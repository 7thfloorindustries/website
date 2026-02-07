/**
 * CreatorCore incremental sync
 * Uses cc_sync_state to track cursor position for resumable syncs.
 */

import { createHash } from 'crypto';
import { neon } from '@neondatabase/serverless';
import {
  DEFAULT_CREATORCORE_BASE_URL,
  fetchCampaignById,
  fetchCampaigns,
  fetchPostById,
  fetchPosts,
  type CCApiCampaign,
  type CCApiPost,
} from './api-client';
import { ensureCreatorCoreSchema } from './schema';
import type { NeonQueryFunctionInTransaction } from '@neondatabase/serverless';
import { allowTestFixtureIngestion } from '@/lib/influencer/flags';
import { validatePostUrl } from './url-validation';

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured');
  }
  return neon(databaseUrl);
}

type TxQuery = NeonQueryFunctionInTransaction<false, false>;
const DEFAULT_SOURCE_KEY = 'legacy';
const DEFAULT_SOURCE_NAME = 'Legacy';
const TEST_SOURCE_KEY_PATTERN = /^it[a-z0-9]+_source_[ab]$/i;
const TEST_TITLE_PATTERN = /^(Genre Sort|Hydrated)\b/i;

function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === 'production';
}

function isFixtureSignature(sourceKey: string, titleOrUrl: string | null | undefined): boolean {
  if (!TEST_SOURCE_KEY_PATTERN.test(sourceKey)) return false;
  const value = (titleOrUrl || '').trim();
  if (!value) return false;
  return TEST_TITLE_PATTERN.test(value) || /^https?:\/\/(www\.)?example\.com\//i.test(value);
}

function shouldMarkAsTestData(sourceKey: string, titleOrUrl: string | null | undefined): boolean {
  if (!isFixtureSignature(sourceKey, titleOrUrl)) return false;
  if (isProductionEnvironment()) return false;
  return allowTestFixtureIngestion();
}

export interface CreatorCoreAgencySource {
  baseUrl: string;
  key: string;
  name: string;
}

async function runWithSystemContext(
  buildQueries: (tx: TxQuery) => ReturnType<TxQuery>[]
) {
  const sql = getDb();
  const results = await sql.transaction((tx) => [
    tx`SELECT set_config('app.current_org_id', '', true)`,
    tx`SELECT set_config('app.current_role', 'system', true)`,
    // Neon may widen tx generic flags; cast to the local transaction query shape.
    ...buildQueries(tx as TxQuery),
  ]);

  return results.slice(2);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function toIsoDate(value: unknown): string | null {
  if (!value || typeof value !== 'string') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeUrl(url: unknown): string | null {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('//')) return `https:${url}`;
  return url;
}

function normalizeSourceKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 64);
}

function sourceNameFromKey(key: string): string {
  if (!key) return DEFAULT_SOURCE_NAME;
  return key
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_CREATORCORE_BASE_URL;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_CREATORCORE_BASE_URL;
  return trimmed.replace(/\/+$/, '');
}

function toSourceEntry(raw: unknown): CreatorCoreAgencySource | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const key = normalizeSourceKey(String(row.key || ''));
  const baseUrl = normalizeBaseUrl(row.baseUrl);
  const nameRaw = typeof row.name === 'string' ? row.name.trim() : '';
  const name = nameRaw || sourceNameFromKey(key);
  if (!key || !baseUrl) return null;
  return { key, name, baseUrl };
}

export function parseAgencySourcesFromEnv(raw: string | undefined): CreatorCoreAgencySource[] {
  const fallback: CreatorCoreAgencySource[] = [
    {
      key: DEFAULT_SOURCE_KEY,
      name: DEFAULT_SOURCE_NAME,
      baseUrl: DEFAULT_CREATORCORE_BASE_URL,
    },
  ];

  if (!raw || !raw.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;

    const dedup = new Map<string, CreatorCoreAgencySource>();
    for (const item of parsed) {
      const source = toSourceEntry(item);
      if (!source) continue;
      dedup.set(source.key, source);
    }

    if (dedup.size === 0) return fallback;
    return [...dedup.values()];
  } catch {
    return fallback;
  }
}

export function getAgencySources(): CreatorCoreAgencySource[] {
  return parseAgencySourcesFromEnv(process.env.CREATORCORE_AGENCY_SOURCES_JSON);
}

async function upsertAgencySources(sources: CreatorCoreAgencySource[]): Promise<void> {
  if (sources.length === 0) return;
  const sql = getDb();
  const now = new Date().toISOString();

  await runWithSystemContext((tx) => [
    ...sources.map((source) => tx`
      INSERT INTO cc_agencies (key, name, base_url, active, created_at, updated_at)
      VALUES (${source.key}, ${source.name}, ${source.baseUrl}, TRUE, ${now}, ${now})
      ON CONFLICT (key) DO UPDATE
      SET
        name = EXCLUDED.name,
        base_url = EXCLUDED.base_url,
        active = TRUE,
        updated_at = ${now}
    `),
  ]);

  const keys = sources.map((source) => source.key);
  await sql`
    UPDATE cc_agencies
    SET active = FALSE, updated_at = ${now}
    WHERE key <> ALL(${keys})
      AND active = TRUE
  `;
}

function getCampaignSlug(campaignId: string, rawSlug: unknown, title: string): string {
  if (typeof rawSlug === 'string' && rawSlug.trim()) {
    const sanitized = slugify(rawSlug);
    if (sanitized && sanitized !== 'untitled') {
      return sanitized;
    }
  }

  const titleBase = slugify(title) || 'campaign';
  return `${titleBase}-${campaignId.slice(-8).toLowerCase()}`;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function toInteger(value: unknown): number | null {
  const n = toNumber(value);
  if (n == null) return null;
  return Math.round(n);
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

function parsePositiveInt(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value == null || value < 1) return fallback;
  return Math.floor(value);
}

function normalizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

interface NormalizedCampaign {
  archived: boolean;
  api_cost_usd: number | null;
  budget: number | null;
  campaign_id: string;
  created_at: string | null;
  creator_count: number | null;
  currency: string | null;
  is_test_data: boolean;
  org_id: string | null;
  platforms: string | null;
  last_synced_at: string;
  source_key: string;
  slug: string;
  thumbnail: string | null;
  title: string;
  total_posts: number | null;
}

interface NormalizedPost {
  api_cost_usd: number | null;
  canonical_post_key: string;
  campaign_id: string | null;
  created_date: string | null;
  is_test_data: boolean;
  platform: string | null;
  post_date: string | null;
  post_id: string;
  post_status: string | null;
  post_url: string | null;
  post_url_reason: string | null;
  post_url_valid: boolean;
  source_key: string;
  username: string | null;
  views: number;
}

function extractApiCostUsd(raw: Record<string, unknown>): number | null {
  const candidates: number[] = [];

  for (const [key, value] of Object.entries(raw)) {
    if (!/(cost|rate|price|fee|spend)/i.test(key)) continue;
    if (value == null) continue;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      candidates.push(value);
      continue;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) continue;
      const parsed = Number(trimmed.replace(/[$,]/g, ''));
      if (Number.isFinite(parsed) && parsed >= 0) {
        candidates.push(parsed);
      }
      continue;
    }
    if (typeof value === 'object') {
      const nested = value as Record<string, unknown>;
      for (const nestedKey of ['amount', 'cost', 'rate', 'price']) {
        const nestedValue = nested[nestedKey];
        const parsed = toNumber(nestedValue);
        if (parsed != null && parsed >= 0) {
          candidates.push(parsed);
          break;
        }
      }
    }
  }

  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

function normalizeCanonicalUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.toLowerCase();
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${protocol}//${host}${pathname}`;
  } catch {
    return url.trim().toLowerCase().replace(/\?.*$/, '').replace(/#.*$/, '');
  }
}

export function buildCanonicalPostKey(input: {
  platform?: string | null;
  postDate?: string | null;
  postId: string;
  postUrl?: string | null;
  sourceKey: string;
  username?: string | null;
}): string {
  if (input.postUrl && input.postUrl.trim()) {
    const normalized = normalizeCanonicalUrl(input.postUrl);
    const digest = createHash('sha1').update(normalized).digest('hex');
    return `url:${digest}`;
  }

  const fallbackSeed = [
    (input.platform || '').trim().toLowerCase(),
    (input.username || '').trim().toLowerCase(),
    (input.postDate || '').trim(),
    (input.postId || '').trim(),
    (input.sourceKey || DEFAULT_SOURCE_KEY).trim().toLowerCase(),
  ].join('|');
  const digest = createHash('sha1').update(fallbackSeed).digest('hex');
  return `fallback:${digest}`;
}

function normalizeCampaign(raw: CCApiCampaign, sourceKey: string): NormalizedCampaign | null {
  if (!raw?._id) return null;

  const title =
    (typeof raw.title === 'string' && raw.title.trim()) ||
    (typeof raw['Campaign Title'] === 'string' && raw['Campaign Title'].trim()) ||
    'Untitled';

  const rawPlatforms =
    (Array.isArray(raw.displayPlatforms) ? raw.displayPlatforms.join(' | ') : null) ||
    (typeof raw.platforms === 'string' ? raw.platforms : null) ||
    (typeof raw.Platforms === 'string' ? raw.Platforms : null);

  const creatorCount =
    toInteger(raw['Creator Count']) ??
    (Array.isArray(raw.creatorProfiles) ? raw.creatorProfiles.length : null);

  const totalPosts =
    toInteger(raw['Total Posts']) ??
    (Array.isArray(raw.posts) ? raw.posts.length : null);
  const isTestData = shouldMarkAsTestData(sourceKey, title);

  return {
    source_key: sourceKey,
    campaign_id: raw._id,
    title,
    slug: getCampaignSlug(raw._id, raw.slug ?? raw.Slug, title),
    budget: toNumber(raw.budget ?? raw.Budget),
    api_cost_usd: extractApiCostUsd(raw as Record<string, unknown>),
    currency: normalizeText(raw.currency ?? raw.Currency, 6),
    is_test_data: isTestData,
    org_id: normalizeText(raw.organization ?? raw['Org ID'], 40),
    platforms: rawPlatforms || null,
    created_at: toIsoDate(raw['Created Date'] ?? raw.created_at),
    archived: Boolean(raw.Archive ?? raw.Archived ?? false),
    creator_count: creatorCount,
    total_posts: totalPosts,
    thumbnail: normalizeUrl(raw.thumbnail ?? raw['Campaign Thumbnail']),
    last_synced_at: new Date().toISOString(),
  };
}

function normalizePost(raw: CCApiPost, sourceKey: string): NormalizedPost | null {
  if (!raw?._id) return null;

  const views =
    toInteger(raw['latestViews/Engagement']) ??
    toInteger(raw.Views) ??
    0;

  const postUrl = normalizeUrl(raw.postUrl ?? raw['Post URL']);
  const username =
    (typeof raw.username === 'string' && raw.username.trim()) ||
    (typeof raw.Username === 'string' && raw.Username.trim()) ||
    null;
  const platform =
    (typeof raw.platform === 'string' && raw.platform) ||
    (typeof raw.Platform === 'string' && raw.Platform) ||
    null;
  const postDate = toIsoDate(raw.postDate ?? raw['Post Date']);
  const validated = validatePostUrl(postUrl);
  const isFixture = shouldMarkAsTestData(sourceKey, postUrl);

  if (isProductionEnvironment() && validated.reason === 'disallowed_domain') {
    return null;
  }

  return {
    source_key: sourceKey,
    post_id: raw._id,
    canonical_post_key: buildCanonicalPostKey({
      sourceKey,
      postId: raw._id,
      postUrl,
      platform,
      username,
      postDate,
    }),
    api_cost_usd: extractApiCostUsd(raw as Record<string, unknown>),
    campaign_id:
      (typeof raw.campaign === 'string' && raw.campaign) ||
      (typeof raw.Campaign === 'string' && raw.Campaign) ||
      null,
    username,
    platform,
    post_url: postUrl,
    post_url_valid: validated.isValid,
    post_url_reason: validated.isValid ? 'valid' : validated.reason,
    is_test_data: isFixture,
    views,
    post_date: postDate,
    post_status:
      (typeof raw.status === 'string' && raw.status) ||
      (typeof raw['Post Status'] === 'string' && raw['Post Status']) ||
      null,
    created_date: toIsoDate(raw['Created Date']),
  };
}

function buildBulkValues<T>(
  rows: T[],
  columns: Array<keyof T>
): { placeholders: string; values: unknown[] } {
  const values: unknown[] = [];
  const placeholders = rows
    .map((row, rowIdx) => {
      const tuple = columns
        .map((col, colIdx) => {
          values.push(row[col]);
          return `$${rowIdx * columns.length + colIdx + 1}`;
        })
        .join(', ');
      return `(${tuple})`;
    })
    .join(', ');

  return { placeholders, values };
}

async function getOrCreateCursor(
  entityType: 'campaign' | 'post',
  sourceKey: string
): Promise<number> {
  const sql = getDb();
  const existing = await sql`
    SELECT last_cursor
    FROM cc_sync_state
    WHERE entity_type = ${entityType}
      AND source_key = ${sourceKey}
  `;
  if (existing[0]?.last_cursor != null) {
    return Number(existing[0].last_cursor);
  }

  await sql`
    INSERT INTO cc_sync_state (entity_type, source_key, last_cursor, last_synced_at, records_synced)
    VALUES (${entityType}, ${sourceKey}, 0, NOW(), 0)
    ON CONFLICT (entity_type, source_key) DO NOTHING
  `;
  return 0;
}

