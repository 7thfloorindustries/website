import { NextRequest, NextResponse } from 'next/server';
import { getInfluencerSession } from '@/lib/influencer/auth';
import { recordCampaignSwipe } from '@/lib/db/creatorcore';
import { isRecommendationFeatureEnabledServer } from '@/lib/influencer/flags';

export const dynamic = 'force-dynamic';

type SwipeAction = 'left' | 'right' | 'maybe';

function isValidAction(value: unknown): value is SwipeAction {
  return value === 'left' || value === 'right' || value === 'maybe';
}

export async function POST(request: NextRequest) {
  if (!isRecommendationFeatureEnabledServer()) {
    return NextResponse.json(
      { error: 'feature_disabled', message: 'Swipe actions are temporarily disabled' },
      { status: 403 }
    );
  }

  const session = getInfluencerSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const runId = typeof body?.run_id === 'string' ? body.run_id : '';
    const creatorId = typeof body?.creator_id === 'string' ? body.creator_id : '';
    const note = typeof body?.note === 'string' ? body.note : undefined;
    const action = body?.action;

    if (!runId || !creatorId || !isValidAction(action)) {
      return NextResponse.json(
        { error: 'run_id, creator_id, and action are required' },
        { status: 400 }
      );
    }

    const recorded = await recordCampaignSwipe(session, {
      runId,
      creatorId,
      action,
      note,
    });

    if (!recorded) {
      return NextResponse.json(
        { error: 'Unable to record swipe for this run' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      run_id: runId,
      creator_id: creatorId.toLowerCase(),
      action,
      recorded_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to record campaign swipe:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to record swipe' },
      { status: 500 }
    );
  }
}
