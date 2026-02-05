/**
 * API endpoint for scraping social metrics
 * Called by Vercel Cron every 6 hours
 *
 * Flow:
 * 1. Read creator roster from Google Sheets (INPUT only)
 * 2. Scrape each platform via Apify
 * 3. INSERT snapshots to PostgreSQL (append-only, never overwrites)
 * 4. Revalidate dashboard cache
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { insertSnapshots, isDatabaseConfigured, type Platform, type MetricSnapshotInsert } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max for scraping

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

/**
 * Fetch creator roster from Google Sheets (INPUT sheet)
 */
async function fetchCreatorRoster(): Promise<RosterEntry[]> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!sheetId || !apiKey) {
    throw new Error('Google Sheets credentials not configured');
  }

  // Roster sheet - fan_page_tracker_data has clean handle list
  // Columns: A=Team Member, B=Artist, C=IG Handle, D=Twitter Handle, E=TikTok Handle
  const range = 'fan_page_tracker_data!A2:G1000';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to fetch roster: ${response.status}`);
  }

  const data = await response.json();
  const rows: string[][] = data.values || [];

  // Parse roster - extract handles and marketing rep
  const roster: RosterEntry[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const marketingRep = row[0]?.trim() || undefined;      // Column A: Team Member
    const instagramHandle = row[2]?.trim().replace('@', '') || undefined;  // Column C: IG Handle
    const twitterHandle = row[3]?.trim().replace('@', '') || undefined;    // Column D: Twitter Handle
    const tiktokHandle = row[4]?.trim().replace('@', '') || undefined;     // Column E: TikTok Handle

    // Create a unique key for this creator combination
    const key = `${tiktokHandle || ''}|${instagramHandle || ''}|${twitterHandle || ''}`;
    if (!key || key === '||' || seen.has(key)) continue;
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

/**
 * Scrape TikTok profile using Apify
 */
async function scrapeTikTok(handle: string): Promise<{
  followers: number;
  likes: number;
  videos: number;
} | null> {
  const apiToken = process.env.APIFY_API_TOKEN;
  if (!apiToken) {
    console.warn('APIFY_API_TOKEN not configured, skipping TikTok scrape');
    return null;
  }

  try {
    // Clean handle (remove @ if present)
    const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;

    const response = await fetch(
      `https://api.apify.com/v2/acts/clockworks~tiktok-profile-scraper/run-sync-get-dataset-items?token=${apiToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profiles: [cleanHandle],
          resultsPerPage: 1,
          shouldDownloadVideos: false,
          shouldDownloadCovers: false,
          shouldDownloadSubtitles: false,
        }),
      }
    );

    if (!response.ok) {
      console.error(`Apify TikTok scrape failed for ${handle}: ${response.status}`);
      return null;
    }

    const results = await response.json();
    if (!results || results.length === 0) {
      console.warn(`No TikTok data found for ${handle}`);
      return null;
    }

    const profile = results[0];
    return {
      followers: profile.authorMeta?.fans || profile.fans || 0,
      likes: profile.authorMeta?.heart || profile.heart || 0,
      videos: profile.authorMeta?.video || profile.video || 0,
    };
  } catch (error) {
    console.error(`Error scraping TikTok for ${handle}:`, error);
    return null;
  }
}

/**
 * Scrape Instagram profile using Apify
 */
async function scrapeInstagram(handle: string): Promise<{
  followers: number;
  posts: number;
} | null> {
  const apiToken = process.env.APIFY_API_TOKEN;
  if (!apiToken) {
    console.warn('APIFY_API_TOKEN not configured, skipping Instagram scrape');
    return null;
  }

  try {
    const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;

    const response = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${apiToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usernames: [cleanHandle],
        }),
      }
    );

    if (!response.ok) {
      console.error(`Apify Instagram scrape failed for ${handle}: ${response.status}`);
      return null;
    }

    const results = await response.json();
    if (!results || results.length === 0) {
      console.warn(`No Instagram data found for ${handle}`);
      return null;
    }

    const profile = results[0];
    return {
      followers: profile.followersCount || 0,
      posts: profile.postsCount || 0,
    };
  } catch (error) {
    console.error(`Error scraping Instagram for ${handle}:`, error);
    return null;
  }
}

/**
 * Scrape Twitter/X profile using RapidAPI (twitter241)
 */
