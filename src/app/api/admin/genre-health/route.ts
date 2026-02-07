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

async function runWithSystemContext<T>(
  sql: NeonQueryFunction<false, false>,
  buildQueries: (tx: TxQuery) => ReturnType<TxQuery>[]
): Promise<T> {
  const results = await sql.transaction((tx) => [
    tx`SELECT set_config('app.current_org_id', '', true)`,
    tx`SELECT set_config('app.current_role', 'system', true)`,
    // Neon may widen tx generic flags; cast to the local transaction query shape.
    ...buildQueries(tx as TxQuery),
  ]);

  return results.slice(2) as T;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const session = getInfluencerSession(request);
  const authorizedBySession = session?.role === 'admin';
  const authorizedByCron = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);

  if (!authorizedBySession && !authorizedByCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 500 });
  }

  const sql = neon(databaseUrl);

  try {
    await ensureCreatorCoreSchema(sql);

    const [coverageRows, recentRuns, sourceRows] = await runWithSystemContext<
      [
        Array<{ total: string | number; classified: string | number; unclassified: string | number; other_count: string | number }>,
        Array<Record<string, unknown>>,
        Array<Record<string, unknown>>,
      ]
    >(sql, (tx) => [
      tx.query(
        `
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE genre IS NOT NULL AND btrim(genre) <> '' AND genre <> 'Unclassified') AS classified,
          COUNT(*) FILTER (WHERE genre IS NULL OR btrim(genre) = '' OR genre = 'Unclassified') AS unclassified,
          COUNT(*) FILTER (WHERE genre = 'Other') AS other_count
        FROM cc_campaigns
      `
      ),
      tx.query(
        `
        SELECT
          id,
          started_at,
          completed_at,
          status,
          total_candidates,
          classified,
          marked_unclassified,
          marked_other,
          failures,
          search_calls,
          error_message
        FROM cc_genre_classification_runs
        ORDER BY started_at DESC
        LIMIT 10
      `
      ),
      tx.query(
        `
        SELECT
          COALESCE(genre_source, 'unknown') AS source,
          COUNT(*) AS count
        FROM cc_campaigns
        GROUP BY COALESCE(genre_source, 'unknown')
        ORDER BY count DESC
      `
      ),
    ]);

    const coverage = coverageRows?.[0] ?? { total: 0, classified: 0, unclassified: 0, other_count: 0 };
    const total = Number(coverage.total || 0);
    const classified = Number(coverage.classified || 0);
    const unclassified = Number(coverage.unclassified || 0);
    const otherCount = Number(coverage.other_count || 0);
    const classifiedPct = total > 0 ? Number(((classified / total) * 100).toFixed(2)) : 0;
    const unclassifiedPct = total > 0 ? Number(((unclassified / total) * 100).toFixed(2)) : 0;

    const latestSuccess = Array.isArray(recentRuns)
      ? recentRuns.find((run) => run.status === 'success')
      : null;
    const recentFailures = Array.isArray(recentRuns)
      ? recentRuns.filter((run) => run.status === 'failed').slice(0, 5)
      : [];

    return NextResponse.json({
      coverage: {
        total,
        classified,
        unclassified,
        other_count: otherCount,
        classified_pct: classifiedPct,
        unclassified_pct: unclassifiedPct,
      },
      latest_successful_run_at: latestSuccess?.completed_at ?? null,
      recent_failures: recentFailures,
      recent_runs: recentRuns ?? [],
      source_breakdown: sourceRows ?? [],
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to fetch genre health:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch genre health' },
      { status: 500 }
    );
  }
}
