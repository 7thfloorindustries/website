import { NextRequest, NextResponse } from 'next/server';
import {
  neon,
  type NeonQueryFunction,
  type NeonQueryFunctionInTransaction,
} from '@neondatabase/serverless';
import { detectGenreHeuristic, parseArtistFromTitle } from '@/lib/creatorcore/genre-detector';
import { getOrSearchGenre } from '@/lib/creatorcore/genre-search';
import { ensureCreatorCoreSchema } from '@/lib/creatorcore/schema';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type TxQuery = NeonQueryFunctionInTransaction<false, false>;

interface CampaignRow {
  id: number;
  title: string;
}

interface RunRow {
  id: number;
}

interface CacheRow {
  genre: string | null;
  confidence: string | null;
}

function confidenceToNumber(confidence: string | null | undefined): number {
  if (confidence === 'high') return 0.9;
  if (confidence === 'medium') return 0.7;
  if (confidence === 'low') return 0.5;
  return 0;
}

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

async function refreshCreatorGenreRollups(sql: NeonQueryFunction<false, false>): Promise<void> {
  await runWithSystemContext(sql, (tx) => [
    tx`DELETE FROM entity_genre_labels WHERE entity_type = 'creator' AND source = 'campaign_rollup'`,
    tx.query(
      `
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
        jsonb_build_object('method', 'campaign_label_rollup', 'updated_at', NOW()),
        NOW()
      FROM creator_scores cs
      JOIN totals t ON t.creator_id = cs.creator_id
      WHERE t.total_weight > 0
      ON CONFLICT (entity_type, entity_id, genre_id) DO UPDATE
      SET
        weight = EXCLUDED.weight,
        confidence = EXCLUDED.confidence,
        source = EXCLUDED.source,
        evidence = EXCLUDED.evidence,
        updated_at = NOW()
      `
    ),
  ]);
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 500 });
  }

  const sql = neon(databaseUrl);
  const startedAt = new Date().toISOString();
  let runId: number | null = null;

  try {
    await ensureCreatorCoreSchema(sql);

    const [runRows] = await runWithSystemContext<[RunRow[]]>(sql, (tx) => [
      tx`
        INSERT INTO cc_genre_classification_runs (started_at, status)
        VALUES (${startedAt}, 'running')
        RETURNING id
      `,
    ]);
    runId = runRows?.[0]?.id ?? null;

    const [campaigns] = await runWithSystemContext<[CampaignRow[]]>(sql, (tx) => [
      tx`
        SELECT id, title
        FROM cc_campaigns
        WHERE (genre IS NULL OR btrim(genre) = '' OR genre = 'Unclassified')
          AND title IS NOT NULL
        ORDER BY id ASC
        LIMIT 500
      `,
    ]);

    if (!campaigns || campaigns.length === 0) {
      if (runId != null) {
        await runWithSystemContext(sql, (tx) => [
          tx`
            UPDATE cc_genre_classification_runs
            SET
              completed_at = NOW(),
              status = 'success',
              total_candidates = 0,
              remaining = 0
            WHERE id = ${runId}
          `,
        ]);
      }

      return NextResponse.json({
        message: 'All campaigns already classified',
        classified: 0,
      });
    }

    let heuristicHits = 0;
    let cacheHits = 0;
    let searchHits = 0;
    let searchCalls = 0;
    let markedOther = 0;
    let markedUnclassified = 0;
    let failures = 0;
    const maxSearchCalls = Number(process.env.CREATORCORE_GENRE_MAX_SEARCH_CALLS || 200);

    for (const campaign of campaigns) {
      const title = String(campaign.title || '').trim();
      const id = Number(campaign.id);
      if (!title || !Number.isFinite(id) || id <= 0) {
        failures++;
        continue;
      }

      let resolvedGenre = '';
      let resolvedConfidence = 0;
      let resolvedSource = 'unclassified';
      const evidence: Record<string, unknown> = {
        title,
      };

      const heuristic = detectGenreHeuristic(title);
      if (heuristic) {
        resolvedGenre = heuristic.genre;
        resolvedConfidence = confidenceToNumber(heuristic.confidence);
        resolvedSource = 'heuristic';
        evidence.heuristic_confidence = heuristic.confidence;
        heuristicHits++;
      } else {
        const artist = parseArtistFromTitle(title);
        if (!artist) {
          resolvedGenre = 'Unclassified';
          resolvedConfidence = 0;
          resolvedSource = 'no_artist_parse';
          evidence.reason = 'artist_not_detected';
          markedUnclassified++;
        } else if (searchCalls >= maxSearchCalls) {
          const [cachedRows] = await runWithSystemContext<[CacheRow[]]>(sql, (tx) => [
            tx`
              SELECT genre, confidence
              FROM cc_genre_cache
              WHERE LOWER(artist_name) = LOWER(${artist})
              LIMIT 1
            `,
          ]);

          const cached = cachedRows?.[0];
          if (cached?.genre) {
            resolvedGenre = cached.genre;
            resolvedConfidence = confidenceToNumber(cached.confidence);
            resolvedSource = 'cache';
            cacheHits++;
          } else {
            resolvedGenre = 'Unclassified';
            resolvedConfidence = 0;
            resolvedSource = 'search_budget_exhausted';
            evidence.reason = 'search_budget_exhausted';
            markedUnclassified++;
          }
        } else {
          const searchResult = await getOrSearchGenre(artist, sql);
          searchCalls++;

          if (searchResult?.genre) {
            resolvedGenre = searchResult.genre;
            resolvedConfidence = confidenceToNumber(searchResult.confidence);
            resolvedSource = 'search';
            searchHits++;
          } else {
            resolvedGenre = 'Unclassified';
            resolvedConfidence = 0;
            resolvedSource = 'search_unresolved';
            evidence.reason = 'search_unresolved';
            markedUnclassified++;
          }
        }
      }

      if (!resolvedGenre) {
        resolvedGenre = 'Unclassified';
        resolvedSource = 'unclassified';
        resolvedConfidence = 0;
      }

      if (resolvedGenre === 'Other') markedOther++;

      const labelConfidence = Math.min(1, Math.max(0, resolvedConfidence || 0));
      await runWithSystemContext(sql, (tx) => [
        tx`
          UPDATE cc_campaigns
          SET
            genre = ${resolvedGenre},
            genre_confidence = ${labelConfidence},
            genre_source = ${resolvedSource},
            genre_updated_at = NOW()
          WHERE id = ${id}
        `,
        tx`
          DELETE FROM entity_genre_labels
          WHERE entity_type = 'campaign'
            AND entity_id = ${String(id)}
        `,
        tx`
          INSERT INTO entity_genre_labels (
            entity_type, entity_id, genre_id, weight, confidence, source, evidence, updated_at
          )
          VALUES (
            'campaign',
            ${String(id)},
            ${resolvedGenre},
            1.0,
            ${labelConfidence},
            ${resolvedSource},
            ${JSON.stringify(evidence)}::jsonb,
            NOW()
          )
          ON CONFLICT (entity_type, entity_id, genre_id) DO UPDATE
          SET
            weight = EXCLUDED.weight,
            confidence = EXCLUDED.confidence,
            source = EXCLUDED.source,
            evidence = EXCLUDED.evidence,
            updated_at = NOW()
        `,
      ]);
    }

    await refreshCreatorGenreRollups(sql);

    const [remainingRows] = await runWithSystemContext<[Array<{ count: string | number }>]>(sql, (tx) => [
      tx`
        SELECT COUNT(*) AS count
        FROM cc_campaigns
        WHERE genre IS NULL OR btrim(genre) = '' OR genre = 'Unclassified'
      `,
    ]);
    const remaining = Number(remainingRows?.[0]?.count || 0);
    const classified = campaigns.length - markedUnclassified;

    if (runId != null) {
      await runWithSystemContext(sql, (tx) => [
        tx`
          UPDATE cc_genre_classification_runs
          SET
            completed_at = NOW(),
            status = 'success',
            total_candidates = ${campaigns.length},
            classified = ${classified},
            heuristic_hits = ${heuristicHits},
            search_hits = ${searchHits},
            cache_hits = ${cacheHits},
            marked_other = ${markedOther},
            marked_unclassified = ${markedUnclassified},
            search_calls = ${searchCalls},
            failures = ${failures},
            remaining = ${remaining}
          WHERE id = ${runId}
        `,
      ]);
    }

    return NextResponse.json({
      classified,
      heuristic_hits: heuristicHits,
      search_hits: searchHits,
      cache_hits: cacheHits,
      marked_other: markedOther,
      marked_unclassified: markedUnclassified,
      search_calls: searchCalls,
      failed_rows: failures,
      remaining,
    });
  } catch (error) {
    console.error('Genre classification error:', error);

    if (runId != null) {
      try {
        await runWithSystemContext(sql, (tx) => [
          tx`
            UPDATE cc_genre_classification_runs
            SET
              completed_at = NOW(),
              status = 'failed',
              error_message = ${error instanceof Error ? error.message : String(error)}
            WHERE id = ${runId}
          `,
        ]);
      } catch (runUpdateError) {
        console.error('Failed to update genre run telemetry:', runUpdateError);
      }
    }

    return NextResponse.json(
      { error: 'Genre classification failed', details: String(error) },
      { status: 500 }
    );
  }
}
