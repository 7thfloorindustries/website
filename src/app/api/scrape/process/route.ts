/**
 * Process endpoint for async scrape pipeline.
 * Called by Vercel Cron every minute to drain the scrape_jobs queue.
 *
 * Each invocation picks up a small batch of pending jobs (default 3),
 * scrapes them, inserts results, and marks jobs complete.
 * Designed to complete within Vercel Hobby's 10s timeout.
 */

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { insertSnapshot, type Platform } from '@/lib/db';
import { detectAnomalies } from '@/lib/anomaly';
import { sendSlackAlert } from '@/lib/alerts';
import { logger } from '@/lib/logger';
import { TikTokResponseSchema, InstagramResponseSchema, TwitterResponseSchema } from '@/lib/schemas/scraper';

export const dynamic = 'force-dynamic';

const BATCH_SIZE = 3;
const FETCH_TIMEOUT_MS = 8_000; // Keep well under 10s Hobby limit

interface ScrapeJob {
  id: number;
  handle: string;
  platform: Platform;
  marketing_rep: string | null;
}

function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');
  return neon(connectionString);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function scrapeSingle(
  handle: string,
  platform: Platform
): Promise<{ followers: number; likes?: number; posts?: number; videos?: number } | null> {
  const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;

  if (platform === 'tiktok') {
    const apiToken = process.env.APIFY_API_TOKEN;
    if (!apiToken) return null;

    const response = await fetchWithTimeout(
      'https://api.apify.com/v2/acts/clockworks~tiktok-profile-scraper/run-sync-get-dataset-items',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiToken}` },
        body: JSON.stringify({ profiles: [cleanHandle], resultsPerPage: 1, shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadSubtitles: false }),
      }
    );
    if (!response.ok) return null;
    const raw = await response.json();
    const parsed = TikTokResponseSchema.safeParse(raw);
    if (!parsed.success) return null;
    const profile = parsed.data[0];
    return {
      followers: profile.authorMeta?.fans || profile.fans || 0,
      likes: profile.authorMeta?.heart || profile.heart || 0,
      videos: profile.authorMeta?.video || profile.video || 0,
    };
  }

  if (platform === 'instagram') {
    const apiToken = process.env.APIFY_API_TOKEN;
    if (!apiToken) return null;

    const response = await fetchWithTimeout(
      'https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiToken}` },
        body: JSON.stringify({ usernames: [cleanHandle] }),
      }
    );
    if (!response.ok) return null;
    const raw = await response.json();
    const parsed = InstagramResponseSchema.safeParse(raw);
    if (!parsed.success) return null;
    const profile = parsed.data[0];
    return { followers: profile.followersCount || 0, posts: profile.postsCount || 0 };
  }

  if (platform === 'twitter') {
    const apiKey = process.env.RAPIDAPI_KEY;
    if (!apiKey) return null;

    const response = await fetchWithTimeout(
      `https://twitter241.p.rapidapi.com/user?username=${cleanHandle}`,
      {
        method: 'GET',
        headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': 'twitter241.p.rapidapi.com' },
      }
    );
    if (!response.ok) return null;
    const raw = await response.json();
    const parsed = TwitterResponseSchema.safeParse(raw);
    if (!parsed.success) return null;
    const legacy = parsed.data.result.data.user.result.legacy;
    return { followers: legacy.followers_count || 0, posts: legacy.statuses_count || 0 };
  }

  return null;
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sql = getDb();

  try {
    // Claim a batch of pending jobs atomically
    const jobs = await sql`
      UPDATE scrape_jobs
      SET status = 'processing', processed_at = NOW()
      WHERE id IN (
        SELECT id FROM scrape_jobs
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, handle, platform, marketing_rep
    ` as ScrapeJob[];

    if (jobs.length === 0) {
      // Queue is empty - check if we should send a completion alert
      const remaining = await sql`
        SELECT COUNT(*)::INTEGER AS cnt FROM scrape_jobs WHERE status IN ('pending', 'processing')
      `;

      if (remaining[0]?.cnt === 0) {
        // All done - revalidate dashboard
        revalidatePath('/broke/dashboard');
        revalidatePath('/broke/dashboard/leaderboard');
        revalidatePath('/api/metrics');
      }

      return NextResponse.json({ success: true, processed: 0, remaining: remaining[0]?.cnt || 0 });
    }

    let succeeded = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        const data = await scrapeSingle(job.handle, job.platform);

        if (data) {
          // Insert snapshot
          await insertSnapshot({
            handle: job.handle,
            platform: job.platform,
            marketing_rep: job.marketing_rep,
            followers: data.followers,
            likes: data.likes,
            posts: data.posts,
            videos: data.videos,
          });

          // Run anomaly detection on this single result
          try {
            const anomalies = await detectAnomalies([{
              handle: job.handle,
              platform: job.platform,
              followers: data.followers,
              likes: data.likes,
              posts: data.posts,
              videos: data.videos,
            }]);

            if (anomalies.length > 0) {
              await sendSlackAlert({
                timestamp: new Date().toISOString(),
                reasons: [`Anomaly detected for ${job.handle} (${job.platform})`],
                platformStats: {
                  tiktok: { attempted: 0, succeeded: 0, failed: [] },
                  instagram: { attempted: 0, succeeded: 0, failed: [] },
                  twitter: { attempted: 0, succeeded: 0, failed: [] },
                },
                database: { inserted: 1, skipped: 0, failed: 0 },
                anomalies,
              });
            }
          } catch {
            // Anomaly detection failure shouldn't block job completion
          }

          await sql`
            UPDATE scrape_jobs
            SET status = 'completed', result = ${JSON.stringify(data)}::jsonb, processed_at = NOW()
            WHERE id = ${job.id}
          `;
          succeeded++;
        } else {
          await sql`
            UPDATE scrape_jobs
            SET status = 'failed', error = 'Scrape returned null', processed_at = NOW()
            WHERE id = ${job.id}
          `;
          failed++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error('Job processing failed', { jobId: job.id, handle: job.handle, platform: job.platform, error: errorMsg });
        await sql`
          UPDATE scrape_jobs
          SET status = 'failed', error = ${errorMsg}, processed_at = NOW()
          WHERE id = ${job.id}
        `;
        failed++;
      }
    }

    // Check remaining
    const remaining = await sql`
      SELECT COUNT(*)::INTEGER AS cnt FROM scrape_jobs WHERE status IN ('pending', 'processing')
    `;

    if (remaining[0]?.cnt === 0) {
      revalidatePath('/broke/dashboard');
      revalidatePath('/broke/dashboard/leaderboard');
      revalidatePath('/api/metrics');
    }

    return NextResponse.json({
      success: true,
      processed: jobs.length,
      succeeded,
      failed,
      remaining: remaining[0]?.cnt || 0,
    });
  } catch (error) {
    logger.error('Process batch failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Process batch failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
