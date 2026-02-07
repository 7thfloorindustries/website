import { neon } from '@neondatabase/serverless';
import { logger } from '@/lib/logger';
import type { Platform } from '@/lib/db';

export type AnomalySeverity = 'suspicious_drop' | 'likely_error';

export interface Anomaly {
  handle: string;
  platform: Platform;
  metric: string;
  previousValue: number;
  newValue: number;
  dropPercent: number;
  severity: AnomalySeverity;
}

interface NewMetric {
  handle: string;
  platform: Platform;
  followers: number;
  likes?: number;
  posts?: number;
  videos?: number;
}

interface PreviousSnapshot {
  handle: string;
  platform: string;
  followers: number;
  likes: number;
  posts: number;
  videos: number;
}

function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return neon(connectionString);
}

function checkDrop(
  handle: string,
  platform: Platform,
  metric: string,
  previousValue: number,
  newValue: number
): Anomaly | null {
  if (previousValue <= 0 || newValue < 0) return null;
  if (newValue >= previousValue) return null;

  const dropPercent = ((previousValue - newValue) / previousValue) * 100;

  if (dropPercent >= 90) {
    return { handle, platform, metric, previousValue, newValue, dropPercent, severity: 'likely_error' };
  }
  if (metric === 'followers' && dropPercent >= 50) {
    return { handle, platform, metric, previousValue, newValue, dropPercent, severity: 'suspicious_drop' };
  }

  return null;
}

/**
 * Compare new scrape results against the most recent previous snapshot
 * and flag suspicious drops.
 */
export async function detectAnomalies(newMetrics: NewMetric[]): Promise<Anomaly[]> {
  if (newMetrics.length === 0) return [];

  const sql = getDb();
  const anomalies: Anomaly[] = [];

  // Fetch the latest previous snapshot for each handle+platform
  const handles = newMetrics.map((m) => m.handle);
  const previousRows = await sql`
    SELECT DISTINCT ON (handle, platform)
      handle, platform, followers, likes, posts, videos
    FROM metrics_snapshots
    WHERE handle = ANY(${handles})
    ORDER BY handle, platform, scraped_at DESC
  ` as PreviousSnapshot[];

  const previousMap = new Map<string, PreviousSnapshot>();
  for (const row of previousRows) {
    previousMap.set(`${row.handle}::${row.platform}`, row);
  }

  for (const metric of newMetrics) {
    const key = `${metric.handle}::${metric.platform}`;
    const prev = previousMap.get(key);
    if (!prev) continue; // No previous data to compare against

    const checks = [
      checkDrop(metric.handle, metric.platform, 'followers', prev.followers, metric.followers),
      checkDrop(metric.handle, metric.platform, 'likes', prev.likes, metric.likes ?? 0),
      checkDrop(metric.handle, metric.platform, 'posts', prev.posts, metric.posts ?? 0),
      checkDrop(metric.handle, metric.platform, 'videos', prev.videos, metric.videos ?? 0),
    ];

    for (const anomaly of checks) {
      if (anomaly) {
        anomalies.push(anomaly);
        logger.warn('Anomaly detected', {
          handle: anomaly.handle,
          platform: anomaly.platform,
          metric: anomaly.metric,
          previousValue: anomaly.previousValue,
          newValue: anomaly.newValue,
          dropPercent: Math.round(anomaly.dropPercent),
          severity: anomaly.severity,
        });
      }
    }
  }

  return anomalies;
}
