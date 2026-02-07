import { NextRequest, NextResponse } from 'next/server';
import { getInfluencerSession } from '@/lib/influencer/auth';
import { generateCampaignRecommendations } from '@/lib/intelligence/recommendations';
import { isRecommendationFeatureEnabledServer } from '@/lib/influencer/flags';

export const dynamic = 'force-dynamic';

function parseCsv(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isRecommendationFeatureEnabledServer()) {
    return NextResponse.json(
      { error: 'feature_disabled', message: 'Recommendation feature is temporarily disabled' },
      { status: 403 }
    );
  }

  const session = getInfluencerSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);

    const budget = Number(searchParams.get('budget') || 0);
    const limit = Number(searchParams.get('limit') || 25);
    const perCreatorCap = Number(searchParams.get('per_creator_cap') || 0);
    const objective = searchParams.get('objective') || 'maximize_views';
    const riskMode = (searchParams.get('risk_mode') as 'manual' | 'hybrid' | 'auto' | null) || 'hybrid';
    const persist = searchParams.get('persist') !== 'false';
    const genres = parseCsv(searchParams.get('genres'));
    const platforms = parseCsv(searchParams.get('platforms'));

    const result = await generateCampaignRecommendations(
      session,
      slug,
      {
        budget: Number.isFinite(budget) && budget > 0 ? budget : undefined,
        limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
        perCreatorCap: Number.isFinite(perCreatorCap) && perCreatorCap > 0 ? perCreatorCap : undefined,
        objective,
        riskMode,
        genres,
        platforms,
      },
      { persist }
    );

    return NextResponse.json({
      success: true,
      generated_at: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error('Failed to generate recommendations:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate recommendations' },
      { status: 500 }
    );
  }
}
