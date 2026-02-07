/**
 * CreatorCore sync endpoint - hourly cron
 * Incrementally syncs campaigns and posts from CreatorCore API
 */

import { NextRequest, NextResponse } from 'next/server';
import { runFullSync } from '@/lib/creatorcore/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const campaignPages = Number(searchParams.get('campaign_pages') || process.env.CREATORCORE_SYNC_CAMPAIGN_PAGES || 10);
    const postPages = Number(searchParams.get('post_pages') || process.env.CREATORCORE_SYNC_POST_PAGES || 20);
    const pendingRecheckLimit = Number(searchParams.get('pending_limit') || process.env.CREATORCORE_PENDING_RECHECK_LIMIT || 30);
    const pendingRecheckMinAgeMinutes = Number(
      searchParams.get('pending_min_age_minutes') || process.env.CREATORCORE_PENDING_RECHECK_MIN_AGE_MINUTES || 30
    );
    const pendingRecheckPostsPerCampaign = Number(
      searchParams.get('pending_posts_per_campaign') || process.env.CREATORCORE_PENDING_RECHECK_POSTS_PER_CAMPAIGN || 25
    );
    const pendingRecheckPostFetchLimit = Number(
      searchParams.get('pending_post_fetch_limit') || process.env.CREATORCORE_PENDING_RECHECK_POST_FETCH_LIMIT || 400
    );
    const pendingRecheckPostConcurrency = Number(
      searchParams.get('pending_post_concurrency') || process.env.CREATORCORE_PENDING_RECHECK_POST_CONCURRENCY || 8
    );
    const creatorDiscoveryCampaignLimit = Number(
      searchParams.get('discovery_campaign_limit') || process.env.CREATORCORE_CREATOR_DISCOVERY_CAMPAIGN_LIMIT || 200
    );
    const creatorDiscoveryMinAgeMinutes = Number(
      searchParams.get('discovery_min_age_minutes') || process.env.CREATORCORE_CREATOR_DISCOVERY_MIN_AGE_MINUTES || 15
    );
    const creatorDiscoveryPostsPerCampaign = Number(
      searchParams.get('discovery_posts_per_campaign') || process.env.CREATORCORE_CREATOR_DISCOVERY_POSTS_PER_CAMPAIGN || 80
    );
    const creatorDiscoveryPostFetchLimit = Number(
      searchParams.get('discovery_post_fetch_limit') || process.env.CREATORCORE_CREATOR_DISCOVERY_POST_FETCH_LIMIT || 2000
    );
    const creatorDiscoveryPostConcurrency = Number(
      searchParams.get('discovery_post_concurrency') || process.env.CREATORCORE_CREATOR_DISCOVERY_POST_CONCURRENCY || 10
    );

    const result = await runFullSync({
      campaignPages: Number.isFinite(campaignPages) ? campaignPages : 10,
      postPages: Number.isFinite(postPages) ? postPages : 20,
      pendingRecheckLimit: Number.isFinite(pendingRecheckLimit) ? pendingRecheckLimit : 30,
      pendingRecheckMinAgeMinutes: Number.isFinite(pendingRecheckMinAgeMinutes) ? pendingRecheckMinAgeMinutes : 30,
      pendingRecheckPostsPerCampaign: Number.isFinite(pendingRecheckPostsPerCampaign) ? pendingRecheckPostsPerCampaign : 25,
      pendingRecheckPostFetchLimit: Number.isFinite(pendingRecheckPostFetchLimit) ? pendingRecheckPostFetchLimit : 400,
      pendingRecheckPostConcurrency: Number.isFinite(pendingRecheckPostConcurrency) ? pendingRecheckPostConcurrency : 8,
      creatorDiscoveryCampaignLimit: Number.isFinite(creatorDiscoveryCampaignLimit) ? creatorDiscoveryCampaignLimit : 200,
      creatorDiscoveryMinAgeMinutes: Number.isFinite(creatorDiscoveryMinAgeMinutes) ? creatorDiscoveryMinAgeMinutes : 15,
      creatorDiscoveryPostsPerCampaign: Number.isFinite(creatorDiscoveryPostsPerCampaign) ? creatorDiscoveryPostsPerCampaign : 80,
      creatorDiscoveryPostFetchLimit: Number.isFinite(creatorDiscoveryPostFetchLimit) ? creatorDiscoveryPostFetchLimit : 2000,
      creatorDiscoveryPostConcurrency: Number.isFinite(creatorDiscoveryPostConcurrency) ? creatorDiscoveryPostConcurrency : 10,
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error('CreatorCore sync failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
