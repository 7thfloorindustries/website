import { createHmac, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';

export const INFLUENCER_SESSION_COOKIE = 'influencer_session';
export const INFLUENCER_SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours
export const INFLUENCER_UNKNOWN_ORG_ID = '__unknown__';

export type InfluencerRole = 'viewer' | 'analyst' | 'admin' | 'customer';

interface SessionPayload {
  exp: number;
  iat: number;
  orgId: string;
  role: InfluencerRole;
  userId: string;
  email: string | null;
}

export interface InfluencerSession {
  email: string | null;
  orgId: string;
  role: InfluencerRole;
  userId: string;
}

export interface InfluencerSessionClaims {
  email?: string | null;
  orgId: string;
  role: InfluencerRole;
  userId: string;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function getSessionSecret(): string | null {
  return process.env.INFLUENCER_SESSION_SECRET || process.env.INFLUENCER_PASSWORD || null;
}

function signPayload(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

function isValidInfluencerRole(value: unknown): value is InfluencerRole {
  return value === 'viewer' || value === 'analyst' || value === 'admin' || value === 'customer';
}

export function createInfluencerSessionToken(
  claims: InfluencerSessionClaims,
  nowEpochSeconds: number = Math.floor(Date.now() / 1000)
): string {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error('Influencer session secret is not configured');
  }

  if (!claims.userId || !claims.orgId || !isValidInfluencerRole(claims.role)) {
    throw new Error('Invalid influencer session claims');
  }

  const payload: SessionPayload = {
    iat: nowEpochSeconds,
    exp: nowEpochSeconds + INFLUENCER_SESSION_TTL_SECONDS,
    userId: claims.userId,
    orgId: claims.orgId,
    role: claims.role,
    email: claims.email ?? null,
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

function verifySignature(payloadB64: string, providedSignature: string, secret: string): boolean {
  const expected = signPayload(payloadB64, secret);
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(providedSignature));
  } catch {
    return false;
  }
}

export function verifyInfluencerSessionToken(token?: string | null): { valid: boolean; payload?: SessionPayload } {
  if (!token) return { valid: false };

  const secret = getSessionSecret();
  if (!secret) return { valid: false };

  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false };

  const [payloadB64, signature] = parts;
  if (!verifySignature(payloadB64, signature, secret)) {
    return { valid: false };
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as SessionPayload;
    if (!payload?.exp || !payload?.iat) return { valid: false };
    if (!payload?.userId || !payload?.orgId || !isValidInfluencerRole(payload.role)) return { valid: false };
    if (payload.email != null && typeof payload.email !== 'string') return { valid: false };
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) return { valid: false };
    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

export function getInfluencerSession(request: NextRequest): InfluencerSession | null {
  const token = request.cookies.get(INFLUENCER_SESSION_COOKIE)?.value;
  const verified = verifyInfluencerSessionToken(token);
  if (!verified.valid || !verified.payload) return null;

  return {
    userId: verified.payload.userId,
    orgId: verified.payload.orgId,
    role: verified.payload.role,
    email: verified.payload.email,
  };
}

export function hasInfluencerSession(request: NextRequest): boolean {
  return Boolean(getInfluencerSession(request));
}

export function hasRequiredInfluencerRole(role: InfluencerRole, allowedRoles: readonly InfluencerRole[]): boolean {
  return allowedRoles.includes(role);
}
