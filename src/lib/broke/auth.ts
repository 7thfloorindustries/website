import { createHmac, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';

export const BROKE_SESSION_COOKIE = 'broke_session';
export const BROKE_SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

interface BrokeSessionPayload {
  exp: number;
  iat: number;
  scope: 'dashboard';
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function getSessionSecret(): string | null {
  const explicitSecret = process.env.BROKE_SESSION_SECRET?.trim();
  if (explicitSecret) return explicitSecret;

  const dashboardPassword = process.env.DASHBOARD_PASSWORD?.trim();
  return dashboardPassword || null;
}

function signPayload(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

export function getDashboardPassword(): string | null {
  const password = process.env.DASHBOARD_PASSWORD?.trim();
  return password || null;
}

export function isDashboardPasswordValid(inputPassword: string): boolean {
  const configuredPassword = getDashboardPassword();
  if (!configuredPassword) {
    return false;
  }

  const expected = Buffer.from(configuredPassword, 'utf8');
  const provided = Buffer.from(inputPassword, 'utf8');

  if (expected.length !== provided.length) {
    return false;
  }

  try {
    return timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}

export function isBrokeAuthEnforced(): boolean {
  const override = process.env.BROKE_AUTH_ENFORCED;
  if (override) {
    const normalized = override.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  }

  // Default on for production, off for local development unless overridden.
  return process.env.NODE_ENV === 'production';
}

export function createBrokeSessionToken(
  nowEpochSeconds: number = Math.floor(Date.now() / 1000)
): string {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error('Broke session secret is not configured');
  }

  const payload: BrokeSessionPayload = {
    iat: nowEpochSeconds,
    exp: nowEpochSeconds + BROKE_SESSION_TTL_SECONDS,
    scope: 'dashboard',
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

export function verifyBrokeSessionToken(token?: string | null): boolean {
  if (!token) return false;

  const secret = getSessionSecret();
  if (!secret) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [payloadB64, providedSignature] = parts;
  const expectedSignature = signPayload(payloadB64, secret);

  if (providedSignature.length !== expectedSignature.length) {
    return false;
  }

  try {
    if (!timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature))) {
      return false;
    }
  } catch {
    return false;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as BrokeSessionPayload;
    if (!payload || payload.scope !== 'dashboard') return false;
    if (typeof payload.exp !== 'number' || typeof payload.iat !== 'number') return false;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) return false;

    return true;
  } catch {
    return false;
  }
}

export function hasBrokeSession(request: NextRequest): boolean {
  const token = request.cookies.get(BROKE_SESSION_COOKIE)?.value;
  return verifyBrokeSessionToken(token);
}
