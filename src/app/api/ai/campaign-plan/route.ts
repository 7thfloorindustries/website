import { NextRequest, NextResponse } from 'next/server';
import { getInfluencerSession } from '@/lib/influencer/auth';
import { generateCampaignRecommendations } from '@/lib/intelligence/recommendations';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function parseGenres(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function parsePlatforms(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export async function POST(request: NextRequest) {
  const session = getInfluencerSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const campaignSlug = typeof body?.campaign_slug === 'string' ? body.campaign_slug.trim() : '';
    if (!campaignSlug) {
      return NextResponse.json({ error: 'campaign_slug is required' }, { status: 400 });
    }

    const budget = Number(body?.budget ?? 0);
    const objective =
      typeof body?.objective === 'string' && body.objective.trim()
        ? body.objective.trim()
        : 'maximize_views';
    const riskMode =
      body?.risk_mode === 'manual' || body?.risk_mode === 'hybrid' || body?.risk_mode === 'auto'
        ? body.risk_mode
        : 'hybrid';
    const genres = parseGenres(body?.genres);
    const platforms = parsePlatforms(body?.platforms);

    const recommendations = await generateCampaignRecommendations(
      session,
      campaignSlug,
      {
        budget: Number.isFinite(budget) && budget > 0 ? budget : undefined,
        objective,
        riskMode,
        genres,
        platforms,
        limit: 12,
      },
      { persist: false }
    );

    const top = recommendations.recommendations.slice(0, 5);
    const totalSuggestedSpend = recommendations.recommendations.reduce(
      (sum, item) => sum + Number(item.estimated_spend || 0),
      0
    );

    return NextResponse.json({
      success: true,
      plan: {
        campaign_slug: recommendations.campaign_slug,
        objective: recommendations.objective,
        budget_input: recommendations.budget,
        budget_suggested_total: totalSuggestedSpend,
        risk_mode: riskMode,
        summary: `Generated ${recommendations.recommendations.length} creator recommendations with ${recommendations.auto_shortlisted} auto-shortlisted candidates under hybrid guardrails.`,
        strategy: {
          target_genres: genres,
          target_platforms: platforms,
          guidance: [
            'Prioritize top-ranked creators first and keep 10-15% budget reserve for mid-flight optimization.',
            'Use right-swipes to lock candidates; left-swipes feed model feedback for future ranking improvements.',
            'Review creators with lower confidence manually before outreach.',
          ],
        },
        top_candidates: top,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to build AI campaign plan:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to build campaign plan' },
      { status: 500 }
    );
  }
}
