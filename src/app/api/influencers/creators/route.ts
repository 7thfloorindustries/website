/**
 * Paginated creator list with filtering and sorting
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCreators } from '@/lib/db/creatorcore';
import { getInfluencerSession } from '@/lib/influencer/auth';
import { shapeCreatorSummaryForRole } from '@/lib/influencer/field-access';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = getInfluencerSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);

    const result = await getCreators(session, {
      page: Number(searchParams.get('page')) || 1,
      limit: Number(searchParams.get('limit')) || 50,
      search: searchParams.get('search') || undefined,
      agency: searchParams.get('agency') || undefined,
      platform: searchParams.get('platform') || undefined,
      genre: searchParams.get('genre') || undefined,
      campaign_slug: searchParams.get('campaign_slug') || undefined,
      min_genre_fit: searchParams.has('min_genre_fit')
        ? Number(searchParams.get('min_genre_fit'))
        : undefined,
      sort: searchParams.get('sort') || undefined,
      review: (searchParams.get('review') as 'all' | 'needs_review' | null) || undefined,
    });

    return NextResponse.json({
      ...result,
      creators: result.creators.map((creator) => shapeCreatorSummaryForRole(creator, session.role)),
    });
  } catch (error) {
    console.error('Failed to fetch creators:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch creators' },
      { status: 500 }
    );
  }
}
