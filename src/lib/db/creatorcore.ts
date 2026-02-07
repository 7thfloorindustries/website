/**
 * CreatorCore database queries
 * Read queries for the influencer browser feature.
 */

import type { NeonQueryFunctionInTransaction } from '@neondatabase/serverless';
import { neon } from '@neondatabase/serverless';
import { ensureCreatorCoreSchema } from '@/lib/creatorcore/schema';
import { INFLUENCER_UNKNOWN_ORG_ID, type InfluencerRole } from '@/lib/influencer/auth';
import { shouldFilterTestData } from '@/lib/influencer/flags';
import { randomUUID } from 'crypto';

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return neon(databaseUrl);
}

function getFiniteNumber(value: number | undefined): number | null {
  if (value == null) return null;
  return Number.isFinite(value) ? value : null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export interface GenreLabel {
  confidence: number;
  genre: string;
  weight: number;
}

export interface CreatorAgencyTag {
  key: string;
  name: string;
}

function normalizeGenreLabels(raw: unknown): GenreLabel[] {
  if (!Array.isArray(raw)) return [];
  const labels: GenreLabel[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const genre = typeof row.genre === 'string' ? row.genre.trim() : '';
    if (!genre) continue;
    labels.push({
      genre,
      weight: clamp01(Number(row.weight ?? 0)),
      confidence: clamp01(Number(row.confidence ?? 0)),
    });
  }
  return labels;
}

function normalizeCreatorAgencies(raw: unknown): CreatorAgencyTag[] {
  if (!Array.isArray(raw)) return [];
  const agencies: CreatorAgencyTag[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const key = typeof row.key === 'string' ? row.key.trim() : '';
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!key || !name) continue;
    agencies.push({ key, name });
  }
  return agencies;
}

export interface CampaignDetailRecord extends Record<string, unknown> {
  budget?: number | string | null;
  campaign_pk: number | string;
  genre?: string | null;
  genre_confidence?: number | string | null;
  genres?: GenreLabel[];
  platforms?: string | string[] | null;
}

interface PaginationResult {
  limit: number;
  page: number;
  total: number;
  totalPages: number;
}

export interface CampaignDetailResult {
  campaign: CampaignDetailRecord;
  creators: Record<string, unknown>[];
  creatorsPagination: PaginationResult;
  posts: Record<string, unknown>[];
  postsPagination: PaginationResult;
}

export interface CreatorSummaryRecord extends Record<string, unknown> {
  agencies: CreatorAgencyTag[];
  avg_views: number;
  campaign_count: number;
  cost_source: 'api' | 'rate_override' | 'mixed' | 'none';
  cost_total_usd: number | null;
  genre_diversity_score: number;
  genre_fit_score: number;
  max_views: number;
  platforms: string[];
  success_rate: number;
  top_genres: GenreLabel[];
  total_posts: number;
  total_views: number;
  username: string;
}

export interface CreatorListResult {
  creators: CreatorSummaryRecord[];
  pagination: PaginationResult;
}

export interface InfluencerAccessContext {
  orgId: string;
  role: InfluencerRole;
  userId: string;
}

type TxQuery = NeonQueryFunctionInTransaction<false, false>;

function pendingIntakeConditionSql(campaignAlias: string, metricsAlias: string): string {
  return `(
    COALESCE(${campaignAlias}.first_seen_at, ${campaignAlias}.created_at, NOW()) >= NOW() - INTERVAL '14 days'
    AND COALESCE(${campaignAlias}.first_seen_at, ${campaignAlias}.created_at, NOW()) <= NOW() - INTERVAL '30 minutes'
    AND COALESCE(${metricsAlias}.quality_status, 'missing_posts') IN ('missing_posts', 'placeholder_links_only', 'missing_core_metadata')
  )`;
}

function nonTestCampaignCondition(alias: string): string {
  if (!shouldFilterTestData()) return 'TRUE';
  return `COALESCE(${alias}.is_test_data, FALSE) = FALSE`;
}

function nonTestPostCondition(alias: string): string {
  if (!shouldFilterTestData()) return 'TRUE';
  return `COALESCE(${alias}.is_test_data, FALSE) = FALSE`;
}

function campaignNeedsReviewSql(campaignAlias: string, reviewAlias: string): string {
  return `(
    ${campaignAlias}.first_seen_at >= NOW() - INTERVAL '7 days'
    AND (${reviewAlias}.reviewed_at IS NULL OR ${reviewAlias}.reviewed_at < ${campaignAlias}.first_seen_at)
  )`;
}

function creatorNeedsReviewSql(statsAlias: string, reviewAlias: string): string {
  return `(
    ${statsAlias}.first_seen_at >= NOW() - INTERVAL '7 days'
    AND (${reviewAlias}.reviewed_at IS NULL OR ${reviewAlias}.reviewed_at < ${statsAlias}.first_seen_at)
  )`;
}

async function runScopedRead(
  access: InfluencerAccessContext,
  buildQueries: (tx: TxQuery) => ReturnType<TxQuery>[]
) {
  const sql = getDb();
  await ensureCreatorCoreSchema(sql);

  const results = await sql.transaction((tx) => [
    tx`SELECT set_config('app.current_org_id', ${access.orgId}, true)`,
    tx`SELECT set_config('app.current_role', ${access.role}, true)`,
    // Neon may widen tx generic flags; cast to the local transaction query shape.
    ...buildQueries(tx as TxQuery),
  ], { readOnly: true });

  return results.slice(2);
}

async function runScopedWrite(
  access: InfluencerAccessContext,
  buildQueries: (tx: TxQuery) => ReturnType<TxQuery>[]
) {
  const sql = getDb();
  await ensureCreatorCoreSchema(sql);

  const results = await sql.transaction((tx) => [
    tx`SELECT set_config('app.current_org_id', ${access.orgId}, true)`,
    tx`SELECT set_config('app.current_role', ${access.role}, true)`,
    // Neon may widen tx generic flags; cast to the local transaction query shape.
    ...buildQueries(tx as TxQuery),
  ]);

  return results.slice(2);
}

function appendOrgScopeCondition(
  conditions: string[],
  values: (string | number)[],
  paramIndex: number,
  column: string,
  orgId: string,
  role: InfluencerRole
): number {
  if (role === 'admin') {
    return paramIndex;
  }

  if (orgId === INFLUENCER_UNKNOWN_ORG_ID) {
    conditions.push(`(${column} IS NULL OR btrim(${column}) = '')`);
    return paramIndex;
  }

  conditions.push(`${column} = $${paramIndex}`);
  values.push(orgId);
  return paramIndex + 1;
}

function orgScopeSql(
  column: string,
  orgId: string,
  placeholderIndex: number,
  role: InfluencerRole
): { clause: string; values: string[] } {
  if (role === 'admin') {
    return { clause: 'TRUE', values: [] };
  }

  if (orgId === INFLUENCER_UNKNOWN_ORG_ID) {
    return { clause: `(${column} IS NULL OR btrim(${column}) = '')`, values: [] };
  }
  return { clause: `${column} = $${placeholderIndex}`, values: [orgId] };
}

async function getCampaignGenreLabelsByPk(
  access: InfluencerAccessContext,
  campaignPks: number[]
): Promise<Map<number, GenreLabel[]>> {
  if (campaignPks.length === 0) return new Map();

  const ids = [...new Set(campaignPks.filter((id) => Number.isFinite(id) && id > 0))].map(String);
  if (ids.length === 0) return new Map();

  const [rows] = await runScopedRead(access, (tx) => [
    tx.query(
      `
      SELECT
        egl.entity_id,
        egl.genre_id,
        egl.weight,
        egl.confidence
      FROM entity_genre_labels egl
      JOIN cc_campaigns c ON c.id = egl.entity_id::INT
      WHERE egl.entity_type = 'campaign'
        AND egl.entity_id = ANY($1)
        AND app.org_matches(c.org_id)
      ORDER BY egl.entity_id::INT ASC, egl.weight DESC, egl.genre_id ASC
      `,
      [ids]
    ),
  ]) as [Array<{ entity_id: string; genre_id: string; weight: string | number; confidence: string | number }>];

  const grouped = new Map<number, GenreLabel[]>();
  for (const row of rows) {
    const campaignPk = Number(row.entity_id);
    if (!Number.isFinite(campaignPk)) continue;
    const labels = grouped.get(campaignPk) ?? [];
    labels.push({
      genre: row.genre_id,
      weight: clamp01(Number(row.weight ?? 0)),
      confidence: clamp01(Number(row.confidence ?? 0)),
    });
    grouped.set(campaignPk, labels);
  }

  return grouped;
}

async function getCampaignGenreVectorBySlug(
  access: InfluencerAccessContext,
  campaignSlug?: string
): Promise<Record<string, number>> {
  const slug = campaignSlug?.trim();
  if (!slug) return {};

  const [campaignRows] = await runScopedRead(access, (tx) => [
    tx.query(
      `
      SELECT id, genre
      FROM cc_campaigns
      WHERE slug = $1
      LIMIT 1
      `,
      [slug]
    ),
  ]) as [Array<{ id: number | string; genre: string | null }>];

  const campaign = campaignRows[0];
  if (!campaign) return {};

  const campaignPk = Number(campaign.id);
  if (!Number.isFinite(campaignPk) || campaignPk <= 0) return {};

  const labels = await getCampaignGenreLabelsByPk(access, [campaignPk]);
  const mapped = labels.get(campaignPk) ?? [];
  if (mapped.length > 0) {
    return Object.fromEntries(mapped.map((label) => [label.genre, label.weight]));
  }

  const fallbackGenre = typeof campaign.genre === 'string' ? campaign.genre.trim() : '';
  if (!fallbackGenre) return {};
  return { [fallbackGenre]: 1 };
}

export interface CampaignListParams {
  genre?: string;
  intake?: 'all' | 'main' | 'pending';
  limit?: number;
  max_budget?: number;
  min_budget?: number;
  review?: 'all' | 'needs_review';
  page?: number;
  platform?: string;
  search?: string;
  sort?: string;
}

