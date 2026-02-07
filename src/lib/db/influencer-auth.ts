import { neon } from '@neondatabase/serverless';
import { ensureCreatorCoreSchema } from '@/lib/creatorcore/schema';
import type { InfluencerRole } from '@/lib/influencer/auth';
import { verifyInfluencerPassword } from '@/lib/influencer/password';

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return neon(databaseUrl);
}

interface MembershipRow {
  org_id: string;
  org_name: string;
  org_slug: string;
  role: string;
}

export interface InfluencerOrgChoice {
  id: string;
  name: string;
  role: InfluencerRole;
  slug: string;
}

export interface InfluencerIdentity {
  email: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: InfluencerRole;
  userId: string;
}

export type AuthenticateInfluencerResult =
  | { ok: true; identity: InfluencerIdentity }
  | { ok: false; reason: 'invalid_credentials' | 'org_not_allowed' }
  | { ok: false; reason: 'org_required'; organizations: InfluencerOrgChoice[] };

export interface AuthenticateInfluencerInput {
  email?: string;
  orgId?: string;
  password: string;
}

function toInfluencerRole(value: unknown): InfluencerRole | null {
  if (value === 'viewer' || value === 'analyst' || value === 'admin' || value === 'customer') return value;
  return null;
}

function normalizeMaybe(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function membershipChoices(rows: MembershipRow[]): InfluencerOrgChoice[] {
  return rows
    .map((row) => {
      const role = toInfluencerRole(row.role);
      if (!role) return null;
      return {
        id: row.org_id,
        name: row.org_name,
        slug: row.org_slug,
        role,
      };
    })
    .filter((row): row is InfluencerOrgChoice => row != null);
}

export async function authenticateInfluencer(input: AuthenticateInfluencerInput): Promise<AuthenticateInfluencerResult> {
  const sql = getDb();
  await ensureCreatorCoreSchema(sql);

  const email =
    normalizeMaybe(input.email)?.toLowerCase() ||
    process.env.INFLUENCER_BOOTSTRAP_EMAIL?.trim().toLowerCase() ||
    'admin@7thfloor.local';
  const requestedOrgId =
    normalizeMaybe(input.orgId) ||
    process.env.INFLUENCER_BOOTSTRAP_ORG_ID?.trim() ||
    null;

  const users = await sql`
    SELECT id, email, password_hash, is_active
    FROM influencer_users
    WHERE LOWER(email) = LOWER(${email})
    LIMIT 1
  `;

  const user = users[0];
  if (!user || !user.is_active || !verifyInfluencerPassword(input.password, user.password_hash)) {
    return { ok: false, reason: 'invalid_credentials' };
  }

  const memberships = await sql`
    SELECT
      m.org_id,
      o.name AS org_name,
      o.slug AS org_slug,
      m.role
    FROM influencer_memberships m
    JOIN influencer_organizations o ON o.id = m.org_id
    WHERE m.user_id = ${user.id}
    ORDER BY
      CASE m.role
        WHEN 'admin' THEN 3
        WHEN 'analyst' THEN 2
        WHEN 'customer' THEN 1
        ELSE 1
      END DESC,
      m.org_id ASC
  ` as MembershipRow[];

  if (memberships.length === 0) {
    return { ok: false, reason: 'invalid_credentials' };
  }

  let selected = memberships[0];
  if (requestedOrgId) {
    const match = memberships.find((membership) => membership.org_id === requestedOrgId);
    if (!match) {
      return { ok: false, reason: 'org_not_allowed' };
    }
    selected = match;
  } else if (memberships.length > 1) {
    return { ok: false, reason: 'org_required', organizations: membershipChoices(memberships) };
  }

  const role = toInfluencerRole(selected.role);
  if (!role) {
    return { ok: false, reason: 'invalid_credentials' };
  }

  return {
    ok: true,
    identity: {
      userId: String(user.id),
      email: String(user.email),
      orgId: selected.org_id,
      orgName: selected.org_name,
      orgSlug: selected.org_slug,
      role,
    },
  };
}
