import { NextRequest, NextResponse } from 'next/server';
import { hasBrokeSession, isBrokeAuthEnforced } from '@/lib/broke/auth';
import { hasInfluencerSession } from '@/lib/influencer/auth';

// Dynamic imports for Redis (only loaded when env vars present)
let ratelimit: {
  limit: (identifier: string) => Promise<{ success: boolean; remaining: number; reset: number }>;
} | null = null;
let redisInitialized = false;

async function initRedis() {
  if (redisInitialized) return;
  redisInitialized = true;

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const { Ratelimit } = await import('@upstash/ratelimit');
      const { Redis } = await import('@upstash/redis');

      const redis = Redis.fromEnv();
      ratelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, '60 s'),
        analytics: true,
        prefix: '7thfloor:ratelimit',
      });
      console.log('[Middleware] Redis rate limiting initialized');
    } catch (error) {
      console.error('[Middleware] Failed to initialize Redis:', error);
    }
  }
}

// In-memory rate limiting fallback
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 60 seconds
const RATE_LIMIT_MAX_REQUESTS = 5;

function getClientIp(request: NextRequest): string {
  // Cloudflare header (highest priority)
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // Check common proxy headers
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  return 'unknown';
}

function isRateLimitedInMemory(ip: string): { limited: boolean; retryAfter: number } {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  // Clean up expired entries periodically
  if (rateLimitStore.size > 10000) {
    for (const [key, value] of rateLimitStore.entries()) {
      if (now > value.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }

  if (!record || now > record.resetTime) {
    rateLimitStore.set(ip, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
    });
    return { limited: false, retryAfter: 0 };
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return { limited: true, retryAfter };
  }

  record.count++;
  return { limited: false, retryAfter: 0 };
}

async function checkRateLimit(ip: string): Promise<{ limited: boolean; retryAfter: number }> {
  // Try Redis first
  if (ratelimit) {
    try {
      const { success, reset } = await ratelimit.limit(ip);
      if (!success) {
        const retryAfter = Math.ceil((reset - Date.now()) / 1000);
        return { limited: true, retryAfter: Math.max(1, retryAfter) };
      }
      return { limited: false, retryAfter: 0 };
    } catch (error) {
      console.error('[Middleware] Redis rate limit error, falling back to in-memory:', error);
      // Fall through to in-memory
    }
  }

  // Fallback to in-memory
  return isRateLimitedInMemory(ip);
}

function generateNonce(): string {
  // Generate a random nonce for CSP
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}

function getRequestHostname(request: NextRequest): string {
  const rawHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  const firstHost = rawHost.split(',')[0].trim().toLowerCase();
  return firstHost.replace(/:\d+$/, '');
}

function buildCspHeader(nonce: string): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'", // Required for Framer Motion
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://challenges.cloudflare.com",
    "media-src 'self'",
    "frame-src https://challenges.cloudflare.com", // For Turnstile iframe
    "frame-ancestors 'self'",
  ];

  return directives.join('; ');
}

export async function proxy(request: NextRequest) {
  const hostname = getRequestHostname(request);
  const pathname = request.nextUrl.pathname;
  const isBrokedownHost = hostname === 'brokedown.app' || hostname === 'www.brokedown.app';
  const rewritePathname = isBrokedownHost && !pathname.startsWith('/broke') && !pathname.startsWith('/api')
    ? (pathname === '/' ? '/broke' : `/broke${pathname}`)
    : pathname;
  const rewriteUrl = rewritePathname !== pathname
    ? (() => {
      const url = request.nextUrl.clone();
      url.pathname = rewritePathname;
      return url;
    })()
    : null;

  // Server-side auth enforcement for Brokedown private surfaces.
  if (isBrokeAuthEnforced()) {
    const isBrokeDashboardAuthPage = rewritePathname === '/broke/dashboard/auth';
    const isBrokeDashboardRoute = rewritePathname === '/broke/dashboard' || rewritePathname.startsWith('/broke/dashboard/');
    const isBrokeMetricsApi = rewritePathname === '/api/metrics';
    const requiresBrokeSession = (isBrokeDashboardRoute && !isBrokeDashboardAuthPage) || isBrokeMetricsApi;

    if (requiresBrokeSession && !hasBrokeSession(request)) {
      if (isBrokeMetricsApi) {
        return new NextResponse(
          JSON.stringify({ error: 'Unauthorized' }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/broke/dashboard/auth';
      redirectUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      return NextResponse.redirect(redirectUrl);
    }
  }

  // Protect influencer APIs and deep routes with server-side session checks.
  const isInfluencerApi = pathname.startsWith('/api/influencers');
  const isInfluencerAuthEndpoint = pathname === '/api/influencers/auth';
  const isInfluencerPage = pathname.startsWith('/influencers');

  if (isInfluencerApi && !isInfluencerAuthEndpoint && !hasInfluencerSession(request)) {
    return new NextResponse(
      JSON.stringify({ error: 'Unauthorized' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  if (
    isInfluencerPage &&
    pathname !== '/influencers' &&
    !hasInfluencerSession(request)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/influencers';
    return NextResponse.redirect(url);
  }

  const response = rewriteUrl ? NextResponse.rewrite(rewriteUrl) : NextResponse.next();

  // Generate nonce for CSP
  const nonce = generateNonce();

  // Set nonce header for downstream use (layout.tsx)
  response.headers.set('x-nonce', nonce);

  // Set CSP header with nonce
  response.headers.set('Content-Security-Policy', buildCspHeader(nonce));

  // Set other security headers
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Rate limit POST requests to /api/* and GET requests to /api/metrics.
  const isPostApiRequest = request.method === 'POST' && request.nextUrl.pathname.startsWith('/api/');
  const isMetricsGetRequest = request.method === 'GET' && request.nextUrl.pathname === '/api/metrics';

  if (isPostApiRequest || isMetricsGetRequest) {
    await initRedis();
    const ip = getClientIp(request);
    const { limited, retryAfter } = await checkRateLimit(ip);

    if (limited) {
      return new NextResponse(
        JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
          },
        }
      );
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Match all paths except static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|woff|woff2|ttf|eot|otf|mp4|webm|mp3|wav|json|map)$).*)',
  ],
};