async function scrapeTwitter(handle: string): Promise<{
  followers: number;
  posts: number;
} | null> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    console.warn('RAPIDAPI_KEY not configured, skipping Twitter scrape');
    return null;
  }

  try {
    const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;

    const response = await fetch(
      `https://twitter241.p.rapidapi.com/user?username=${cleanHandle}`,
      {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': 'twitter241.p.rapidapi.com',
        },
      }
    );

    if (!response.ok) {
      console.error(`RapidAPI Twitter scrape failed for ${handle}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const legacy = data?.result?.data?.user?.result?.legacy;

    if (!legacy) {
      console.warn(`No Twitter data found for ${handle}`);
      return null;
    }

    return {
      followers: legacy.followers_count || 0,
      posts: legacy.statuses_count || 0,
    };
  } catch (error) {
    console.error(`Error scraping Twitter for ${handle}:`, error);
    return null;
  }
}

interface ScrapeStats {
  results: ScrapeResult[];
  platformStats: {
    tiktok: { attempted: number; succeeded: number; failed: string[] };
    instagram: { attempted: number; succeeded: number; failed: string[] };
    twitter: { attempted: number; succeeded: number; failed: string[] };
  };
}

/**
 * Scrape all platforms for all creators in the roster
 */
async function scrapeAllPlatforms(roster: RosterEntry[]): Promise<ScrapeStats> {
  const results: ScrapeResult[] = [];
  const platformStats = {
    tiktok: { attempted: 0, succeeded: 0, failed: [] as string[] },
    instagram: { attempted: 0, succeeded: 0, failed: [] as string[] },
    twitter: { attempted: 0, succeeded: 0, failed: [] as string[] },
  };

  for (const entry of roster) {
    // Scrape TikTok
    if (entry.tiktokHandle) {
      platformStats.tiktok.attempted++;
      const tiktokData = await scrapeTikTok(entry.tiktokHandle);
      if (tiktokData) {
        platformStats.tiktok.succeeded++;
        results.push({
          handle: entry.tiktokHandle,
          platform: 'tiktok',
          marketingRep: entry.marketingRep,
          followers: tiktokData.followers,
          likes: tiktokData.likes,
          videos: tiktokData.videos,
        });
      } else {
        platformStats.tiktok.failed.push(entry.tiktokHandle);
      }
    }

    // Scrape Instagram
    if (entry.instagramHandle) {
      platformStats.instagram.attempted++;
      const igData = await scrapeInstagram(entry.instagramHandle);
      if (igData) {
        platformStats.instagram.succeeded++;
        results.push({
          handle: entry.instagramHandle,
          platform: 'instagram',
          marketingRep: entry.marketingRep,
          followers: igData.followers,
          posts: igData.posts,
        });
      } else {
        platformStats.instagram.failed.push(entry.instagramHandle);
      }
    }

    // Scrape Twitter
    if (entry.twitterHandle) {
      platformStats.twitter.attempted++;
      const twitterData = await scrapeTwitter(entry.twitterHandle);
      if (twitterData) {
        platformStats.twitter.succeeded++;
        results.push({
          handle: entry.twitterHandle,
          platform: 'twitter',
          marketingRep: entry.marketingRep,
          followers: twitterData.followers,
          posts: twitterData.posts,
        });
      } else {
        platformStats.twitter.failed.push(entry.twitterHandle);
      }
    }

    // Small delay between creators to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return { results, platformStats };
}

export async function POST(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check database configuration
    const dbConfigured = await isDatabaseConfigured();
    if (!dbConfigured) {
      return NextResponse.json(
        { error: 'Database not configured. Set DATABASE_URL environment variable.' },
        { status: 500 }
      );
    }

    // 1. Read creator roster from Google Sheet (INPUT sheet)
    console.log('Fetching creator roster...');
    const roster = await fetchCreatorRoster();
    console.log(`Found ${roster.length} creators in roster`);

    // 2. Scrape each platform via Apify
    console.log('Scraping platforms...');
    const { results: scrapeResults, platformStats } = await scrapeAllPlatforms(roster);
    console.log(`Scraped ${scrapeResults.length} platform profiles`);
    console.log('Platform stats:', JSON.stringify(platformStats, null, 2));

    // 3. Transform results to snapshots and INSERT to PostgreSQL
    const snapshots: MetricSnapshotInsert[] = scrapeResults.map(result => ({
      handle: result.handle,
      platform: result.platform,
      marketing_rep: result.marketingRep,
      followers: result.followers,
      likes: result.likes,
      posts: result.posts,
      videos: result.videos,
    }));

    console.log('Inserting snapshots to database...');
    const insertResult = await insertSnapshots(snapshots);
    console.log(`Insert result: ${insertResult.inserted} inserted, ${insertResult.skipped} skipped, ${insertResult.failed} failed`);

    // 4. Revalidate dashboard cache so new data appears immediately
    revalidatePath('/broke/dashboard');
    revalidatePath('/broke/dashboard/leaderboard');
    revalidatePath('/api/metrics');

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      roster: {
        totalCreators: roster.length,
      },
      scrape: {
        total: scrapeResults.length,
        platforms: {
          tiktok: { attempted: platformStats.tiktok.attempted, succeeded: platformStats.tiktok.succeeded, failed: platformStats.tiktok.failed.length },
          instagram: { attempted: platformStats.instagram.attempted, succeeded: platformStats.instagram.succeeded, failed: platformStats.instagram.failed.length },
          twitter: { attempted: platformStats.twitter.attempted, succeeded: platformStats.twitter.succeeded, failed: platformStats.twitter.failed.length },
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
    });
  } catch (error) {
    console.error('Scrape failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scrape failed' },
      { status: 500 }
    );
  }
}

// Also support GET for manual testing (with auth)
export async function GET(request: NextRequest) {
  // Redirect to POST handler
  return POST(request);
}
