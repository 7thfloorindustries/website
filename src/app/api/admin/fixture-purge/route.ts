import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  neon,
  type NeonQueryFunction,
  type NeonQueryFunctionInTransaction,
} from '@neondatabase/serverless';
import { ensureCreatorCoreSchema } from '@/lib/creatorcore/schema';
import { getInfluencerSession } from '@/lib/influencer/auth';

export const dynamic = 'force-dynamic';

type TxQuery = NeonQueryFunctionInTransaction<false, false>;

const FIXTURE_CAMPAIGN_WHERE = `
(
  (c.title ILIKE 'Genre Sort %' OR c.title ILIKE 'Hydrated %')
  AND c.source_key ~ '^it[a-z0-9]+_source_[ab]$'
)
`;

const FIXTURE_POST_WHERE = `
(
  p.post_url ILIKE 'https://example.com/%'
  AND p.source_key ~ '^it[a-z0-9]+_source_[ab]$'
)
`;

interface CountRows {
  campaign_count: string | number;
  post_count: string | number;
  recommendation_count: string | number;
  swipe_count: string | number;
}

interface PurgeCounts {
  campaignCount: number;
  postCount: number;
  recommendationCount: number;
  swipeCount: number;
}

function toNumber(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function countsFromRow(row?: CountRows): PurgeCounts {
  return {
    campaignCount: toNumber(row?.campaign_count),
    postCount: toNumber(row?.post_count),
    recommendationCount: toNumber(row?.recommendation_count),
    swipeCount: toNumber(row?.swipe_count),
  };
}

async function runWithSystemContext<T>(
  sql: NeonQueryFunction<false, false>,
  buildQueries: (tx: TxQuery) => ReturnType<TxQuery>[]
): Promise<T> {
  const results = await sql.transaction((tx) => [
    tx`SELECT set_config('app.current_org_id', '', true)`,
    tx`SELECT set_config('app.current_role', 'system', true)`,
    ...buildQueries(tx as TxQuery),
  ]);

  return results.slice(2) as T;
}

async function ensureArchiveTables(sql: NeonQueryFunction<false, false>): Promise<void> {
  await runWithSystemContext(sql, (tx) => [
    tx`
      CREATE TABLE IF NOT EXISTS cc_campaigns_fixture_archive (
        LIKE cc_campaigns INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES
      )
    `,
    tx`ALTER TABLE cc_campaigns_fixture_archive ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    tx`ALTER TABLE cc_campaigns_fixture_archive ADD COLUMN IF NOT EXISTS purge_run_id TEXT NOT NULL DEFAULT ''`,
    tx`
      CREATE TABLE IF NOT EXISTS cc_posts_fixture_archive (
        LIKE cc_posts INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES
      )
    `,
    tx`ALTER TABLE cc_posts_fixture_archive ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    tx`ALTER TABLE cc_posts_fixture_archive ADD COLUMN IF NOT EXISTS purge_run_id TEXT NOT NULL DEFAULT ''`,
    tx`
      CREATE TABLE IF NOT EXISTS campaign_recommendations_fixture_archive (
        LIKE campaign_recommendations INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES
      )
    `,
    tx`ALTER TABLE campaign_recommendations_fixture_archive ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    tx`ALTER TABLE campaign_recommendations_fixture_archive ADD COLUMN IF NOT EXISTS purge_run_id TEXT NOT NULL DEFAULT ''`,
    tx`
      CREATE TABLE IF NOT EXISTS campaign_swipes_fixture_archive (
        LIKE campaign_swipes INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES
      )
    `,
    tx`ALTER TABLE campaign_swipes_fixture_archive ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    tx`ALTER TABLE campaign_swipes_fixture_archive ADD COLUMN IF NOT EXISTS purge_run_id TEXT NOT NULL DEFAULT ''`,
    tx`
      CREATE TABLE IF NOT EXISTS cc_fixture_purge_audit (
        run_id TEXT PRIMARY KEY,
        dry_run BOOLEAN NOT NULL DEFAULT TRUE,
        rows_archived_campaigns INTEGER NOT NULL DEFAULT 0,
        rows_archived_posts INTEGER NOT NULL DEFAULT 0,
        rows_archived_recommendations INTEGER NOT NULL DEFAULT 0,
        rows_archived_swipes INTEGER NOT NULL DEFAULT 0,
        rows_deleted_campaigns INTEGER NOT NULL DEFAULT 0,
        rows_deleted_posts INTEGER NOT NULL DEFAULT 0,
        rows_deleted_recommendations INTEGER NOT NULL DEFAULT 0,
        rows_deleted_swipes INTEGER NOT NULL DEFAULT 0,
        execution_time_ms INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        error_message TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ NULL
      )
    `,
  ]);
}

async function getFixtureCounts(sql: NeonQueryFunction<false, false>): Promise<PurgeCounts> {
  const [rows] = await runWithSystemContext<[CountRows[]]>(sql, (tx) => [
    tx.query(
      `
      WITH campaign_candidates AS (
        SELECT c.id
        FROM cc_campaigns c
        WHERE ${FIXTURE_CAMPAIGN_WHERE}
      ),
      post_candidates AS (
        SELECT DISTINCT p.id
        FROM cc_posts p
        LEFT JOIN campaign_candidates cc ON cc.id = p.campaign_pk
        WHERE ${FIXTURE_POST_WHERE}
           OR cc.id IS NOT NULL
      ),
      recommendation_candidates AS (
        SELECT DISTINCT cr.run_id, cr.creator_id
        FROM campaign_recommendations cr
        JOIN campaign_recommendation_runs rr ON rr.run_id = cr.run_id
        JOIN campaign_candidates cc ON cc.id = rr.campaign_pk
      ),
      swipe_candidates AS (
        SELECT DISTINCT s.id
        FROM campaign_swipes s
        JOIN campaign_recommendation_runs rr ON rr.run_id = s.run_id
        JOIN campaign_candidates cc ON cc.id = rr.campaign_pk
      )
      SELECT
        (SELECT COUNT(*) FROM campaign_candidates) AS campaign_count,
        (SELECT COUNT(*) FROM post_candidates) AS post_count,
        (SELECT COUNT(*) FROM recommendation_candidates) AS recommendation_count,
        (SELECT COUNT(*) FROM swipe_candidates) AS swipe_count
      `
    ),
  ]);
  return countsFromRow(rows?.[0]);
}

async function executePurge(sql: NeonQueryFunction<false, false>, runId: string): Promise<PurgeCounts> {
  const [archiveCampaignsRows, archivePostsRows, archiveRecommendationsRows, archiveSwipesRows, deleteSwipesRows, deleteRecommendationsRows, deleteRunsRows, deletePostsRows, deleteCampaignsRows] = await runWithSystemContext<
    [
      Array<{ archived: string | number }>,
      Array<{ archived: string | number }>,
      Array<{ archived: string | number }>,
      Array<{ archived: string | number }>,
      Array<{ deleted: string | number }>,
      Array<{ deleted: string | number }>,
      Array<{ deleted: string | number }>,
      Array<{ deleted: string | number }>,
      Array<{ deleted: string | number }>,
    ]
  >(sql, (tx) => [
    tx.query(
      `
      WITH campaign_candidates AS (
        SELECT c.*
        FROM cc_campaigns c
        WHERE ${FIXTURE_CAMPAIGN_WHERE}
      )
      INSERT INTO cc_campaigns_fixture_archive
      SELECT campaign_candidates.*, NOW(), $1
      FROM campaign_candidates
      ON CONFLICT (id) DO NOTHING
      RETURNING 1
      `,
      [runId]
    ),
    tx.query(
      `
      WITH campaign_candidates AS (
        SELECT c.id
        FROM cc_campaigns c
        WHERE ${FIXTURE_CAMPAIGN_WHERE}
      ),
      post_candidates AS (
        SELECT DISTINCT p.*
        FROM cc_posts p
        LEFT JOIN campaign_candidates cc ON cc.id = p.campaign_pk
        WHERE ${FIXTURE_POST_WHERE}
           OR cc.id IS NOT NULL
      )
      INSERT INTO cc_posts_fixture_archive
      SELECT post_candidates.*, NOW(), $1
      FROM post_candidates
      ON CONFLICT (id) DO NOTHING
      RETURNING 1
      `,
      [runId]
    ),
    tx.query(
      `
      WITH campaign_candidates AS (
        SELECT c.id
        FROM cc_campaigns c
        WHERE ${FIXTURE_CAMPAIGN_WHERE}
      ),
      recommendation_candidates AS (
        SELECT DISTINCT cr.*
        FROM campaign_recommendations cr
        JOIN campaign_recommendation_runs rr ON rr.run_id = cr.run_id
        JOIN campaign_candidates cc ON cc.id = rr.campaign_pk
      )
      INSERT INTO campaign_recommendations_fixture_archive
      SELECT recommendation_candidates.*, NOW(), $1
      FROM recommendation_candidates
      ON CONFLICT (run_id, creator_id) DO NOTHING
      RETURNING 1
      `,
      [runId]
    ),
    tx.query(
      `
      WITH campaign_candidates AS (
        SELECT c.id
        FROM cc_campaigns c
        WHERE ${FIXTURE_CAMPAIGN_WHERE}
      ),
      swipe_candidates AS (
        SELECT DISTINCT s.*
        FROM campaign_swipes s
        JOIN campaign_recommendation_runs rr ON rr.run_id = s.run_id
        JOIN campaign_candidates cc ON cc.id = rr.campaign_pk
      )
      INSERT INTO campaign_swipes_fixture_archive
      SELECT swipe_candidates.*, NOW(), $1
      FROM swipe_candidates
      ON CONFLICT (id) DO NOTHING
      RETURNING 1
      `,
      [runId]
    ),
    tx.query(
      `
      WITH campaign_candidates AS (
        SELECT c.id
        FROM cc_campaigns c
        WHERE ${FIXTURE_CAMPAIGN_WHERE}
      )
      DELETE FROM campaign_swipes s
      USING campaign_recommendation_runs rr, campaign_candidates cc
      WHERE s.run_id = rr.run_id
        AND rr.campaign_pk = cc.id
      RETURNING 1
      `
    ),
    tx.query(
      `
      WITH campaign_candidates AS (
        SELECT c.id
        FROM cc_campaigns c
        WHERE ${FIXTURE_CAMPAIGN_WHERE}
      )
      DELETE FROM campaign_recommendations cr
      USING campaign_recommendation_runs rr, campaign_candidates cc
      WHERE cr.run_id = rr.run_id
        AND rr.campaign_pk = cc.id
      RETURNING 1
      `
    ),
    tx.query(
      `
      WITH campaign_candidates AS (
        SELECT c.id
        FROM cc_campaigns c
        WHERE ${FIXTURE_CAMPAIGN_WHERE}
      )
      DELETE FROM campaign_recommendation_runs rr
      USING campaign_candidates cc
      WHERE rr.campaign_pk = cc.id
      RETURNING 1
      `
    ),
    tx.query(
      `
      WITH campaign_candidates AS (
        SELECT c.id
        FROM cc_campaigns c
        WHERE ${FIXTURE_CAMPAIGN_WHERE}
      )
      DELETE FROM cc_posts p
      USING campaign_candidates cc
      WHERE p.campaign_pk = cc.id
         OR (${FIXTURE_POST_WHERE})
      RETURNING 1
      `
    ),
    tx.query(
      `
      WITH campaign_candidates AS (
        SELECT c.id
        FROM cc_campaigns c
        WHERE ${FIXTURE_CAMPAIGN_WHERE}
      )
      DELETE FROM cc_campaigns c
      USING campaign_candidates cc
      WHERE c.id = cc.id
      RETURNING 1
      `
    ),
  ]);

  return {
    campaignCount: toNumber(deleteCampaignsRows.length),
    postCount: toNumber(deletePostsRows.length),
    recommendationCount: toNumber(deleteRecommendationsRows.length),
    swipeCount: toNumber(deleteSwipesRows.length),
    // Keep archive table insert counts in the audit body below.
  };
}

async function getRecentAudit(sql: NeonQueryFunction<false, false>) {
  const [rows] = await runWithSystemContext<[Record<string, unknown>[]]>(sql, (tx) => [
    tx`
      SELECT
        run_id,
        dry_run,
        rows_archived_campaigns,
        rows_archived_posts,
        rows_archived_recommendations,
        rows_archived_swipes,
        rows_deleted_campaigns,
        rows_deleted_posts,
        rows_deleted_recommendations,
        rows_deleted_swipes,
        execution_time_ms,
        status,
        error_message,
        created_at,
        completed_at
      FROM cc_fixture_purge_audit
      ORDER BY created_at DESC
      LIMIT 20
    `,
  ]);
  return rows ?? [];
}

function authorize(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const session = getInfluencerSession(request);
  const authorizedBySession = session?.role === 'admin';
  const authorizedByCron = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
  return authorizedBySession || authorizedByCron;
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 500 });
  }
  const sql = neon(databaseUrl);

  try {
    await ensureCreatorCoreSchema(sql);
    await ensureArchiveTables(sql);
    const counts = await getFixtureCounts(sql);
    const audit = await getRecentAudit(sql);

    return NextResponse.json({
      dry_run: true,
      fixture_candidates: counts,
      recent_audit_runs: audit,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to compute fixture purge dry run:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run dry-run purge' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 500 });
  }
  const sql = neon(databaseUrl);
  const runId = `fixture-purge-${randomUUID()}`;
  const startedAt = Date.now();

  try {
    await ensureCreatorCoreSchema(sql);
    await ensureArchiveTables(sql);

    const body = await request.json().catch(() => ({}));
    const execute = body?.execute === true;
    const counts = await getFixtureCounts(sql);

    if (!execute) {
      await runWithSystemContext(sql, (tx) => [
        tx`
          INSERT INTO cc_fixture_purge_audit (
            run_id,
            dry_run,
            rows_archived_campaigns,
            rows_archived_posts,
            rows_archived_recommendations,
            rows_archived_swipes,
            rows_deleted_campaigns,
            rows_deleted_posts,
            rows_deleted_recommendations,
            rows_deleted_swipes,
            execution_time_ms,
            status,
            completed_at
          )
          VALUES (
            ${runId},
            TRUE,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            ${Date.now() - startedAt},
            'dry_run',
            NOW()
          )
        `,
      ]);

      return NextResponse.json({
        run_id: runId,
        dry_run: true,
        fixture_candidates: counts,
        execution_time_ms: Date.now() - startedAt,
      });
    }

    const [archiveCountsRows] = await runWithSystemContext<[Array<{ campaigns: string | number; posts: string | number; recommendations: string | number; swipes: string | number }>]>(sql, (tx) => [
      tx.query(
        `
        WITH campaign_candidates AS (
          SELECT c.id
          FROM cc_campaigns c
          WHERE ${FIXTURE_CAMPAIGN_WHERE}
        ),
        post_candidates AS (
          SELECT DISTINCT p.id
          FROM cc_posts p
          LEFT JOIN campaign_candidates cc ON cc.id = p.campaign_pk
          WHERE ${FIXTURE_POST_WHERE}
             OR cc.id IS NOT NULL
        ),
        recommendation_candidates AS (
          SELECT DISTINCT cr.run_id, cr.creator_id
          FROM campaign_recommendations cr
          JOIN campaign_recommendation_runs rr ON rr.run_id = cr.run_id
          JOIN campaign_candidates cc ON cc.id = rr.campaign_pk
        ),
        swipe_candidates AS (
          SELECT DISTINCT s.id
          FROM campaign_swipes s
          JOIN campaign_recommendation_runs rr ON rr.run_id = s.run_id
          JOIN campaign_candidates cc ON cc.id = rr.campaign_pk
        )
        SELECT
          (SELECT COUNT(*) FROM campaign_candidates) AS campaigns,
          (SELECT COUNT(*) FROM post_candidates) AS posts,
          (SELECT COUNT(*) FROM recommendation_candidates) AS recommendations,
          (SELECT COUNT(*) FROM swipe_candidates) AS swipes
        `
      ),
    ]);
    const archivedCampaigns = toNumber(archiveCountsRows?.[0]?.campaigns);
    const archivedPosts = toNumber(archiveCountsRows?.[0]?.posts);
    const archivedRecommendations = toNumber(archiveCountsRows?.[0]?.recommendations);
    const archivedSwipes = toNumber(archiveCountsRows?.[0]?.swipes);

    const deleted = await executePurge(sql, runId);

    await runWithSystemContext(sql, (tx) => [
      tx`
        INSERT INTO cc_fixture_purge_audit (
          run_id,
          dry_run,
          rows_archived_campaigns,
          rows_archived_posts,
          rows_archived_recommendations,
          rows_archived_swipes,
          rows_deleted_campaigns,
          rows_deleted_posts,
          rows_deleted_recommendations,
          rows_deleted_swipes,
          execution_time_ms,
          status,
          completed_at
        )
        VALUES (
          ${runId},
          FALSE,
          ${archivedCampaigns},
          ${archivedPosts},
          ${archivedRecommendations},
          ${archivedSwipes},
          ${deleted.campaignCount},
          ${deleted.postCount},
          ${deleted.recommendationCount},
          ${deleted.swipeCount},
          ${Date.now() - startedAt},
          'success',
          NOW()
        )
      `,
    ]);

    return NextResponse.json({
      run_id: runId,
      dry_run: false,
      rows_archived: {
        campaigns: archivedCampaigns,
        posts: archivedPosts,
        recommendations: archivedRecommendations,
        swipes: archivedSwipes,
      },
      rows_deleted: {
        campaigns: deleted.campaignCount,
        posts: deleted.postCount,
        recommendations: deleted.recommendationCount,
        swipes: deleted.swipeCount,
      },
      execution_time_ms: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('Fixture purge failed:', error);
    await runWithSystemContext(sql, (tx) => [
      tx`
        INSERT INTO cc_fixture_purge_audit (
          run_id,
          dry_run,
          execution_time_ms,
          status,
          error_message,
          completed_at
        )
        VALUES (
          ${runId},
          FALSE,
          ${Date.now() - startedAt},
          'failed',
          ${error instanceof Error ? error.message : 'unknown_error'},
          NOW()
        )
        ON CONFLICT (run_id) DO UPDATE
        SET
          execution_time_ms = EXCLUDED.execution_time_ms,
          status = EXCLUDED.status,
          error_message = EXCLUDED.error_message,
          completed_at = EXCLUDED.completed_at
      `,
    ]).catch(() => {
      // best effort
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Fixture purge failed', run_id: runId },
      { status: 500 }
    );
  }
}
