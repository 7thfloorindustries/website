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

export type ScrapeHealthStatus = 'healthy' | 'degraded' | 'stale';
export type ScrapePlatformStatus = 'fresh' | 'stale' | 'missing';

export interface ScrapeHealthPlatform {
  platform: Platform;
  latest_snapshot_at: Date | null;
  hours_since_latest_snapshot: number | null;
  snapshots_last_24h: number;
  handles_last_24h: number;
  status: ScrapePlatformStatus;
}

export interface ScrapeHealthReport {
  generated_at: Date;
  cadence_hours: number;
  stale_threshold_hours: number;
  latest_snapshot_at: Date | null;
  hours_since_latest_snapshot: number | null;
  status: ScrapeHealthStatus;
  action_required: boolean;
  issues: string[];
  platforms: ScrapeHealthPlatform[];
}

const SCRAPE_INSERT_LOCK_KEY = 704021;
const RECENT_SNAPSHOT_WINDOW_HOURS = 4;

export interface InsertSnapshotsResult {
  inserted: number;
  skipped: number;
  failed: number;
  lockUnavailable?: boolean;
  details: { handle: string; platform: string; status: 'inserted' | 'skipped' | 'failed'; error?: string }[];
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

function getSnapshotKey(handle: string, platform: string): string {
  return `${handle.toLowerCase()}::${platform.toLowerCase()}`;
}

function normalizeSnapshot(snapshot: MetricSnapshotInsert): MetricSnapshotInsert {
  return {
    handle: snapshot.handle.trim(),
    platform: snapshot.platform,
    marketing_rep: snapshot.marketing_rep?.trim() || null,
    followers: Math.max(0, Math.floor(snapshot.followers || 0)),
    likes: Math.max(0, Math.floor(snapshot.likes || 0)),
    posts: Math.max(0, Math.floor(snapshot.posts || 0)),
    videos: Math.max(0, Math.floor(snapshot.videos || 0)),
  };
}

/**
 * Insert multiple snapshots in a batch
 * Checks for existing records within 4-hour window to prevent duplicates
 */
export async function insertSnapshots(snapshots: MetricSnapshotInsert[]): Promise<InsertSnapshotsResult> {
  if (snapshots.length === 0) return { inserted: 0, skipped: 0, failed: 0, details: [] };

  const sql = getDb();
  const details: InsertSnapshotsResult['details'] = [];

  // Advisory lock prevents overlapping insert windows from duplicate cron/manual runs.
  const lockResult = await sql`
    SELECT pg_try_advisory_lock(${SCRAPE_INSERT_LOCK_KEY}) AS locked
  `;
  const lockAcquired = Boolean(lockResult[0]?.locked);
  if (!lockAcquired) {
    return {
      inserted: 0,
      skipped: snapshots.length,
      failed: 0,
      lockUnavailable: true,
      details: snapshots.map((snapshot) => ({
        handle: snapshot.handle,
        platform: snapshot.platform,
        status: 'skipped',
        error: 'Another scrape insert is already in progress',
      })),
    };
  }

  try {
    const normalized = snapshots.map(normalizeSnapshot).filter((snapshot) => snapshot.handle !== '');
    const dedupedByKey = new Map<string, MetricSnapshotInsert>();
    for (const snapshot of normalized) {
      dedupedByKey.set(getSnapshotKey(snapshot.handle, snapshot.platform), snapshot);
    }
    const deduped = Array.from(dedupedByKey.values());

    const recentRows = await sql`
      SELECT handle, platform
      FROM metrics_snapshots
      WHERE scraped_at > NOW() - INTERVAL '1 hour' * ${RECENT_SNAPSHOT_WINDOW_HOURS}
    `;
    const recentKeys = new Set<string>(
      recentRows.map((row) => getSnapshotKey(String(row.handle), String(row.platform)))
    );

    const toInsert = deduped.filter((snapshot) => !recentKeys.has(getSnapshotKey(snapshot.handle, snapshot.platform)));

    if (toInsert.length === 0) {
      for (const snapshot of deduped) {
        details.push({ handle: snapshot.handle, platform: snapshot.platform, status: 'skipped' });
      }
      return {
        inserted: 0,
        skipped: deduped.length,
        failed: 0,
        details,
      };
    }

    const payload = JSON.stringify(
      toInsert.map((snapshot) => ({
        handle: snapshot.handle,
        platform: snapshot.platform,
        marketing_rep: snapshot.marketing_rep || null,
        followers: snapshot.followers,
        likes: snapshot.likes || 0,
        posts: snapshot.posts || 0,
        videos: snapshot.videos || 0,
      }))
    );

    const insertedRows = await sql`
      INSERT INTO metrics_snapshots (handle, platform, marketing_rep, followers, likes, posts, videos)
      SELECT
        row_data.handle::VARCHAR(255),
        row_data.platform::VARCHAR(20),
        row_data.marketing_rep::VARCHAR(255),
        row_data.followers::INTEGER,
        row_data.likes::BIGINT,
        row_data.posts::INTEGER,
        row_data.videos::INTEGER
      FROM jsonb_to_recordset(${payload}::jsonb) AS row_data(
        handle TEXT,
        platform TEXT,
        marketing_rep TEXT,
        followers INTEGER,
        likes BIGINT,
        posts INTEGER,
        videos INTEGER
      )
      ON CONFLICT (handle, platform, scraped_at) DO NOTHING
      RETURNING handle, platform
    `;

    const insertedKeys = new Set<string>(
      insertedRows.map((row) => getSnapshotKey(String(row.handle), String(row.platform)))
    );

    let inserted = 0;
    let skipped = 0;

    for (const snapshot of deduped) {
      const key = getSnapshotKey(snapshot.handle, snapshot.platform);
      if (insertedKeys.has(key)) {
        inserted++;
        details.push({ handle: snapshot.handle, platform: snapshot.platform, status: 'inserted' });
      } else {
        skipped++;
        details.push({ handle: snapshot.handle, platform: snapshot.platform, status: 'skipped' });
      }
    }

    return { inserted, skipped, failed: 0, details };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to insert snapshots batch:', error);
    return {
      inserted: 0,
      skipped: 0,
      failed: snapshots.length,
      details: snapshots.map((snapshot) => ({
        handle: snapshot.handle,
        platform: snapshot.platform,
        status: 'failed',
        error: errorMsg,
      })),
    };
  } finally {
    await sql`SELECT pg_advisory_unlock(${SCRAPE_INSERT_LOCK_KEY})`;
  }
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
 *
 * Uses LATERAL joins to fetch all previous-period columns in 2 sub-lookups
 * instead of 7 correlated subqueries per row.
 */
export async function getMetricsWithDeltas(): Promise<MetricWithDeltas[]> {
  const sql = getDb();

  const result = await sql`
    WITH latest AS (
      SELECT DISTINCT ON (handle, platform)
        id, handle, platform, marketing_rep, followers, likes, posts, videos, scraped_at
      FROM metrics_snapshots
      ORDER BY handle, platform, scraped_at DESC
    )
    SELECT
      l.id,
      l.handle,
      l.platform,
      l.marketing_rep,
      l.followers,
      l.likes,
      l.posts,
      l.videos,
      l.scraped_at,
      l.followers - COALESCE(prev1d.followers, l.followers) AS delta_followers,
      l.likes    - COALESCE(prev1d.likes,    l.likes)    AS delta_likes,
      l.posts    - COALESCE(prev1d.posts,    l.posts)    AS delta_posts,
      l.videos   - COALESCE(prev1d.videos,   l.videos)   AS delta_videos,
      l.posts    - COALESCE(prev7d.posts,    l.posts)    AS delta_posts_7d,
      l.videos   - COALESCE(prev7d.videos,   l.videos)   AS delta_videos_7d,
      l.followers - COALESCE(prev1d.followers, l.followers) AS delta_1d,
      l.followers - COALESCE(prev7d.followers, l.followers) AS delta_7d
    FROM latest l
    LEFT JOIN LATERAL (
      SELECT followers, likes, posts, videos
      FROM metrics_snapshots m
      WHERE m.handle = l.handle
        AND m.platform = l.platform
        AND m.scraped_at <= l.scraped_at - INTERVAL '24 hours'
      ORDER BY m.scraped_at DESC
      LIMIT 1
    ) prev1d ON true
    LEFT JOIN LATERAL (
      SELECT followers, posts, videos
      FROM metrics_snapshots m
      WHERE m.handle = l.handle
        AND m.platform = l.platform
        AND m.scraped_at <= l.scraped_at - INTERVAL '7 days'
      ORDER BY m.scraped_at DESC
      LIMIT 1
    ) prev7d ON true
    ORDER BY l.followers DESC
  `;

  return result as MetricWithDeltas[];
}

/**
 * Get historical metrics with pre-calculated deltas (1D and 7D) for the selected time window.
 *
 * Uses LATERAL joins to fetch all previous-period columns in 2 sub-lookups
 * instead of 7 correlated subqueries per row.
 */
export async function getMetricsHistoryWithDeltas(days: number = 90): Promise<MetricWithDeltas[]> {
  const sql = getDb();

  const result = await sql`
    SELECT
      h.id,
      h.handle,
      h.platform,
      h.marketing_rep,
      h.followers,
      h.likes,
      h.posts,
      h.videos,
      h.scraped_at,
      h.followers - COALESCE(prev1d.followers, h.followers) AS delta_followers,
      h.likes    - COALESCE(prev1d.likes,    h.likes)    AS delta_likes,
      h.posts    - COALESCE(prev1d.posts,    h.posts)    AS delta_posts,
      h.videos   - COALESCE(prev1d.videos,   h.videos)   AS delta_videos,
      h.posts    - COALESCE(prev7d.posts,    h.posts)    AS delta_posts_7d,
      h.videos   - COALESCE(prev7d.videos,   h.videos)   AS delta_videos_7d,
      h.followers - COALESCE(prev1d.followers, h.followers) AS delta_1d,
      h.followers - COALESCE(prev7d.followers, h.followers) AS delta_7d
    FROM metrics_snapshots h
    LEFT JOIN LATERAL (
      SELECT followers, likes, posts, videos
      FROM metrics_snapshots m
      WHERE m.handle = h.handle
        AND m.platform = h.platform
        AND m.scraped_at <= h.scraped_at - INTERVAL '24 hours'
      ORDER BY m.scraped_at DESC
      LIMIT 1
    ) prev1d ON true
    LEFT JOIN LATERAL (
      SELECT followers, posts, videos
      FROM metrics_snapshots m
      WHERE m.handle = h.handle
        AND m.platform = h.platform
        AND m.scraped_at <= h.scraped_at - INTERVAL '7 days'
      ORDER BY m.scraped_at DESC
      LIMIT 1
    ) prev7d ON true
    WHERE h.scraped_at > NOW() - INTERVAL '1 day' * ${days}
    ORDER BY h.scraped_at DESC, h.followers DESC
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
    )
    SELECT
      COALESCE(l.marketing_rep, 'Unassigned') as rep,
      SUM(l.followers)::INTEGER as total_followers,
      SUM(l.followers - COALESCE(prev1d.followers, l.followers))::INTEGER as total_growth,
      COUNT(DISTINCT l.handle)::INTEGER as creator_count
    FROM latest l
    LEFT JOIN LATERAL (
      SELECT followers
      FROM metrics_snapshots m
      WHERE m.handle = l.handle
        AND m.platform = l.platform
        AND m.scraped_at <= l.scraped_at - INTERVAL '24 hours'
      ORDER BY m.scraped_at DESC
      LIMIT 1
    ) prev1d ON true
    GROUP BY l.marketing_rep
    ORDER BY total_followers DESC
  `;

  return result as {
    rep: string;
    total_followers: number;
    total_growth: number;
    creator_count: number;
  }[];
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function roundHoursSince(date: Date | null): number | null {
  if (!date) return null;
  const hours = (Date.now() - date.getTime()) / (1000 * 60 * 60);
  return Number.isFinite(hours) ? Number(hours.toFixed(1)) : null;
}

function derivePlatformStatus(
  latestSnapshotAt: Date | null,
  staleThresholdHours: number
): ScrapePlatformStatus {
  if (!latestSnapshotAt) return 'missing';
  const hoursSince = roundHoursSince(latestSnapshotAt);
  if (hoursSince === null) return 'missing';
  return hoursSince > staleThresholdHours ? 'stale' : 'fresh';
}

/**
 * Dashboard health signal for scrape freshness.
 */
export async function getScrapeHealthReport(
  cadenceHours: number = 24,
  staleThresholdHours: number = 26
): Promise<ScrapeHealthReport> {
  const sql = getDb();

  const overallRows = await sql`
    SELECT MAX(scraped_at) AS latest_snapshot_at
    FROM metrics_snapshots
  `;

  const platformRows = await sql`
    SELECT
      platform,
      MAX(scraped_at) AS latest_snapshot_at,
      COUNT(*) FILTER (WHERE scraped_at >= NOW() - INTERVAL '24 hours')::INTEGER AS snapshots_last_24h,
      COUNT(DISTINCT handle) FILTER (WHERE scraped_at >= NOW() - INTERVAL '24 hours')::INTEGER AS handles_last_24h
    FROM metrics_snapshots
    GROUP BY platform
  `;

  const byPlatform = new Map(
    platformRows.map((row) => [String(row.platform), row])
  );

  const platforms: ScrapeHealthPlatform[] = (['tiktok', 'instagram', 'twitter'] as Platform[]).map((platform) => {
    const row = byPlatform.get(platform);
    const latestSnapshotAt = toDate(row?.latest_snapshot_at);
    const hoursSince = roundHoursSince(latestSnapshotAt);

    return {
      platform,
      latest_snapshot_at: latestSnapshotAt,
      hours_since_latest_snapshot: hoursSince,
      snapshots_last_24h: Number(row?.snapshots_last_24h || 0),
      handles_last_24h: Number(row?.handles_last_24h || 0),
      status: derivePlatformStatus(latestSnapshotAt, staleThresholdHours),
    };
  });

  const latestSnapshotAt = toDate(overallRows[0]?.latest_snapshot_at);
  const hoursSinceLatestSnapshot = roundHoursSince(latestSnapshotAt);

  const stalePlatforms = platforms.filter((platform) => platform.status !== 'fresh');
  const allStale = stalePlatforms.length === platforms.length;
  const isOverallStale = hoursSinceLatestSnapshot === null || hoursSinceLatestSnapshot > staleThresholdHours;

  let status: ScrapeHealthStatus = 'healthy';
  if (isOverallStale || allStale) {
    status = 'stale';
  } else if (stalePlatforms.length > 0) {
    status = 'degraded';
  }

  const issues: string[] = [];
  if (!latestSnapshotAt) {
    issues.push('No snapshots found in metrics_snapshots');
  } else if (hoursSinceLatestSnapshot !== null && hoursSinceLatestSnapshot > staleThresholdHours) {
    issues.push(`Last snapshot is ${hoursSinceLatestSnapshot}h old (threshold ${staleThresholdHours}h)`);
  }

  stalePlatforms.forEach((platform) => {
    if (platform.status === 'missing') {
      issues.push(`No ${platform.platform} snapshots found`);
      return;
    }
    issues.push(`${platform.platform} snapshots are stale (${platform.hours_since_latest_snapshot}h old)`);
  });

  return {
    generated_at: new Date(),
    cadence_hours: cadenceHours,
    stale_threshold_hours: staleThresholdHours,
    latest_snapshot_at: latestSnapshotAt,
    hours_since_latest_snapshot: hoursSinceLatestSnapshot,
    status,
    action_required: status !== 'healthy',
    issues,
    platforms,
  };
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
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_handle_platform_time_desc ON metrics_snapshots(handle, platform, scraped_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_scraped_at ON metrics_snapshots(scraped_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_platform_time ON metrics_snapshots(platform, scraped_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_marketing_rep ON metrics_snapshots(marketing_rep)`;
}
