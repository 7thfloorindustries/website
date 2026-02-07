import { redis } from '@/lib/redis';
import { isCacheEnabled } from '@/lib/influencer/flags';

type CacheRecord<T> = {
  cached_at: string;
  payload: T;
  stale_after_ms: number;
};

const CACHE_TTL_SECONDS = 45;

export function getCacheTtlSeconds(): number {
  return CACHE_TTL_SECONDS;
}

export async function getCachedPayload<T>(key: string): Promise<CacheRecord<T> | null> {
  if (!isCacheEnabled()) return null;
  try {
    const value = await redis.get<CacheRecord<T>>(key);
    if (!value || typeof value !== 'object') return null;
    return value;
  } catch {
    return null;
  }
}

export async function setCachedPayload<T>(key: string, payload: T): Promise<void> {
  if (!isCacheEnabled()) return;
  try {
    const record: CacheRecord<T> = {
      payload,
      cached_at: new Date().toISOString(),
      stale_after_ms: CACHE_TTL_SECONDS * 1000,
    };
    await redis.set(key, record, { ex: CACHE_TTL_SECONDS });
  } catch {
    // Best-effort cache; ignore failures.
  }
}

export function isCacheStale(record: CacheRecord<unknown>): boolean {
  const cachedAtMs = Date.parse(record.cached_at);
  if (!Number.isFinite(cachedAtMs)) return true;
  return Date.now() - cachedAtMs > record.stale_after_ms;
}

export function makeInfluencerCacheKey(
  namespace: string,
  session: { orgId: string; role: string; userId: string },
  params: Record<string, string | number | undefined>
): string {
  const sortedParams = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return `influencer:${namespace}:org=${session.orgId}:role=${session.role}:user=${session.userId}:${sortedParams}`;
}
