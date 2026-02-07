/**
 * Identity auth for the influencer browser.
 * Sessions include user/org/role claims for tenant-scoped access control.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createInfluencerSessionToken,
  getInfluencerSession,
  INFLUENCER_SESSION_COOKIE,
  INFLUENCER_SESSION_TTL_SECONDS,
} from '@/lib/influencer/auth';
import { authenticateInfluencer } from '@/lib/db/influencer-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = getInfluencerSession(request);
  return NextResponse.json({
    authenticated: Boolean(session),
    session: session ?? null,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const password = typeof body?.password === 'string' ? body.password : '';
    const email = typeof body?.email === 'string' ? body.email : undefined;
    const orgId = typeof body?.orgId === 'string' ? body.orgId : undefined;

    if (!password) {
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }

    const authResult = await authenticateInfluencer({ email, orgId, password });
    if (!authResult.ok) {
      if (authResult.reason === 'org_required') {
        return NextResponse.json(
          {
            error: 'Organization selection required',
            organizations: authResult.organizations,
            requiresOrgSelection: true,
          },
          { status: 409 }
        );
      }
      if (authResult.reason === 'org_not_allowed') {
        return NextResponse.json({ error: 'Organization access denied' }, { status: 403 });
      }
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const token = createInfluencerSessionToken({
      userId: authResult.identity.userId,
      orgId: authResult.identity.orgId,
      role: authResult.identity.role,
      email: authResult.identity.email,
    });
    const response = NextResponse.json({
      success: true,
      session: {
        userId: authResult.identity.userId,
        email: authResult.identity.email,
        orgId: authResult.identity.orgId,
        orgName: authResult.identity.orgName,
        role: authResult.identity.role,
      },
    });
    response.headers.set('Cache-Control', 'no-store');
    response.cookies.set({
      name: INFLUENCER_SESSION_COOKIE,
      value: token,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: INFLUENCER_SESSION_TTL_SECONDS,
    });
    return response;
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json(
      { error: 'Auth failed' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: INFLUENCER_SESSION_COOKIE,
    value: '',
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
  });
  return response;
}
