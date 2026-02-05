import { neon } from '@neondatabase/serverless';

// Initialize connection
function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return neon(connectionString);
}

export type Platform = 'tiktok' | 'instagram' | 'twitter';

export interface MetricSnapshot {
  id: string;
  handle: string;
  platform: Platform;
  marketing_rep: string | null;
  followers: number;
  likes: number;
  posts: number;
  videos: number;
  scraped_at: Date;
}

export interface MetricSnapshotInsert {
  handle: string;
  platform: Platform;
  marketing_rep?: string | null;
  followers: number;
  likes?: number;
  posts?: number;
  videos?: number;
}

export interface MetricWithDeltas extends MetricSnapshot {
  delta_followers: number;
  delta_likes: number;
  delta_posts: number;
  delta_videos: number;
  delta_posts_7d: number;
  delta_videos_7d: number;
  delta_1d?: number;
  delta_7d?: number;
}

/**
 * Insert a new metrics snapshot (append-only, never overwrites)
 */
export async function insertSnapshot(snapshot: MetricSnapshotInsert): Promise<MetricSnapshot> {
  const sql = getDb();

  const result = await sql`
    INSERT INTO metrics_snapshots (handle, platform, marketing_rep, followers, likes, posts, videos)
    VALUES (
      ${snapshot.handle},
      ${snapshot.platform},
      ${snapshot.marketing_rep || null},
      ${snapshot.followers},
      ${snapshot.likes || 0},
      ${snapshot.posts || 0},
      ${snapshot.videos || 0}
    )
    RETURNING *
  `;

  return result[0] as MetricSnapshot;
}

/**
 * Check if a recent snapshot exists for handle/platform within time window
 */
async function hasRecentSnapshot(
  handle: string,
  platform: Platform,
  hoursWindow: number = 4
): Promise<boolean> {
  const sql = getDb();
  const result = await sql`
    SELECT 1 FROM metrics_snapshots
    WHERE handle = ${handle}
      AND platform = ${platform}
      AND scraped_at > NOW() - INTERVAL '1 hour' * ${hoursWindow}
    LIMIT 1
  `;
  return result.length > 0;
}

/**
 * Insert multiple snapshots in a batch
 * Checks for existing records within 4-hour window to prevent duplicates
 */
