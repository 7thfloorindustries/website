import { neon } from '@neondatabase/serverless';
import { hash, compare } from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';

export type UserRole = 'admin' | 'editor' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  created_at: Date;
  last_login: Date | null;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: string;
  active: boolean;
  created_at: Date;
  last_login: Date | null;
}

const SESSION_COOKIE = 'broke_user_session';
const SESSION_TTL_DAYS = 7;
const BCRYPT_ROUNDS = 12;

function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return neon(connectionString);
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}

export async function createSession(userId: string): Promise<string> {
  const sql = getDb();
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await sql`
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES (${sessionId}, ${userId}, ${expiresAt.toISOString()})
  `;

  // Update last_login
  await sql`UPDATE users SET last_login = NOW() WHERE id = ${userId}`;

  return sessionId;
}

export async function validateSession(sessionId: string): Promise<User | null> {
  if (!sessionId) return null;
  const sql = getDb();

  const rows = await sql`
    SELECT u.id, u.email, u.name, u.role, u.active, u.created_at, u.last_login
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ${sessionId}
      AND s.expires_at > NOW()
      AND u.active = true
  `;

  if (rows.length === 0) return null;
  return rows[0] as User;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM sessions WHERE id = ${sessionId}`;
}

export async function cleanExpiredSessions(): Promise<number> {
  const sql = getDb();
  const result = await sql`
    DELETE FROM sessions WHERE expires_at <= NOW()
    RETURNING id
  `;
  return result.length;
}

export function getSessionIdFromRequest(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value || null;
}

export async function getUserFromSession(request: NextRequest): Promise<User | null> {
  const sessionId = getSessionIdFromRequest(request);
  if (!sessionId) return null;
  return validateSession(sessionId);
}

export function setSessionCookie(response: NextResponse, sessionId: string): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: sessionId,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
  return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
  });
  return response;
}

/**
 * Middleware-style helper: returns user if they have the required role,
 * or a 401/403 response if not.
 */
export async function requireRole(
  request: NextRequest,
  ...allowedRoles: UserRole[]
): Promise<User | NextResponse> {
  const user = await getUserFromSession(request);

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  return user;
}

/**
 * Check whether any user accounts exist in the DB.
 */
export async function hasUserAccounts(): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`SELECT 1 FROM users LIMIT 1`;
  return rows.length > 0;
}

/**
 * Authenticate a user by email and password.
 */
export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, email, name, password_hash, role, active, created_at, last_login
    FROM users
    WHERE email = ${email.toLowerCase().trim()} AND active = true
  `;

  if (rows.length === 0) return null;
  const row = rows[0] as UserRow;

  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as UserRole,
    active: row.active,
    created_at: row.created_at,
    last_login: row.last_login,
  };
}

export { SESSION_COOKIE };