async function upsertCampaigns(campaigns: NormalizedCampaign[]): Promise<{ inserted: number; updated: number }> {
  if (campaigns.length === 0) return { inserted: 0, updated: 0 };

  const columns: Array<keyof NormalizedCampaign> = [
    'source_key',
    'campaign_id',
    'title',
    'slug',
    'budget',
    'api_cost_usd',
    'currency',
    'is_test_data',
    'org_id',
    'platforms',
    'created_at',
    'archived',
    'creator_count',
    'total_posts',
    'thumbnail',
    'last_synced_at',
  ];

  let inserted = 0;
  let updated = 0;
  const chunkSize = 250;

  for (let i = 0; i < campaigns.length; i += chunkSize) {
    const chunk = campaigns.slice(i, i + chunkSize);
    const { placeholders, values } = buildBulkValues(chunk, columns);

    const [result] = await runWithSystemContext((tx) => [
      tx.query(
        `
        INSERT INTO cc_campaigns (
          source_key, campaign_id, title, slug, budget, api_cost_usd, currency, is_test_data, org_id, platforms, created_at,
          archived, creator_count, total_posts, thumbnail, last_synced_at
        )
        VALUES ${placeholders}
        ON CONFLICT (source_key, campaign_id) DO UPDATE SET
          title = CASE
            WHEN EXCLUDED.title = 'Untitled'
              AND cc_campaigns.title IS NOT NULL
              AND btrim(cc_campaigns.title) <> ''
              AND cc_campaigns.title <> 'Untitled'
              THEN cc_campaigns.title
            ELSE EXCLUDED.title
          END,
          slug = CASE
            WHEN EXCLUDED.slug IS NULL OR btrim(EXCLUDED.slug) = '' THEN cc_campaigns.slug
            WHEN cc_campaigns.slug IS NULL OR btrim(cc_campaigns.slug) = '' THEN EXCLUDED.slug
            WHEN (cc_campaigns.title = 'Untitled' AND EXCLUDED.title <> 'Untitled') THEN EXCLUDED.slug
            WHEN cc_campaigns.slug ~ '^untitled-[a-z0-9]+$' THEN EXCLUDED.slug
            WHEN cc_campaigns.slug ~ '^campaign-[a-z0-9]+$' THEN EXCLUDED.slug
            ELSE cc_campaigns.slug
          END,
          budget = COALESCE(EXCLUDED.budget, cc_campaigns.budget),
          api_cost_usd = COALESCE(EXCLUDED.api_cost_usd, cc_campaigns.api_cost_usd),
          currency = COALESCE(EXCLUDED.currency, cc_campaigns.currency),
          is_test_data = EXCLUDED.is_test_data,
          org_id = COALESCE(EXCLUDED.org_id, cc_campaigns.org_id),
          platforms = COALESCE(EXCLUDED.platforms, cc_campaigns.platforms),
          created_at = COALESCE(cc_campaigns.created_at, EXCLUDED.created_at),
          archived = EXCLUDED.archived,
          creator_count = COALESCE(EXCLUDED.creator_count, cc_campaigns.creator_count),
          total_posts = COALESCE(EXCLUDED.total_posts, cc_campaigns.total_posts),
          thumbnail = COALESCE(EXCLUDED.thumbnail, cc_campaigns.thumbnail),
          first_seen_at = COALESCE(cc_campaigns.first_seen_at, EXCLUDED.created_at, NOW()),
          last_seen_at = NOW(),
          last_synced_at = NOW()
        RETURNING (xmax = 0) AS inserted_row
        `,
        values
      ),
    ]) as [Array<{ inserted_row: boolean }>];

    for (const row of result) {
      if (row.inserted_row) inserted++;
      else updated++;
    }
  }

  return { inserted, updated };
}

interface PostRow extends Omit<NormalizedPost, 'campaign_id'> {
  campaign_pk: number;
}

async function upsertPosts(posts: PostRow[]): Promise<{ inserted: number; updated: number }> {
  if (posts.length === 0) return { inserted: 0, updated: 0 };

  const columns: Array<keyof PostRow> = [
    'source_key',
    'post_id',
    'campaign_pk',
    'canonical_post_key',
    'api_cost_usd',
    'username',
    'platform',
    'post_url',
    'post_url_valid',
    'post_url_reason',
    'views',
    'post_date',
    'post_status',
    'created_date',
    'is_test_data',
  ];

  let inserted = 0;
  let updated = 0;
  const chunkSize = 500;

  for (let i = 0; i < posts.length; i += chunkSize) {
    const chunk = posts.slice(i, i + chunkSize);
    const { placeholders, values } = buildBulkValues(chunk, columns);
    const [result] = await runWithSystemContext((tx) => [
      tx.query(
        `
        INSERT INTO cc_posts (
          source_key, post_id, campaign_pk, canonical_post_key, api_cost_usd,
          username, platform, post_url, post_url_valid, post_url_reason, views, post_date, post_status, created_date, is_test_data
        )
        VALUES ${placeholders}
        ON CONFLICT (source_key, post_id) DO UPDATE SET
          campaign_pk = EXCLUDED.campaign_pk,
          canonical_post_key = EXCLUDED.canonical_post_key,
          api_cost_usd = COALESCE(EXCLUDED.api_cost_usd, cc_posts.api_cost_usd),
          username = COALESCE(EXCLUDED.username, cc_posts.username),
          platform = COALESCE(EXCLUDED.platform, cc_posts.platform),
          post_url = COALESCE(EXCLUDED.post_url, cc_posts.post_url),
          post_url_valid = EXCLUDED.post_url_valid,
          post_url_reason = EXCLUDED.post_url_reason,
          views = GREATEST(COALESCE(EXCLUDED.views, 0), COALESCE(cc_posts.views, 0)),
          post_date = COALESCE(EXCLUDED.post_date, cc_posts.post_date),
          post_status = COALESCE(EXCLUDED.post_status, cc_posts.post_status),
          created_date = COALESCE(cc_posts.created_date, EXCLUDED.created_date),
          is_test_data = EXCLUDED.is_test_data
        RETURNING (xmax = 0) AS inserted_row
        `,
        values
      ),
    ]) as [Array<{ inserted_row: boolean }>];

    for (const row of result) {
      if (row.inserted_row) inserted++;
      else updated++;
    }
  }

  return { inserted, updated };
}

interface CreatorSeenRow {
  first_campaign_pk: number | null;
  first_seen_at: string;
  last_campaign_pk: number | null;
  last_platform: string | null;
  last_seen_at: string;
  username: string;
}

async function upsertCreatorSeen(rows: CreatorSeenRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  const columns: Array<keyof CreatorSeenRow> = [
    'username',
    'first_seen_at',
    'last_seen_at',
    'first_campaign_pk',
    'last_campaign_pk',
    'last_platform',
  ];

  let inserted = 0;
  const chunkSize = 500;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { placeholders, values } = buildBulkValues(chunk, columns);
    const [result] = await runWithSystemContext((tx) => [
      tx.query(
        `
        INSERT INTO cc_creators (
          username, first_seen_at, last_seen_at, first_campaign_pk, last_campaign_pk, last_platform
        )
        VALUES ${placeholders}
        ON CONFLICT (username) DO UPDATE SET
          first_seen_at = LEAST(cc_creators.first_seen_at, EXCLUDED.first_seen_at),
          last_seen_at = GREATEST(cc_creators.last_seen_at, EXCLUDED.last_seen_at),
          first_campaign_pk = COALESCE(cc_creators.first_campaign_pk, EXCLUDED.first_campaign_pk),
          last_campaign_pk = COALESCE(EXCLUDED.last_campaign_pk, cc_creators.last_campaign_pk),
          last_platform = COALESCE(EXCLUDED.last_platform, cc_creators.last_platform)
        RETURNING (xmax = 0) AS inserted_row
        `,
        values
      ),
    ]) as [Array<{ inserted_row: boolean }>];
    inserted += result.filter((r) => r.inserted_row).length;
  }

  return inserted;
}

