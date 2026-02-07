import type { InfluencerAccessContext } from '@/lib/db/creatorcore';
import {
  createRecommendationRun,
  finalizeRecommendationRun,
  getCampaignBySlug,
  getCreators,
  replaceRecommendationsForRun,
  type RecommendationRowInput,
} from '@/lib/db/creatorcore';
import {
  calculateRecommendationScore,
  estimateCreatorSpend,
  normalizeRoiFromViews,
  platformOverlapScore,
} from './scoring';

export interface RecommendationRequest {
  budget?: number;
  genres?: string[];
  limit?: number;
  objective?: string;
  perCreatorCap?: number;
  platforms?: string[];
  riskMode?: 'manual' | 'hybrid' | 'auto';
}

interface ParsedGenreLabel {
  confidence: number;
  genre: string;
  weight: number;
}

export interface RecommendationResult {
  auto_shortlisted: number;
  budget: number;
  campaign_pk: number;
  campaign_slug: string;
  objective: string;
  recommendations: Array<{
    confidence: number;
    creator_id: string;
    estimated_spend: number;
    platforms: string[];
    rank: number;
    rationale: Record<string, unknown>;
    score: number;
    score_breakdown: Record<string, number>;
    status: string;
    top_genres: ParsedGenreLabel[];
  }>;
  run_id: string | null;
  skipped: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function toPlatforms(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split('|')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function parseTopGenres(raw: unknown): ParsedGenreLabel[] {
  if (!Array.isArray(raw)) return [];
  const labels: ParsedGenreLabel[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const genre = typeof row.genre === 'string' ? row.genre : '';
    if (!genre) continue;
    labels.push({
      genre,
      weight: clamp01(Number(row.weight ?? 0)),
      confidence: clamp01(Number(row.confidence ?? 0)),
    });
  }
  return labels;
}

function normalizeGenres(genres: string[] | undefined): string[] {
  return (genres ?? []).map((genre) => genre.trim()).filter(Boolean);
}

export async function generateCampaignRecommendations(
  access: InfluencerAccessContext,
  campaignSlug: string,
  request: RecommendationRequest,
  options: { persist?: boolean } = {}
): Promise<RecommendationResult> {
  const campaign = await getCampaignBySlug(access, campaignSlug, {
    creatorsLimit: 25,
    postsLimit: 25,
  });
  if (!campaign) {
    throw new Error('Campaign not found');
  }

  const campaignPk = Number(campaign.campaign.campaign_pk);
  if (!Number.isFinite(campaignPk) || campaignPk <= 0) {
    throw new Error('Invalid campaign ID');
  }

  const budget = Math.max(0, Number(request.budget ?? campaign.campaign.budget ?? 0));
  const riskMode = request.riskMode ?? 'hybrid';
  const objective = request.objective?.trim() || 'maximize_views';
  const limit = Math.min(100, Math.max(1, Number(request.limit ?? 25)));
  const perCreatorCap = Math.max(100, Number(request.perCreatorCap ?? Math.max(500, budget * 0.2 || 1000)));
  const requestedGenres = normalizeGenres(request.genres);
  const targetPlatforms =
    (request.platforms ?? []).length > 0
      ? toPlatforms(request.platforms)
      : toPlatforms(campaign.campaign.platforms);

  const creatorResult = await getCreators(access, {
    campaign_slug: campaignSlug,
    limit: 300,
    page: 1,
    sort: 'genre_fit_desc',
  });
  const creators = creatorResult.creators ?? [];

  const scored = creators
    .map((creator) => {
      const username = String(creator.username || '').toLowerCase();
      if (!username) return null;

      const avgViews = Number(creator.avg_views || 0);
      const totalPosts = Number(creator.total_posts || 0);
      const successRate = clamp01(Number(creator.success_rate || 0) / 100);
      const creatorPlatforms = toPlatforms(creator.platforms);
      const topGenres = parseTopGenres(creator.top_genres);

      const genreFitFromVector = clamp01(Number(creator.genre_fit_score ?? 0));
      const genreKeywordFit =
        requestedGenres.length === 0
          ? genreFitFromVector
          : clamp01(
              requestedGenres.filter((genre) =>
                topGenres.some((label) => label.genre.toLowerCase() === genre.toLowerCase())
              ).length / requestedGenres.length
            );
      const genreFit = Math.max(genreFitFromVector, genreKeywordFit);

      const platformFit = platformOverlapScore(creatorPlatforms, targetPlatforms);
      const historicalRoi = normalizeRoiFromViews(avgViews);
      const noveltyPenaltyAdjusted = clamp01(1 - Math.min(Number(creator.campaign_count || 0) / 20, 1));

      const score = calculateRecommendationScore({
        genreFit,
        audienceFit: successRate,
        historicalRoi,
        platformFit,
        noveltyPenaltyAdjusted,
      });

      const avgGenreConfidence =
        topGenres.length > 0
          ? topGenres.reduce((sum, label) => sum + label.confidence, 0) / topGenres.length
          : 0.4;
      const confidence = Number((0.6 * avgGenreConfidence + 0.4 * score).toFixed(4));
      const estimatedSpend = estimateCreatorSpend(avgViews);

      const rejectedByPlatform = targetPlatforms.length > 0 && platformFit === 0;
      const rejectedByBudget = estimatedSpend > perCreatorCap;
      const rejectedByCooling = successRate < 0.35 && totalPosts >= 5;
      const isRejected = rejectedByPlatform || rejectedByBudget || rejectedByCooling;

      if (isRejected) {
        return null;
      }

      const status =
        score >= 0.82 && confidence >= 0.75 && riskMode !== 'manual'
          ? 'auto_shortlist'
          : 'pending_review';

      return {
        creator_id: username,
        score,
        confidence,
        estimated_spend: estimatedSpend,
        status,
        platforms: creatorPlatforms,
        top_genres: topGenres,
        score_breakdown: {
          genre_fit: Number(genreFit.toFixed(4)),
          audience_fit: Number(successRate.toFixed(4)),
          historical_roi: Number(historicalRoi.toFixed(4)),
          platform_fit: Number(platformFit.toFixed(4)),
          novelty_penalty_adjusted: Number(noveltyPenaltyAdjusted.toFixed(4)),
        },
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const totalScore = scored.reduce((sum, creator) => sum + creator.score, 0);
  let assigned = 0;
  const recommendations = scored.map((creator, index) => {
    let suggestedSpend = creator.estimated_spend;
    if (budget > 0 && totalScore > 0) {
      const weighted = Math.round((budget * creator.score) / totalScore);
      suggestedSpend = Math.min(perCreatorCap, Math.max(100, weighted));
      assigned += suggestedSpend;
    }

    const isLast = index === scored.length - 1;
    if (budget > 0 && isLast && assigned !== budget) {
      suggestedSpend = Math.max(100, Math.min(perCreatorCap, suggestedSpend + (budget - assigned)));
    }

    const rationale: Record<string, unknown> = {
      objective,
      reason: 'Scored using weighted fit model with hybrid guardrails',
      constraints: {
        per_creator_cap: perCreatorCap,
        required_platforms: targetPlatforms,
      },
    };

    return {
      ...creator,
      rank: index + 1,
      estimated_spend: suggestedSpend,
      rationale,
    };
  });

  let runId: string | null = null;
  if (options.persist !== false) {
    runId = await createRecommendationRun(access, {
      campaignPk,
      budget,
      objective,
      riskMode,
      status: 'running',
      metadata: {
        requested_genres: requestedGenres,
        target_platforms: targetPlatforms,
        per_creator_cap: perCreatorCap,
      },
    });

    const rows: RecommendationRowInput[] = recommendations.map((recommendation) => ({
      creatorId: recommendation.creator_id,
      rank: recommendation.rank,
      score: recommendation.score,
      scoreBreakdown: recommendation.score_breakdown,
      rationale: recommendation.rationale,
      status: recommendation.status,
      estimatedSpend: recommendation.estimated_spend,
    }));
    await replaceRecommendationsForRun(access, runId, rows);
    await finalizeRecommendationRun(access, runId, 'completed');
  }

  return {
    run_id: runId,
    campaign_pk: campaignPk,
    campaign_slug: campaignSlug,
    budget,
    objective,
    auto_shortlisted: recommendations.filter((row) => row.status === 'auto_shortlist').length,
    skipped: creators.length - recommendations.length,
    recommendations,
  };
}
