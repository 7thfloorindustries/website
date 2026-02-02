/**
 * Upstash Redis client for storing campaign snapshots
 */

import { Redis } from '@upstash/redis';

// Initialize Redis client (uses UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars)
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

export interface CampaignSnapshot {
  timestamp: string;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  postCount: number;
  byPlatform: Record<string, {
    views: number;
    likes: number;
    posts: number;
  }>;
}

/**
 * Store a campaign snapshot
 */
export async function storeCampaignSnapshot(
  campaignSlug: string,
  snapshot: CampaignSnapshot
): Promise<void> {
  const key = `campaign:${campaignSlug}:snapshots`;

  // Add to sorted set with timestamp as score for easy range queries
  const score = new Date(snapshot.timestamp).getTime();
  await redis.zadd(key, { score, member: JSON.stringify(snapshot) });

  // Keep only last 90 days of data (trim old entries)
  const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
  await redis.zremrangebyscore(key, 0, cutoff);
}

/**
 * Get campaign snapshots for a time range
 */
export async function getCampaignSnapshots(
  campaignSlug: string,
  days: number = 14
): Promise<CampaignSnapshot[]> {
  const key = `campaign:${campaignSlug}:snapshots`;
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);

  // Get all snapshots from cutoff to now using zrange with BYSCORE
  const results = await redis.zrange(key, cutoff, Date.now(), { byScore: true });

  return results.map((item) => {
    if (typeof item === 'string') {
      return JSON.parse(item) as CampaignSnapshot;
    }
    return item as CampaignSnapshot;
  });
}

/**
 * Check if Redis is configured
 */
export function isRedisConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}
