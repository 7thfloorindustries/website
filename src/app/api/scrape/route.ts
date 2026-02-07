/**
 * API endpoint for scraping social metrics.
 * Called by Vercel Cron daily at 6:00 AM UTC.
 *
 * Supports two modes:
 * - Synchronous (default): Scrapes all creators in one invocation
 * - Async (SCRAPE_ASYNC=1): Enqueues jobs into scrape_jobs table,
 *   processed by /api/scrape/process in small batches within timeout
 *
 * Flow (sync):
 * 1. Read creator roster from DB or Google Sheets
 * 2. Scrape each platform via provider APIs
 * 3. INSERT snapshots to PostgreSQL (append-only, never overwrites)
 * 4. Revalidate dashboard cache
 *
 * Flow (async):
 * 1. Read creator roster
 * 2. Insert all handles as pending jobs into scrape_jobs
 * 3. Return immediately; /api/scrape/process drains the queue
 */

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { insertSnapshots, isDatabaseConfigured, type MetricSnapshotInsert, type Platform } from '@/lib/db';
import { getActiveCreators } from '@/lib/db/creators';
import { detectAnomalies, type Anomaly } from '@/lib/anomaly';
import { sendSlackAlert } from '@/lib/alerts';
import { logger } from '@/lib/logger';
import { TikTokResponseSchema, InstagramResponseSchema, TwitterResponseSchema } from '@/lib/schemas/scraper';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max for scraping

const DEFAULT_CONCURRENCY = 6;
const DEFAULT_FETCH_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 750;
const MAX_RETRY_DELAY_MS = 5_000;
const ALERT_SUCCESS_RATIO_THRESHOLD = 0.6;

interface RosterEntry {
  tiktokHandle?: string;
  instagramHandle?: string;
  twitterHandle?: string;
  marketingRep?: string;
}

interface ScrapeResult {
  handle: string;
  platform: Platform;
  marketingRep?: string;
  followers: number;
  likes?: number;
  posts?: number;
  videos?: number;
}

interface PlatformStat {
  attempted: number;
  succeeded: number;
  failed: string[];
}

interface ScrapeStats {
  results: ScrapeResult[];
  platformStats: Record<Platform, PlatformStat>;
}

interface ScrapeTask {
  handle: string;
  marketingRep?: string;
  platform: Platform;
  execute: () => Promise<ScrapeResult | null>;
}

interface FetchRetryOptions {
  label: string;
  timeoutMs?: number;
  maxRetries?: number;
}

function getScrapeConcurrency(): number {
  const parsed = Number.parseInt(process.env.SCRAPE_CONCURRENCY || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CONCURRENCY;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: FetchRetryOptions
): Promise<Response> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      const shouldRetryStatus = response.status === 429 || response.status >= 500;
      if (!shouldRetryStatus || attempt === maxRetries) {
        return response;
      }

      const delayMs = Math.min(BASE_RETRY_DELAY_MS * (2 ** attempt), MAX_RETRY_DELAY_MS);
      await sleep(delayMs);
      continue;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(`${options.label} request failed`);
      lastError = err;

      if (attempt === maxRetries) {
        break;
      }

      const delayMs = Math.min(BASE_RETRY_DELAY_MS * (2 ** attempt), MAX_RETRY_DELAY_MS);
      await sleep(delayMs);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error(`${options.label} request failed after retries`);
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: limit }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

function calculateSuccessRatio(stat: PlatformStat): number {
  if (stat.attempted === 0) return 1;
  return stat.succeeded / stat.attempted;
}


/**
 * Fetch creator roster from the creators database table.
 * Falls back to Google Sheets if the table is empty or unavailable.
 */
