import { createHash } from 'crypto';
import type { NeonQueryFunction } from '@neondatabase/serverless';
import { INFLUENCER_UNKNOWN_ORG_ID, type InfluencerRole } from '@/lib/influencer/auth';
import { hashInfluencerPassword } from '@/lib/influencer/password';
import { GENRE_TAXONOMY } from './genre-constants';

let schemaReadyPromise: Promise<void> | null = null;
const CREATORCORE_SCHEMA_VERSION = '2026-02-07.3';
const SCHEMA_RECHECK_INTERVAL_MS = 5 * 60 * 1000;
let schemaValidatedAtMs = 0;
let schemaIsCurrent = false;

async function ensureSchemaMetaTable(sql: NeonQueryFunction<false, false>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS cc_schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function getSchemaVersion(sql: NeonQueryFunction<false, false>): Promise<string | null> {
  await ensureSchemaMetaTable(sql);
  const rows = await sql`
    SELECT value
    FROM cc_schema_meta
    WHERE key = 'creatorcore_schema_version'
    LIMIT 1
  `;
  return typeof rows[0]?.value === 'string' ? rows[0].value : null;
}

async function setSchemaVersion(sql: NeonQueryFunction<false, false>, version: string): Promise<void> {
  await ensureSchemaMetaTable(sql);
  await sql`
    INSERT INTO cc_schema_meta (key, value, updated_at)
    VALUES ('creatorcore_schema_version', ${version}, NOW())
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

function normalizeRole(value: unknown): InfluencerRole {
  if (value === 'viewer' || value === 'analyst' || value === 'admin' || value === 'customer') return value;
  return 'admin';
}

function bootstrapUserId(email: string): string {
  const digest = createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16);
  return `bootstrap_${digest}`;
}

function bootstrapPasswordSalt(email: string): string {
  return createHash('sha256').update(`bootstrap:${email.toLowerCase()}`).digest('base64url').slice(0, 22);
}

function orgSlugFromId(orgId: string): string {
  if (orgId === INFLUENCER_UNKNOWN_ORG_ID) return 'unassigned';
  const digest = createHash('sha1').update(orgId).digest('hex').slice(0, 12);
  return `org-${digest}`;
}

function defaultOrgName(orgId: string): string {
  if (orgId === INFLUENCER_UNKNOWN_ORG_ID) return 'Unassigned Campaigns';
  return `Organization ${orgId.slice(-6)}`;
}

async function seedOrganizations(sql: NeonQueryFunction<false, false>): Promise<void> {
  await sql`
    INSERT INTO influencer_organizations (id, slug, name)
    VALUES (${INFLUENCER_UNKNOWN_ORG_ID}, 'unassigned', 'Unassigned Campaigns')
    ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    INSERT INTO influencer_organizations (id, slug, name)
    SELECT DISTINCT
      c.org_id AS id,
      'org-' || right(md5(c.org_id), 12) AS slug,
      'Organization ' || right(c.org_id, 6) AS name
    FROM cc_campaigns c
    WHERE c.org_id IS NOT NULL AND btrim(c.org_id) <> ''
    ON CONFLICT (id) DO NOTHING
  `;
}

async function resolveBootstrapOrgId(sql: NeonQueryFunction<false, false>): Promise<string> {
  const configured = process.env.INFLUENCER_BOOTSTRAP_ORG_ID?.trim();
  if (configured) return configured;

  const rows = await sql`
    SELECT COALESCE(NULLIF(org_id, ''), ${INFLUENCER_UNKNOWN_ORG_ID}) AS org_id
    FROM cc_campaigns
    ORDER BY created_at DESC NULLS LAST, id DESC
    LIMIT 1
  `;

  return rows[0]?.org_id ?? INFLUENCER_UNKNOWN_ORG_ID;
}

async function seedBootstrapUser(sql: NeonQueryFunction<false, false>): Promise<void> {
  const bootstrapPassword = process.env.INFLUENCER_BOOTSTRAP_PASSWORD || process.env.INFLUENCER_PASSWORD;
  if (!bootstrapPassword) return;

  const email = (process.env.INFLUENCER_BOOTSTRAP_EMAIL?.trim().toLowerCase() || 'admin@7thfloor.local');
  const displayName = process.env.INFLUENCER_BOOTSTRAP_NAME?.trim() || 'Influencer Admin';
  const role = normalizeRole(process.env.INFLUENCER_BOOTSTRAP_ROLE);
  const orgId = await resolveBootstrapOrgId(sql);
  const orgSlug = orgSlugFromId(orgId);
  const orgName = defaultOrgName(orgId);

  await sql`
    INSERT INTO influencer_organizations (id, slug, name)
    VALUES (${orgId}, ${orgSlug}, ${orgName})
    ON CONFLICT (id) DO UPDATE
    SET
      slug = COALESCE(influencer_organizations.slug, EXCLUDED.slug),
      name = COALESCE(influencer_organizations.name, EXCLUDED.name)
  `;

  const passwordHash = hashInfluencerPassword(bootstrapPassword, bootstrapPasswordSalt(email));
  const userId = bootstrapUserId(email);

  await sql`
    INSERT INTO influencer_users (id, email, password_hash, display_name, is_active)
    VALUES (${userId}, ${email}, ${passwordHash}, ${displayName}, TRUE)
    ON CONFLICT (email) DO UPDATE
    SET
      password_hash = EXCLUDED.password_hash,
      display_name = EXCLUDED.display_name,
      is_active = TRUE,
      updated_at = NOW()
  `;

  const users = await sql`
    SELECT id
    FROM influencer_users
    WHERE LOWER(email) = LOWER(${email})
    LIMIT 1
  `;
  const persistedUserId = users[0]?.id ?? userId;

  await sql`
    INSERT INTO influencer_memberships (user_id, org_id, role)
    VALUES (${persistedUserId}, ${orgId}, ${role})
    ON CONFLICT (user_id, org_id) DO UPDATE
    SET role = EXCLUDED.role
  `;
}

async function applyCreatorCoreRls(sql: NeonQueryFunction<false, false>): Promise<void> {
  await sql`CREATE SCHEMA IF NOT EXISTS app`;

  await sql`
    CREATE OR REPLACE FUNCTION app.current_org_id()
    RETURNS TEXT
    LANGUAGE SQL
    STABLE
    AS $$
      SELECT NULLIF(current_setting('app.current_org_id', true), '')
    $$
  `;

  await sql`
    CREATE OR REPLACE FUNCTION app.current_role()
    RETURNS TEXT
    LANGUAGE SQL
    STABLE
    AS $$
      SELECT NULLIF(current_setting('app.current_role', true), '')
    $$
  `;

  await sql`
    CREATE OR REPLACE FUNCTION app.role_is_admin()
    RETURNS BOOLEAN
    LANGUAGE SQL
    STABLE
    AS $$
      SELECT app.current_role() IN ('admin', 'system')
    $$
  `;

  await sql`
    CREATE OR REPLACE FUNCTION app.org_matches(resource_org_id TEXT)
    RETURNS BOOLEAN
    LANGUAGE SQL
    STABLE
    AS $$
      SELECT
        CASE
          WHEN app.role_is_admin() THEN TRUE
          WHEN app.current_org_id() IS NULL THEN FALSE
          WHEN app.current_org_id() = '__unknown__' THEN resource_org_id IS NULL OR btrim(resource_org_id) = ''
          ELSE resource_org_id = app.current_org_id()
        END
    $$
  `;

  await sql`ALTER TABLE cc_campaigns ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE cc_campaigns FORCE ROW LEVEL SECURITY`;
  await sql`DROP POLICY IF EXISTS cc_campaigns_select_scope ON cc_campaigns`;
  await sql`DROP POLICY IF EXISTS cc_campaigns_insert_any ON cc_campaigns`;
  await sql`DROP POLICY IF EXISTS cc_campaigns_update_any ON cc_campaigns`;
  await sql`DROP POLICY IF EXISTS cc_campaigns_delete_any ON cc_campaigns`;
  await sql`
    CREATE POLICY cc_campaigns_select_scope
    ON cc_campaigns
    FOR SELECT
    USING (app.org_matches(org_id))
  `;
  await sql`
    CREATE POLICY cc_campaigns_insert_any
    ON cc_campaigns
    FOR INSERT
    WITH CHECK (TRUE)
  `;
  await sql`
    CREATE POLICY cc_campaigns_update_any
    ON cc_campaigns
    FOR UPDATE
    USING (TRUE)
    WITH CHECK (TRUE)
  `;
  await sql`
    CREATE POLICY cc_campaigns_delete_any
    ON cc_campaigns
    FOR DELETE
    USING (TRUE)
  `;

  await sql`ALTER TABLE cc_posts ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE cc_posts FORCE ROW LEVEL SECURITY`;
  await sql`DROP POLICY IF EXISTS cc_posts_select_scope ON cc_posts`;
  await sql`DROP POLICY IF EXISTS cc_posts_insert_any ON cc_posts`;
  await sql`DROP POLICY IF EXISTS cc_posts_update_any ON cc_posts`;
  await sql`DROP POLICY IF EXISTS cc_posts_delete_any ON cc_posts`;
  await sql`
    CREATE POLICY cc_posts_select_scope
    ON cc_posts
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM cc_campaigns c
        WHERE c.id = cc_posts.campaign_pk
          AND app.org_matches(c.org_id)
      )
    )
  `;
  await sql`
    CREATE POLICY cc_posts_insert_any
    ON cc_posts
    FOR INSERT
    WITH CHECK (TRUE)
  `;
  await sql`
    CREATE POLICY cc_posts_update_any
    ON cc_posts
    FOR UPDATE
    USING (TRUE)
    WITH CHECK (TRUE)
  `;
  await sql`
    CREATE POLICY cc_posts_delete_any
    ON cc_posts
    FOR DELETE
    USING (TRUE)
  `;

  await sql`ALTER TABLE cc_creators ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE cc_creators FORCE ROW LEVEL SECURITY`;
  await sql`DROP POLICY IF EXISTS cc_creators_select_scope ON cc_creators`;
  await sql`DROP POLICY IF EXISTS cc_creators_insert_any ON cc_creators`;
  await sql`DROP POLICY IF EXISTS cc_creators_update_any ON cc_creators`;
  await sql`DROP POLICY IF EXISTS cc_creators_delete_any ON cc_creators`;
  await sql`
    CREATE POLICY cc_creators_select_scope
    ON cc_creators
    FOR SELECT
    USING (
      app.role_is_admin()
      OR EXISTS (
        SELECT 1
        FROM cc_posts p
        JOIN cc_campaigns c ON c.id = p.campaign_pk
        WHERE LOWER(p.username) = LOWER(cc_creators.username)
          AND app.org_matches(c.org_id)
      )
    )
  `;
  await sql`
    CREATE POLICY cc_creators_insert_any
    ON cc_creators
    FOR INSERT
    WITH CHECK (TRUE)
  `;
  await sql`
    CREATE POLICY cc_creators_update_any
    ON cc_creators
    FOR UPDATE
    USING (TRUE)
    WITH CHECK (TRUE)
  `;
  await sql`
    CREATE POLICY cc_creators_delete_any
    ON cc_creators
    FOR DELETE
    USING (TRUE)
  `;
}

async function seedGenreTaxonomy(sql: NeonQueryFunction<false, false>): Promise<void> {
  await sql`
    INSERT INTO genre_taxonomy (genre_id, label)
    VALUES ('Unclassified', 'Unclassified')
    ON CONFLICT (genre_id) DO UPDATE
    SET label = EXCLUDED.label, is_active = TRUE
  `;

  for (const genre of GENRE_TAXONOMY) {
    if (genre === 'Unclassified') continue;
    await sql`
      INSERT INTO genre_taxonomy (genre_id, label)
      VALUES (${genre}, ${genre})
      ON CONFLICT (genre_id) DO UPDATE
      SET label = EXCLUDED.label, is_active = TRUE
    `;
  }
}

async function runSchemaMigration(sql: NeonQueryFunction<false, false>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS cc_campaigns (
      id SERIAL PRIMARY KEY,
      campaign_id VARCHAR(255) NOT NULL,
      title TEXT NULL,
      slug TEXT NULL,
      budget NUMERIC NULL,
      currency VARCHAR(6) NULL,
      org_id VARCHAR(64) NULL,
      platforms TEXT NULL,
      created_at TIMESTAMPTZ NULL,
      archived BOOLEAN DEFAULT FALSE,
      creator_count SMALLINT NULL,
      total_posts SMALLINT NULL,
      is_test_data BOOLEAN NOT NULL DEFAULT FALSE,
      thumbnail TEXT NULL,
      last_synced_at TIMESTAMPTZ NULL,
      UNIQUE (campaign_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS cc_posts (
      id SERIAL PRIMARY KEY,
      post_id VARCHAR(255) NOT NULL,
      campaign_pk INTEGER NOT NULL REFERENCES cc_campaigns(id) ON DELETE CASCADE,
      username VARCHAR(255) NULL,
      platform VARCHAR(64) NULL,
      post_url TEXT NULL,
      post_url_valid BOOLEAN NOT NULL DEFAULT FALSE,
      post_url_reason TEXT NULL,
      views BIGINT NULL,
      post_date TIMESTAMPTZ NULL,
      post_status VARCHAR(64) NULL,
      created_date TIMESTAMPTZ NULL,
      is_test_data BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE (post_id)
    )
  `;

  await sql`ALTER TABLE cc_campaigns ADD COLUMN IF NOT EXISTS source_key TEXT`;
  await sql`ALTER TABLE cc_campaigns ALTER COLUMN source_key SET DEFAULT 'legacy'`;
  await sql`UPDATE cc_campaigns SET source_key = 'legacy' WHERE source_key IS NULL OR btrim(source_key) = ''`;
  await sql`ALTER TABLE cc_campaigns ALTER COLUMN source_key SET NOT NULL`;

  await sql`ALTER TABLE cc_posts ADD COLUMN IF NOT EXISTS source_key TEXT`;
  await sql`ALTER TABLE cc_posts ALTER COLUMN source_key SET DEFAULT 'legacy'`;
  await sql`UPDATE cc_posts SET source_key = 'legacy' WHERE source_key IS NULL OR btrim(source_key) = ''`;
  await sql`ALTER TABLE cc_posts ALTER COLUMN source_key SET NOT NULL`;

  await sql`ALTER TABLE cc_posts ADD COLUMN IF NOT EXISTS canonical_post_key TEXT`;
  await sql`
    UPDATE cc_posts
    SET canonical_post_key = COALESCE(
      NULLIF(btrim(post_url), ''),
      source_key || ':' || post_id
    )
    WHERE canonical_post_key IS NULL OR btrim(canonical_post_key) = ''
  `;
  await sql`ALTER TABLE cc_posts ALTER COLUMN canonical_post_key DROP NOT NULL`;

  await sql`ALTER TABLE cc_campaigns ADD COLUMN IF NOT EXISTS api_cost_usd NUMERIC(12,2)`;
  await sql`ALTER TABLE cc_campaigns ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE cc_posts ADD COLUMN IF NOT EXISTS api_cost_usd NUMERIC(12,2)`;
  await sql`ALTER TABLE cc_posts ADD COLUMN IF NOT EXISTS post_url_valid BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE cc_posts ADD COLUMN IF NOT EXISTS post_url_reason TEXT NULL`;
  await sql`ALTER TABLE cc_posts ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`
    UPDATE cc_posts p
    SET
      post_url_valid = CASE
        WHEN p.post_url IS NULL OR btrim(p.post_url) = '' THEN FALSE
        WHEN p.post_url ~* '^https?://(www\\.)?(example\\.com|example\\.org|example\\.net)(/|$)' THEN FALSE
        WHEN p.post_url ~* '^https?://([a-z0-9-]+\\.)?(tiktok\\.com|instagram\\.com|youtube\\.com|youtu\\.be|twitter\\.com|x\\.com|facebook\\.com|fb\\.watch|soundcloud\\.com|spotify\\.com)(/|$)' THEN TRUE
        ELSE FALSE
      END,
      post_url_reason = CASE
        WHEN p.post_url IS NULL OR btrim(p.post_url) = '' THEN 'missing_url'
        WHEN p.post_url ~* '^https?://(www\\.)?(example\\.com|example\\.org|example\\.net)(/|$)' THEN 'invalid_source_url'
        WHEN p.post_url ~* '^https?://([a-z0-9-]+\\.)?(tiktok\\.com|instagram\\.com|youtube\\.com|youtu\\.be|twitter\\.com|x\\.com|facebook\\.com|fb\\.watch|soundcloud\\.com|spotify\\.com)(/|$)' THEN 'valid'
        ELSE 'unsupported_source_url'
      END
    WHERE p.post_url_valid IS DISTINCT FROM CASE
      WHEN p.post_url IS NULL OR btrim(p.post_url) = '' THEN FALSE
      WHEN p.post_url ~* '^https?://(www\\.)?(example\\.com|example\\.org|example\\.net)(/|$)' THEN FALSE
      WHEN p.post_url ~* '^https?://([a-z0-9-]+\\.)?(tiktok\\.com|instagram\\.com|youtube\\.com|youtu\\.be|twitter\\.com|x\\.com|facebook\\.com|fb\\.watch|soundcloud\\.com|spotify\\.com)(/|$)' THEN TRUE
      ELSE FALSE
    END
      OR p.post_url_reason IS DISTINCT FROM CASE
        WHEN p.post_url IS NULL OR btrim(p.post_url) = '' THEN 'missing_url'
        WHEN p.post_url ~* '^https?://(www\\.)?(example\\.com|example\\.org|example\\.net)(/|$)' THEN 'invalid_source_url'
        WHEN p.post_url ~* '^https?://([a-z0-9-]+\\.)?(tiktok\\.com|instagram\\.com|youtube\\.com|youtu\\.be|twitter\\.com|x\\.com|facebook\\.com|fb\\.watch|soundcloud\\.com|spotify\\.com)(/|$)' THEN 'valid'
        ELSE 'unsupported_source_url'
      END
  `;

  await sql`ALTER TABLE cc_campaigns DROP CONSTRAINT IF EXISTS cc_campaigns_campaign_id_key`;
  await sql`ALTER TABLE cc_posts DROP CONSTRAINT IF EXISTS cc_posts_post_id_key`;
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'cc_campaigns_source_campaign_unique'
      ) THEN
        ALTER TABLE cc_campaigns
        ADD CONSTRAINT cc_campaigns_source_campaign_unique UNIQUE (source_key, campaign_id);
      END IF;
    END
    $$;
  `;
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'cc_posts_source_post_unique'
      ) THEN
        ALTER TABLE cc_posts
        ADD CONSTRAINT cc_posts_source_post_unique UNIQUE (source_key, post_id);
      END IF;
    END
    $$;
  `;

  await sql`ALTER TABLE cc_campaigns ADD COLUMN IF NOT EXISTS genre TEXT`;
  await sql`ALTER TABLE cc_campaigns ADD COLUMN IF NOT EXISTS genre_confidence NUMERIC(5,4)`;
  await sql`ALTER TABLE cc_campaigns ADD COLUMN IF NOT EXISTS genre_source TEXT`;
  await sql`ALTER TABLE cc_campaigns ADD COLUMN IF NOT EXISTS genre_updated_at TIMESTAMPTZ`;
  await sql`ALTER TABLE cc_campaigns ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ`;
  await sql`ALTER TABLE cc_campaigns ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`;
  await sql`ALTER TABLE cc_campaigns ALTER COLUMN first_seen_at SET DEFAULT NOW()`;
  await sql`ALTER TABLE cc_campaigns ALTER COLUMN last_seen_at SET DEFAULT NOW()`;

  await sql`
    UPDATE cc_campaigns
    SET
      first_seen_at = COALESCE(first_seen_at, created_at, NOW()),
      last_seen_at = COALESCE(last_seen_at, last_synced_at, created_at, NOW())
    WHERE first_seen_at IS NULL OR last_seen_at IS NULL
  `;

  // Fill empty/missing slugs with a stable fallback that includes campaign_id.
  await sql`
    UPDATE cc_campaigns
    SET slug = regexp_replace(
      COALESCE(NULLIF(regexp_replace(lower(COALESCE(title, 'campaign')), '[^a-z0-9]+', '-', 'g'), ''), 'campaign')
      || '-' || right(campaign_id, 8),
      '(^-|-$)',
      '',
      'g'
    )
    WHERE slug IS NULL OR btrim(slug) = ''
  `;

  // Resolve duplicate slugs by suffixing with row id.
  await sql`
    WITH ranked AS (
      SELECT id, slug, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY id) AS rn
      FROM cc_campaigns
      WHERE slug IS NOT NULL AND btrim(slug) <> ''
    )
    UPDATE cc_campaigns c
    SET slug = c.slug || '-' || c.id
    FROM ranked r
    WHERE c.id = r.id AND r.rn > 1
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS cc_creators (
      username TEXT PRIMARY KEY,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      first_campaign_pk INTEGER NULL,
      last_campaign_pk INTEGER NULL,
      last_platform VARCHAR(32) NULL
    )
  `;

  // Backfill creator first/last seen from existing posts.
  await sql`
    INSERT INTO cc_creators (username, first_seen_at, last_seen_at)
    SELECT
      LOWER(username) AS username,
      COALESCE(MIN(created_date), MIN(post_date), NOW()) AS first_seen_at,
      COALESCE(MAX(created_date), MAX(post_date), NOW()) AS last_seen_at
    FROM cc_posts
    WHERE username IS NOT NULL AND btrim(username) <> ''
    GROUP BY LOWER(username)
    ON CONFLICT (username) DO UPDATE
    SET
      first_seen_at = LEAST(cc_creators.first_seen_at, EXCLUDED.first_seen_at),
      last_seen_at = GREATEST(cc_creators.last_seen_at, EXCLUDED.last_seen_at)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS influencer_organizations (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS influencer_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS influencer_memberships (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES influencer_users(id) ON DELETE CASCADE,
      org_id TEXT NOT NULL REFERENCES influencer_organizations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('viewer', 'analyst', 'admin', 'customer')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, org_id)
    )
  `;
  await sql`ALTER TABLE influencer_memberships DROP CONSTRAINT IF EXISTS influencer_memberships_role_check`;
  await sql`
    ALTER TABLE influencer_memberships
    ADD CONSTRAINT influencer_memberships_role_check
    CHECK (role IN ('viewer', 'analyst', 'admin', 'customer'))
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS cc_campaign_review_state (
      campaign_pk INTEGER PRIMARY KEY REFERENCES cc_campaigns(id) ON DELETE CASCADE,
      reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_by TEXT NULL,
      notes TEXT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS cc_creator_review_state (
      username TEXT PRIMARY KEY REFERENCES cc_creators(username) ON DELETE CASCADE,
      reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_by TEXT NULL,
      notes TEXT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS cc_campaign_metrics (
      campaign_pk INTEGER PRIMARY KEY REFERENCES cc_campaigns(id) ON DELETE CASCADE,
      actual_posts BIGINT NOT NULL DEFAULT 0,
      actual_creators BIGINT NOT NULL DEFAULT 0,
      total_views NUMERIC NOT NULL DEFAULT 0,
      verified_views NUMERIC NOT NULL DEFAULT 0,
      valid_url_posts BIGINT NOT NULL DEFAULT 0,
      invalid_url_posts BIGINT NOT NULL DEFAULT 0,
      quality_status TEXT NOT NULL DEFAULT 'missing_posts',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS cc_dashboard_stats_org_1m (
      org_id TEXT PRIMARY KEY,
      total_campaigns BIGINT NOT NULL DEFAULT 0,
      active_campaigns BIGINT NOT NULL DEFAULT 0,
      total_creators BIGINT NOT NULL DEFAULT 0,
      total_posts BIGINT NOT NULL DEFAULT 0,
      total_views NUMERIC NOT NULL DEFAULT 0,
      verified_views NUMERIC NOT NULL DEFAULT 0,
      total_budget NUMERIC NOT NULL DEFAULT 0,
      genre_count BIGINT NOT NULL DEFAULT 0,
      new_campaigns_24h BIGINT NOT NULL DEFAULT 0,
      new_campaigns_7d BIGINT NOT NULL DEFAULT 0,
      new_creators_24h BIGINT NOT NULL DEFAULT 0,
      new_creators_7d BIGINT NOT NULL DEFAULT 0,
      pending_campaigns_total BIGINT NOT NULL DEFAULT 0,
      pending_campaigns_24h BIGINT NOT NULL DEFAULT 0,
      campaigns_needing_review BIGINT NOT NULL DEFAULT 0,
      creators_needing_review BIGINT NOT NULL DEFAULT 0,
      top_genres JSONB NOT NULL DEFAULT '[]'::jsonb,
      top_platforms JSONB NOT NULL DEFAULT '[]'::jsonb,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS cc_sync_state (
      id BIGSERIAL PRIMARY KEY,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('campaign', 'post')),
      source_key TEXT NOT NULL DEFAULT 'legacy',
      last_cursor BIGINT NOT NULL DEFAULT 0,
      last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      records_synced BIGINT NOT NULL DEFAULT 0,
      UNIQUE (entity_type, source_key)
    )
  `;
  await sql`ALTER TABLE cc_sync_state ADD COLUMN IF NOT EXISTS source_key TEXT`;
  await sql`ALTER TABLE cc_sync_state ALTER COLUMN source_key SET DEFAULT 'legacy'`;
  await sql`UPDATE cc_sync_state SET source_key = 'legacy' WHERE source_key IS NULL OR btrim(source_key) = ''`;
  await sql`ALTER TABLE cc_sync_state ALTER COLUMN source_key SET NOT NULL`;
  await sql`ALTER TABLE cc_sync_state DROP CONSTRAINT IF EXISTS cc_sync_state_entity_type_key`;
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'cc_sync_state_entity_source_unique'
      ) THEN
        ALTER TABLE cc_sync_state
        ADD CONSTRAINT cc_sync_state_entity_source_unique UNIQUE (entity_type, source_key);
      END IF;
    END
    $$;
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS cc_agencies (
      key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS cc_agency_platform_rates (
      id BIGSERIAL PRIMARY KEY,
      agency_key TEXT NOT NULL REFERENCES cc_agencies(key) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      rate_per_post_usd NUMERIC(12,2) NOT NULL CHECK (rate_per_post_usd >= 0),
      currency TEXT NOT NULL DEFAULT 'USD',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (agency_key, platform)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS cc_genre_cache (
      artist_name TEXT PRIMARY KEY,
      genre TEXT NULL,
      confidence TEXT NULL,
      searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS cc_genre_classification_runs (
      id BIGSERIAL PRIMARY KEY,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ NULL,
      status TEXT NOT NULL DEFAULT 'started',
      total_candidates INTEGER NOT NULL DEFAULT 0,
      classified INTEGER NOT NULL DEFAULT 0,
      heuristic_hits INTEGER NOT NULL DEFAULT 0,
      search_hits INTEGER NOT NULL DEFAULT 0,
      cache_hits INTEGER NOT NULL DEFAULT 0,
      marked_other INTEGER NOT NULL DEFAULT 0,
      marked_unclassified INTEGER NOT NULL DEFAULT 0,
      search_calls INTEGER NOT NULL DEFAULT 0,
      failures INTEGER NOT NULL DEFAULT 0,
      remaining INTEGER NOT NULL DEFAULT 0,
      error_message TEXT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS genre_taxonomy (
      genre_id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      parent_genre_id TEXT NULL REFERENCES genre_taxonomy(genre_id) ON DELETE SET NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS entity_genre_labels (
      entity_type TEXT NOT NULL CHECK (entity_type IN ('campaign', 'creator', 'track')),
      entity_id TEXT NOT NULL,
      genre_id TEXT NOT NULL REFERENCES genre_taxonomy(genre_id),
      weight NUMERIC(5,4) NOT NULL CHECK (weight >= 0 AND weight <= 1),
      confidence NUMERIC(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
      source TEXT NOT NULL,
      evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (entity_type, entity_id, genre_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS creator_feature_daily (
      creator_id TEXT NOT NULL,
      as_of_date DATE NOT NULL,
      platform TEXT NOT NULL,
      genre_vector JSONB NOT NULL,
      audience_vector JSONB NOT NULL DEFAULT '{}'::jsonb,
      perf_vector JSONB NOT NULL DEFAULT '{}'::jsonb,
      spend_efficiency NUMERIC(12,6) NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (creator_id, as_of_date, platform)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS tracks (
      track_id TEXT PRIMARY KEY,
      campaign_pk INTEGER NULL REFERENCES cc_campaigns(id) ON DELETE SET NULL,
      artist TEXT NOT NULL,
      title TEXT NOT NULL,
      isrc TEXT NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
        CREATE EXTENSION IF NOT EXISTS vector;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END
    $$;
  `;

  await sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
        EXECUTE '
          CREATE TABLE IF NOT EXISTS track_audio_features (
            track_id TEXT PRIMARY KEY REFERENCES tracks(track_id) ON DELETE CASCADE,
            tempo NUMERIC NULL,
            key TEXT NULL,
            mode TEXT NULL,
            energy NUMERIC NULL,
            danceability NUMERIC NULL,
            valence NUMERIC NULL,
            embedding vector(1536) NULL,
            extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        ';
      ELSE
        EXECUTE '
          CREATE TABLE IF NOT EXISTS track_audio_features (
            track_id TEXT PRIMARY KEY REFERENCES tracks(track_id) ON DELETE CASCADE,
            tempo NUMERIC NULL,
            key TEXT NULL,
            mode TEXT NULL,
            energy NUMERIC NULL,
            danceability NUMERIC NULL,
            valence NUMERIC NULL,
            embedding DOUBLE PRECISION[] NULL,
            extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        ';
      END IF;
    END
    $$;
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS chart_observations (
      id BIGSERIAL PRIMARY KEY,
      track_id TEXT NOT NULL REFERENCES tracks(track_id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      chart_name TEXT NOT NULL,
      observed_at DATE NOT NULL,
      rank INTEGER NOT NULL,
      momentum NUMERIC NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS campaign_recommendation_runs (
      run_id TEXT PRIMARY KEY,
      campaign_pk INTEGER NOT NULL REFERENCES cc_campaigns(id) ON DELETE CASCADE,
      budget NUMERIC NULL,
      objective TEXT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      risk_mode TEXT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS campaign_recommendations (
      run_id TEXT NOT NULL REFERENCES campaign_recommendation_runs(run_id) ON DELETE CASCADE,
      creator_id TEXT NOT NULL,
      rank INTEGER NOT NULL,
      score NUMERIC(6,4) NOT NULL,
      score_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
      rationale JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'pending_review',
      estimated_spend NUMERIC NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (run_id, creator_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS campaign_swipes (
      id BIGSERIAL PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES campaign_recommendation_runs(run_id) ON DELETE CASCADE,
      creator_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('left', 'right', 'maybe')),
      actor_user_id TEXT NOT NULL,
      acted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      note TEXT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS automation_policies (
      policy_id TEXT PRIMARY KEY,
      mode TEXT NOT NULL CHECK (mode IN ('manual', 'hybrid', 'auto')),
      guardrails JSONB NOT NULL DEFAULT '{}'::jsonb,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Recreate the summary view so column-order mismatches from older deployments cannot break migration.
  await sql`DROP VIEW IF EXISTS v_campaign_summary`;
  await sql`
    CREATE VIEW v_campaign_summary AS
    SELECT
      c.id AS campaign_pk,
      c.title,
      c.slug,
      c.budget,
      c.currency,
      c.platforms,
      c.org_id,
      c.created_at,
      c.archived,
      c.creator_count,
      c.total_posts,
      c.genre,
      c.genre_confidence,
      c.genre_source,
      c.thumbnail,
      COUNT(DISTINCT p.username) AS actual_creators,
      COUNT(p.post_id) AS actual_posts,
      SUM(p.views) AS total_views,
      STRING_AGG(DISTINCT p.username::text, ', ' ORDER BY p.username::text) AS creator_list
    FROM cc_campaigns c
    LEFT JOIN cc_posts p ON p.campaign_pk = c.id
    GROUP BY c.id
  `;

  await seedGenreTaxonomy(sql);

  await sql`
    WITH target AS (
      SELECT id
      FROM cc_campaigns
      WHERE genre IS NULL OR btrim(genre) = ''
      ORDER BY id ASC
      FOR UPDATE SKIP LOCKED
    )
    UPDATE cc_campaigns c
    SET
      genre = 'Unclassified',
      genre_confidence = COALESCE(c.genre_confidence, 0),
      genre_source = COALESCE(c.genre_source, 'legacy_default'),
      genre_updated_at = COALESCE(c.genre_updated_at, NOW())
    FROM target t
    WHERE c.id = t.id
  `;

  await sql`
    WITH target AS (
      SELECT id
      FROM cc_campaigns
      WHERE genre IS NOT NULL
        AND btrim(genre) <> ''
        AND (genre_confidence IS NULL OR genre_source IS NULL OR genre_updated_at IS NULL)
      ORDER BY id ASC
      FOR UPDATE SKIP LOCKED
    )
    UPDATE cc_campaigns c
    SET
      genre_confidence = COALESCE(c.genre_confidence, CASE WHEN c.genre = 'Unclassified' THEN 0 ELSE 0.7 END),
      genre_source = COALESCE(c.genre_source, 'legacy'),
      genre_updated_at = COALESCE(c.genre_updated_at, NOW())
    FROM target t
    WHERE c.id = t.id
  `;

  await sql`
    UPDATE cc_campaigns
    SET genre = btrim(genre)
    WHERE genre IS NOT NULL
      AND genre <> btrim(genre)
  `;

  await sql`
    INSERT INTO genre_taxonomy (genre_id, label)
    SELECT DISTINCT btrim(c.genre), btrim(c.genre)
    FROM cc_campaigns c
    WHERE c.genre IS NOT NULL
      AND btrim(c.genre) <> ''
    ON CONFLICT (genre_id) DO UPDATE
    SET label = EXCLUDED.label, is_active = TRUE
  `;

  await sql`
    INSERT INTO genre_taxonomy (genre_id, label)
    SELECT DISTINCT btrim(egl.genre_id), btrim(egl.genre_id)
    FROM entity_genre_labels egl
    WHERE egl.genre_id IS NOT NULL
      AND btrim(egl.genre_id) <> ''
    ON CONFLICT (genre_id) DO UPDATE
    SET label = EXCLUDED.label, is_active = TRUE
  `;

  await sql`
    INSERT INTO entity_genre_labels (
      entity_type, entity_id, genre_id, weight, confidence, source, evidence, updated_at
    )
    SELECT
      'campaign',
      c.id::text,
      btrim(c.genre),
      1.0,
      COALESCE(c.genre_confidence, CASE WHEN btrim(c.genre) = 'Unclassified' THEN 0 ELSE 0.7 END),
      COALESCE(c.genre_source, 'legacy'),
      jsonb_build_object('backfill', true, 'source', 'cc_campaigns.genre'),
      NOW()
    FROM cc_campaigns c
    WHERE c.genre IS NOT NULL AND btrim(c.genre) <> ''
    ORDER BY c.id ASC
    ON CONFLICT (entity_type, entity_id, genre_id) DO NOTHING
  `;

  await sql`
    WITH creator_scores AS (
      SELECT
        LOWER(p.username) AS creator_id,
        egl.genre_id,
        SUM(COALESCE(egl.weight, 0)) AS raw_weight
      FROM cc_posts p
      JOIN entity_genre_labels egl
        ON egl.entity_type = 'campaign'
       AND egl.entity_id = p.campaign_pk::text
      WHERE p.username IS NOT NULL
        AND btrim(p.username) <> ''
      GROUP BY LOWER(p.username), egl.genre_id
    ),
    totals AS (
      SELECT creator_id, SUM(raw_weight) AS total_weight
      FROM creator_scores
      GROUP BY creator_id
    )
    INSERT INTO entity_genre_labels (
      entity_type, entity_id, genre_id, weight, confidence, source, evidence, updated_at
    )
    SELECT
      'creator',
      cs.creator_id,
      cs.genre_id,
      ROUND((cs.raw_weight / NULLIF(t.total_weight, 0))::numeric, 4),
      ROUND(LEAST(1.0, (cs.raw_weight / NULLIF(t.total_weight, 0)))::numeric, 4),
      'campaign_rollup',
      jsonb_build_object('backfill', true, 'method', 'campaign_label_rollup'),
      NOW()
    FROM creator_scores cs
    JOIN totals t ON t.creator_id = cs.creator_id
    WHERE t.total_weight > 0
    ORDER BY cs.creator_id ASC, cs.genre_id ASC
    ON CONFLICT (entity_type, entity_id, genre_id) DO NOTHING
  `;

  await sql`
    WITH post_rollup AS (
      SELECT
        p.campaign_pk,
        COUNT(*) AS actual_posts,
        COUNT(DISTINCT LOWER(p.username)) FILTER (WHERE p.username IS NOT NULL AND btrim(p.username) <> '') AS actual_creators,
        COALESCE(SUM(p.views), 0)::NUMERIC AS total_views,
        COUNT(*) FILTER (WHERE COALESCE(p.post_url_valid, FALSE) = TRUE) AS valid_url_posts,
        COUNT(*) FILTER (WHERE COALESCE(p.post_url_valid, FALSE) = FALSE) AS invalid_url_posts,
        COALESCE(
          SUM(
            CASE
              WHEN COALESCE(p.post_url_valid, FALSE) = TRUE
              THEN COALESCE(p.views, 0)::NUMERIC
              ELSE 0::NUMERIC
            END
          ),
          0::NUMERIC
        ) AS verified_views
      FROM cc_posts p
      WHERE COALESCE(p.is_test_data, FALSE) = FALSE
      GROUP BY p.campaign_pk
    )
    INSERT INTO cc_campaign_metrics (
      campaign_pk,
      actual_posts,
      actual_creators,
      total_views,
      verified_views,
      valid_url_posts,
      invalid_url_posts,
      quality_status,
      updated_at
    )
    SELECT
      c.id,
      COALESCE(pr.actual_posts, 0),
      COALESCE(pr.actual_creators, 0),
      COALESCE(pr.total_views, 0),
      COALESCE(pr.verified_views, 0),
      COALESCE(pr.valid_url_posts, 0),
      COALESCE(pr.invalid_url_posts, 0),
      CASE
        WHEN COALESCE(pr.actual_posts, 0) = 0 THEN 'missing_posts'
        WHEN COALESCE(pr.valid_url_posts, 0) = 0 THEN 'placeholder_links_only'
        WHEN (
          COALESCE(NULLIF(btrim(c.title), ''), 'Untitled') = 'Untitled'
          OR c.platforms IS NULL
          OR btrim(c.platforms) = ''
        ) AND COALESCE(c.first_seen_at, c.created_at, NOW()) <= NOW() - INTERVAL '30 minutes'
          THEN 'missing_core_metadata'
        ELSE 'ready'
      END,
      NOW()
    FROM cc_campaigns c
    LEFT JOIN post_rollup pr ON pr.campaign_pk = c.id
    WHERE COALESCE(c.is_test_data, FALSE) = FALSE
    ON CONFLICT (campaign_pk) DO UPDATE
    SET
      actual_posts = EXCLUDED.actual_posts,
      actual_creators = EXCLUDED.actual_creators,
      total_views = EXCLUDED.total_views,
      verified_views = EXCLUDED.verified_views,
      valid_url_posts = EXCLUDED.valid_url_posts,
      invalid_url_posts = EXCLUDED.invalid_url_posts,
      quality_status = EXCLUDED.quality_status,
      updated_at = NOW()
  `;

  await sql`
    WITH scoped_campaigns AS (
      SELECT
        c.id,
        COALESCE(NULLIF(c.org_id, ''), ${INFLUENCER_UNKNOWN_ORG_ID}) AS org_id,
        c.archived,
        c.budget,
        c.genre,
        c.first_seen_at
      FROM cc_campaigns c
      WHERE COALESCE(c.is_test_data, FALSE) = FALSE
    ),
    scoped_metrics AS (
      SELECT
        sc.org_id,
        sc.id,
        sc.archived,
        sc.budget,
        sc.genre,
        sc.first_seen_at,
        COALESCE(cm.actual_posts, 0) AS actual_posts,
        COALESCE(cm.actual_creators, 0) AS actual_creators,
        COALESCE(cm.total_views, 0) AS total_views,
        COALESCE(cm.verified_views, 0) AS verified_views,
        COALESCE(cm.quality_status, 'missing_posts') AS quality_status
      FROM scoped_campaigns sc
      LEFT JOIN cc_campaign_metrics cm ON cm.campaign_pk = sc.id
    ),
    creator_counts AS (
      SELECT
        COALESCE(NULLIF(c.org_id, ''), ${INFLUENCER_UNKNOWN_ORG_ID}) AS org_id,
        COUNT(DISTINCT LOWER(p.username)) FILTER (WHERE p.username IS NOT NULL AND btrim(p.username) <> '') AS total_creators
      FROM cc_posts p
      JOIN cc_campaigns c ON c.id = p.campaign_pk
      WHERE COALESCE(c.is_test_data, FALSE) = FALSE
        AND COALESCE(p.is_test_data, FALSE) = FALSE
      GROUP BY COALESCE(NULLIF(c.org_id, ''), ${INFLUENCER_UNKNOWN_ORG_ID})
    ),
    top_genres AS (
      SELECT
        org_id,
        COALESCE(
          JSONB_AGG(
            JSONB_BUILD_OBJECT(
              'genre', genre,
              'campaign_count', campaign_count,
              'total_budget', total_budget
            )
            ORDER BY campaign_count DESC, genre ASC
          ),
          '[]'::jsonb
        ) AS top_genres
      FROM (
        SELECT
          org_id,
          genre,
          COUNT(*) AS campaign_count,
          COALESCE(SUM(budget), 0) AS total_budget,
          ROW_NUMBER() OVER (PARTITION BY org_id ORDER BY COUNT(*) DESC, genre ASC) AS rn
        FROM scoped_metrics
        WHERE genre IS NOT NULL
        GROUP BY org_id, genre
      ) ranked
      WHERE rn <= 10
      GROUP BY org_id
    ),
    top_platforms AS (
      SELECT
        org_id,
        COALESCE(
          JSONB_AGG(
            JSONB_BUILD_OBJECT(
              'platform', platform,
              'post_count', post_count,
              'total_views', total_views
            )
            ORDER BY total_views DESC, platform ASC
          ),
          '[]'::jsonb
        ) AS top_platforms
      FROM (
        SELECT
          COALESCE(NULLIF(c.org_id, ''), ${INFLUENCER_UNKNOWN_ORG_ID}) AS org_id,
          p.platform,
          COUNT(*) AS post_count,
          COALESCE(SUM(p.views), 0) AS total_views,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(NULLIF(c.org_id, ''), ${INFLUENCER_UNKNOWN_ORG_ID})
            ORDER BY COALESCE(SUM(p.views), 0) DESC, p.platform ASC
          ) AS rn
        FROM cc_posts p
        JOIN cc_campaigns c ON c.id = p.campaign_pk
        WHERE COALESCE(c.is_test_data, FALSE) = FALSE
          AND COALESCE(p.is_test_data, FALSE) = FALSE
          AND p.platform IS NOT NULL
          AND btrim(p.platform) <> ''
        GROUP BY COALESCE(NULLIF(c.org_id, ''), ${INFLUENCER_UNKNOWN_ORG_ID}), p.platform
      ) ranked
      WHERE rn <= 10
      GROUP BY org_id
    )
    INSERT INTO cc_dashboard_stats_org_1m (
      org_id,
      total_campaigns,
      active_campaigns,
      total_creators,
      total_posts,
      total_views,
      verified_views,
      total_budget,
      genre_count,
      new_campaigns_24h,
      new_campaigns_7d,
      new_creators_24h,
      new_creators_7d,
      pending_campaigns_total,
      pending_campaigns_24h,
      campaigns_needing_review,
      creators_needing_review,
      top_genres,
      top_platforms,
      computed_at
    )
    SELECT
      sm.org_id,
      COUNT(*) AS total_campaigns,
      COUNT(*) FILTER (WHERE NOT sm.archived) AS active_campaigns,
      COALESCE(cc.total_creators, 0) AS total_creators,
      COALESCE(SUM(sm.actual_posts), 0) AS total_posts,
      COALESCE(SUM(sm.total_views), 0) AS total_views,
      COALESCE(SUM(sm.verified_views), 0) AS verified_views,
      COALESCE(SUM(sm.budget), 0) AS total_budget,
      COUNT(DISTINCT sm.genre) FILTER (WHERE sm.genre IS NOT NULL) AS genre_count,
      COUNT(*) FILTER (WHERE sm.first_seen_at >= NOW() - INTERVAL '24 hours') AS new_campaigns_24h,
      COUNT(*) FILTER (WHERE sm.first_seen_at >= NOW() - INTERVAL '7 days') AS new_campaigns_7d,
      0 AS new_creators_24h,
      0 AS new_creators_7d,
      COUNT(*) FILTER (
        WHERE sm.first_seen_at >= NOW() - INTERVAL '14 days'
          AND sm.first_seen_at <= NOW() - INTERVAL '30 minutes'
          AND sm.quality_status IN ('missing_posts', 'placeholder_links_only', 'missing_core_metadata')
      ) AS pending_campaigns_total,
      COUNT(*) FILTER (
        WHERE sm.first_seen_at >= NOW() - INTERVAL '24 hours'
          AND sm.first_seen_at <= NOW() - INTERVAL '30 minutes'
          AND sm.quality_status IN ('missing_posts', 'placeholder_links_only', 'missing_core_metadata')
      ) AS pending_campaigns_24h,
      0 AS campaigns_needing_review,
      0 AS creators_needing_review,
      COALESCE(tg.top_genres, '[]'::jsonb) AS top_genres,
      COALESCE(tp.top_platforms, '[]'::jsonb) AS top_platforms,
      NOW()
    FROM scoped_metrics sm
    LEFT JOIN creator_counts cc ON cc.org_id = sm.org_id
    LEFT JOIN top_genres tg ON tg.org_id = sm.org_id
    LEFT JOIN top_platforms tp ON tp.org_id = sm.org_id
    GROUP BY sm.org_id, cc.total_creators, tg.top_genres, tp.top_platforms
    ON CONFLICT (org_id) DO UPDATE
    SET
      total_campaigns = EXCLUDED.total_campaigns,
      active_campaigns = EXCLUDED.active_campaigns,
      total_creators = EXCLUDED.total_creators,
      total_posts = EXCLUDED.total_posts,
      total_views = EXCLUDED.total_views,
      verified_views = EXCLUDED.verified_views,
      total_budget = EXCLUDED.total_budget,
      genre_count = EXCLUDED.genre_count,
      new_campaigns_24h = EXCLUDED.new_campaigns_24h,
      new_campaigns_7d = EXCLUDED.new_campaigns_7d,
      new_creators_24h = EXCLUDED.new_creators_24h,
      new_creators_7d = EXCLUDED.new_creators_7d,
      pending_campaigns_total = EXCLUDED.pending_campaigns_total,
      pending_campaigns_24h = EXCLUDED.pending_campaigns_24h,
      campaigns_needing_review = EXCLUDED.campaigns_needing_review,
      creators_needing_review = EXCLUDED.creators_needing_review,
      top_genres = EXCLUDED.top_genres,
      top_platforms = EXCLUDED.top_platforms,
      computed_at = NOW()
  `;

  await seedOrganizations(sql);
  await seedBootstrapUser(sql);
  await applyCreatorCoreRls(sql);

  await sql`
    INSERT INTO automation_policies (policy_id, mode, guardrails, active)
    VALUES (
      'default-hybrid',
      'hybrid',
      '{"auto_shortlist_score":0.82,"auto_shortlist_confidence":0.75,"requires_human_above_spend":2500}'::jsonb,
      TRUE
    )
    ON CONFLICT (policy_id) DO UPDATE
    SET
      mode = EXCLUDED.mode,
      guardrails = EXCLUDED.guardrails,
      active = EXCLUDED.active,
      updated_at = NOW()
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_cc_campaigns_first_seen_at ON cc_campaigns(first_seen_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_campaigns_last_seen_at ON cc_campaigns(last_seen_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_campaigns_org_id ON cc_campaigns(org_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_campaigns_slug ON cc_campaigns(slug)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_campaigns_genre ON cc_campaigns(genre)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_campaigns_is_test_data ON cc_campaigns(is_test_data)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_campaigns_source_key ON cc_campaigns(source_key)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_campaigns_source_campaign_id ON cc_campaigns(source_key, campaign_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_creators_first_seen_at ON cc_creators(first_seen_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_creators_last_seen_at ON cc_creators(last_seen_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_posts_campaign_pk ON cc_posts(campaign_pk)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_posts_username_lower ON cc_posts(LOWER(username))`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_posts_is_test_data ON cc_posts(is_test_data)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_posts_url_valid ON cc_posts(post_url_valid)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_posts_source_key ON cc_posts(source_key)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_posts_source_post_id ON cc_posts(source_key, post_id)`;
  await sql`DROP INDEX IF EXISTS idx_cc_posts_canonical_key`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_posts_canonical_key_hash ON cc_posts((md5(COALESCE(canonical_post_key, ''))))`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_sync_state_synced_at ON cc_sync_state(last_synced_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_sync_state_entity_source ON cc_sync_state(entity_type, source_key)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_genre_cache_searched_at ON cc_genre_cache(searched_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_genre_runs_started_at ON cc_genre_classification_runs(started_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_agencies_active ON cc_agencies(active)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_rates_agency_platform ON cc_agency_platform_rates(agency_key, platform)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_campaign_metrics_quality_status ON cc_campaign_metrics(quality_status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_campaign_metrics_updated_at ON cc_campaign_metrics(updated_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_dashboard_stats_computed_at ON cc_dashboard_stats_org_1m(computed_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_entity_genre_labels_type_id ON entity_genre_labels(entity_type, entity_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_entity_genre_labels_type_genre ON entity_genre_labels(entity_type, genre_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_entity_genre_labels_updated ON entity_genre_labels(updated_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_creator_feature_daily_creator_date ON creator_feature_daily(creator_id, as_of_date DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tracks_campaign_pk ON tracks(campaign_pk)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_chart_observations_track_date ON chart_observations(track_id, observed_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_chart_observations_source_chart_date ON chart_observations(source, chart_name, observed_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_reco_runs_campaign_created ON campaign_recommendation_runs(campaign_pk, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_reco_runs_status_created ON campaign_recommendation_runs(status, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_recommendations_run_rank ON campaign_recommendations(run_id, rank ASC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_campaign_swipes_run_creator ON campaign_swipes(run_id, creator_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_campaign_swipes_actor_date ON campaign_swipes(actor_user_id, acted_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_campaign_review_state_reviewed_at ON cc_campaign_review_state(reviewed_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cc_creator_review_state_reviewed_at ON cc_creator_review_state(reviewed_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_influencer_memberships_user_id ON influencer_memberships(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_influencer_memberships_org_id ON influencer_memberships(org_id)`;
}

export async function ensureCreatorCoreSchema(sql: NeonQueryFunction<false, false>): Promise<void> {
  const now = Date.now();
  if (schemaIsCurrent && now - schemaValidatedAtMs < SCHEMA_RECHECK_INTERVAL_MS) {
    return;
  }

  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const currentVersion = await getSchemaVersion(sql);
      if (currentVersion === CREATORCORE_SCHEMA_VERSION) {
        schemaIsCurrent = true;
        schemaValidatedAtMs = Date.now();
        return;
      }

      await runSchemaMigration(sql);
      await setSchemaVersion(sql, CREATORCORE_SCHEMA_VERSION);
      schemaIsCurrent = true;
      schemaValidatedAtMs = Date.now();
    })();
  }

  try {
    await schemaReadyPromise;
  } catch (error) {
    schemaReadyPromise = null;
    schemaIsCurrent = false;
    schemaValidatedAtMs = 0;
    throw error;
  }

  schemaReadyPromise = null;
  if (!schemaIsCurrent) {
    schemaValidatedAtMs = Date.now();
  }
}