async function updateSyncState(
  entity: 'campaign' | 'post',
  sourceKey: string,
  nextCursor: number,
  processed: number
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE cc_sync_state
    SET
      last_cursor = ${nextCursor},
      last_synced_at = NOW(),
      records_synced = COALESCE(records_synced, 0) + ${processed}
    WHERE entity_type = ${entity}
      AND source_key = ${sourceKey}
  `;
}

interface CampaignLookupRef {
  campaign_id: string;
  source_key: string;
}

function campaignLookupKey(sourceKey: string, campaignId: string): string {
  return `${sourceKey}:${campaignId}`;
}

async function getCampaignPkMap(campaignRefs: CampaignLookupRef[]): Promise<Map<string, number>> {
  if (campaignRefs.length === 0) return new Map();

  const deduped = new Map<string, CampaignLookupRef>();
  for (const row of campaignRefs) {
    const sourceKey = normalizeSourceKey(row.source_key || DEFAULT_SOURCE_KEY) || DEFAULT_SOURCE_KEY;
    if (!row.campaign_id) continue;
    deduped.set(campaignLookupKey(sourceKey, row.campaign_id), {
      source_key: sourceKey,
      campaign_id: row.campaign_id,
    });
  }

  if (deduped.size === 0) return new Map();

  const refs = [...deduped.values()];
  const valuesSql = refs
    .map((_, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2})`)
    .join(', ');
  const params: string[] = [];
  for (const row of refs) {
    params.push(row.source_key, row.campaign_id);
  }

  const [mappings] = await runWithSystemContext((tx) => [
    tx.query(
      `
      SELECT c.source_key, c.campaign_id, c.id
      FROM cc_campaigns c
      JOIN (VALUES ${valuesSql}) AS refs(source_key, campaign_id)
        ON c.source_key = refs.source_key
       AND c.campaign_id = refs.campaign_id
      `,
      params
    ),
  ]) as [Array<{ source_key: string; campaign_id: string; id: number | string }>];

  return new Map(
    mappings.map((row) => [
      campaignLookupKey(String(row.source_key), String(row.campaign_id)),
      Number(row.id),
    ])
  );
}

function buildCreatorSeenRows(posts: PostRow[]): CreatorSeenRow[] {
  const creatorMap = new Map<string, CreatorSeenRow>();
  const nowIso = new Date().toISOString();

  for (const post of posts) {
    if (!post.username || !post.username.trim()) continue;

    const username = post.username.trim().toLowerCase();
    const seenAt = post.created_date || post.post_date || nowIso;
    const existing = creatorMap.get(username);

    if (!existing) {
      creatorMap.set(username, {
        username,
        first_seen_at: seenAt,
        last_seen_at: seenAt,
        first_campaign_pk: post.campaign_pk,
        last_campaign_pk: post.campaign_pk,
        last_platform: post.platform || null,
      });
      continue;
    }

    if (seenAt < existing.first_seen_at) {
      existing.first_seen_at = seenAt;
      existing.first_campaign_pk = post.campaign_pk;
    }
    if (seenAt >= existing.last_seen_at) {
      existing.last_seen_at = seenAt;
      existing.last_campaign_pk = post.campaign_pk;
      existing.last_platform = post.platform || existing.last_platform;
    }
  }

  return [...creatorMap.values()];
}

function chunkArray<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    out.push(rows.slice(i, i + size));
  }
  return out;
}

function extractCampaignPostIds(raw: CCApiCampaign, perCampaignLimit: number): string[] {
  if (perCampaignLimit < 1) return [];
  if (!Array.isArray(raw.posts)) return [];

  const ids = raw.posts
    .filter((postId): postId is string => typeof postId === 'string' && postId.trim().length > 0)
    .slice(0, perCampaignLimit);

  return ids;
}

export interface SyncSourceResult {
  cursor: number;
  entity: string;
  fetched: number;
  hasMore: boolean;
  inserted: number;
  newItems: number;
  pages: number;
  processed: number;
  skipped: number;
  sourceKey: string;
  sourceName: string;
  updated: number;
}

export interface SyncResult {
  bySource: SyncSourceResult[];
  cursor: number;
  entity: string;
  fetched: number;
  hasMore: boolean;
  inserted: number;
  newItems: number;
  pages: number;
  processed: number;
  skipped: number;
  updated: number;
}

interface SyncOptions {
  campaignPages?: number;
  creatorDiscoveryCampaignLimit?: number;
  creatorDiscoveryMinAgeMinutes?: number;
  creatorDiscoveryPostConcurrency?: number;
  creatorDiscoveryPostFetchLimit?: number;
  creatorDiscoveryPostsPerCampaign?: number;
  sources?: CreatorCoreAgencySource[];
  pendingRecheckLimit?: number;
  pendingRecheckMinAgeMinutes?: number;
  pendingRecheckPostConcurrency?: number;
  pendingRecheckPostFetchLimit?: number;
  pendingRecheckPostsPerCampaign?: number;
  postPages?: number;
}

const PENDING_INTAKE_CONDITION_SQL = `
(
  COALESCE(c.first_seen_at, c.created_at, NOW()) >= NOW() - INTERVAL '14 days'
  AND COALESCE(c.first_seen_at, c.created_at, NOW()) <= NOW() - INTERVAL '30 minutes'
  AND COALESCE(cm.quality_status, 'missing_posts') IN ('missing_posts', 'placeholder_links_only', 'missing_core_metadata')
)
`;

export interface PendingHydrationResult {
  eligible: number;
  failed: number;
  fetched: number;
  inserted: number;
  newCreators: number;
  postFetched: number;
  postInserted: number;
  postSkipped: number;
  postUpdated: number;
  skipped: number;
  updated: number;
}

export interface CreatorDiscoveryResult {
  eligible: number;
  failed: number;
  fetched: number;
  inserted: number;
  newCreators: number;
  postFetched: number;
  postInserted: number;
  postSkipped: number;
  postUpdated: number;
  skipped: number;
  updated: number;
}

interface PendingCampaignRef {
  campaign_id: string;
  source_key: string;
}

async function getPendingCampaignIds(limit: number, minAgeMinutes: number): Promise<PendingCampaignRef[]> {
  if (limit < 1) return [];

  const [rows] = await runWithSystemContext((tx) => [
    tx.query(
      `
      SELECT c.campaign_id, c.source_key
      FROM cc_campaigns c
      LEFT JOIN cc_campaign_metrics cm ON cm.campaign_pk = c.id
      WHERE c.campaign_id IS NOT NULL
        AND COALESCE(c.is_test_data, FALSE) = FALSE
        AND ${PENDING_INTAKE_CONDITION_SQL}
        AND COALESCE(c.last_synced_at, c.created_at, NOW() - INTERVAL '1 day')
          <= NOW() - ($1::INT * INTERVAL '1 minute')
      ORDER BY
        CASE
          WHEN COALESCE(c.first_seen_at, c.created_at, NOW()) >= NOW() - INTERVAL '24 hours' THEN 0
          WHEN COALESCE(c.first_seen_at, c.created_at, NOW()) >= NOW() - INTERVAL '7 days' THEN 1
          ELSE 2
        END,
        COALESCE(c.first_seen_at, c.created_at, NOW()) DESC,
        COALESCE(c.last_synced_at, c.created_at, NOW()) ASC
      LIMIT $2
      `,
      [minAgeMinutes, limit]
    ),
  ]) as [Array<{ campaign_id: string; source_key: string | null }>];

  return rows
    .map((row) => ({
      campaign_id: row.campaign_id,
      source_key: normalizeSourceKey(row.source_key || DEFAULT_SOURCE_KEY) || DEFAULT_SOURCE_KEY,
    }))
    .filter((row) => Boolean(row.campaign_id));
}

