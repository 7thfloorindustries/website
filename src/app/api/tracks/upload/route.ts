import { NextRequest, NextResponse } from 'next/server';
import { getInfluencerSession } from '@/lib/influencer/auth';
import { createTrackRecord, resolveCampaignPkBySlug } from '@/lib/db/creatorcore';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const session = getInfluencerSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const artist = String(formData.get('artist') || '').trim();
    const title = String(formData.get('title') || '').trim();
    const isrc = String(formData.get('isrc') || '').trim();
    const campaignSlug = String(formData.get('campaign_slug') || '').trim();
    const file = formData.get('file');

    if (!artist || !title) {
      return NextResponse.json(
        { error: 'artist and title are required' },
        { status: 400 }
      );
    }

    let campaignPk: number | null = null;
    if (campaignSlug) {
      campaignPk = await resolveCampaignPkBySlug(session, campaignSlug);
    }

    const track = await createTrackRecord(session, {
      artist,
      title,
      isrc: isrc || null,
      campaignPk,
    });

    const fileMetadata =
      file instanceof File
        ? {
            name: file.name,
            type: file.type,
            size_bytes: file.size,
          }
        : null;

    return NextResponse.json({
      success: true,
      track_id: track.trackId,
      uploaded_at: track.uploadedAt,
      extracted_features_status: 'pending',
      storage_status: fileMetadata ? 'metadata_received' : 'no_file_received',
      file: fileMetadata,
      campaign_pk: campaignPk,
    });
  } catch (error) {
    console.error('Track upload failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Track upload failed' },
      { status: 500 }
    );
  }
}
