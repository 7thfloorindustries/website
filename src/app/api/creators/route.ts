import { NextRequest, NextResponse } from 'next/server';
import { getAllCreators, addCreator } from '@/lib/db/creators';

export const dynamic = 'force-dynamic';

/**
 * GET /api/creators - List all creators
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const creators = await getAllCreators();
    return NextResponse.json({ creators });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch creators' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/creators - Add a new creator
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!body.team_member || !body.artist) {
      return NextResponse.json(
        { error: 'team_member and artist are required' },
        { status: 400 }
      );
    }

    const creator = await addCreator({
      team_member: body.team_member,
      artist: body.artist,
      ig_handle: body.ig_handle || null,
      twitter_handle: body.twitter_handle || null,
      tiktok_handle: body.tiktok_handle || null,
    });

    return NextResponse.json({ creator }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add creator';
    // Handle unique constraint violation
    if (message.includes('idx_creators_artist_unique')) {
      return NextResponse.json({ error: 'A creator with that artist name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