async function fetchCreatorRoster(): Promise<RosterEntry[]> {
  // Try database first
  try {
    const creators = await getActiveCreators();
    if (creators.length > 0) {
      logger.info('Roster loaded from creators table', { count: creators.length });
      return creators.map((c) => ({
        tiktokHandle: c.tiktok_handle || undefined,
        instagramHandle: c.ig_handle || undefined,
        twitterHandle: c.twitter_handle || undefined,
        marketingRep: c.team_member || undefined,
      }));
    }
    logger.warn('Creators table is empty, falling back to Google Sheets');
  } catch (error) {
    logger.warn('Failed to read creators table, falling back to Google Sheets', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fallback: Google Sheets
  return fetchCreatorRosterFromSheets();
}

/**
 * Fetch creator roster from Google Sheets (legacy fallback)
 */
async function fetchCreatorRosterFromSheets(): Promise<RosterEntry[]> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!sheetId || !apiKey) {
    throw new Error('Google Sheets credentials not configured');
  }

  const range = 'fan_page_tracker_data!A2:G1000';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to fetch roster: ${response.status}`);
  }

  const data = await response.json();
  const rows: string[][] = data.values || [];

  const roster: RosterEntry[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const marketingRep = row[0]?.trim() || undefined;
    const instagramHandle = row[2]?.trim().replace('@', '') || undefined;
    const twitterHandle = row[3]?.trim().replace('@', '') || undefined;
    const tiktokHandle = row[4]?.trim().replace('@', '') || undefined;

    const key = `${tiktokHandle || ''}|${instagramHandle || ''}|${twitterHandle || ''}`;
    if (key === '||' || seen.has(key)) continue;
    seen.add(key);

    roster.push({
      tiktokHandle,
      instagramHandle,
      twitterHandle,
      marketingRep,
    });
  }

  return roster;
}

async function scrapeTikTok(handle: string): Promise<{
  followers: number;
  likes: number;
  videos: number;
} | null> {
  const apiToken = process.env.APIFY_API_TOKEN;
  if (!apiToken) {
    logger.warn('APIFY_API_TOKEN not configured, skipping TikTok scrape');
    return null;
  }

  try {
    const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;
    const response = await fetchWithRetry(
      'https://api.apify.com/v2/acts/clockworks~tiktok-profile-scraper/run-sync-get-dataset-items',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({
          profiles: [cleanHandle],
          resultsPerPage: 1,
          shouldDownloadVideos: false,
          shouldDownloadCovers: false,
          shouldDownloadSubtitles: false,
        }),
      },
      { label: `TikTok:${cleanHandle}` }
    );

    if (!response.ok) {
      logger.error('Apify TikTok scrape failed', { handle, status: response.status, platform: 'tiktok' });
      return null;
    }

    const raw = await response.json();
    const parsed = TikTokResponseSchema.safeParse(raw);
    if (!parsed.success) {
      logger.error('TikTok response validation failed', {
        handle,
        platform: 'tiktok',
        issues: parsed.error.issues,
      });
      return null;
    }

    const profile = parsed.data[0];
    return {
      followers: profile.authorMeta?.fans || profile.fans || 0,
      likes: profile.authorMeta?.heart || profile.heart || 0,
      videos: profile.authorMeta?.video || profile.video || 0,
    };
  } catch (error) {
    logger.error('Error scraping TikTok', { handle, platform: 'tiktok', error: String(error) });
    return null;
  }
}

async function scrapeInstagram(handle: string): Promise<{
  followers: number;
  posts: number;
} | null> {
  const apiToken = process.env.APIFY_API_TOKEN;
  if (!apiToken) {
    logger.warn('APIFY_API_TOKEN not configured, skipping Instagram scrape');
    return null;
  }

  try {
    const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;
    const response = await fetchWithRetry(
      'https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({
          usernames: [cleanHandle],
        }),
      },
      { label: `Instagram:${cleanHandle}` }
    );

    if (!response.ok) {
      logger.error('Apify Instagram scrape failed', { handle, status: response.status, platform: 'instagram' });
      return null;
    }

    const raw = await response.json();
    const parsed = InstagramResponseSchema.safeParse(raw);
    if (!parsed.success) {
      logger.error('Instagram response validation failed', {
        handle,
        platform: 'instagram',
        issues: parsed.error.issues,
      });
      return null;
    }

    const profile = parsed.data[0];
    return {
      followers: profile.followersCount || 0,
      posts: profile.postsCount || 0,
    };
  } catch (error) {
    logger.error('Error scraping Instagram', { handle, platform: 'instagram', error: String(error) });
    return null;
  }
}

async function scrapeTwitter(handle: string): Promise<{
  followers: number;
  posts: number;
} | null> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    logger.warn('RAPIDAPI_KEY not configured, skipping Twitter scrape');
    return null;
  }

  try {
    const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;
    const response = await fetchWithRetry(
      `https://twitter241.p.rapidapi.com/user?username=${cleanHandle}`,
      {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': 'twitter241.p.rapidapi.com',
        },
      },
      { label: `Twitter:${cleanHandle}` }
    );

    if (!response.ok) {
      logger.error('RapidAPI Twitter scrape failed', { handle, status: response.status, platform: 'twitter' });
      return null;
    }

    const raw = await response.json();
    const parsed = TwitterResponseSchema.safeParse(raw);
    if (!parsed.success) {
      logger.error('Twitter response validation failed', {
        handle,
        platform: 'twitter',
        issues: parsed.error.issues,
      });
      return null;
    }

    const legacy = parsed.data.result.data.user.result.legacy;
    return {
      followers: legacy.followers_count || 0,
      posts: legacy.statuses_count || 0,
    };
  } catch (error) {
    logger.error('Error scraping Twitter', { handle, platform: 'twitter', error: String(error) });
    return null;
  }
}

