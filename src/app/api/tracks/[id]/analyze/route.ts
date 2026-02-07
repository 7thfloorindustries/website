import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getInfluencerSession } from '@/lib/influencer/auth';
import {
  addTrackChartObservation,
  getCampaigns,
  getTrackRecord,
  upsertEntityGenreLabel,
  upsertTrackAnalysis,
} from '@/lib/db/creatorcore';
import { detectGenreHeuristic } from '@/lib/creatorcore/genre-detector';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function seededUnit(seed: string, label: string): number {
  const digest = createHash('sha256').update(`${seed}:${label}`).digest('hex');
  const slice = digest.slice(0, 8);
  const intValue = parseInt(slice, 16);
  return (intValue % 10_000) / 10_000;
}

function between(seed: string, label: string, min: number, max: number): number {
  return Number((min + seededUnit(seed, label) * (max - min)).toFixed(4));
}

const MUSICAL_KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getInfluencerSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const trackId = id.trim();
    if (!trackId) {
      return NextResponse.json({ error: 'Track ID is required' }, { status: 400 });
    }

    const track = await getTrackRecord(session, trackId);
    if (!track) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 });
    }

    const tempo = between(trackId, 'tempo', 76, 164);
    const energy = between(trackId, 'energy', 0.2, 0.95);
    const danceability = between(trackId, 'danceability', 0.15, 0.95);
    const valence = between(trackId, 'valence', 0.1, 0.95);
    const keyIndex = Math.floor(between(trackId, 'key', 0, MUSICAL_KEYS.length));
    const mode = between(trackId, 'mode', 0, 1) > 0.5 ? 'major' : 'minor';

    await upsertTrackAnalysis(session, trackId, {
      tempo,
      key: MUSICAL_KEYS[Math.min(MUSICAL_KEYS.length - 1, keyIndex)],
      mode,
      energy,
      danceability,
      valence,
    });

    const title = String(track.title || '').trim();
    const artist = String(track.artist || '').trim();
    const campaignGenre = String(track.campaign_genre || '').trim();
    const detectedGenre =
      detectGenreHeuristic(`${artist} - ${title}`)?.genre ||
      (campaignGenre || 'Unclassified');

    await upsertEntityGenreLabel(session, {
      entityType: 'track',
      entityId: trackId,
      genreId: detectedGenre,
      weight: 1,
      confidence: detectedGenre === 'Unclassified' ? 0.25 : 0.7,
      source: 'audio_heuristic',
      evidence: {
        artist,
        title,
        method: 'deterministic_feature_seed',
      },
    });

    const hot100Rank = Math.floor(between(trackId, 'hot100_rank', 1, 100));
    const tiktokRank = Math.floor(between(trackId, 'tiktok_rank', 1, 100));
    await addTrackChartObservation(
      session,
      trackId,
      'billboard',
      'Hot 100',
      hot100Rank,
      Number((1 - hot100Rank / 100).toFixed(4)),
      { synthetic: true }
    );
    await addTrackChartObservation(
      session,
      trackId,
      'tiktok',
      'Viral Chart',
      tiktokRank,
      Number((1 - tiktokRank / 100).toFixed(4)),
      { synthetic: true }
    );

    const similarCampaigns = await getCampaigns(session, {
      page: 1,
      limit: 5,
      sort: 'views_desc',
      genre: detectedGenre,
    });

    return NextResponse.json({
      success: true,
      track_id: trackId,
      features: {
        tempo,
        key: MUSICAL_KEYS[Math.min(MUSICAL_KEYS.length - 1, keyIndex)],
        mode,
        energy,
        danceability,
        valence,
      },
      inferred_genre: detectedGenre,
      similar_campaigns: similarCampaigns.campaigns ?? [],
      analyzed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Track analysis failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Track analysis failed' },
      { status: 500 }
    );
  }
}