async function getCreatorDiscoveryCampaignRefs(limit: number, minAgeMinutes: number): Promise<PendingCampaignRef[]> {
  if (limit < 1) return [];

  const [rows] = await runWithSystemContext((tx) => [
    tx.query(
      `
      SELECT c.campaign_id, c.source_key
      FROM cc_campaigns c
      WHERE c.campaign_id IS NOT NULL
        AND COALESCE(c.is_test_data, FALSE) = FALSE
        AND COALESCE(c.last_synced_at, c.created_at, NOW() - INTERVAL '1 day')
          <= NOW() - ($1::INT * INTERVAL '1 minute')
      ORDER BY
        COALESCE(c.last_synced_at, c.created_at, NOW() - INTERVAL '1 day') ASC,
        COALESCE(c.first_seen_at, c.created_at, NOW()) DESC
      LIMIT $2
      `,
      [minAgeMinutes, limit]
    ),
  ]) as [Array<{ campaign_id: string; source_key: string | null }>];

  return rows
    .map((row) => ({
      campaign_id: row.campaign_id,
      source_key: normalizeSourceKey(row.source_key || DEFAULT_SOURCE_KEY) || DEFAULT_SOURCE_KEY,
    }))
    .filter((row) => Boolean(row.campaign_id));
}

async function resolveAgencySources(options: SyncOptions): Promise<CreatorCoreAgencySource[]> {
  const provided = Array.isArray(options.sources) ? options.sources : [];
  const fromEnv = getAgencySources();
  const deduped = new Map<string, CreatorCoreAgencySource>();
  for (const source of [...provided, ...fromEnv]) {
    const normalized = toSourceEntry(source);
    if (!normalized) continue;
    deduped.set(normalized.key, normalized);
  }
  if (deduped.size === 0) {
    const fallback = parseAgencySourcesFromEnv(undefined);
    await upsertAgencySources(fallback);
    return fallback;
  }
  const resolved = [...deduped.values()];
  await upsertAgencySources(resolved);
  return resolved;
}

function aggregateSyncResults(entity: 'campaign' | 'post', bySource: SyncSourceResult[]): SyncResult {
  return {
    entity,
    bySource,
    cursor: bySource.reduce((max, item) => Math.max(max, item.cursor), 0),
    hasMore: bySource.some((item) => item.hasMore),
    pages: bySource.reduce((sum, item) => sum + item.pages, 0),
    fetched: bySource.reduce((sum, item) => sum + item.fetched, 0),
    processed: bySource.reduce((sum, item) => sum + item.processed, 0),
    inserted: bySource.reduce((sum, item) => sum + item.inserted, 0),
    updated: bySource.reduce((sum, item) => sum + item.updated, 0),
    skipped: bySource.reduce((sum, item) => sum + item.skipped, 0),
    newItems: bySource.reduce((sum, item) => sum + item.newItems, 0),
  };
}

async function hydratePendingCampaigns(options: SyncOptions = {}): Promise<PendingHydrationResult> {
  const sources = await resolveAgencySources(options);
  const sourceMap = new Map(sources.map((source) => [source.key, source]));

  const configuredLimit =
    options.pendingRecheckLimit ??
    parseNonNegativeInt(process.env.CREATORCORE_PENDING_RECHECK_LIMIT, 30);
  const limit = Math.max(0, configuredLimit);
  const minAgeMinutes =
    options.pendingRecheckMinAgeMinutes ??
    parseNonNegativeInt(process.env.CREATORCORE_PENDING_RECHECK_MIN_AGE_MINUTES, 30);
  const postsPerCampaign =
    options.pendingRecheckPostsPerCampaign ??
    parseNonNegativeInt(process.env.CREATORCORE_PENDING_RECHECK_POSTS_PER_CAMPAIGN, 25);
  const postFetchLimit =
    options.pendingRecheckPostFetchLimit ??
    parseNonNegativeInt(process.env.CREATORCORE_PENDING_RECHECK_POST_FETCH_LIMIT, 400);
  const postConcurrency = parsePositiveInt(
    options.pendingRecheckPostConcurrency ??
      parseNonNegativeInt(process.env.CREATORCORE_PENDING_RECHECK_POST_CONCURRENCY, 8),
    8
  );

  if (limit === 0) {
    return {
      eligible: 0,
      fetched: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      postFetched: 0,
      postInserted: 0,
      postUpdated: 0,
      postSkipped: 0,
      newCreators: 0,
    };
  }

  const pendingCampaignRefs = await getPendingCampaignIds(limit, Math.max(0, minAgeMinutes));
  if (pendingCampaignRefs.length === 0) {
    return {
      eligible: 0,
      fetched: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      postFetched: 0,
      postInserted: 0,
      postUpdated: 0,
      postSkipped: 0,
      newCreators: 0,
    };
  }

  const hydratedCampaigns: NormalizedCampaign[] = [];
  const rawCampaigns: Array<{ raw: CCApiCampaign; source_key: string }> = [];
  let skipped = 0;
  let failed = 0;
  let fetched = 0;

  for (const campaignRef of pendingCampaignRefs) {
    try {
      const source = sourceMap.get(campaignRef.source_key);
      if (!source) {
        skipped++;
        continue;
      }

      const raw = await fetchCampaignById(campaignRef.campaign_id, { baseUrl: source.baseUrl });
      if (!raw) {
        skipped++;
        continue;
      }

      fetched++;
      const normalized = normalizeCampaign(raw, source.key);
      if (!normalized) {
        skipped++;
        continue;
      }
      hydratedCampaigns.push(normalized);
      rawCampaigns.push({ raw, source_key: source.key });
    } catch (error) {
      failed++;
      console.warn('[creatorcore] pending campaign hydration failed', { campaignRef, error });
    }
  }

  const { inserted, updated } = await upsertCampaigns(hydratedCampaigns);

  const postIdSet = new Set<string>();
  const pendingPostIds: Array<{ post_id: string; source_key: string }> = [];
  if (postsPerCampaign > 0 && postFetchLimit > 0) {
    for (const rawCampaign of rawCampaigns) {
      const postIds = extractCampaignPostIds(rawCampaign.raw, postsPerCampaign);
      for (const postId of postIds) {
        const dedupeKey = `${rawCampaign.source_key}:${postId}`;
        if (postIdSet.has(dedupeKey)) continue;
        postIdSet.add(dedupeKey);
        pendingPostIds.push({ post_id: postId, source_key: rawCampaign.source_key });
        if (pendingPostIds.length >= postFetchLimit) break;
      }
      if (pendingPostIds.length >= postFetchLimit) break;
    }
  }

  const hydratedPosts: NormalizedPost[] = [];
  let postSkipped = 0;
  let postFailed = 0;
  let postFetched = 0;

  if (pendingPostIds.length > 0) {
    for (const chunk of chunkArray(pendingPostIds, postConcurrency)) {
      const chunkResults = await Promise.all(
        chunk.map(async (postRef) => {
          try {
            const source = sourceMap.get(postRef.source_key);
            if (!source) {
              return { skipped: 1, failed: 0, normalized: null as NormalizedPost | null };
            }

            const rawPost = await fetchPostById(postRef.post_id, { baseUrl: source.baseUrl });
            if (!rawPost) {
              return { skipped: 1, failed: 0, normalized: null as NormalizedPost | null };
            }
            const normalized = normalizePost(rawPost, source.key);
            if (!normalized) {
              return { skipped: 1, failed: 0, normalized: null as NormalizedPost | null };
            }
            return { skipped: 0, failed: 0, normalized };
          } catch (error) {
            console.warn('[creatorcore] pending post hydration failed', { postRef, error });
            return { skipped: 0, failed: 1, normalized: null as NormalizedPost | null };
          }
        })
      );

      for (const result of chunkResults) {
        postSkipped += result.skipped;
        postFailed += result.failed;
        if (result.normalized) {
          hydratedPosts.push(result.normalized);
          postFetched++;
        }
      }
    }
  }

  let postInserted = 0;
  let postUpdated = 0;
  let newCreators = 0;

  if (hydratedPosts.length > 0) {
    const campaignRefs = hydratedPosts
      .map((post) => {
        if (!post.campaign_id) return null;
        return {
          source_key: post.source_key,
          campaign_id: post.campaign_id,
        };
      })
      .filter((row): row is CampaignLookupRef => row != null);
    const campaignMap = await getCampaignPkMap(campaignRefs);

    const readyPosts: PostRow[] = [];
    for (const post of hydratedPosts) {
      if (!post.campaign_id) {
        postSkipped++;
        continue;
      }

      const campaignPk = campaignMap.get(campaignLookupKey(post.source_key, post.campaign_id));
      if (!campaignPk) {
        postSkipped++;
        continue;
      }

      readyPosts.push({
        source_key: post.source_key,
        post_id: post.post_id,
        campaign_pk: campaignPk,
        canonical_post_key: post.canonical_post_key,
        api_cost_usd: post.api_cost_usd,
        username: post.username,
        platform: post.platform,
        post_url: post.post_url,
        post_url_valid: post.post_url_valid,
        post_url_reason: post.post_url_reason,
        views: post.views,
        post_date: post.post_date,
        post_status: post.post_status,
        created_date: post.created_date,
        is_test_data: post.is_test_data,
      });
    }

    if (readyPosts.length > 0) {
      const postUpsert = await upsertPosts(readyPosts);
      postInserted = postUpsert.inserted;
      postUpdated = postUpsert.updated;
      newCreators = await upsertCreatorSeen(buildCreatorSeenRows(readyPosts));
    }
  }

  return {
    eligible: pendingCampaignRefs.length,
    fetched,
    inserted,
    updated,
    skipped,
    failed: failed + postFailed,
    postFetched,
    postInserted,
    postUpdated,
    postSkipped,
    newCreators,
  };
}

