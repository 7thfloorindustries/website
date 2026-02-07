import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireRole, hashPassword, type UserRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');
  return neon(connectionString);
}

/** GET /api/admin/users - List all users (admin only) */
export async function GET(request: NextRequest) {
  const result = await requireRole(request, 'admin');
  if (result instanceof NextResponse) return result;

  const sql = getDb();
  const users = await sql`
    SELECT id, email, name, role, active, created_at, last_login
    FROM users
    ORDER BY created_at DESC
  `;

  return NextResponse.json({ users });
}

/** POST /api/admin/users - Create a new user (admin only) */
export async function POST(request: NextRequest) {
  const result = await requireRole(request, 'admin');
  if (result instanceof NextResponse) return result;

  try {
    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : '';
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const role: UserRole = ['admin', 'editor', 'viewer'].includes(body?.role) ? body.role : 'viewer';

    if (!email || !name || !password) {
      return NextResponse.json(
        { error: 'email, name, and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const sql = getDb();
    const passwordHash = await hashPassword(password);

    const rows = await sql`
      INSERT INTO users (email, name, password_hash, role)
      VALUES (${email}, ${name}, ${passwordHash}, ${role})
      RETURNING id, email, name, role, active, created_at
    `;

    return NextResponse.json({ user: rows[0] }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('unique') || message.includes('duplicate')) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}

/** PATCH /api/admin/users - Update a user (admin only) */
export async function PATCH(request: NextRequest) {
  const result = await requireRole(request, 'admin');
  if (result instanceof NextResponse) return result;

  try {
    const body = await request.json();
    const userId = typeof body?.id === 'string' ? body.id : '';
    if (!userId) {
      return NextResponse.json({ error: 'User id is required' }, { status: 400 });
    }

    const sql = getDb();

    const newName = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
    const newEmail = typeof body.email === 'string' && body.email.trim() ? body.email.toLowerCase().trim() : null;
    const newRole = ['admin', 'editor', 'viewer'].includes(body.role) ? body.role : null;
    const newActive = typeof body.active === 'boolean' ? body.active : null;
    const newPasswordHash = typeof body.password === 'string' && body.password.length >= 8
      ? await hashPassword(body.password) : null;

    if (!newName && !newEmail && !newRole && newActive === null && !newPasswordHash) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const rows = await sql`
      UPDATE users SET
        name = COALESCE(${newName}, name),
        email = COALESCE(${newEmail}, email),
        role = COALESCE(${newRole}, role),
        active = COALESCE(${newActive}, active),
        password_hash = COALESCE(${newPasswordHash}, password_hash)
      WHERE id = ${userId}
      RETURNING id, email, name, role, active, created_at, last_login
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user: rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('unique') || message.includes('duplicate')) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

/** DELETE /api/admin/users - Deactivate a user (admin only) */
export async function DELETE(request: NextRequest) {
  const result = await requireRole(request, 'admin');
  if (result instanceof NextResponse) return result;

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');
    if (!userId) {
      return NextResponse.json({ error: 'User id is required' }, { status: 400 });
    }

    // Don't allow admins to deactivate themselves
    if (userId === result.id) {
      return NextResponse.json({ error: 'Cannot deactivate your own account' }, { status: 400 });
    }

    const sql = getDb();
    const rows = await sql`
      UPDATE users SET active = false WHERE id = ${userId}
      RETURNING id, email, name, role, active
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Delete active sessions for the deactivated user
    await sql`DELETE FROM sessions WHERE user_id = ${userId}`;

    return NextResponse.json({ user: rows[0] });
  } catch {
    return NextResponse.json({ error: 'Failed to deactivate user' }, { status: 500 });
  }
}