function buildScrapeTasks(roster: RosterEntry[]): { tasks: ScrapeTask[]; platformStats: Record<Platform, PlatformStat> } {
  const tasks: ScrapeTask[] = [];
  const platformStats: Record<Platform, PlatformStat> = {
    tiktok: { attempted: 0, succeeded: 0, failed: [] },
    instagram: { attempted: 0, succeeded: 0, failed: [] },
    twitter: { attempted: 0, succeeded: 0, failed: [] },
  };

  for (const entry of roster) {
    if (entry.tiktokHandle) {
      platformStats.tiktok.attempted++;
      tasks.push({
        handle: entry.tiktokHandle,
        marketingRep: entry.marketingRep,
        platform: 'tiktok',
        execute: async () => {
          const data = await scrapeTikTok(entry.tiktokHandle!);
          if (!data) return null;
          return {
            handle: entry.tiktokHandle!,
            platform: 'tiktok',
            marketingRep: entry.marketingRep,
            followers: data.followers,
            likes: data.likes,
            videos: data.videos,
          };
        },
      });
    }

    if (entry.instagramHandle) {
      platformStats.instagram.attempted++;
      tasks.push({
        handle: entry.instagramHandle,
        marketingRep: entry.marketingRep,
        platform: 'instagram',
        execute: async () => {
          const data = await scrapeInstagram(entry.instagramHandle!);
          if (!data) return null;
          return {
            handle: entry.instagramHandle!,
            platform: 'instagram',
            marketingRep: entry.marketingRep,
            followers: data.followers,
            posts: data.posts,
          };
        },
      });
    }

    if (entry.twitterHandle) {
      platformStats.twitter.attempted++;
      tasks.push({
        handle: entry.twitterHandle,
        marketingRep: entry.marketingRep,
        platform: 'twitter',
        execute: async () => {
          const data = await scrapeTwitter(entry.twitterHandle!);
          if (!data) return null;
          return {
            handle: entry.twitterHandle!,
            platform: 'twitter',
            marketingRep: entry.marketingRep,
            followers: data.followers,
            posts: data.posts,
          };
        },
      });
    }
  }

  return { tasks, platformStats };
}

