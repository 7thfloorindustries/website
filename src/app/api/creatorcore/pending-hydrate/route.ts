/**
 * CreatorCore pending hydration endpoint - frequent cron
 * Rechecks pending campaigns and hydrates posts by explicit post IDs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runCreatorDiscoverySweep, runPendingHydration } from '@/lib/creatorcore/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function getFiniteNumber(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const pendingRecheckLimit = getFiniteNumber(
      searchParams.get('pending_limit'),
      getFiniteNumber(process.env.CREATORCORE_PENDING_RECHECK_LIMIT ?? null, 160)
    );
    const pendingRecheckMinAgeMinutes = getFiniteNumber(
      searchParams.get('pending_min_age_minutes'),
      getFiniteNumber(process.env.CREATORCORE_PENDING_RECHECK_MIN_AGE_MINUTES ?? null, 10)
    );
    const pendingRecheckPostsPerCampaign = getFiniteNumber(
      searchParams.get('pending_posts_per_campaign'),
      getFiniteNumber(process.env.CREATORCORE_PENDING_RECHECK_POSTS_PER_CAMPAIGN ?? null, 80)
    );
    const pendingRecheckPostFetchLimit = getFiniteNumber(
      searchParams.get('pending_post_fetch_limit'),
      getFiniteNumber(process.env.CREATORCORE_PENDING_RECHECK_POST_FETCH_LIMIT ?? null, 1500)
    );
    const pendingRecheckPostConcurrency = getFiniteNumber(
      searchParams.get('pending_post_concurrency'),
      getFiniteNumber(process.env.CREATORCORE_PENDING_RECHECK_POST_CONCURRENCY ?? null, 10)
    );
    const creatorDiscoveryCampaignLimit = getFiniteNumber(
      searchParams.get('discovery_campaign_limit'),
      getFiniteNumber(process.env.CREATORCORE_CREATOR_DISCOVERY_CAMPAIGN_LIMIT ?? null, 120)
    );
    const creatorDiscoveryMinAgeMinutes = getFiniteNumber(
      searchParams.get('discovery_min_age_minutes'),
      getFiniteNumber(process.env.CREATORCORE_CREATOR_DISCOVERY_MIN_AGE_MINUTES ?? null, 10)
    );
    const creatorDiscoveryPostsPerCampaign = getFiniteNumber(
      searchParams.get('discovery_posts_per_campaign'),
      getFiniteNumber(process.env.CREATORCORE_CREATOR_DISCOVERY_POSTS_PER_CAMPAIGN ?? null, 60)
    );
    const creatorDiscoveryPostFetchLimit = getFiniteNumber(
      searchParams.get('discovery_post_fetch_limit'),
      getFiniteNumber(process.env.CREATORCORE_CREATOR_DISCOVERY_POST_FETCH_LIMIT ?? null, 1500)
    );
    const creatorDiscoveryPostConcurrency = getFiniteNumber(
      searchParams.get('discovery_post_concurrency'),
      getFiniteNumber(process.env.CREATORCORE_CREATOR_DISCOVERY_POST_CONCURRENCY ?? null, 10)
    );

    const pendingHydration = await runPendingHydration({
      pendingRecheckLimit,
      pendingRecheckMinAgeMinutes,
      pendingRecheckPostsPerCampaign,
      pendingRecheckPostFetchLimit,
      pendingRecheckPostConcurrency,
    });

    const creatorDiscovery = await runCreatorDiscoverySweep({
      creatorDiscoveryCampaignLimit,
      creatorDiscoveryMinAgeMinutes,
      creatorDiscoveryPostsPerCampaign,
      creatorDiscoveryPostFetchLimit,
      creatorDiscoveryPostConcurrency,
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      pendingHydration,
      creatorDiscovery,
    });
  } catch (error) {
    console.error('CreatorCore pending hydration failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Pending hydration failed' },
      { status: 500 }
    );
  }
}