export async function insertSnapshots(snapshots: MetricSnapshotInsert[]): Promise<{
  inserted: number;
  skipped: number;
  failed: number;
  details: { handle: string; platform: string; status: 'inserted' | 'skipped' | 'failed'; error?: string }[];
}> {
  if (snapshots.length === 0) return { inserted: 0, skipped: 0, failed: 0, details: [] };

  const sql = getDb();
  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  const details: { handle: string; platform: string; status: 'inserted' | 'skipped' | 'failed'; error?: string }[] = [];

  // Insert in batches to avoid query size limits
  const batchSize = 100;
  for (let i = 0; i < snapshots.length; i += batchSize) {
    const batch = snapshots.slice(i, i + batchSize);

    for (const snapshot of batch) {
      try {
        // Check if record exists within last 4 hours
        const hasRecent = await hasRecentSnapshot(snapshot.handle, snapshot.platform, 4);
        if (hasRecent) {
          skipped++;
          details.push({ handle: snapshot.handle, platform: snapshot.platform, status: 'skipped' });
          continue;
        }

        await sql`
          INSERT INTO metrics_snapshots (handle, platform, marketing_rep, followers, likes, posts, videos)
          VALUES (
            ${snapshot.handle},
            ${snapshot.platform},
            ${snapshot.marketing_rep || null},
            ${snapshot.followers},
            ${snapshot.likes || 0},
            ${snapshot.posts || 0},
            ${snapshot.videos || 0}
          )
        `;
        inserted++;
        details.push({ handle: snapshot.handle, platform: snapshot.platform, status: 'inserted' });
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to insert snapshot for ${snapshot.handle}:`, error);
        details.push({ handle: snapshot.handle, platform: snapshot.platform, status: 'failed', error: errorMsg });
      }
    }
  }

  return { inserted, skipped, failed, details };
}

/**
 * Get the latest metrics for all creators
 */
export async function getLatestMetrics(): Promise<MetricSnapshot[]> {
  const sql = getDb();

  const result = await sql`
    SELECT * FROM latest_metrics
    ORDER BY followers DESC
  `;

  return result as MetricSnapshot[];
}

/**
 * Get historical data for a specific creator/platform
 */
export async function getCreatorHistory(
  handle: string,
  platform: Platform,
  days: number = 30
): Promise<MetricSnapshot[]> {
  const sql = getDb();

  const result = await sql`
    SELECT * FROM metrics_snapshots
    WHERE handle = ${handle}
      AND platform = ${platform}
      AND scraped_at > NOW() - INTERVAL '1 day' * ${days}
    ORDER BY scraped_at DESC
  `;

  return result as MetricSnapshot[];
}

/**
 * Get latest metrics with pre-calculated deltas (1D and 7D)
 * This is the main query used by the dashboard
 */
export async function getMetricsWithDeltas(): Promise<MetricWithDeltas[]> {
  const sql = getDb();

  const result = await sql`
    WITH latest AS (
      SELECT DISTINCT ON (handle, platform)
        id, handle, platform, marketing_rep, followers, likes, posts, videos, scraped_at
      FROM metrics_snapshots
      ORDER BY handle, platform, scraped_at DESC
    ),
    with_history AS (
      SELECT
        l.*,
        -- 1-day delta: find record from roughly 1 day ago (18-30 hours window)
        (
          SELECT followers FROM metrics_snapshots m
          WHERE m.handle = l.handle
            AND m.platform = l.platform
            AND m.scraped_at < l.scraped_at - INTERVAL '6 hours'
          ORDER BY m.scraped_at DESC
          LIMIT 1
        ) as prev_followers_1d,
        -- 7-day delta: find record from roughly 7 days ago (5-9 day window)
        (
          SELECT followers FROM metrics_snapshots m
          WHERE m.handle = l.handle
            AND m.platform = l.platform
            AND m.scraped_at < l.scraped_at - INTERVAL '5 days'
          ORDER BY m.scraped_at DESC
          LIMIT 1
        ) as prev_followers_7d,
        -- Previous likes for delta calculation
        (
          SELECT likes FROM metrics_snapshots m
          WHERE m.handle = l.handle
            AND m.platform = l.platform
            AND m.scraped_at < l.scraped_at - INTERVAL '6 hours'
          ORDER BY m.scraped_at DESC
          LIMIT 1
        ) as prev_likes_1d,
        -- Previous posts for delta calculation (1d)
        (
          SELECT posts FROM metrics_snapshots m
          WHERE m.handle = l.handle
            AND m.platform = l.platform
            AND m.scraped_at < l.scraped_at - INTERVAL '6 hours'
          ORDER BY m.scraped_at DESC
          LIMIT 1
        ) as prev_posts_1d,
        -- Previous posts for delta calculation (7d)
        (
          SELECT posts FROM metrics_snapshots m
          WHERE m.handle = l.handle
            AND m.platform = l.platform
            AND m.scraped_at < l.scraped_at - INTERVAL '5 days'
          ORDER BY m.scraped_at DESC
          LIMIT 1
        ) as prev_posts_7d,
        -- Previous videos for delta calculation (1d)
        (
          SELECT videos FROM metrics_snapshots m
          WHERE m.handle = l.handle
            AND m.platform = l.platform
            AND m.scraped_at < l.scraped_at - INTERVAL '6 hours'
          ORDER BY m.scraped_at DESC
          LIMIT 1
        ) as prev_videos_1d,
        -- Previous videos for delta calculation (7d)
        (
          SELECT videos FROM metrics_snapshots m
          WHERE m.handle = l.handle
            AND m.platform = l.platform
            AND m.scraped_at < l.scraped_at - INTERVAL '5 days'
          ORDER BY m.scraped_at DESC
          LIMIT 1
        ) as prev_videos_7d
      FROM latest l
    )
    SELECT
      id,
      handle,
      platform,
      marketing_rep,
      followers,
      likes,
      posts,
      videos,
      scraped_at,
      followers - COALESCE(prev_followers_1d, followers) as delta_followers,
      likes - COALESCE(prev_likes_1d, likes) as delta_likes,
      posts - COALESCE(prev_posts_1d, posts) as delta_posts,
      videos - COALESCE(prev_videos_1d, videos) as delta_videos,
      posts - COALESCE(prev_posts_7d, posts) as delta_posts_7d,
      videos - COALESCE(prev_videos_7d, videos) as delta_videos_7d,
      followers - COALESCE(prev_followers_1d, followers) as delta_1d,
      followers - COALESCE(prev_followers_7d, followers) as delta_7d
    FROM with_history
    ORDER BY followers DESC
  `;

  return result as MetricWithDeltas[];
}

/**
 * Get aggregated stats by marketing rep
 */
export async function getRepStats(): Promise<{
  rep: string;
  total_followers: number;
  total_growth: number;
  creator_count: number;
}[]> {
  const sql = getDb();

  const result = await sql`
    WITH latest AS (
      SELECT DISTINCT ON (handle, platform)
        handle, platform, marketing_rep, followers, scraped_at
      FROM metrics_snapshots
      ORDER BY handle, platform, scraped_at DESC
    ),
    with_prev AS (
      SELECT
        l.*,
        (
          SELECT followers FROM metrics_snapshots m
          WHERE m.handle = l.handle
            AND m.platform = l.platform
            AND m.scraped_at < l.scraped_at - INTERVAL '6 hours'
          ORDER BY m.scraped_at DESC
          LIMIT 1
        ) as prev_followers
      FROM latest l
    )
    SELECT
      COALESCE(marketing_rep, 'Unassigned') as rep,
      SUM(followers)::INTEGER as total_followers,
      SUM(followers - COALESCE(prev_followers, followers))::INTEGER as total_growth,
      COUNT(DISTINCT handle)::INTEGER as creator_count
    FROM with_prev
    GROUP BY marketing_rep
    ORDER BY total_followers DESC
  `;

  return result as {
    rep: string;
    total_followers: number;
    total_growth: number;
    creator_count: number;
  }[];
}

/**
 * Get all historical data for charting
 */
export async function getHistoricalData(days: number = 30): Promise<MetricSnapshot[]> {
  const sql = getDb();

  const result = await sql`
    SELECT * FROM metrics_snapshots
    WHERE scraped_at > NOW() - INTERVAL '1 day' * ${days}
    ORDER BY scraped_at DESC
  `;

  return result as MetricSnapshot[];
}

/**
 * Check if database is properly configured
 */
export async function isDatabaseConfigured(): Promise<boolean> {
  try {
    const sql = getDb();
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize database schema (run once)
 */
export async function initializeSchema(): Promise<void> {
  const sql = getDb();

  // Create table
  await sql`
    CREATE TABLE IF NOT EXISTS metrics_snapshots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      handle VARCHAR(255) NOT NULL,
      platform VARCHAR(20) NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'twitter')),
      marketing_rep VARCHAR(255),
      followers INTEGER NOT NULL DEFAULT 0,
      likes BIGINT DEFAULT 0,
      posts INTEGER DEFAULT 0,
      videos INTEGER DEFAULT 0,
      scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT unique_snapshot UNIQUE (handle, platform, scraped_at)
    )
  `;

  // Create indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_handle_platform ON metrics_snapshots(handle, platform)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_scraped_at ON metrics_snapshots(scraped_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_platform_time ON metrics_snapshots(platform, scraped_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_marketing_rep ON metrics_snapshots(marketing_rep)`;
}
