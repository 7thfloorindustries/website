import { neon } from '@neondatabase/serverless';

function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return neon(connectionString);
}

export interface ArchiveResult {
  archivedCount: number;
  deletedCount: number;
  thresholdDate: string;
}

export interface ArchiveStats {
  snapshotsCount: number;
  archiveCount: number;
  oldestSnapshot: string | null;
  newestSnapshot: string | null;
  oldestArchive: string | null;
  newestArchive: string | null;
}

/**
 * Archive snapshots older than the given number of days.
 * Uses a transaction: INSERT INTO archive, then DELETE from snapshots.
 */
export async function archiveOldSnapshots(retentionDays: number = 90): Promise<ArchiveResult> {
  const sql = getDb();
  const thresholdDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  // Insert into archive (skip duplicates via ON CONFLICT)
  const inserted = await sql`
    INSERT INTO metrics_snapshots_archive (id, handle, platform, marketing_rep, followers, likes, posts, videos, scraped_at)
    SELECT id, handle, platform, marketing_rep, followers, likes, posts, videos, scraped_at
    FROM metrics_snapshots
    WHERE scraped_at < ${thresholdDate}
    ON CONFLICT (id) DO NOTHING
  `;

  // Delete the archived rows from the main table
  const deleted = await sql`
    DELETE FROM metrics_snapshots
    WHERE scraped_at < ${thresholdDate}
      AND id IN (SELECT id FROM metrics_snapshots_archive)
    RETURNING id
  `;

  return {
    archivedCount: typeof inserted === 'object' && 'count' in inserted ? Number(inserted.count) : 0,
    deletedCount: deleted.length,
    thresholdDate,
  };
}

/**
 * Get stats about the current snapshots and archive tables.
 */
export async function getArchiveStats(): Promise<ArchiveStats> {
  const sql = getDb();

  const [snapshotStats, archiveStats] = await Promise.all([
    sql`
      SELECT
        COUNT(*)::INTEGER AS count,
        MIN(scraped_at) AS oldest,
        MAX(scraped_at) AS newest
      FROM metrics_snapshots
    `,
    sql`
      SELECT
        COUNT(*)::INTEGER AS count,
        MIN(scraped_at) AS oldest,
        MAX(scraped_at) AS newest
      FROM metrics_snapshots_archive
    `,
  ]);

  return {
    snapshotsCount: Number(snapshotStats[0]?.count || 0),
    archiveCount: Number(archiveStats[0]?.count || 0),
    oldestSnapshot: snapshotStats[0]?.oldest ? String(snapshotStats[0].oldest) : null,
    newestSnapshot: snapshotStats[0]?.newest ? String(snapshotStats[0].newest) : null,
    oldestArchive: archiveStats[0]?.oldest ? String(archiveStats[0].oldest) : null,
    newestArchive: archiveStats[0]?.newest ? String(archiveStats[0].newest) : null,
  };
}