async function scrapeAllPlatforms(roster: RosterEntry[]): Promise<ScrapeStats> {
  const { tasks, platformStats } = buildScrapeTasks(roster);
  const results: ScrapeResult[] = [];

  const taskResults = await runWithConcurrency(tasks, getScrapeConcurrency(), async (task) => {
    try {
      return await task.execute();
    } catch (error) {
      logger.error('Unhandled scrape error', { platform: task.platform, handle: task.handle, error: String(error) });
      return null;
    }
  });

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const result = taskResults[i];

    if (result) {
      platformStats[task.platform].succeeded++;
      results.push(result);
    } else {
      platformStats[task.platform].failed.push(task.handle);
    }
  }

  return { results, platformStats };
}

/**
 * Enqueue all roster entries as pending scrape jobs.
 * Returns the number of jobs created.
 */
async function enqueueScrapeJobs(roster: RosterEntry[]): Promise<number> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');
  const sql = neon(connectionString);

  // Clean up old completed/failed jobs (older than 24h)
  await sql`DELETE FROM scrape_jobs WHERE created_at < NOW() - INTERVAL '24 hours'`;

  // Check if there are already pending jobs (avoid double-enqueue)
  const existing = await sql`
    SELECT COUNT(*)::INTEGER AS cnt FROM scrape_jobs WHERE status IN ('pending', 'processing')
  `;
  if (existing[0]?.cnt > 0) {
    logger.info('Scrape jobs already queued', { pending: existing[0].cnt });
    return existing[0].cnt as number;
  }

  let jobCount = 0;
  for (const entry of roster) {
    const platforms: { handle: string; platform: Platform }[] = [];
    if (entry.tiktokHandle) platforms.push({ handle: entry.tiktokHandle, platform: 'tiktok' });
    if (entry.instagramHandle) platforms.push({ handle: entry.instagramHandle, platform: 'instagram' });
    if (entry.twitterHandle) platforms.push({ handle: entry.twitterHandle, platform: 'twitter' });

    for (const p of platforms) {
      await sql`
        INSERT INTO scrape_jobs (handle, platform, marketing_rep)
        VALUES (${p.handle}, ${p.platform}, ${entry.marketingRep || null})
      `;
      jobCount++;
    }
  }

  return jobCount;
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured' },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const useAsync = process.env.SCRAPE_ASYNC === '1';

  try {
    const dbConfigured = await isDatabaseConfigured();
    if (!dbConfigured) {
      return NextResponse.json(
        { error: 'Database not configured. Set DATABASE_URL environment variable.' },
        { status: 500 }
      );
    }

    logger.info('Fetching creator roster');
    const roster = await fetchCreatorRoster();
    logger.info('Roster loaded', { creators: roster.length });

    // Async mode: enqueue jobs and return immediately
    if (useAsync) {
      logger.info('Async mode: enqueuing scrape jobs');
      const jobCount = await enqueueScrapeJobs(roster);
      logger.info('Scrape jobs enqueued', { jobs: jobCount });

      return NextResponse.json({
        success: true,
        mode: 'async',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        roster: { totalCreators: roster.length },
        jobsEnqueued: jobCount,
      });
    }

    // Synchronous mode (default): scrape everything in this invocation
    logger.info('Scraping platforms');
    const { results: scrapeResults, platformStats } = await scrapeAllPlatforms(roster);
    logger.info('Scraping complete', { profiles: scrapeResults.length });

    // Anomaly detection: compare new results against previous snapshots
    let anomalies: Anomaly[] = [];
    try {
      anomalies = await detectAnomalies(scrapeResults);
      if (anomalies.length > 0) {
        logger.warn('Anomalies detected during scrape', { count: anomalies.length });
      }
    } catch (error) {
      logger.error('Anomaly detection failed', { error: error instanceof Error ? error.message : String(error) });
    }

    const snapshots: MetricSnapshotInsert[] = scrapeResults.map((result) => ({
      handle: result.handle,
      platform: result.platform,
      marketing_rep: result.marketingRep,
      followers: result.followers,
      likes: result.likes,
      posts: result.posts,
      videos: result.videos,
    }));

    logger.info('Inserting snapshots to database', { count: snapshots.length });
    const insertResult = await insertSnapshots(snapshots);
    if (insertResult.lockUnavailable) {
      return NextResponse.json(
        {
          error: 'Another scrape insert is already in progress',
          database: {
            inserted: insertResult.inserted,
            skipped: insertResult.skipped,
            failed: insertResult.failed,
          },
        },
        { status: 409 }
      );
    }

    const successRatio = {
      tiktok: calculateSuccessRatio(platformStats.tiktok),
      instagram: calculateSuccessRatio(platformStats.instagram),
      twitter: calculateSuccessRatio(platformStats.twitter),
    };

    const alertReasons: string[] = [];
    (Object.keys(successRatio) as Platform[]).forEach((platform) => {
      if (successRatio[platform] < ALERT_SUCCESS_RATIO_THRESHOLD) {
        alertReasons.push(`${platform} success ratio below ${(ALERT_SUCCESS_RATIO_THRESHOLD * 100).toFixed(0)}%`);
      }
    });
    if (insertResult.inserted === 0 && scrapeResults.length > 0) {
      alertReasons.push('No snapshots inserted');
    }
    if (anomalies.length > 0) {
      alertReasons.push(`${anomalies.length} anomal${anomalies.length === 1 ? 'y' : 'ies'} detected`);
    }

    let alertSent = false;
    if (alertReasons.length > 0) {
      alertSent = await sendSlackAlert({
        timestamp: new Date().toISOString(),
        reasons: alertReasons,
        platformStats: {
          tiktok: { ...platformStats.tiktok, successRatio: successRatio.tiktok },
          instagram: { ...platformStats.instagram, successRatio: successRatio.instagram },
          twitter: { ...platformStats.twitter, successRatio: successRatio.twitter },
        },
        database: {
          inserted: insertResult.inserted,
          skipped: insertResult.skipped,
          failed: insertResult.failed,
        },
        anomalies: anomalies.length > 0 ? anomalies : undefined,
        durationMs: Date.now() - startedAt,
      });
    }

    revalidatePath('/broke/dashboard');
    revalidatePath('/broke/dashboard/leaderboard');
    revalidatePath('/api/metrics');

    return NextResponse.json({
      success: true,
      mode: 'sync',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      roster: {
        totalCreators: roster.length,
      },
      scrape: {
        total: scrapeResults.length,
        concurrency: getScrapeConcurrency(),
        platforms: {
          tiktok: {
            attempted: platformStats.tiktok.attempted,
            succeeded: platformStats.tiktok.succeeded,
            failed: platformStats.tiktok.failed.length,
            successRatio: successRatio.tiktok,
          },
          instagram: {
            attempted: platformStats.instagram.attempted,
            succeeded: platformStats.instagram.succeeded,
            failed: platformStats.instagram.failed.length,
            successRatio: successRatio.instagram,
          },
          twitter: {
            attempted: platformStats.twitter.attempted,
            succeeded: platformStats.twitter.succeeded,
            failed: platformStats.twitter.failed.length,
            successRatio: successRatio.twitter,
          },
        },
        failedHandles: {
          tiktok: platformStats.tiktok.failed,
          instagram: platformStats.instagram.failed,
          twitter: platformStats.twitter.failed,
        },
      },
      database: {
        inserted: insertResult.inserted,
        skipped: insertResult.skipped,
        failed: insertResult.failed,
      },
      alerts: {
        triggered: alertReasons.length > 0,
        sent: alertSent,
        reasons: alertReasons,
      },
      anomalies: anomalies.length > 0 ? anomalies : [],
    });
  } catch (error) {
    logger.error('Scrape failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scrape failed' },
      { status: 500 }
    );
  }
}

// Also support GET for manual testing (with auth).
export async function GET(request: NextRequest) {
  return POST(request);
}