async function runCreatorDiscovery(options: SyncOptions = {}): Promise<CreatorDiscoveryResult> {
  const sources = await resolveAgencySources(options);
  const sourceMap = new Map(sources.map((source) => [source.key, source]));

  const campaignLimit = Math.max(
    0,
    options.creatorDiscoveryCampaignLimit ??
      parseNonNegativeInt(process.env.CREATORCORE_CREATOR_DISCOVERY_CAMPAIGN_LIMIT, 200)
  );
  const minAgeMinutes = Math.max(
    0,
    options.creatorDiscoveryMinAgeMinutes ??
      parseNonNegativeInt(process.env.CREATORCORE_CREATOR_DISCOVERY_MIN_AGE_MINUTES, 15)
  );
  const postsPerCampaign =
    options.creatorDiscoveryPostsPerCampaign ??
    parseNonNegativeInt(process.env.CREATORCORE_CREATOR_DISCOVERY_POSTS_PER_CAMPAIGN, 80);
  const postFetchLimit =
    options.creatorDiscoveryPostFetchLimit ??
    parseNonNegativeInt(process.env.CREATORCORE_CREATOR_DISCOVERY_POST_FETCH_LIMIT, 2000);
  const postConcurrency = parsePositiveInt(
    options.creatorDiscoveryPostConcurrency ??
      parseNonNegativeInt(process.env.CREATORCORE_CREATOR_DISCOVERY_POST_CONCURRENCY, 10),
    10
  );

  if (campaignLimit === 0) {
    return {
      eligible: 0,
      fetched: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      postFetched: 0,
      postInserted: 0,
      postUpdated: 0,
      postSkipped: 0,
      newCreators: 0,
    };
  }

  const campaignRefs = await getCreatorDiscoveryCampaignRefs(campaignLimit, minAgeMinutes);
  if (campaignRefs.length === 0) {
    return {
      eligible: 0,
      fetched: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      postFetched: 0,
      postInserted: 0,
      postUpdated: 0,
      postSkipped: 0,
      newCreators: 0,
    };
  }

  const hydratedCampaigns: NormalizedCampaign[] = [];
  const rawCampaigns: Array<{ raw: CCApiCampaign; source_key: string }> = [];
  let skipped = 0;
  let failed = 0;
  let fetched = 0;

  for (const campaignRef of campaignRefs) {
    try {
      const source = sourceMap.get(campaignRef.source_key);
      if (!source) {
        skipped++;
        continue;
      }
      const raw = await fetchCampaignById(campaignRef.campaign_id, { baseUrl: source.baseUrl });
      if (!raw) {
        skipped++;
        continue;
      }

      fetched++;
      const normalized = normalizeCampaign(raw, source.key);
      if (!normalized) {
        skipped++;
        continue;
      }
      hydratedCampaigns.push(normalized);
      rawCampaigns.push({ raw, source_key: source.key });
    } catch (error) {
      failed++;
      console.warn('[creatorcore] creator discovery campaign hydration failed', { campaignRef, error });
    }
  }

  const { inserted, updated } = await upsertCampaigns(hydratedCampaigns);

  const postIdSet = new Set<string>();
  const pendingPostIds: Array<{ post_id: string; source_key: string }> = [];
  if (postsPerCampaign > 0 && postFetchLimit > 0) {
    for (const rawCampaign of rawCampaigns) {
      const postIds = extractCampaignPostIds(rawCampaign.raw, postsPerCampaign);
      for (const postId of postIds) {
        const dedupeKey = `${rawCampaign.source_key}:${postId}`;
        if (postIdSet.has(dedupeKey)) continue;
        postIdSet.add(dedupeKey);
        pendingPostIds.push({ post_id: postId, source_key: rawCampaign.source_key });
        if (pendingPostIds.length >= postFetchLimit) break;
      }
      if (pendingPostIds.length >= postFetchLimit) break;
    }
  }

  const hydratedPosts: NormalizedPost[] = [];
  let postSkipped = 0;
  let postFailed = 0;
  let postFetched = 0;

  if (pendingPostIds.length > 0) {
    for (const chunk of chunkArray(pendingPostIds, postConcurrency)) {
      const chunkResults = await Promise.all(
        chunk.map(async (postRef) => {
          try {
            const source = sourceMap.get(postRef.source_key);
            if (!source) {
              return { skipped: 1, failed: 0, normalized: null as NormalizedPost | null };
            }

            const rawPost = await fetchPostById(postRef.post_id, { baseUrl: source.baseUrl });
            if (!rawPost) {
              return { skipped: 1, failed: 0, normalized: null as NormalizedPost | null };
            }

            const normalized = normalizePost(rawPost, source.key);
            if (!normalized) {
              return { skipped: 1, failed: 0, normalized: null as NormalizedPost | null };
            }
            return { skipped: 0, failed: 0, normalized };
          } catch (error) {
            console.warn('[creatorcore] creator discovery post hydration failed', { postRef, error });
            return { skipped: 0, failed: 1, normalized: null as NormalizedPost | null };
          }
        })
      );

      for (const result of chunkResults) {
        postSkipped += result.skipped;
        postFailed += result.failed;
        if (result.normalized) {
          hydratedPosts.push(result.normalized);
          postFetched++;
        }
      }
    }
  }

  let postInserted = 0;
  let postUpdated = 0;
  let newCreators = 0;

  if (hydratedPosts.length > 0) {
    const campaignRefsForPosts = hydratedPosts
      .map((post) => {
        if (!post.campaign_id) return null;
        return {
          source_key: post.source_key,
          campaign_id: post.campaign_id,
        };
      })
      .filter((row): row is CampaignLookupRef => row != null);

    const campaignMap = await getCampaignPkMap(campaignRefsForPosts);
    const readyPosts: PostRow[] = [];

    for (const post of hydratedPosts) {
      if (!post.campaign_id) {
        postSkipped++;
        continue;
      }
      const campaignPk = campaignMap.get(campaignLookupKey(post.source_key, post.campaign_id));
      if (!campaignPk) {
        postSkipped++;
        continue;
      }
      readyPosts.push({
        source_key: post.source_key,
        post_id: post.post_id,
        campaign_pk: campaignPk,
        canonical_post_key: post.canonical_post_key,
        api_cost_usd: post.api_cost_usd,
        username: post.username,
        platform: post.platform,
        post_url: post.post_url,
        post_url_valid: post.post_url_valid,
        post_url_reason: post.post_url_reason,
        views: post.views,
        post_date: post.post_date,
        post_status: post.post_status,
        created_date: post.created_date,
        is_test_data: post.is_test_data,
      });
    }

    if (readyPosts.length > 0) {
      const postUpsert = await upsertPosts(readyPosts);
      postInserted = postUpsert.inserted;
      postUpdated = postUpsert.updated;
      newCreators = await upsertCreatorSeen(buildCreatorSeenRows(readyPosts));
    }
  }

  return {
    eligible: campaignRefs.length,
    fetched,
    inserted,
    updated,
    skipped,
    failed: failed + postFailed,
    postFetched,
    postInserted,
    postUpdated,
    postSkipped,
    newCreators,
  };
}

