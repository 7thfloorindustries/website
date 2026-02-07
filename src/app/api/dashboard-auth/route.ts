import { NextRequest, NextResponse } from 'next/server';
import {
  BROKE_SESSION_COOKIE,
  BROKE_SESSION_TTL_SECONDS,
  createBrokeSessionToken,
  getDashboardPassword,
  hasBrokeSession,
  isDashboardPasswordValid,
} from '@/lib/broke/auth';
import { generateCsrfToken, validateCsrfToken } from '@/lib/csrf';
import { checkRateLimit, recordFailedAttempt } from '@/lib/login-rate-limit';

export const dynamic = 'force-dynamic';

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function GET(request: NextRequest) {
  return withNoStore(
    NextResponse.json({
      authenticated: hasBrokeSession(request),
      csrfToken: generateCsrfToken(),
    })
  );
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  const rateLimit = await checkRateLimit(ip);
  if (rateLimit.blocked) {
    const retryAfter = Math.ceil((rateLimit.retryAfterMs ?? 900000) / 1000);
    const resp = withNoStore(
      NextResponse.json(
        { success: false, error: 'Too many failed attempts. Try again later.' },
        { status: 429 }
      )
    );
    resp.headers.set('Retry-After', String(retryAfter));
    return resp;
  }

  const configuredPassword = getDashboardPassword();
  if (!configuredPassword) {
    return withNoStore(
      NextResponse.json(
        { success: false, error: 'Dashboard password is not configured' },
        { status: 500 }
      )
    );
  }

  try {
    const body = await request.json();

    const csrfToken = typeof body?.csrfToken === 'string' ? body.csrfToken : '';
    if (!validateCsrfToken(csrfToken)) {
      return withNoStore(
        NextResponse.json({ success: false, error: 'Invalid CSRF token' }, { status: 403 })
      );
    }

    const password = typeof body?.password === 'string' ? body.password : '';

    if (!isDashboardPasswordValid(password)) {
      await recordFailedAttempt(ip);
      return withNoStore(NextResponse.json({ success: false }, { status: 401 }));
    }

    const response = withNoStore(NextResponse.json({ success: true }));
    response.cookies.set({
      name: BROKE_SESSION_COOKIE,
      value: createBrokeSessionToken(),
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: BROKE_SESSION_TTL_SECONDS,
    });

    return response;
  } catch {
    return withNoStore(
      NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
    );
  }
}

export async function DELETE() {
  const response = withNoStore(NextResponse.json({ success: true }));
  response.cookies.set({
    name: BROKE_SESSION_COOKIE,
    value: '',
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
  });
  return response;
}
