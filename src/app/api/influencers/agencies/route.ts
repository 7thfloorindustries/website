import { NextRequest, NextResponse } from 'next/server';
import { getAgencyList } from '@/lib/db/creatorcore';
import { getInfluencerSession } from '@/lib/influencer/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = getInfluencerSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const agencies = await getAgencyList(session);
    return NextResponse.json({ agencies });
  } catch (error) {
    console.error('Failed to fetch agencies:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch agencies' },
      { status: 500 }
    );
  }
}

