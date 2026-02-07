import { NextRequest, NextResponse } from 'next/server';
import {
  BROKE_SESSION_COOKIE,
  BROKE_SESSION_TTL_SECONDS,
  createBrokeSessionToken,
  getDashboardPassword,
  hasBrokeSession,
  isDashboardPasswordValid,
} from '@/lib/broke/auth';
import {
  authenticateUser,
  createSession,
  hasUserAccounts,
  setSessionCookie,
  getUserFromSession,
  SESSION_COOKIE,
  clearSessionCookie,
} from '@/lib/auth';
import { generateCsrfToken, validateCsrfToken } from '@/lib/csrf';
import { checkRateLimit, recordFailedAttempt } from '@/lib/login-rate-limit';

export const dynamic = 'force-dynamic';

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function GET(request: NextRequest) {
  // Check user-based session first, then shared password session
  const userSession = await getUserFromSession(request);
  const sharedSession = hasBrokeSession(request);

  return withNoStore(
    NextResponse.json({
      authenticated: !!userSession || sharedSession,
      user: userSession ? { name: userSession.name, email: userSession.email, role: userSession.role } : null,
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

  try {
    const body = await request.json();

    const csrfToken = typeof body?.csrfToken === 'string' ? body.csrfToken : '';
    if (!validateCsrfToken(csrfToken)) {
      return withNoStore(
        NextResponse.json({ success: false, error: 'Invalid CSRF token' }, { status: 403 })
      );
    }

    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    // Try user-based auth first if email is provided and user accounts exist
    if (email) {
      let usersExist = false;
      try {
        usersExist = await hasUserAccounts();
      } catch {
        // DB not available, fall through to shared password
      }

      if (usersExist) {
        const user = await authenticateUser(email, password);
        if (user) {
          const sessionId = await createSession(user.id);
          const response = withNoStore(
            NextResponse.json({
              success: true,
              user: { name: user.name, email: user.email, role: user.role },
            })
          );
          setSessionCookie(response, sessionId);
          // Also set the shared session cookie so existing middleware works
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
        }

        // User-based auth failed
        await recordFailedAttempt(ip);
        return withNoStore(NextResponse.json({ success: false }, { status: 401 }));
      }
    }

    // Fall back to shared password auth
    const configuredPassword = getDashboardPassword();
    if (!configuredPassword) {
      return withNoStore(
        NextResponse.json(
          { success: false, error: 'Dashboard password is not configured' },
          { status: 500 }
        )
      );
    }

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

export async function DELETE(request: NextRequest) {
  const response = withNoStore(NextResponse.json({ success: true }));

  // Clear user session if present
  const userSessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (userSessionId) {
    try {
      const { deleteSession } = await import('@/lib/auth');
      await deleteSession(userSessionId);
    } catch {
      // Best effort
    }
  }

  clearSessionCookie(response);
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
