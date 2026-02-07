/**
 * Campaign detail endpoint - returns campaign info, posts, and per-creator stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCampaignBySlug, markCampaignReviewed } from '@/lib/db/creatorcore';
import { getInfluencerSession } from '@/lib/influencer/auth';
import { shapeCampaignDetailForRole } from '@/lib/influencer/field-access';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = getInfluencerSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const postsPage = Number(searchParams.get('posts_page')) || 1;
    const postsLimit = Number(searchParams.get('posts_limit')) || 100;
    const creatorsPage = Number(searchParams.get('creators_page')) || 1;
    const creatorsLimit = Number(searchParams.get('creators_limit')) || 100;
    const postsSort = searchParams.get('posts_sort') || 'views';
    const sortDirParam = searchParams.get('sort_dir');
    const sortDir = sortDirParam === 'asc' ? 'asc' : 'desc';

    const campaign = await getCampaignBySlug(session, slug, {
      postsPage,
      postsLimit,
      creatorsPage,
      creatorsLimit,
      postsSort,
      sortDir,
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const campaignPk = Number(campaign.campaign.campaign_pk);
    if (Number.isFinite(campaignPk) && campaignPk > 0) {
      await markCampaignReviewed(session, campaignPk);
    }

    return NextResponse.json({
      ...campaign,
      campaign: shapeCampaignDetailForRole(campaign.campaign, session.role),
    });
  } catch (error) {
    console.error('Failed to fetch campaign:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch campaign' },
      { status: 500 }
    );
  }
}
