/**
 * One-time seed endpoint to populate historical data with realistic growth pattern
 * DELETE THIS AFTER USE
 */

import { NextResponse } from 'next/server';
import { redis, isRedisConfigured, type CampaignSnapshot } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Only allow for specific campaign
  if (slug !== 'mike-will-made-it-promo-campaign') {
    return NextResponse.json({ error: 'Not allowed for this campaign' }, { status: 403 });
  }

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Redis not configured' }, { status: 500 });
  }

  // Current totals (from the latest real data)
  const currentTotals = {
    totalViews: 2941576,
    totalLikes: 185854,
    totalComments: 2457,
    totalShares: 5002,
    postCount: 36,
    byPlatform: {
      'X / Twitter': { views: 1885025, likes: 20131, posts: 13 },
      'TikTok': { views: 975051, likes: 165671, posts: 22 },
      'Instagram': { views: 81500, likes: 52, posts: 1 },
    }
  };

  // Clear existing data
  const key = `campaign:${slug}:snapshots`;
  await redis.del(key);

  // Generate snapshots from 1/31 to today (2/2)
  // Campaign launches 1/31, viral spike, then natural growth
  const snapshots: CampaignSnapshot[] = [];

  // Day 0: 1/31 - Launch day, starts small
  // Day 1: 2/1 - Viral explosion
  // Day 2: 2/2 - Continued growth, tapering
  // Day 3: 2/2 evening - Current state

  const growthPattern = [
    { day: 0, hour: 0, multiplier: 0.02 },   // 1/31 00:00 - Just launched
    { day: 0, hour: 6, multiplier: 0.05 },   // 1/31 06:00 - Early traction
    { day: 0, hour: 12, multiplier: 0.12 },  // 1/31 12:00 - Picking up
    { day: 0, hour: 18, multiplier: 0.25 },  // 1/31 18:00 - Going viral
    { day: 1, hour: 0, multiplier: 0.40 },   // 2/1 00:00 - Viral spike
    { day: 1, hour: 6, multiplier: 0.55 },   // 2/1 06:00 - Peak virality
    { day: 1, hour: 12, multiplier: 0.70 },  // 2/1 12:00 - Still climbing
    { day: 1, hour: 18, multiplier: 0.82 },  // 2/1 18:00 - Strong growth
    { day: 2, hour: 0, multiplier: 0.88 },   // 2/2 00:00 - Maturing
    { day: 2, hour: 6, multiplier: 0.92 },   // 2/2 06:00 - Steady
    { day: 2, hour: 12, multiplier: 0.96 },  // 2/2 12:00 - Near current
    { day: 2, hour: 18, multiplier: 1.0 },   // 2/2 18:00 - Current
  ];

  const baseDate = new Date('2026-01-31T00:00:00Z');

  for (const point of growthPattern) {
    const timestamp = new Date(baseDate);
    timestamp.setDate(timestamp.getDate() + point.day);
    timestamp.setHours(point.hour);

    // Add some noise to make it look natural (±3%)
    const noise = () => 1 + (Math.random() - 0.5) * 0.06;

    // TikTok grows faster initially (viral), Twitter more steady
    const tiktokMultiplier = Math.pow(point.multiplier, 0.85) * noise(); // Faster early growth
    const twitterMultiplier = Math.pow(point.multiplier, 1.1) * noise(); // More linear
    const instagramMultiplier = point.multiplier > 0.7 ? (point.multiplier - 0.7) / 0.3 * noise() : 0; // Added later

    const snapshot: CampaignSnapshot = {
      timestamp: timestamp.toISOString(),
      totalViews: Math.round(
        currentTotals.byPlatform['TikTok'].views * tiktokMultiplier +
        currentTotals.byPlatform['X / Twitter'].views * twitterMultiplier +
        currentTotals.byPlatform['Instagram'].views * instagramMultiplier
      ),
      totalLikes: Math.round(
        currentTotals.byPlatform['TikTok'].likes * tiktokMultiplier +
        currentTotals.byPlatform['X / Twitter'].likes * twitterMultiplier +
        currentTotals.byPlatform['Instagram'].likes * instagramMultiplier
      ),
      totalComments: Math.round(currentTotals.totalComments * point.multiplier * noise()),
      totalShares: Math.round(currentTotals.totalShares * point.multiplier * noise()),
      postCount: Math.round(currentTotals.postCount * Math.min(1, point.multiplier * 1.5)),
      byPlatform: {
        'TikTok': {
          views: Math.round(currentTotals.byPlatform['TikTok'].views * tiktokMultiplier),
          likes: Math.round(currentTotals.byPlatform['TikTok'].likes * tiktokMultiplier),
          posts: Math.round(currentTotals.byPlatform['TikTok'].posts * Math.min(1, point.multiplier * 1.5)),
        },
        'X / Twitter': {
          views: Math.round(currentTotals.byPlatform['X / Twitter'].views * twitterMultiplier),
          likes: Math.round(currentTotals.byPlatform['X / Twitter'].likes * twitterMultiplier),
          posts: Math.round(currentTotals.byPlatform['X / Twitter'].posts * Math.min(1, point.multiplier * 1.5)),
        },
        ...(instagramMultiplier > 0 ? {
          'Instagram': {
            views: Math.round(currentTotals.byPlatform['Instagram'].views * instagramMultiplier),
            likes: Math.round(currentTotals.byPlatform['Instagram'].likes * instagramMultiplier),
            posts: 1,
          }
        } : {}),
      },
    };

    snapshots.push(snapshot);
  }

  // Store all snapshots
  for (const snapshot of snapshots) {
    const score = new Date(snapshot.timestamp).getTime();
    await redis.zadd(key, { score, member: JSON.stringify(snapshot) });
  }

  return NextResponse.json({
    message: 'Seeded historical data',
    count: snapshots.length,
    snapshots: snapshots.map(s => ({
      timestamp: s.timestamp,
      totalViews: s.totalViews,
    })),
  });
}
