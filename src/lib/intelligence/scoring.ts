export interface RecommendationScoreInput {
  audienceFit: number;
  genreFit: number;
  historicalRoi: number;
  noveltyPenaltyAdjusted: number;
  platformFit: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function calculateRecommendationScore(input: RecommendationScoreInput): number {
  const genreFit = clamp01(input.genreFit);
  const audienceFit = clamp01(input.audienceFit);
  const historicalRoi = clamp01(input.historicalRoi);
  const platformFit = clamp01(input.platformFit);
  const noveltyPenaltyAdjusted = clamp01(input.noveltyPenaltyAdjusted);

  const score =
    0.3 * genreFit +
    0.25 * audienceFit +
    0.2 * historicalRoi +
    0.15 * platformFit +
    0.1 * noveltyPenaltyAdjusted;

  return Number(score.toFixed(4));
}

export function estimateCreatorSpend(avgViews: number): number {
  const views = Math.max(0, Number(avgViews || 0));
  // Conservative CPM-style proxy until explicit creator pricing is integrated.
  const estimate = 125 + views * 0.018;
  return Math.round(estimate);
}

export function normalizeRoiFromViews(avgViews: number): number {
  const views = Math.max(0, Number(avgViews || 0));
  // Log scaling keeps high-view creators from dominating.
  const normalized = Math.log10(views + 1) / 6;
  return clamp01(normalized);
}

export function platformOverlapScore(
  creatorPlatforms: string[] | null | undefined,
  targetPlatforms: string[] | null | undefined
): number {
  const creator = (creatorPlatforms ?? []).map((item) => item.toLowerCase().trim()).filter(Boolean);
  const target = (targetPlatforms ?? []).map((item) => item.toLowerCase().trim()).filter(Boolean);
  if (target.length === 0) return 1;
  if (creator.length === 0) return 0;

  const creatorSet = new Set(creator);
  const matches = target.filter((platform) => creatorSet.has(platform)).length;
  return clamp01(matches / target.length);
}
