import { Redis } from '@upstash/redis';

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60; // 15 minutes
const WINDOW_MS = WINDOW_SECONDS * 1000;

// In-memory fallback for when Upstash is not configured
const attempts = new Map<string, { count: number; windowStart: number }>();

let redis: Redis | null = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

const REDIS_PREFIX = 'login_fail:';

export interface RateLimitResult {
  blocked: boolean;
  retryAfterMs?: number;
}

/**
 * Check if an IP is currently locked out due to too many failed attempts.
 */
export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  if (redis) {
    const key = `${REDIS_PREFIX}${ip}`;
    const count = await redis.get<number>(key);
    if (count !== null && count >= MAX_ATTEMPTS) {
      const ttl = await redis.ttl(key);
      return { blocked: true, retryAfterMs: ttl > 0 ? ttl * 1000 : WINDOW_MS };
    }
    return { blocked: false };
  }

  // In-memory fallback
  const entry = attempts.get(ip);
  if (!entry) return { blocked: false };

  const now = Date.now();
  if (now - entry.windowStart > WINDOW_MS) {
    attempts.delete(ip);
    return { blocked: false };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return { blocked: true, retryAfterMs: WINDOW_MS - (now - entry.windowStart) };
  }

  return { blocked: false };
}

/**
 * Record a failed login attempt for an IP.
 */
export async function recordFailedAttempt(ip: string): Promise<void> {
  if (redis) {
    const key = `${REDIS_PREFIX}${ip}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, WINDOW_SECONDS);
    }
    return;
  }

  // In-memory fallback
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(ip, { count: 1, windowStart: now });
    return;
  }

  entry.count += 1;

  // Periodic cleanup
  if (attempts.size > 1000) {
    for (const [key, e] of attempts) {
      if (now - e.windowStart > WINDOW_MS) {
        attempts.delete(key);
      }
    }
  }
}
