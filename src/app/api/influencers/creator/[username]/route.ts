/**
 * Creator detail endpoint - returns creator stats, campaign history, and recent posts
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCreatorByUsername, markCreatorReviewed } from '@/lib/db/creatorcore';
import { getInfluencerSession } from '@/lib/influencer/auth';
import { shapeCreatorCampaignsForRole, shapeCreatorDetailForRole } from '@/lib/influencer/field-access';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const session = getInfluencerSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { username } = await params;
    const creator = await getCreatorByUsername(session, username);

    if (!creator) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }

    await markCreatorReviewed(session, username);

    return NextResponse.json({
      ...creator,
      creator: shapeCreatorDetailForRole(creator.creator, session.role),
      campaigns: shapeCreatorCampaignsForRole(creator.campaigns, session.role),
    });
  } catch (error) {
    console.error('Failed to fetch creator:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch creator' },
      { status: 500 }
    );
  }
}
