/**
 * Paginated campaign list with filtering and sorting
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCampaigns } from '@/lib/db/creatorcore';
import { getInfluencerSession } from '@/lib/influencer/auth';
import { shapeCampaignSummaryForRole } from '@/lib/influencer/field-access';
import {
  getCachedPayload,
  isCacheStale,
  makeInfluencerCacheKey,
  setCachedPayload,
} from '@/lib/influencer/cache';
import { shouldFilterTestData } from '@/lib/influencer/flags';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestStartedAt = performance.now();
  const session = getInfluencerSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const queryParams = {
      page: Number(searchParams.get('page')) || 1,
      limit: Number(searchParams.get('limit')) || 50,
      search: searchParams.get('search') || undefined,
      genre: searchParams.get('genre') || undefined,
      platform: searchParams.get('platform') || undefined,
      sort: searchParams.get('sort') || undefined,
      intake: (searchParams.get('intake') as 'all' | 'main' | 'pending' | null) || undefined,
      review: (searchParams.get('review') as 'all' | 'needs_review' | null) || undefined,
      min_budget: searchParams.has('min_budget') ? Number(searchParams.get('min_budget')) : undefined,
      max_budget: searchParams.has('max_budget') ? Number(searchParams.get('max_budget')) : undefined,
    };
    const debugMode = searchParams.get('debug') === '1';
    const cacheKey = makeInfluencerCacheKey('campaigns', session, {
      ...queryParams,
      debug: debugMode ? 1 : undefined,
    });

    const cacheLookupStartedAt = performance.now();
    const cached = await getCachedPayload<Record<string, unknown>>(cacheKey);
    const cacheLookupMs = performance.now() - cacheLookupStartedAt;
    if (cached) {
      const response = NextResponse.json(cached.payload);
      const state = isCacheStale(cached) ? 'stale' : 'hit';
      response.headers.set(
        'Server-Timing',
        `cache;desc="${state}";dur=${cacheLookupMs.toFixed(1)},total;dur=${(performance.now() - requestStartedAt).toFixed(1)}`
      );
      if (!isCacheStale(cached)) {
        return response;
      }
      void (async () => {
        try {
          const fresh = await getCampaigns(session, queryParams);
          const freshPayload = {
            ...fresh,
            campaigns: fresh.campaigns.map((campaign) => shapeCampaignSummaryForRole(campaign, session.role)),
            ...(debugMode ? { is_test_data_filtered: shouldFilterTestData() } : {}),
          };
          await setCachedPayload(cacheKey, freshPayload);
        } catch (error) {
          console.warn('campaigns cache revalidation failed', error);
        }
      })();
      return response;
    }

    const dbStartedAt = performance.now();
    const result = await getCampaigns(session, queryParams);
    const dbMs = performance.now() - dbStartedAt;

    const payload = {
      ...result,
      campaigns: result.campaigns.map((campaign) => shapeCampaignSummaryForRole(campaign, session.role)),
      ...(debugMode ? { is_test_data_filtered: shouldFilterTestData() } : {}),
    };

    await setCachedPayload(cacheKey, payload);

    const response = NextResponse.json(payload);
    response.headers.set(
      'Server-Timing',
      `cache;desc="miss";dur=${cacheLookupMs.toFixed(1)},db;dur=${dbMs.toFixed(1)},total;dur=${(performance.now() - requestStartedAt).toFixed(1)}`
    );
    return response;
  } catch (error) {
    console.error('Failed to fetch campaigns:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch campaigns' },
      { status: 500 }
    );
  }
}