export async function runPendingHydration(options: SyncOptions = {}): Promise<PendingHydrationResult> {
  const sql = getDb();
  await ensureCreatorCoreSchema(sql);
  return hydratePendingCampaigns(options);
}

export async function runCreatorDiscoverySweep(options: SyncOptions = {}): Promise<CreatorDiscoveryResult> {
  const sql = getDb();
  await ensureCreatorCoreSchema(sql);
  return runCreatorDiscovery(options);
}

async function refreshRollups(): Promise<void> {
  await runWithSystemContext((tx) => [
    tx.query(
      `
      WITH post_rollup AS (
        SELECT
          p.campaign_pk,
          COUNT(*) AS actual_posts,
          COUNT(DISTINCT LOWER(p.username)) FILTER (
            WHERE p.username IS NOT NULL AND btrim(p.username) <> ''
          ) AS actual_creators,
          COALESCE(SUM(p.views), 0)::NUMERIC AS total_views,
          COALESCE(
            SUM(
              CASE WHEN COALESCE(p.post_url_valid, FALSE) THEN COALESCE(p.views, 0)::NUMERIC ELSE 0::NUMERIC END
            ),
            0::NUMERIC
          ) AS verified_views,
          COUNT(*) FILTER (WHERE COALESCE(p.post_url_valid, FALSE)) AS valid_url_posts,
          COUNT(*) FILTER (WHERE NOT COALESCE(p.post_url_valid, FALSE)) AS invalid_url_posts
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
        END AS quality_status,
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
      `
    ),
    tx.query(
      `
      DELETE FROM cc_campaign_metrics cm
      WHERE NOT EXISTS (
        SELECT 1
        FROM cc_campaigns c
        WHERE c.id = cm.campaign_pk
          AND COALESCE(c.is_test_data, FALSE) = FALSE
      )
      `
    ),
    tx.query(
      `
      DELETE FROM cc_dashboard_stats_org_1m
      `
    ),
    tx.query(
      `
      WITH scoped_campaigns AS (
        SELECT
          c.id,
          COALESCE(NULLIF(c.org_id, ''), '__unknown__') AS org_id,
          c.archived,
          c.budget,
          c.genre,
          COALESCE(c.first_seen_at, c.created_at, NOW()) AS first_seen_at,
          c.created_at
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
      creator_seen AS (
        SELECT
          COALESCE(NULLIF(c.org_id, ''), '__unknown__') AS org_id,
          LOWER(p.username) AS username,
          MIN(COALESCE(p.created_date, p.post_date, NOW())) AS first_seen_at
        FROM cc_posts p
        JOIN cc_campaigns c ON c.id = p.campaign_pk
        WHERE COALESCE(c.is_test_data, FALSE) = FALSE
          AND COALESCE(p.is_test_data, FALSE) = FALSE
          AND p.username IS NOT NULL
          AND btrim(p.username) <> ''
        GROUP BY COALESCE(NULLIF(c.org_id, ''), '__unknown__'), LOWER(p.username)
      ),
      creator_counts AS (
        SELECT
          org_id,
          COUNT(*) AS total_creators,
          COUNT(*) FILTER (WHERE first_seen_at >= NOW() - INTERVAL '24 hours') AS new_creators_24h,
          COUNT(*) FILTER (WHERE first_seen_at >= NOW() - INTERVAL '7 days') AS new_creators_7d
        FROM creator_seen
        GROUP BY org_id
      ),
      campaign_review_counts AS (
        SELECT
          sc.org_id,
          COUNT(*) FILTER (
            WHERE sc.first_seen_at >= NOW() - INTERVAL '7 days'
              AND (cr.reviewed_at IS NULL OR cr.reviewed_at < sc.first_seen_at)
          ) AS campaigns_needing_review
        FROM scoped_campaigns sc
        LEFT JOIN cc_campaign_review_state cr ON cr.campaign_pk = sc.id
        GROUP BY sc.org_id
      ),
      creator_review_counts AS (
        SELECT
          cs.org_id,
          COUNT(*) FILTER (
            WHERE cs.first_seen_at >= NOW() - INTERVAL '7 days'
              AND (rs.reviewed_at IS NULL OR rs.reviewed_at < cs.first_seen_at)
          ) AS creators_needing_review
        FROM creator_seen cs
        LEFT JOIN cc_creator_review_state rs ON rs.username = cs.username
        GROUP BY cs.org_id
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
            COALESCE(NULLIF(c.org_id, ''), '__unknown__') AS org_id,
            p.platform,
            COUNT(*) AS post_count,
            COALESCE(SUM(p.views), 0) AS total_views,
            ROW_NUMBER() OVER (
              PARTITION BY COALESCE(NULLIF(c.org_id, ''), '__unknown__')
              ORDER BY COALESCE(SUM(p.views), 0) DESC, p.platform ASC
            ) AS rn
          FROM cc_posts p
          JOIN cc_campaigns c ON c.id = p.campaign_pk
          WHERE COALESCE(c.is_test_data, FALSE) = FALSE
            AND COALESCE(p.is_test_data, FALSE) = FALSE
            AND p.platform IS NOT NULL
            AND btrim(p.platform) <> ''
          GROUP BY COALESCE(NULLIF(c.org_id, ''), '__unknown__'), p.platform
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
        COALESCE(cc.new_creators_24h, 0) AS new_creators_24h,
        COALESCE(cc.new_creators_7d, 0) AS new_creators_7d,
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
        COALESCE(crc.campaigns_needing_review, 0) AS campaigns_needing_review,
        COALESCE(rsc.creators_needing_review, 0) AS creators_needing_review,
        COALESCE(tg.top_genres, '[]'::jsonb) AS top_genres,
        COALESCE(tp.top_platforms, '[]'::jsonb) AS top_platforms,
        NOW()
      FROM scoped_metrics sm
      LEFT JOIN creator_counts cc ON cc.org_id = sm.org_id
      LEFT JOIN campaign_review_counts crc ON crc.org_id = sm.org_id
      LEFT JOIN creator_review_counts rsc ON rsc.org_id = sm.org_id
      LEFT JOIN top_genres tg ON tg.org_id = sm.org_id
      LEFT JOIN top_platforms tp ON tp.org_id = sm.org_id
      GROUP BY
        sm.org_id,
        cc.total_creators,
        cc.new_creators_24h,
        cc.new_creators_7d,
        crc.campaigns_needing_review,
        rsc.creators_needing_review,
        tg.top_genres,
        tp.top_platforms
      `
    ),
  ]);
}