export async function getCampaigns(access: InfluencerAccessContext, params: CampaignListParams) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 50));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: (string | number)[] = [];
  let paramIndex = 1;

  paramIndex = appendOrgScopeCondition(conditions, values, paramIndex, 'c.org_id', access.orgId, access.role);
  conditions.push(nonTestCampaignCondition('c'));

  if (params.search) {
    conditions.push(`c.title ILIKE $${paramIndex}`);
    values.push(`%${params.search}%`);
    paramIndex++;
  }

  if (params.genre) {
    const genres = params.genre.split(',').map((g) => g.trim()).filter(Boolean);
    if (genres.length === 1) {
      const genreLower = genres[0].toLowerCase();
      conditions.push(`(
        LOWER(c.genre) = $${paramIndex}
        OR EXISTS (
          SELECT 1
          FROM entity_genre_labels egl
          WHERE egl.entity_type = 'campaign'
            AND egl.entity_id = c.id::text
            AND LOWER(egl.genre_id) = $${paramIndex}
        )
      )`);
      values.push(genreLower);
      paramIndex++;
    } else if (genres.length > 1) {
      const genreValues = genres.map((genre) => genre.toLowerCase());
      const placeholders = genres.map((_, i) => `$${paramIndex + i}`).join(', ');
      conditions.push(`(
        LOWER(c.genre) IN (${placeholders})
        OR EXISTS (
          SELECT 1
          FROM entity_genre_labels egl
          WHERE egl.entity_type = 'campaign'
            AND egl.entity_id = c.id::text
            AND LOWER(egl.genre_id) IN (${placeholders})
        )
      )`);
      values.push(...genreValues);
      paramIndex += genreValues.length;
    }
  }

  if (params.platform) {
    conditions.push(`COALESCE(c.platforms, '') ILIKE $${paramIndex}`);
    values.push(`%${params.platform}%`);
    paramIndex++;
  }

  const intake = params.intake ?? 'main';
  if (intake === 'pending') {
    conditions.push(pendingIntakeConditionSql('c', 'cm'));
  } else if (intake === 'main') {
    conditions.push(`NOT ${pendingIntakeConditionSql('c', 'cm')}`);
  }

  if (params.review === 'needs_review') {
    conditions.push(campaignNeedsReviewSql('c', 'cr'));
  }

  const minBudget = getFiniteNumber(params.min_budget);
  if (minBudget != null) {
    conditions.push(`c.budget >= $${paramIndex}`);
    values.push(minBudget);
    paramIndex++;
  }

  const maxBudget = getFiniteNumber(params.max_budget);
  if (maxBudget != null) {
    conditions.push(`c.budget <= $${paramIndex}`);
    values.push(maxBudget);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sortMap: Record<string, string> = {
    views: 'COALESCE(cm.verified_views, cm.total_views, 0) DESC NULLS LAST',
    views_desc: 'COALESCE(cm.verified_views, cm.total_views, 0) DESC NULLS LAST',
    views_asc: 'COALESCE(cm.verified_views, cm.total_views, 0) ASC NULLS LAST',
    budget: 'c.budget DESC NULLS LAST',
    budget_desc: 'c.budget DESC NULLS LAST',
    budget_asc: 'c.budget ASC NULLS LAST',
    newest: 'c.created_at DESC NULLS LAST',
    newest_desc: 'c.created_at DESC NULLS LAST',
    newest_asc: 'c.created_at ASC NULLS LAST',
    date_desc: 'c.created_at DESC NULLS LAST',
    date_asc: 'c.created_at ASC NULLS LAST',
    creators: 'COALESCE(cm.actual_creators, 0) DESC NULLS LAST',
    creators_desc: 'COALESCE(cm.actual_creators, 0) DESC NULLS LAST',
    creators_asc: 'COALESCE(cm.actual_creators, 0) ASC NULLS LAST',
    genre: `
      CASE
        WHEN c.genre IS NULL OR btrim(c.genre) = '' OR LOWER(btrim(c.genre)) = 'unclassified'
        THEN 1
        ELSE 0
      END ASC,
      LOWER(c.genre) DESC,
      c.created_at DESC NULLS LAST
    `,
    genre_desc: `
      CASE
        WHEN c.genre IS NULL OR btrim(c.genre) = '' OR LOWER(btrim(c.genre)) = 'unclassified'
        THEN 1
        ELSE 0
      END ASC,
      LOWER(c.genre) DESC,
      c.created_at DESC NULLS LAST
    `,
    genre_asc: `
      CASE
        WHEN c.genre IS NULL OR btrim(c.genre) = '' OR LOWER(btrim(c.genre)) = 'unclassified'
        THEN 1
        ELSE 0
      END ASC,
      LOWER(c.genre) ASC,
      c.created_at DESC NULLS LAST
    `,
  };
  const orderBy = sortMap[params.sort ?? ''] ?? 'COALESCE(cm.verified_views, cm.total_views, 0) DESC NULLS LAST';

  const dataQuery = `
    SELECT
      c.id AS campaign_pk,
      c.title,
      c.slug,
      c.budget,
      c.currency,
      c.org_id,
      c.platforms,
      c.created_at,
      c.genre,
      c.genre_confidence,
      c.genre_source,
      c.thumbnail,
      COALESCE(cm.actual_creators, 0) AS actual_creators,
      COALESCE(cm.actual_posts, 0) AS actual_posts,
      COALESCE(cm.total_views, 0) AS raw_total_views,
      COALESCE(cm.verified_views, 0) AS verified_views,
      COALESCE(cm.valid_url_posts, 0) AS valid_url_posts,
      COALESCE(cm.invalid_url_posts, 0) AS invalid_url_posts,
      COALESCE(
        ROUND(
          (COALESCE(cm.valid_url_posts, 0)::numeric
            / NULLIF(COALESCE(cm.valid_url_posts, 0) + COALESCE(cm.invalid_url_posts, 0), 0)) * 100,
          2
        ),
        0
      ) AS verified_views_coverage,
      COALESCE(NULLIF(cm.verified_views, 0), cm.total_views, 0) AS total_views,
      COALESCE(cm.quality_status, 'missing_posts') AS quality_status,
      c.first_seen_at,
      c.last_seen_at,
      (c.first_seen_at >= NOW() - INTERVAL '48 hours') AS is_new_campaign,
      ${pendingIntakeConditionSql('c', 'cm')} AS is_pending_intake,
      ${campaignNeedsReviewSql('c', 'cr')} AS needs_review_campaign,
      cr.reviewed_at AS reviewed_campaign_at
    FROM cc_campaigns c
    LEFT JOIN cc_campaign_metrics cm ON cm.campaign_pk = c.id
    LEFT JOIN cc_campaign_review_state cr ON cr.campaign_pk = c.id
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  const dataValues = [...values, limit, offset];
  const countQuery = `
    SELECT COUNT(*) AS total
    FROM cc_campaigns c
    LEFT JOIN cc_campaign_metrics cm ON cm.campaign_pk = c.id
    LEFT JOIN cc_campaign_review_state cr ON cr.campaign_pk = c.id
    ${whereClause}
  `;

  const [rows, countRows] = await runScopedRead(access, (tx) => [
    tx.query(dataQuery, dataValues),
    tx.query(countQuery, values),
  ]) as [Record<string, unknown>[], Array<{ total: string | number }>];

  const labelsByCampaignPk = await getCampaignGenreLabelsByPk(
    access,
    rows
      .map((row) => Number(row.campaign_pk))
      .filter((id) => Number.isFinite(id) && id > 0)
  );

  const campaigns = rows.map((campaign) => {
    const campaignPk = Number(campaign.campaign_pk);
    const labels = labelsByCampaignPk.get(campaignPk) ?? [];
    const firstLabel = labels[0];
    const fallbackGenre = typeof campaign.genre === 'string' && campaign.genre.trim() ? campaign.genre : null;
    const resolvedGenre = firstLabel?.genre ?? fallbackGenre ?? 'Unclassified';
    const resolvedConfidence =
      firstLabel?.confidence ??
      (campaign.genre_confidence == null ? 0 : clamp01(Number(campaign.genre_confidence)));

    return {
      ...campaign,
      genre: resolvedGenre,
      genres: labels,
      genre_confidence: resolvedConfidence,
    };
  });

  const total = Number(countRows[0]?.total ?? 0);

  return {
    campaigns,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export interface CampaignDetailParams {
  creatorsLimit?: number;
  creatorsPage?: number;
  postsLimit?: number;
  postsPage?: number;
  postsSort?: string;
  sortDir?: 'asc' | 'desc';
}

export async function getCampaignBySlug(
  access: InfluencerAccessContext,
  slug: string,
  params: CampaignDetailParams = {}
): Promise<CampaignDetailResult | null> {
  const campaignConditions = ['c.slug = $1', nonTestCampaignCondition('c')];
  const campaignValues: (string | number)[] = [slug];
  appendOrgScopeCondition(campaignConditions, campaignValues, 2, 'c.org_id', access.orgId, access.role);

  const campaignQuery = `
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
      COALESCE(cm.actual_creators, 0) AS actual_creators,
      COALESCE(cm.actual_posts, 0) AS actual_posts,
      COALESCE(cm.total_views, 0) AS raw_total_views,
      COALESCE(cm.verified_views, 0) AS verified_views,
      COALESCE(NULLIF(cm.verified_views, 0), cm.total_views, 0) AS total_views,
      COALESCE(cm.quality_status, 'missing_posts') AS quality_status,
      c.first_seen_at,
      c.last_seen_at,
      (c.first_seen_at >= NOW() - INTERVAL '48 hours') AS is_new_campaign,
      ${pendingIntakeConditionSql('c', 'cm')} AS is_pending_intake,
      ${campaignNeedsReviewSql('c', 'cr')} AS needs_review_campaign,
      cr.reviewed_at AS reviewed_campaign_at
    FROM cc_campaigns c
    LEFT JOIN cc_campaign_metrics cm ON cm.campaign_pk = c.id
    LEFT JOIN cc_campaign_review_state cr ON cr.campaign_pk = c.id
    WHERE ${campaignConditions.join(' AND ')}
    LIMIT 1
  `;

  const [campaignRows] = await runScopedRead(access, (tx) => [
    tx.query(campaignQuery, campaignValues),
  ]) as [Record<string, unknown>[]];

  if (campaignRows.length === 0) return null;

  const campaign = campaignRows[0] as CampaignDetailRecord;
  const campaignPk = Number(campaign.campaign_pk);
  const postsPage = Math.max(1, params.postsPage ?? 1);
  const postsLimit = Math.min(200, Math.max(10, params.postsLimit ?? 100));
  const creatorsPage = Math.max(1, params.creatorsPage ?? 1);
  const creatorsLimit = Math.min(200, Math.max(10, params.creatorsLimit ?? 100));
  const postsOffset = (postsPage - 1) * postsLimit;
  const creatorsOffset = (creatorsPage - 1) * creatorsLimit;

  const sortKey = params.postsSort ?? 'views';
  const sortDir = params.sortDir === 'asc' ? 'asc' : 'desc';
  const postsSortMap: Record<string, string> = {
    views_asc: 'p.views ASC NULLS LAST',
    views_desc: 'p.views DESC NULLS LAST',
    post_date_asc: 'p.post_date ASC NULLS LAST',
    post_date_desc: 'p.post_date DESC NULLS LAST',
    username_asc: 'p.username ASC NULLS LAST',
    username_desc: 'p.username DESC NULLS LAST',
    platform_asc: 'p.platform ASC NULLS LAST',
    platform_desc: 'p.platform DESC NULLS LAST',
    post_status_asc: 'p.post_status ASC NULLS LAST',
    post_status_desc: 'p.post_status DESC NULLS LAST',
    post_url_asc: 'p.post_url ASC NULLS LAST',
    post_url_desc: 'p.post_url DESC NULLS LAST',
  };
  const postsOrderBy = postsSortMap[`${sortKey}_${sortDir}`] ?? 'p.views DESC NULLS LAST';

  const [posts, postsCountRows, creators, creatorsCountRows] = await runScopedRead(access, (tx) => [
    tx.query(
      `
      SELECT
        p.post_id,
        p.username,
        p.platform,
        p.post_url,
        COALESCE(p.post_url_valid, FALSE) AS post_url_valid,
        CASE
          WHEN COALESCE(p.post_url_valid, FALSE) = TRUE THEN 'valid'
          WHEN p.post_url_reason IS NOT NULL AND btrim(p.post_url_reason) <> '' THEN p.post_url_reason
          ELSE 'invalid_source_url'
        END AS post_url_reason,
        p.views,
        p.post_date,
        p.post_status
      FROM cc_posts p
      WHERE p.campaign_pk = $1
        AND ${nonTestPostCondition('p')}
      ORDER BY ${postsOrderBy}
      LIMIT $2 OFFSET $3
      `,
      [campaignPk, postsLimit, postsOffset]
    ),
    tx.query(
      `
      SELECT COUNT(*) AS total
      FROM cc_posts p
      WHERE p.campaign_pk = $1
        AND ${nonTestPostCondition('p')}
      `,
      [campaignPk]
    ),
    tx.query(
      `
      WITH creator_genres AS (
        SELECT
          ranked.entity_id AS username,
          COALESCE(
            JSONB_AGG(
              JSONB_BUILD_OBJECT(
                'genre', ranked.genre_id,
                'weight', ranked.weight,
                'confidence', ranked.confidence
              )
              ORDER BY ranked.weight DESC, ranked.genre_id ASC
            ) FILTER (WHERE ranked.rn <= 2),
            '[]'::jsonb
          ) AS top_genres
        FROM (
          SELECT
            egl.entity_id,
            egl.genre_id,
            egl.weight,
            egl.confidence,
            ROW_NUMBER() OVER (PARTITION BY egl.entity_id ORDER BY egl.weight DESC, egl.genre_id ASC) AS rn
          FROM entity_genre_labels egl
          WHERE egl.entity_type = 'creator'
        ) ranked
        GROUP BY ranked.entity_id
      )
      SELECT
        LOWER(p.username) AS username,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT p.platform), NULL) AS platforms,
        COUNT(*) AS post_count,
        COALESCE(SUM(p.views), 0) AS total_views,
        COALESCE(ROUND(AVG(p.views)), 0) AS avg_views,
        COALESCE(cg.top_genres, '[]'::jsonb) AS top_genres,
        COALESCE(
          ROUND((100.0 * COUNT(*) FILTER (WHERE p.post_status = 'Success')) / NULLIF(COUNT(*), 0), 1),
          0
        ) AS success_rate
      FROM cc_posts p
      LEFT JOIN creator_genres cg ON LOWER(cg.username) = LOWER(p.username)
      WHERE p.campaign_pk = $1
        AND ${nonTestPostCondition('p')}
        AND p.username IS NOT NULL
        AND btrim(p.username) <> ''
      GROUP BY LOWER(p.username), cg.top_genres
      ORDER BY total_views DESC NULLS LAST
      LIMIT $2 OFFSET $3
      `,
      [campaignPk, creatorsLimit, creatorsOffset]
    ),
    tx.query(
      `
      SELECT COUNT(DISTINCT LOWER(p.username)) AS total
      FROM cc_posts p
      WHERE p.campaign_pk = $1
        AND ${nonTestPostCondition('p')}
        AND p.username IS NOT NULL
        AND btrim(p.username) <> ''
      `,
      [campaignPk]
    ),
  ]) as [
    Record<string, unknown>[],
    Array<{ total: string | number }>,
    Record<string, unknown>[],
    Array<{ total: string | number }>,
  ];

  const totalPosts = Number(postsCountRows[0]?.total ?? 0);
  const totalCreators = Number(creatorsCountRows[0]?.total ?? 0);
  const campaignLabelsByPk = await getCampaignGenreLabelsByPk(access, [campaignPk]);
  const campaignLabels = campaignLabelsByPk.get(campaignPk) ?? [];
  const campaignFallbackGenre = typeof campaign.genre === 'string' && campaign.genre.trim() ? campaign.genre : null;
  const campaignResolvedGenre = campaignLabels[0]?.genre ?? campaignFallbackGenre ?? 'Unclassified';
  const campaignConfidence =
    campaignLabels[0]?.confidence ??
    (campaign.genre_confidence == null ? 0 : clamp01(Number(campaign.genre_confidence)));

  const campaignDetail: CampaignDetailRecord = {
    ...campaign,
    genre: campaignResolvedGenre,
    genres: campaignLabels,
    genre_confidence: campaignConfidence,
  };

  return {
    campaign: {
      ...campaignDetail,
    },
    posts,
    creators,
    postsPagination: {
      page: postsPage,
      limit: postsLimit,
      total: totalPosts,
      totalPages: Math.max(1, Math.ceil(totalPosts / postsLimit)),
    },
    creatorsPagination: {
      page: creatorsPage,
      limit: creatorsLimit,
      total: totalCreators,
      totalPages: Math.max(1, Math.ceil(totalCreators / creatorsLimit)),
    },
  };
}

export interface CreatorListParams {
  agency?: string;
  campaign_slug?: string;
  genre?: string;
  limit?: number;
  min_genre_fit?: number;
  page?: number;
  platform?: string;
  review?: 'all' | 'needs_review';
  search?: string;
  sort?: string;
}

export async function getCreators(
  access: InfluencerAccessContext,
  params: CreatorListParams
): Promise<CreatorListResult> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(300, Math.max(1, params.limit ?? 50));
  const offset = (page - 1) * limit;
  const campaignGenreVector = await getCampaignGenreVectorBySlug(access, params.campaign_slug);

  const orgScope = orgScopeSql('c.org_id', access.orgId, 1, access.role);
  const conditions: string[] = [];
  const values: (string | number)[] = [...orgScope.values, JSON.stringify(campaignGenreVector)];
  const campaignVectorParamIndex = values.length;
  let paramIndex = values.length + 1;

  if (params.search) {
    conditions.push(`(
      s.username ILIKE $${paramIndex}
      OR EXISTS (
        SELECT 1
        FROM creator_agency_pairs cap
        WHERE cap.username = s.username
          AND (
            cap.agency_key ILIKE $${paramIndex}
            OR cap.agency_name ILIKE $${paramIndex}
          )
      )
    )`);
    values.push(`%${params.search.toLowerCase()}%`);
    paramIndex++;
  }

  if (params.agency) {
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM creator_agency_pairs cap
        WHERE cap.username = s.username
          AND cap.agency_key = $${paramIndex}
      )
    `);
    values.push(params.agency.trim().toLowerCase());
    paramIndex++;
  }

  if (params.platform) {
    conditions.push(
      `EXISTS (SELECT 1 FROM unnest(s.platforms) platform_name WHERE LOWER(platform_name) = LOWER($${paramIndex}))`
    );
    values.push(params.platform);
    paramIndex++;
  }

  if (params.genre) {
    const genreFilters = params.genre.split(',').map((genre) => genre.trim().toLowerCase()).filter(Boolean);
    if (genreFilters.length === 1) {
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM entity_genre_labels egl
          WHERE egl.entity_type = 'creator'
            AND LOWER(egl.entity_id) = LOWER(s.username)
            AND LOWER(egl.genre_id) = $${paramIndex}
        )
      `);
      values.push(genreFilters[0]);
      paramIndex++;
    } else if (genreFilters.length > 1) {
      const placeholders = genreFilters.map((_, i) => `$${paramIndex + i}`).join(', ');
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM entity_genre_labels egl
          WHERE egl.entity_type = 'creator'
            AND LOWER(egl.entity_id) = LOWER(s.username)
            AND LOWER(egl.genre_id) IN (${placeholders})
        )
      `);
      values.push(...genreFilters);
      paramIndex += genreFilters.length;
    }
  }

  if (params.review === 'needs_review') {
    conditions.push(creatorNeedsReviewSql('s', 'rs'));
  }

  const minGenreFit = getFiniteNumber(params.min_genre_fit);
  if (minGenreFit != null) {
    conditions.push(`COALESCE(cgf.genre_fit_score, 0) >= $${paramIndex}`);
    values.push(clamp01(minGenreFit));
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sortMap: Record<string, string> = {
    views: 's.total_views DESC NULLS LAST',
    views_desc: 's.total_views DESC NULLS LAST',
    views_asc: 's.total_views ASC NULLS LAST',
    campaigns: 's.campaign_count DESC NULLS LAST',
    campaigns_desc: 's.campaign_count DESC NULLS LAST',
    campaigns_asc: 's.campaign_count ASC NULLS LAST',
    posts: 's.total_posts DESC NULLS LAST',
    posts_desc: 's.total_posts DESC NULLS LAST',
    posts_asc: 's.total_posts ASC NULLS LAST',
    success: 's.success_rate DESC NULLS LAST',
    success_desc: 's.success_rate DESC NULLS LAST',
    success_asc: 's.success_rate ASC NULLS LAST',
    newest: 's.first_seen_at DESC NULLS LAST',
    newest_desc: 's.first_seen_at DESC NULLS LAST',
    newest_asc: 's.first_seen_at ASC NULLS LAST',
    genre_fit: 'COALESCE(cgf.genre_fit_score, 0) DESC NULLS LAST',
    genre_fit_desc: 'COALESCE(cgf.genre_fit_score, 0) DESC NULLS LAST',
    genre_fit_asc: 'COALESCE(cgf.genre_fit_score, 0) ASC NULLS LAST',
    diversity: 'COALESCE(cgp.genre_diversity_score, 0) DESC NULLS LAST',
    diversity_desc: 'COALESCE(cgp.genre_diversity_score, 0) DESC NULLS LAST',
    diversity_asc: 'COALESCE(cgp.genre_diversity_score, 0) ASC NULLS LAST',
    cost: `
      CASE
        WHEN (s.api_cost_count + s.override_cost_count) > 0
        THEN (s.api_cost_total + s.override_cost_total)
        ELSE NULL
      END DESC NULLS LAST
    `,
    cost_desc: `
      CASE
        WHEN (s.api_cost_count + s.override_cost_count) > 0
        THEN (s.api_cost_total + s.override_cost_total)
        ELSE NULL
      END DESC NULLS LAST
    `,
    cost_asc: `
      CASE
        WHEN (s.api_cost_count + s.override_cost_count) > 0
        THEN (s.api_cost_total + s.override_cost_total)
        ELSE NULL
      END ASC NULLS LAST
    `,
  };
  const orderBy = sortMap[params.sort ?? ''] ?? 's.total_views DESC NULLS LAST';

  const baseCte = `
    WITH scoped_posts_raw AS (
      SELECT p.*
      FROM cc_posts p
      JOIN cc_campaigns c ON c.id = p.campaign_pk
      WHERE ${orgScope.clause}
        AND ${nonTestCampaignCondition('c')}
        AND ${nonTestPostCondition('p')}
    ),
    scoped_posts AS (
      SELECT ranked.*
      FROM (
        SELECT
          p.*,
          COALESCE(NULLIF(btrim(p.canonical_post_key), ''), p.source_key || ':' || p.post_id) AS dedupe_key,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(NULLIF(btrim(p.canonical_post_key), ''), p.source_key || ':' || p.post_id)
            ORDER BY COALESCE(p.views, 0) DESC NULLS LAST, p.id DESC
          ) AS rn
        FROM scoped_posts_raw p
      ) ranked
      WHERE ranked.rn = 1
    ),
    creator_stats AS (
      SELECT
        LOWER(p.username) AS username,
        COUNT(DISTINCT p.campaign_pk) AS campaign_count,
        COUNT(*) AS total_posts,
        COALESCE(SUM(p.views), 0) AS total_views,
        COALESCE(ROUND(AVG(p.views)), 0) AS avg_views,
        MAX(p.views) AS max_views,
        COALESCE(
          ROUND((100.0 * COUNT(*) FILTER (WHERE p.post_status = 'Success')) / NULLIF(COUNT(*), 0), 1),
          0
        ) AS success_rate,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT p.platform), NULL) AS platforms,
        MIN(p.post_date) AS first_post,
        MAX(p.post_date) AS last_post,
        MIN(COALESCE(p.created_date, p.post_date)) AS first_seen_at,
        MAX(COALESCE(p.created_date, p.post_date)) AS last_seen_at,
        COUNT(*) FILTER (WHERE p.api_cost_usd IS NOT NULL) AS api_cost_count,
        COALESCE(SUM(p.api_cost_usd) FILTER (WHERE p.api_cost_usd IS NOT NULL), 0)::DOUBLE PRECISION AS api_cost_total,
        COUNT(*) FILTER (WHERE p.api_cost_usd IS NULL AND apr.rate_per_post_usd IS NOT NULL) AS override_cost_count,
        COALESCE(
          SUM(apr.rate_per_post_usd) FILTER (WHERE p.api_cost_usd IS NULL AND apr.rate_per_post_usd IS NOT NULL),
          0
        )::DOUBLE PRECISION AS override_cost_total
      FROM scoped_posts p
      LEFT JOIN cc_agency_platform_rates apr
        ON apr.agency_key = p.source_key
       AND LOWER(apr.platform) = LOWER(COALESCE(p.platform, ''))
       AND apr.currency = 'USD'
      WHERE p.username IS NOT NULL AND btrim(p.username) <> ''
      GROUP BY LOWER(p.username)
    ),
    creator_agency_pairs AS (
      SELECT DISTINCT
        LOWER(p.username) AS username,
        p.source_key AS agency_key,
        COALESCE(a.name, p.source_key) AS agency_name
      FROM scoped_posts_raw p
      LEFT JOIN cc_agencies a ON a.key = p.source_key
      WHERE p.username IS NOT NULL AND btrim(p.username) <> ''
    ),
    creator_agencies AS (
      SELECT
        cap.username,
        COALESCE(
          JSONB_AGG(
            JSONB_BUILD_OBJECT('key', cap.agency_key, 'name', cap.agency_name)
            ORDER BY cap.agency_name ASC, cap.agency_key ASC
          ),
          '[]'::jsonb
        ) AS agencies
      FROM creator_agency_pairs cap
      GROUP BY cap.username
    ),
    creator_genre_ranked AS (
      SELECT
        egl.entity_id AS username,
        egl.genre_id,
        egl.weight,
        egl.confidence,
        ROW_NUMBER() OVER (
          PARTITION BY egl.entity_id
          ORDER BY egl.weight DESC, egl.genre_id ASC
        ) AS rn
      FROM entity_genre_labels egl
      WHERE egl.entity_type = 'creator'
    ),
    creator_genre_profile AS (
      SELECT
        ranked.username,
        COALESCE(
          JSONB_AGG(
            JSONB_BUILD_OBJECT(
              'genre', ranked.genre_id,
              'weight', ranked.weight,
              'confidence', ranked.confidence
            )
            ORDER BY ranked.weight DESC, ranked.genre_id ASC
          ) FILTER (WHERE ranked.rn <= 2),
          '[]'::jsonb
        ) AS top_genres,
        COALESCE(ROUND((1 - MAX(ranked.weight))::numeric, 4), 0) AS genre_diversity_score
      FROM creator_genre_ranked ranked
      GROUP BY ranked.username
    ),
    campaign_vector AS (
      SELECT
        key AS genre_id,
        value::DOUBLE PRECISION AS weight
      FROM jsonb_each_text($${campaignVectorParamIndex}::jsonb)
    ),
    campaign_vector_totals AS (
      SELECT COALESCE(SUM(weight), 0) AS total_weight
      FROM campaign_vector
    ),
    creator_genre_fit AS (
      SELECT
        egl.entity_id AS username,
        COALESCE(
          SUM(egl.weight::DOUBLE PRECISION * cv.weight)
          / NULLIF((SELECT total_weight FROM campaign_vector_totals), 0),
          0
        ) AS genre_fit_score
      FROM entity_genre_labels egl
      JOIN campaign_vector cv ON LOWER(cv.genre_id) = LOWER(egl.genre_id)
      WHERE egl.entity_type = 'creator'
      GROUP BY egl.entity_id
    )
  `;

  const dataQuery = `
    ${baseCte}
    SELECT
      s.username,
      s.campaign_count,
      s.total_posts,
      s.total_views,
      s.avg_views,
      s.max_views,
      s.success_rate,
      s.platforms,
      s.first_post,
      s.last_post,
      s.first_seen_at,
      s.last_seen_at,
      COALESCE(cgp.top_genres, '[]'::jsonb) AS top_genres,
      COALESCE(cgp.genre_diversity_score, 0) AS genre_diversity_score,
      COALESCE(cgf.genre_fit_score, 0) AS genre_fit_score,
      COALESCE(ca.agencies, '[]'::jsonb) AS agencies,
      CASE
        WHEN s.api_cost_count > 0 AND s.override_cost_count > 0 THEN 'mixed'
        WHEN s.api_cost_count > 0 THEN 'api'
        WHEN s.override_cost_count > 0 THEN 'rate_override'
        ELSE 'none'
      END AS cost_source,
      CASE
        WHEN (s.api_cost_count + s.override_cost_count) > 0
        THEN ROUND((s.api_cost_total + s.override_cost_total)::numeric, 2)
        ELSE NULL
      END AS cost_total_usd,
      (s.first_seen_at >= NOW() - INTERVAL '48 hours') AS is_new_creator,
      ${creatorNeedsReviewSql('s', 'rs')} AS needs_review_creator,
      rs.reviewed_at AS reviewed_creator_at
    FROM creator_stats s
    LEFT JOIN creator_agencies ca ON LOWER(ca.username) = LOWER(s.username)
    LEFT JOIN creator_genre_profile cgp ON LOWER(cgp.username) = LOWER(s.username)
    LEFT JOIN creator_genre_fit cgf ON LOWER(cgf.username) = LOWER(s.username)
    LEFT JOIN cc_creator_review_state rs ON rs.username = s.username
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  const dataValues = [...values, limit, offset];
  const countQuery = `
    ${baseCte}
    SELECT COUNT(*) AS total
    FROM creator_stats s
    LEFT JOIN creator_agencies ca ON LOWER(ca.username) = LOWER(s.username)
    LEFT JOIN creator_genre_profile cgp ON LOWER(cgp.username) = LOWER(s.username)
    LEFT JOIN creator_genre_fit cgf ON LOWER(cgf.username) = LOWER(s.username)
    LEFT JOIN cc_creator_review_state rs ON rs.username = s.username
    ${whereClause}
  `;

  const [rows, countRows] = await runScopedRead(access, (tx) => [
    tx.query(dataQuery, dataValues),
    tx.query(countQuery, values),
  ]) as [Record<string, unknown>[], Array<{ total: string | number }>];

  const total = Number(countRows[0]?.total ?? 0);
  const creators: CreatorSummaryRecord[] = rows.map((creator) => {
    const normalizedPlatforms = Array.isArray(creator.platforms)
      ? creator.platforms.map((platform) => String(platform).trim()).filter(Boolean)
      : [];

    return {
      ...creator,
      username: String(creator.username ?? '').toLowerCase(),
      campaign_count: Number(creator.campaign_count ?? 0),
      total_posts: Number(creator.total_posts ?? 0),
      total_views: Number(creator.total_views ?? 0),
      avg_views: Number(creator.avg_views ?? 0),
      max_views: Number(creator.max_views ?? 0),
      success_rate: Number(creator.success_rate ?? 0),
      platforms: normalizedPlatforms,
      agencies: normalizeCreatorAgencies(creator.agencies),
      genre_diversity_score: clamp01(Number(creator.genre_diversity_score ?? 0)),
      genre_fit_score: clamp01(Number(creator.genre_fit_score ?? 0)),
      top_genres: normalizeGenreLabels(creator.top_genres),
      cost_total_usd: creator.cost_total_usd == null ? null : Number(creator.cost_total_usd),
      cost_source:
        creator.cost_source === 'api' ||
        creator.cost_source === 'rate_override' ||
        creator.cost_source === 'mixed' ||
        creator.cost_source === 'none'
          ? creator.cost_source
          : 'none',
    };
  });

  return {
    creators,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function getCreatorByUsername(access: InfluencerAccessContext, username: string) {
  const orgScope = orgScopeSql('c.org_id', access.orgId, 1, access.role);
  const usernameParamIndex = orgScope.values.length + 1;
  const baseValues: (string | number)[] = [...orgScope.values, username];

  const statsQuery = `
    WITH scoped_posts_raw AS (
      SELECT p.*
      FROM cc_posts p
      JOIN cc_campaigns c ON c.id = p.campaign_pk
      WHERE ${orgScope.clause}
        AND ${nonTestCampaignCondition('c')}
        AND ${nonTestPostCondition('p')}
    ),
    scoped_posts AS (
      SELECT ranked.*
      FROM (
        SELECT
          p.*,
          COALESCE(NULLIF(btrim(p.canonical_post_key), ''), p.source_key || ':' || p.post_id) AS dedupe_key,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(NULLIF(btrim(p.canonical_post_key), ''), p.source_key || ':' || p.post_id)
            ORDER BY COALESCE(p.views, 0) DESC NULLS LAST, p.id DESC
          ) AS rn
        FROM scoped_posts_raw p
        WHERE p.username IS NOT NULL
          AND btrim(p.username) <> ''
          AND LOWER(p.username) = LOWER($${usernameParamIndex})
      ) ranked
      WHERE ranked.rn = 1
    ),
    creator_agency_pairs AS (
      SELECT DISTINCT
        LOWER(p.username) AS username,
        p.source_key AS agency_key,
        COALESCE(a.name, p.source_key) AS agency_name
      FROM scoped_posts_raw p
      LEFT JOIN cc_agencies a ON a.key = p.source_key
      WHERE p.username IS NOT NULL
        AND btrim(p.username) <> ''
        AND LOWER(p.username) = LOWER($${usernameParamIndex})
    ),
    creator_agencies AS (
      SELECT
        cap.username,
        COALESCE(
          JSONB_AGG(
            JSONB_BUILD_OBJECT('key', cap.agency_key, 'name', cap.agency_name)
            ORDER BY cap.agency_name ASC, cap.agency_key ASC
          ),
          '[]'::jsonb
        ) AS agencies
      FROM creator_agency_pairs cap
      GROUP BY cap.username
    )
    SELECT
      LOWER(p.username) AS username,
      COUNT(DISTINCT p.campaign_pk) AS campaign_count,
      COUNT(*) AS total_posts,
      COALESCE(SUM(p.views), 0) AS total_views,
      COALESCE(ROUND(AVG(p.views)), 0) AS avg_views,
      MAX(p.views) AS max_views,
      COALESCE(
        ROUND((100.0 * COUNT(*) FILTER (WHERE p.post_status = 'Success')) / NULLIF(COUNT(*), 0), 1),
        0
      ) AS success_rate,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT p.platform), NULL) AS platforms,
      MIN(p.post_date) AS first_post,
      MAX(p.post_date) AS last_post,
      MIN(COALESCE(p.created_date, p.post_date)) AS first_seen_at,
      MAX(COALESCE(p.created_date, p.post_date)) AS last_seen_at,
      COALESCE(ca.agencies, '[]'::jsonb) AS agencies,
      COUNT(*) FILTER (WHERE p.api_cost_usd IS NOT NULL) AS api_cost_count,
      COALESCE(SUM(p.api_cost_usd) FILTER (WHERE p.api_cost_usd IS NOT NULL), 0)::DOUBLE PRECISION AS api_cost_total,
      COUNT(*) FILTER (WHERE p.api_cost_usd IS NULL AND apr.rate_per_post_usd IS NOT NULL) AS override_cost_count,
      COALESCE(
        SUM(apr.rate_per_post_usd) FILTER (WHERE p.api_cost_usd IS NULL AND apr.rate_per_post_usd IS NOT NULL),
        0
      )::DOUBLE PRECISION AS override_cost_total,
      CASE
        WHEN COUNT(*) FILTER (WHERE p.api_cost_usd IS NOT NULL) > 0
          AND COUNT(*) FILTER (WHERE p.api_cost_usd IS NULL AND apr.rate_per_post_usd IS NOT NULL) > 0
          THEN 'mixed'
        WHEN COUNT(*) FILTER (WHERE p.api_cost_usd IS NOT NULL) > 0
          THEN 'api'
        WHEN COUNT(*) FILTER (WHERE p.api_cost_usd IS NULL AND apr.rate_per_post_usd IS NOT NULL) > 0
          THEN 'rate_override'
        ELSE 'none'
      END AS cost_source,
      CASE
        WHEN (
          COUNT(*) FILTER (WHERE p.api_cost_usd IS NOT NULL)
          + COUNT(*) FILTER (WHERE p.api_cost_usd IS NULL AND apr.rate_per_post_usd IS NOT NULL)
        ) > 0
          THEN ROUND((
            COALESCE(SUM(p.api_cost_usd) FILTER (WHERE p.api_cost_usd IS NOT NULL), 0)
            + COALESCE(SUM(apr.rate_per_post_usd) FILTER (WHERE p.api_cost_usd IS NULL AND apr.rate_per_post_usd IS NOT NULL), 0)
          )::numeric, 2)
        ELSE NULL
      END AS cost_total_usd,
      (MIN(COALESCE(p.created_date, p.post_date)) >= NOW() - INTERVAL '48 hours') AS is_new_creator,
      rs.reviewed_at AS reviewed_creator_at,
      (
        MIN(COALESCE(p.created_date, p.post_date)) >= NOW() - INTERVAL '7 days'
        AND (rs.reviewed_at IS NULL OR rs.reviewed_at < MIN(COALESCE(p.created_date, p.post_date)))
      ) AS needs_review_creator
    FROM scoped_posts p
    LEFT JOIN cc_agency_platform_rates apr
      ON apr.agency_key = p.source_key
     AND LOWER(apr.platform) = LOWER(COALESCE(p.platform, ''))
     AND apr.currency = 'USD'
    LEFT JOIN cc_creator_review_state rs ON rs.username = LOWER(p.username)
    LEFT JOIN creator_agencies ca ON ca.username = LOWER(p.username)
    GROUP BY LOWER(p.username), rs.reviewed_at, ca.agencies
    LIMIT 1
  `;

  const campaignsQuery = `
    SELECT
      c.slug,
      c.title,
      c.genre,
      c.budget,
      COUNT(*) AS post_count,
      COALESCE(SUM(p.views), 0) AS total_views,
      c.created_at
    FROM cc_posts p
    JOIN cc_campaigns c ON c.id = p.campaign_pk
    WHERE ${orgScope.clause}
      AND ${nonTestCampaignCondition('c')}
      AND ${nonTestPostCondition('p')}
      AND LOWER(p.username) = LOWER($${usernameParamIndex})
    GROUP BY c.id, c.slug, c.title, c.genre, c.budget, c.created_at
    ORDER BY c.created_at DESC NULLS LAST
  `;

  const platformQuery = `
    WITH scoped_posts_raw AS (
      SELECT p.*
      FROM cc_posts p
      JOIN cc_campaigns c ON c.id = p.campaign_pk
      WHERE ${orgScope.clause}
        AND ${nonTestCampaignCondition('c')}
        AND ${nonTestPostCondition('p')}
        AND LOWER(p.username) = LOWER($${usernameParamIndex})
    ),
    scoped_posts AS (
      SELECT ranked.*
      FROM (
        SELECT
          p.*,
          COALESCE(NULLIF(btrim(p.canonical_post_key), ''), p.source_key || ':' || p.post_id) AS dedupe_key,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(NULLIF(btrim(p.canonical_post_key), ''), p.source_key || ':' || p.post_id)
            ORDER BY COALESCE(p.views, 0) DESC NULLS LAST, p.id DESC
          ) AS rn
        FROM scoped_posts_raw p
      ) ranked
      WHERE ranked.rn = 1
    )
    SELECT
      p.platform,
      COUNT(*) AS post_count,
      COALESCE(SUM(p.views), 0) AS total_views,
      COALESCE(ROUND(AVG(p.views)), 0) AS avg_views
    FROM scoped_posts p
    GROUP BY p.platform
    ORDER BY total_views DESC NULLS LAST
  `;

  const topGenresQuery = `
    SELECT
      COALESCE(
        JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'genre', ranked.genre_id,
            'weight', ranked.weight,
            'confidence', ranked.confidence
          )
          ORDER BY ranked.weight DESC, ranked.genre_id ASC
        ) FILTER (WHERE ranked.rn <= 5),
        '[]'::jsonb
      ) AS top_genres,
      COALESCE(ROUND((1 - MAX(ranked.weight))::numeric, 4), 0) AS genre_diversity_score
    FROM (
      SELECT
        egl.genre_id,
        egl.weight,
        egl.confidence,
        ROW_NUMBER() OVER (
          PARTITION BY egl.entity_id
          ORDER BY egl.weight DESC, egl.genre_id ASC
        ) AS rn
      FROM entity_genre_labels egl
      WHERE egl.entity_type = 'creator'
        AND LOWER(egl.entity_id) = LOWER($${usernameParamIndex})
    ) ranked
  `;

  const [statsRows, campaigns, platformBreakdown, topGenreRows] = await runScopedRead(access, (tx) => [
    tx.query(statsQuery, baseValues),
    tx.query(campaignsQuery, baseValues),
    tx.query(platformQuery, baseValues),
    tx.query(topGenresQuery, baseValues),
  ]) as [
    Record<string, unknown>[],
    Record<string, unknown>[],
    Record<string, unknown>[],
    Array<{ top_genres: unknown; genre_diversity_score: string | number }>,
  ];

  if (statsRows.length === 0) return null;

  const creator = {
    ...statsRows[0],
    agencies: normalizeCreatorAgencies(statsRows[0]?.agencies),
    cost_total_usd: statsRows[0]?.cost_total_usd == null ? null : Number(statsRows[0]?.cost_total_usd),
    cost_source:
      statsRows[0]?.cost_source === 'api' ||
      statsRows[0]?.cost_source === 'rate_override' ||
      statsRows[0]?.cost_source === 'mixed' ||
      statsRows[0]?.cost_source === 'none'
        ? statsRows[0]?.cost_source
        : 'none',
    top_genres: Array.isArray(topGenreRows[0]?.top_genres) ? topGenreRows[0].top_genres : [],
    genre_diversity_score: clamp01(Number(topGenreRows[0]?.genre_diversity_score ?? 0)),
  };

  return { creator, campaigns, platformBreakdown };
}

export async function getAggregateStats(access: InfluencerAccessContext) {
  const isAdmin = access.role === 'admin';
  const scopedOrg = access.orgId === INFLUENCER_UNKNOWN_ORG_ID ? '__unknown__' : access.orgId;
  const statsScopeClause = isAdmin ? 'TRUE' : `s.org_id = $1`;
  const statsScopeValues = isAdmin ? [] : [scopedOrg];

  const [statsRows] = await runScopedRead(access, (tx) => [
    tx.query(
      `
      WITH scoped_stats AS (
        SELECT *
        FROM cc_dashboard_stats_org_1m s
        WHERE ${statsScopeClause}
      ),
      aggregated AS (
        SELECT
          COALESCE(SUM(total_campaigns), 0) AS total_campaigns,
          COALESCE(SUM(active_campaigns), 0) AS active_campaigns,
          COALESCE(SUM(total_creators), 0) AS total_creators,
          COALESCE(SUM(total_posts), 0) AS total_posts,
          COALESCE(SUM(total_views), 0) AS total_views,
          COALESCE(SUM(verified_views), 0) AS verified_views,
          COALESCE(SUM(total_budget), 0) AS total_budget,
          COALESCE(SUM(genre_count), 0) AS genre_count,
          COALESCE(SUM(new_campaigns_24h), 0) AS new_campaigns_24h,
          COALESCE(SUM(new_campaigns_7d), 0) AS new_campaigns_7d,
          COALESCE(SUM(new_creators_24h), 0) AS new_creators_24h,
          COALESCE(SUM(new_creators_7d), 0) AS new_creators_7d,
          COALESCE(SUM(pending_campaigns_total), 0) AS pending_campaigns_total,
          COALESCE(SUM(pending_campaigns_24h), 0) AS pending_campaigns_24h,
          COALESCE(SUM(campaigns_needing_review), 0) AS campaigns_needing_review,
          COALESCE(SUM(creators_needing_review), 0) AS creators_needing_review,
          MAX(computed_at) AS computed_at
        FROM scoped_stats
      ),
      top_genres AS (
        SELECT COALESCE(
          JSONB_AGG(
            JSONB_BUILD_OBJECT(
              'genre', genre,
              'campaign_count', campaign_count,
              'total_budget', total_budget
            )
            ORDER BY campaign_count DESC, genre ASC
          ),
          '[]'::jsonb
        ) AS items
        FROM (
          SELECT
            g.value->>'genre' AS genre,
            SUM(COALESCE((g.value->>'campaign_count')::BIGINT, 0)) AS campaign_count,
            SUM(COALESCE((g.value->>'total_budget')::NUMERIC, 0)) AS total_budget
          FROM scoped_stats ss
          CROSS JOIN LATERAL jsonb_array_elements(ss.top_genres) AS g(value)
          GROUP BY g.value->>'genre'
          ORDER BY campaign_count DESC, genre ASC
          LIMIT 10
        ) ranked
      ),
      top_platforms AS (
        SELECT COALESCE(
          JSONB_AGG(
            JSONB_BUILD_OBJECT(
              'platform', platform,
              'post_count', post_count,
              'total_views', total_views
            )
            ORDER BY total_views DESC, platform ASC
          ),
          '[]'::jsonb
        ) AS items
        FROM (
          SELECT
            p.value->>'platform' AS platform,
            SUM(COALESCE((p.value->>'post_count')::BIGINT, 0)) AS post_count,
            SUM(COALESCE((p.value->>'total_views')::NUMERIC, 0)) AS total_views
          FROM scoped_stats ss
          CROSS JOIN LATERAL jsonb_array_elements(ss.top_platforms) AS p(value)
          GROUP BY p.value->>'platform'
          ORDER BY total_views DESC, platform ASC
          LIMIT 10
        ) ranked
      )
      SELECT
        a.*,
        g.items AS top_genres,
        p.items AS top_platforms
      FROM aggregated a
      CROSS JOIN top_genres g
      CROSS JOIN top_platforms p
      `,
      statsScopeValues
    ),
  ]) as [Array<Record<string, unknown>>];

  const cacheRow = statsRows[0];
  if (cacheRow && Number(cacheRow.total_campaigns ?? 0) > 0) {
    return cacheRow;
  }

  const orgScope = orgScopeSql('c.org_id', access.orgId, 1, access.role);
  const values = [...orgScope.values];
  const [fallbackRows] = await runScopedRead(access, (tx) => [
    tx.query(
      `
      WITH scoped_campaigns AS (
        SELECT *
        FROM cc_campaigns c
        WHERE ${orgScope.clause}
          AND ${nonTestCampaignCondition('c')}
      ),
      scoped_metrics AS (
        SELECT
          c.id,
          c.archived,
          c.budget,
          c.genre,
          COALESCE(c.first_seen_at, c.created_at, NOW()) AS first_seen_at,
          COALESCE(cm.actual_posts, 0) AS actual_posts,
          COALESCE(cm.total_views, 0) AS total_views,
          COALESCE(cm.verified_views, 0) AS verified_views,
          COALESCE(cm.quality_status, 'missing_posts') AS quality_status
        FROM scoped_campaigns c
        LEFT JOIN cc_campaign_metrics cm ON cm.campaign_pk = c.id
      ),
      scoped_posts AS (
        SELECT p.*
        FROM cc_posts p
        JOIN scoped_campaigns c ON c.id = p.campaign_pk
        WHERE ${nonTestPostCondition('p')}
      )
      SELECT
        (SELECT COUNT(*) FROM scoped_campaigns) AS total_campaigns,
        (SELECT COUNT(*) FROM scoped_campaigns WHERE NOT archived) AS active_campaigns,
        (SELECT COUNT(DISTINCT LOWER(username)) FROM scoped_posts WHERE username IS NOT NULL AND btrim(username) <> '') AS total_creators,
        (SELECT COUNT(*) FROM scoped_posts) AS total_posts,
        (SELECT COALESCE(SUM(total_views), 0) FROM scoped_metrics) AS total_views,
        (SELECT COALESCE(SUM(verified_views), 0) FROM scoped_metrics) AS verified_views,
        (SELECT COALESCE(SUM(budget), 0) FROM scoped_campaigns WHERE budget IS NOT NULL) AS total_budget,
        (SELECT COUNT(DISTINCT genre) FROM scoped_campaigns WHERE genre IS NOT NULL) AS genre_count,
        (SELECT COUNT(*) FROM scoped_campaigns WHERE COALESCE(first_seen_at, created_at, NOW()) >= NOW() - INTERVAL '24 hours') AS new_campaigns_24h,
        (SELECT COUNT(*) FROM scoped_campaigns WHERE COALESCE(first_seen_at, created_at, NOW()) >= NOW() - INTERVAL '7 days') AS new_campaigns_7d,
        (
          SELECT COUNT(*)
          FROM (
            SELECT LOWER(username) AS username, MIN(COALESCE(created_date, post_date, NOW())) AS first_seen_at
            FROM scoped_posts
            WHERE username IS NOT NULL AND btrim(username) <> ''
            GROUP BY LOWER(username)
          ) s
          WHERE s.first_seen_at >= NOW() - INTERVAL '24 hours'
        ) AS new_creators_24h,
        (
          SELECT COUNT(*)
          FROM (
            SELECT LOWER(username) AS username, MIN(COALESCE(created_date, post_date, NOW())) AS first_seen_at
            FROM scoped_posts
            WHERE username IS NOT NULL AND btrim(username) <> ''
            GROUP BY LOWER(username)
          ) s
          WHERE s.first_seen_at >= NOW() - INTERVAL '7 days'
        ) AS new_creators_7d,
        (
          SELECT COUNT(*)
          FROM scoped_metrics m
          WHERE m.first_seen_at >= NOW() - INTERVAL '14 days'
            AND m.first_seen_at <= NOW() - INTERVAL '30 minutes'
            AND m.quality_status IN ('missing_posts', 'placeholder_links_only', 'missing_core_metadata')
        ) AS pending_campaigns_total,
        (
          SELECT COUNT(*)
          FROM scoped_metrics m
          WHERE m.first_seen_at >= NOW() - INTERVAL '24 hours'
            AND m.first_seen_at <= NOW() - INTERVAL '30 minutes'
            AND m.quality_status IN ('missing_posts', 'placeholder_links_only', 'missing_core_metadata')
        ) AS pending_campaigns_24h,
        (
          SELECT COUNT(*)
          FROM scoped_campaigns c
          LEFT JOIN cc_campaign_review_state cr ON cr.campaign_pk = c.id
          WHERE ${campaignNeedsReviewSql('c', 'cr')}
        ) AS campaigns_needing_review,
        (
          SELECT COUNT(*)
          FROM (
            SELECT LOWER(p.username) AS username, MIN(COALESCE(p.created_date, p.post_date, NOW())) AS first_seen_at
            FROM scoped_posts p
            WHERE p.username IS NOT NULL AND btrim(p.username) <> ''
            GROUP BY LOWER(p.username)
          ) cs
          LEFT JOIN cc_creator_review_state rs ON rs.username = cs.username
          WHERE cs.first_seen_at >= NOW() - INTERVAL '7 days'
            AND (rs.reviewed_at IS NULL OR rs.reviewed_at < cs.first_seen_at)
        ) AS creators_needing_review,
        (
          SELECT COALESCE(
            JSONB_AGG(
              JSONB_BUILD_OBJECT(
                'genre', ranked.genre,
                'campaign_count', ranked.campaign_count,
                'total_budget', ranked.total_budget
              )
              ORDER BY ranked.campaign_count DESC, ranked.genre ASC
            ),
            '[]'::jsonb
          )
          FROM (
            SELECT
              genre,
              COUNT(*) AS campaign_count,
              COALESCE(SUM(budget), 0) AS total_budget
            FROM scoped_campaigns
            WHERE genre IS NOT NULL
            GROUP BY genre
            ORDER BY campaign_count DESC, genre ASC
            LIMIT 10
          ) ranked
        ) AS top_genres,
        (
          SELECT COALESCE(
            JSONB_AGG(
              JSONB_BUILD_OBJECT(
                'platform', ranked.platform,
                'post_count', ranked.post_count,
                'total_views', ranked.total_views
              )
              ORDER BY ranked.total_views DESC, ranked.platform ASC
            ),
            '[]'::jsonb
          )
          FROM (
            SELECT
              p.platform,
              COUNT(*) AS post_count,
              COALESCE(SUM(p.views), 0) AS total_views
            FROM scoped_posts p
            WHERE p.platform IS NOT NULL AND btrim(p.platform) <> ''
            GROUP BY p.platform
            ORDER BY total_views DESC, p.platform ASC
            LIMIT 10
          ) ranked
        ) AS top_platforms
      `,
      values
    ),
  ]) as [Array<Record<string, unknown>>];

  return fallbackRows[0] ?? {
    total_campaigns: 0,
    active_campaigns: 0,
    total_creators: 0,
    total_posts: 0,
    total_views: 0,
    verified_views: 0,
    total_budget: 0,
    genre_count: 0,
    new_campaigns_24h: 0,
    new_campaigns_7d: 0,
    new_creators_24h: 0,
    new_creators_7d: 0,
    pending_campaigns_total: 0,
    pending_campaigns_24h: 0,
    campaigns_needing_review: 0,
    creators_needing_review: 0,
    top_genres: [],
    top_platforms: [],
  };
}

export interface AgencyListRow {
  key: string;
  name: string;
}

export async function getAgencyList(access: InfluencerAccessContext): Promise<AgencyListRow[]> {
  const orgScope = orgScopeSql('c.org_id', access.orgId, 1, access.role);
  const values = [...orgScope.values];

  const [rows] = await runScopedRead(access, (tx) => [
    tx.query(
      `
      WITH scoped_sources AS (
        SELECT DISTINCT c.source_key
        FROM cc_campaigns c
        WHERE ${orgScope.clause}
          AND ${nonTestCampaignCondition('c')}
          AND c.source_key IS NOT NULL
          AND btrim(c.source_key) <> ''
      )
      SELECT
        s.source_key AS key,
        COALESCE(a.name, s.source_key) AS name
      FROM scoped_sources s
      LEFT JOIN cc_agencies a ON a.key = s.source_key
      ORDER BY COALESCE(a.name, s.source_key) ASC
      `,
      values
    ),
  ]) as [Array<{ key: string; name: string }>];

  return rows
    .map((row) => ({
      key: String(row.key || '').trim().toLowerCase(),
      name: String(row.name || '').trim(),
    }))
    .filter((row) => row.key && row.name);
}

export interface AgencyRateRow {
  agency_key: string;
  agency_name: string;
  currency: string;
  platform: string;
  rate_per_post_usd: number;
}

export async function getAgencyPlatformRates(access: InfluencerAccessContext): Promise<AgencyRateRow[]> {
  const orgScope = orgScopeSql('c.org_id', access.orgId, 1, access.role);
  const values = [...orgScope.values];

  const [rows] = await runScopedRead(access, (tx) => [
    tx.query(
      `
      WITH scoped_sources AS (
        SELECT DISTINCT c.source_key
        FROM cc_campaigns c
        WHERE ${orgScope.clause}
          AND ${nonTestCampaignCondition('c')}
          AND c.source_key IS NOT NULL
          AND btrim(c.source_key) <> ''
      )
      SELECT
        r.agency_key,
        COALESCE(a.name, r.agency_key) AS agency_name,
        r.platform,
        r.rate_per_post_usd,
        r.currency
      FROM cc_agency_platform_rates r
      JOIN scoped_sources s ON s.source_key = r.agency_key
      LEFT JOIN cc_agencies a ON a.key = r.agency_key
      ORDER BY COALESCE(a.name, r.agency_key) ASC, r.platform ASC
      `,
      values
    ),
  ]) as [Array<{
    agency_key: string;
    agency_name: string;
    currency: string;
    platform: string;
    rate_per_post_usd: string | number;
  }>];

  return rows.map((row) => ({
    agency_key: String(row.agency_key || '').trim().toLowerCase(),
    agency_name: String(row.agency_name || '').trim(),
    platform: String(row.platform || '').trim().toLowerCase(),
    rate_per_post_usd: Number(row.rate_per_post_usd ?? 0),
    currency: String(row.currency || 'USD').trim().toUpperCase(),
  }));
}

export interface AgencyRateInput {
  agency_key: string;
  platform: string;
  rate_per_post_usd: number;
  currency?: string;
}

export async function upsertAgencyPlatformRates(
  access: InfluencerAccessContext,
  rates: AgencyRateInput[]
): Promise<AgencyRateRow[]> {
  if (rates.length === 0) return [];

  const normalized = rates
    .map((rate) => ({
      agency_key: String(rate.agency_key || '').trim().toLowerCase(),
      platform: String(rate.platform || '').trim().toLowerCase(),
      rate_per_post_usd: Number(rate.rate_per_post_usd),
      currency: String(rate.currency || 'USD').trim().toUpperCase() || 'USD',
    }))
    .filter((rate) => rate.agency_key && rate.platform && Number.isFinite(rate.rate_per_post_usd) && rate.rate_per_post_usd >= 0);

  if (normalized.length === 0) return [];

  await runScopedWrite(access, (tx) => [
    ...normalized.map((rate) => tx.query(
      `
      INSERT INTO cc_agency_platform_rates (agency_key, platform, rate_per_post_usd, currency, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (agency_key, platform) DO UPDATE
      SET
        rate_per_post_usd = EXCLUDED.rate_per_post_usd,
        currency = EXCLUDED.currency,
        updated_at = NOW()
      `,
      [rate.agency_key, rate.platform, rate.rate_per_post_usd, rate.currency]
    )),
  ]);

  return getAgencyPlatformRates(access);
}

export async function markCampaignReviewed(access: InfluencerAccessContext, campaignPk: number): Promise<boolean> {
  if (!Number.isFinite(campaignPk) || campaignPk <= 0) return false;

  const orgScope = orgScopeSql('c.org_id', access.orgId, 2, access.role);
  const values: (string | number)[] = [campaignPk, ...orgScope.values];

  const [rows] = await runScopedWrite(access, (tx) => [
    tx.query(
      `
      WITH target AS (
        SELECT c.id
        FROM cc_campaigns c
        WHERE c.id = $1
          AND ${orgScope.clause}
        LIMIT 1
      )
      INSERT INTO cc_campaign_review_state (campaign_pk, reviewed_at, reviewed_by, updated_at)
      SELECT id, NOW(), $${values.length + 1}, NOW()
      FROM target
      ON CONFLICT (campaign_pk) DO UPDATE
      SET
        reviewed_at = EXCLUDED.reviewed_at,
        reviewed_by = EXCLUDED.reviewed_by,
        updated_at = NOW()
      RETURNING campaign_pk
      `,
      [...values, access.userId]
    ),
  ]) as [Array<{ campaign_pk: number }>];

  return rows.length > 0;
}

export async function markCreatorReviewed(access: InfluencerAccessContext, username: string): Promise<boolean> {
  const normalized = username.trim().toLowerCase();
  if (!normalized) return false;

  const orgScope = orgScopeSql('c.org_id', access.orgId, 2, access.role);
  const values: (string | number)[] = [normalized, ...orgScope.values];

  const [rows] = await runScopedWrite(access, (tx) => [
    tx.query(
      `
      WITH target AS (
        SELECT
          LOWER(p.username) AS username,
          MIN(COALESCE(p.created_date, p.post_date, NOW())) AS first_seen_at,
          MAX(COALESCE(p.created_date, p.post_date, NOW())) AS last_seen_at
        FROM cc_posts p
        JOIN cc_campaigns c ON c.id = p.campaign_pk
        WHERE LOWER(p.username) = LOWER($1)
          AND ${orgScope.clause}
        GROUP BY LOWER(p.username)
        LIMIT 1
      ),
      upsert_creator AS (
        INSERT INTO cc_creators (username, first_seen_at, last_seen_at)
        SELECT username, first_seen_at, last_seen_at
        FROM target
        ON CONFLICT (username) DO UPDATE
        SET
          first_seen_at = LEAST(cc_creators.first_seen_at, EXCLUDED.first_seen_at),
          last_seen_at = GREATEST(cc_creators.last_seen_at, EXCLUDED.last_seen_at)
        RETURNING username
      )
      INSERT INTO cc_creator_review_state (username, reviewed_at, reviewed_by, updated_at)
      SELECT username, NOW(), $${values.length + 1}, NOW()
      FROM upsert_creator
      ON CONFLICT (username) DO UPDATE
      SET
        reviewed_at = EXCLUDED.reviewed_at,
        reviewed_by = EXCLUDED.reviewed_by,
        updated_at = NOW()
      RETURNING username
      `,
      [...values, access.userId]
    ),
  ]) as [Array<{ username: string }>];

  return rows.length > 0;
}

export async function resolveCampaignPkBySlug(
  access: InfluencerAccessContext,
  slug: string
): Promise<number | null> {
  const trimmedSlug = slug.trim();
  if (!trimmedSlug) return null;

  const [rows] = await runScopedRead(access, (tx) => [
    tx.query(
      `
      SELECT id
      FROM cc_campaigns
      WHERE slug = $1
        AND ${nonTestCampaignCondition('cc_campaigns')}
      LIMIT 1
      `,
      [trimmedSlug]
    ),
  ]) as [Array<{ id: string | number }>];

  const id = Number(rows[0]?.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

export interface RecommendationRunInput {
  budget?: number | null;
  campaignPk: number;
  metadata?: Record<string, unknown>;
  objective?: string | null;
  riskMode?: string | null;
  status?: string;
}

export async function createRecommendationRun(
  access: InfluencerAccessContext,
  input: RecommendationRunInput
): Promise<string> {
  const campaignPk = Number(input.campaignPk);
  if (!Number.isFinite(campaignPk) || campaignPk <= 0) {
    throw new Error('Invalid campaign PK');
  }

  const runId = randomUUID();
  const [rows] = await runScopedWrite(access, (tx) => [
    tx.query(
      `
      WITH eligible_campaign AS (
        SELECT id
        FROM cc_campaigns
        WHERE id = $1
        LIMIT 1
      )
      INSERT INTO campaign_recommendation_runs (
        run_id, campaign_pk, budget, objective, status, risk_mode, metadata
      )
      SELECT
        $2,
        id,
        $3,
        $4,
        $5,
        $6,
        $7::jsonb
      FROM eligible_campaign
      RETURNING run_id
      `,
      [
        campaignPk,
        runId,
        input.budget ?? null,
        input.objective ?? null,
        input.status || 'pending',
        input.riskMode ?? null,
        JSON.stringify(input.metadata ?? {}),
      ]
    ),
  ]) as [Array<{ run_id: string }>];

  if (!rows[0]?.run_id) {
    throw new Error('Campaign not found or not accessible');
  }
  return rows[0].run_id;
}

export interface RecommendationRowInput {
  creatorId: string;
  estimatedSpend?: number | null;
  rank: number;
  rationale: Record<string, unknown>;
  score: number;
  scoreBreakdown: Record<string, unknown>;
  status: string;
}

export async function replaceRecommendationsForRun(
  access: InfluencerAccessContext,
  runId: string,
  recommendations: RecommendationRowInput[]
): Promise<void> {
  const trimmedRunId = runId.trim();
  if (!trimmedRunId) throw new Error('runId is required');

  const queries = [
    (tx: TxQuery) => tx.query(
      `
      DELETE FROM campaign_recommendations
      WHERE run_id = $1
      `,
      [trimmedRunId]
    ),
    ...recommendations.map((recommendation) => (tx: TxQuery) => tx.query(
      `
      INSERT INTO campaign_recommendations (
        run_id, creator_id, rank, score, score_breakdown, rationale, status, estimated_spend
      )
      SELECT
        $1,
        $2,
        $3,
        $4,
        $5::jsonb,
        $6::jsonb,
        $7,
        $8
      WHERE EXISTS (
        SELECT 1
        FROM campaign_recommendation_runs rr
        JOIN cc_campaigns c ON c.id = rr.campaign_pk
        WHERE rr.run_id = $1
          AND c.id IS NOT NULL
      )
      `,
      [
        trimmedRunId,
        recommendation.creatorId.toLowerCase(),
        recommendation.rank,
        clamp01(recommendation.score),
        JSON.stringify(recommendation.scoreBreakdown ?? {}),
        JSON.stringify(recommendation.rationale ?? {}),
        recommendation.status,
        recommendation.estimatedSpend ?? null,
      ]
    )),
  ];

  await runScopedWrite(access, (tx) => queries.map((queryBuilder) => queryBuilder(tx)));
}

export async function finalizeRecommendationRun(
  access: InfluencerAccessContext,
  runId: string,
  status: string = 'completed'
): Promise<void> {
  const trimmedRunId = runId.trim();
  if (!trimmedRunId) return;

  await runScopedWrite(access, (tx) => [
    tx.query(
      `
      UPDATE campaign_recommendation_runs rr
      SET
        status = $2,
        completed_at = NOW()
      FROM cc_campaigns c
      WHERE rr.run_id = $1
        AND c.id = rr.campaign_pk
        AND c.id IS NOT NULL
      `,
      [trimmedRunId, status]
    ),
  ]);
}

export interface CampaignSwipeInput {
  action: 'left' | 'right' | 'maybe';
  creatorId: string;
  note?: string;
  runId: string;
}

export async function recordCampaignSwipe(
  access: InfluencerAccessContext,
  input: CampaignSwipeInput
): Promise<boolean> {
  const runId = input.runId.trim();
  const creatorId = input.creatorId.trim().toLowerCase();
  const note = input.note?.trim() || null;
  if (!runId || !creatorId) return false;

  const [rows] = await runScopedWrite(access, (tx) => [
    tx.query(
      `
      INSERT INTO campaign_swipes (run_id, creator_id, action, actor_user_id, note)
      SELECT
        rr.run_id,
        $2,
        $3,
        $4,
        $5
      FROM campaign_recommendation_runs rr
      JOIN cc_campaigns c ON c.id = rr.campaign_pk
      WHERE rr.run_id = $1
      RETURNING id
      `,
      [runId, creatorId, input.action, access.userId, note]
    ),
  ]) as [Array<{ id: number } >];

  return rows.length > 0;
}

export interface TrackRecordInput {
  artist: string;
  campaignPk?: number | null;
  isrc?: string | null;
  title: string;
}

export async function createTrackRecord(
  access: InfluencerAccessContext,
  input: TrackRecordInput
): Promise<{ trackId: string; uploadedAt: string }> {
  const trackId = randomUUID();
  const campaignPk =
    input.campaignPk != null && Number.isFinite(input.campaignPk) && Number(input.campaignPk) > 0
      ? Number(input.campaignPk)
      : null;

  const [rows] = await runScopedWrite(access, (tx) => [
    tx.query(
      `
      INSERT INTO tracks (track_id, campaign_pk, artist, title, isrc, uploaded_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING track_id, uploaded_at
      `,
      [trackId, campaignPk, input.artist, input.title, input.isrc ?? null]
    ),
  ]) as [Array<{ track_id: string; uploaded_at: string }>];

  if (!rows[0]?.track_id) {
    throw new Error('Failed to create track');
  }
  return { trackId: rows[0].track_id, uploadedAt: rows[0].uploaded_at };
}

export async function getTrackRecord(
  access: InfluencerAccessContext,
  trackId: string
): Promise<Record<string, unknown> | null> {
  const normalized = trackId.trim();
  if (!normalized) return null;

  const [rows] = await runScopedRead(access, (tx) => [
    tx.query(
      `
      SELECT
        t.track_id,
        t.campaign_pk,
        t.artist,
        t.title,
        t.isrc,
        t.uploaded_at,
        c.slug AS campaign_slug,
        c.genre AS campaign_genre
      FROM tracks t
      LEFT JOIN cc_campaigns c ON c.id = t.campaign_pk
      WHERE t.track_id = $1
      LIMIT 1
      `,
      [normalized]
    ),
  ]) as [Record<string, unknown>[]];

  return rows[0] ?? null;
}

export interface TrackAnalysisInput {
  danceability: number;
  energy: number;
  key: string;
  mode: string;
  tempo: number;
  valence: number;
}

export async function upsertTrackAnalysis(
  access: InfluencerAccessContext,
  trackId: string,
  analysis: TrackAnalysisInput
): Promise<void> {
  const normalized = trackId.trim();
  if (!normalized) throw new Error('trackId is required');

  await runScopedWrite(access, (tx) => [
    tx.query(
      `
      INSERT INTO track_audio_features (
        track_id,
        tempo,
        key,
        mode,
        energy,
        danceability,
        valence,
        extracted_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (track_id) DO UPDATE
      SET
        tempo = EXCLUDED.tempo,
        key = EXCLUDED.key,
        mode = EXCLUDED.mode,
        energy = EXCLUDED.energy,
        danceability = EXCLUDED.danceability,
        valence = EXCLUDED.valence,
        extracted_at = NOW()
      `,
      [
        normalized,
        analysis.tempo,
        analysis.key,
        analysis.mode,
        analysis.energy,
        analysis.danceability,
        analysis.valence,
      ]
    ),
  ]);
}

export async function addTrackChartObservation(
  access: InfluencerAccessContext,
  trackId: string,
  source: string,
  chartName: string,
  rank: number,
  momentum: number,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const normalized = trackId.trim();
  if (!normalized) throw new Error('trackId is required');

  await runScopedWrite(access, (tx) => [
    tx.query(
      `
      INSERT INTO chart_observations (
        track_id,
        source,
        chart_name,
        observed_at,
        rank,
        momentum,
        metadata
      )
      VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6::jsonb)
      `,
      [normalized, source, chartName, rank, momentum, JSON.stringify(metadata)]
    ),
  ]);
}

export interface EntityGenreLabelUpsertInput {
  confidence: number;
  entityId: string;
  entityType: 'campaign' | 'creator' | 'track';
  evidence?: Record<string, unknown>;
  genreId: string;
  source: string;
  weight: number;
}

export async function upsertEntityGenreLabel(
  access: InfluencerAccessContext,
  input: EntityGenreLabelUpsertInput
): Promise<void> {
  const entityId = input.entityId.trim();
  const genreId = input.genreId.trim();
  if (!entityId || !genreId) return;

  await runScopedWrite(access, (tx) => [
    tx.query(
      `
      INSERT INTO entity_genre_labels (
        entity_type, entity_id, genre_id, weight, confidence, source, evidence, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
      ON CONFLICT (entity_type, entity_id, genre_id) DO UPDATE
      SET
        weight = EXCLUDED.weight,
        confidence = EXCLUDED.confidence,
        source = EXCLUDED.source,
        evidence = EXCLUDED.evidence,
        updated_at = NOW()
      `,
      [
        input.entityType,
        entityId,
        genreId,
        clamp01(input.weight),
        clamp01(input.confidence),
        input.source,
        JSON.stringify(input.evidence ?? {}),
      ]
    ),
  ]);
}
