/**
 * Aggregate dashboard stats endpoint
 */

import { NextResponse } from 'next/server';
import { getAggregateStats } from '@/lib/db/creatorcore';
import { getInfluencerSession } from '@/lib/influencer/auth';
import { shapeStatsForRole } from '@/lib/influencer/field-access';
import type { NextRequest } from 'next/server';
import {
  getCachedPayload,
  isCacheStale,
  makeInfluencerCacheKey,
  setCachedPayload,
} from '@/lib/influencer/cache';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestStartedAt = performance.now();
  const session = getInfluencerSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const cacheKey = makeInfluencerCacheKey('stats', session, {});
    const cacheLookupStartedAt = performance.now();
    const cached = await getCachedPayload<Record<string, unknown>>(cacheKey);
    const cacheLookupMs = performance.now() - cacheLookupStartedAt;

    if (cached) {
      const response = NextResponse.json(cached.payload);
      const stale = isCacheStale(cached);
      response.headers.set(
        'Server-Timing',
        `cache;desc="${stale ? 'stale' : 'hit'}";dur=${cacheLookupMs.toFixed(1)},total;dur=${(performance.now() - requestStartedAt).toFixed(1)}`
      );
      if (!stale) {
        return response;
      }

      void (async () => {
        try {
          const freshStats = await getAggregateStats(session);
          const shaped = shapeStatsForRole(freshStats, session.role);
          await setCachedPayload(cacheKey, shaped);
        } catch (error) {
          console.warn('stats cache revalidation failed', error);
        }
      })();
      return response;
    }

    const dbStartedAt = performance.now();
    const stats = await getAggregateStats(session);
    const dbMs = performance.now() - dbStartedAt;
    const payload = shapeStatsForRole(stats, session.role);
    await setCachedPayload(cacheKey, payload);

    const response = NextResponse.json(payload);
    response.headers.set(
      'Server-Timing',
      `cache;desc="miss";dur=${cacheLookupMs.toFixed(1)},db;dur=${dbMs.toFixed(1)},total;dur=${(performance.now() - requestStartedAt).toFixed(1)}`
    );
    return response;
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