async function syncCampaignsForSource(
  source: CreatorCoreAgencySource,
  options: SyncOptions
): Promise<SyncSourceResult> {
  const baseCursor = await getOrCreateCursor('campaign', source.key);
  const configuredPages =
    options.campaignPages ??
    parseNonNegativeInt(process.env.CREATORCORE_SYNC_CAMPAIGN_PAGES, 10);
  const maxPages = parsePositiveInt(configuredPages, 10);
  const maxRowsPerRun = maxPages * 100;
  const configuredLookback = parseNonNegativeInt(process.env.CREATORCORE_SYNC_CAMPAIGN_LOOKBACK_ROWS, 500);
  const lookbackRows = Math.min(configuredLookback, Math.max(0, maxRowsPerRun - 1));
  const startCursor = Math.max(0, baseCursor - lookbackRows);

  const { campaigns: raw, nextCursor, hasMore, pages } = await fetchCampaigns(startCursor, {
    maxPages,
    limit: 100,
    baseUrl: source.baseUrl,
  });

  const campaigns = raw
    .map((campaign) => normalizeCampaign(campaign, source.key))
    .filter((row): row is NormalizedCampaign => row != null);
  const { inserted, updated } = await upsertCampaigns(campaigns);

  const cursor = Math.max(baseCursor, nextCursor);
  const advanced = Math.max(0, cursor - baseCursor);

  await updateSyncState('campaign', source.key, cursor, advanced);

  return {
    entity: 'campaign',
    sourceKey: source.key,
    sourceName: source.name,
    fetched: raw.length,
    processed: campaigns.length,
    inserted,
    updated,
    skipped: raw.length - campaigns.length,
    cursor,
    hasMore,
    pages,
    newItems: inserted,
  };
}

export async function syncCampaigns(options: SyncOptions = {}): Promise<SyncResult> {
  const sql = getDb();
  await ensureCreatorCoreSchema(sql);
  const sources = await resolveAgencySources(options);
  const bySource: SyncSourceResult[] = [];
  for (const source of sources) {
    bySource.push(await syncCampaignsForSource(source, options));
  }
  return aggregateSyncResults('campaign', bySource);
}

async function syncPostsForSource(
  source: CreatorCoreAgencySource,
  options: SyncOptions
): Promise<SyncSourceResult> {
  const baseCursor = await getOrCreateCursor('post', source.key);
  const configuredPages =
    options.postPages ??
    parseNonNegativeInt(process.env.CREATORCORE_SYNC_POST_PAGES, 20);
  const maxPages = parsePositiveInt(configuredPages, 20);
  const maxRowsPerRun = maxPages * 100;
  const configuredLookback = parseNonNegativeInt(process.env.CREATORCORE_SYNC_POST_LOOKBACK_ROWS, 1000);
  const lookbackRows = Math.min(configuredLookback, Math.max(0, maxRowsPerRun - 1));
  const startCursor = Math.max(0, baseCursor - lookbackRows);

  const { posts: raw, nextCursor, hasMore, pages } = await fetchPosts(startCursor, {
    maxPages,
    limit: 100,
    baseUrl: source.baseUrl,
  });

  const normalized = raw
    .map((post) => normalizePost(post, source.key))
    .filter((row): row is NormalizedPost => row != null);
  const campaignRefs = normalized
    .map((row) => {
      if (!row.campaign_id) return null;
      return { source_key: row.source_key, campaign_id: row.campaign_id };
    })
    .filter((row): row is CampaignLookupRef => row != null);
  const campaignMap = await getCampaignPkMap(campaignRefs);

  const readyPosts: PostRow[] = [];
  let skipped = 0;

  for (const post of normalized) {
    if (!post.campaign_id) {
      skipped++;
      continue;
    }

    const campaignPk = campaignMap.get(campaignLookupKey(post.source_key, post.campaign_id));
    if (!campaignPk) {
      skipped++;
      continue;
    }

    readyPosts.push({
      source_key: post.source_key,
      post_id: post.post_id,
      campaign_pk: campaignPk,
      canonical_post_key: post.canonical_post_key,
      api_cost_usd: post.api_cost_usd,
      username: post.username,
      platform: post.platform,
      post_url: post.post_url,
      post_url_valid: post.post_url_valid,
      post_url_reason: post.post_url_reason,
      views: post.views,
      post_date: post.post_date,
      post_status: post.post_status,
      created_date: post.created_date,
      is_test_data: post.is_test_data,
    });
  }

  const { inserted, updated } = await upsertPosts(readyPosts);
  const newCreators = await upsertCreatorSeen(buildCreatorSeenRows(readyPosts));

  const cursor = Math.max(baseCursor, nextCursor);
  const advanced = Math.max(0, cursor - baseCursor);

  await updateSyncState('post', source.key, cursor, advanced);

  return {
    entity: 'post',
    sourceKey: source.key,
    sourceName: source.name,
    fetched: raw.length,
    processed: readyPosts.length,
    inserted,
    updated,
    skipped: skipped + (raw.length - normalized.length),
    cursor,
    hasMore,
    pages,
    newItems: newCreators,
  };
}

export async function syncPosts(options: SyncOptions = {}): Promise<SyncResult> {
  const sql = getDb();
  await ensureCreatorCoreSchema(sql);
  const sources = await resolveAgencySources(options);
  const bySource: SyncSourceResult[] = [];
  for (const source of sources) {
    bySource.push(await syncPostsForSource(source, options));
  }
  return aggregateSyncResults('post', bySource);
}

export interface FullSyncResult {
  campaigns: SyncResult;
  creatorDiscovery: CreatorDiscoveryResult;
  pendingHydration: PendingHydrationResult;
  posts: SyncResult;
  rollupsRefreshedAt: string;
}

export async function runFullSync(options: SyncOptions = {}): Promise<FullSyncResult> {
  const sources = await resolveAgencySources(options);
  const campaigns = await syncCampaigns({ ...options, sources });
  const posts = await syncPosts({ ...options, sources });
  const creatorDiscovery = await runCreatorDiscoverySweep({ ...options, sources });
  const pendingHydration = await runPendingHydration({ ...options, sources });
  await refreshRollups();
  return {
    campaigns,
    posts,
    creatorDiscovery,
    pendingHydration,
    rollupsRefreshedAt: new Date().toISOString(),
  };
}
