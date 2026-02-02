/**
 * API Route to add Thumbnail URL column header to a campaign's Google Sheet
 * POST /api/campaign/[slug]/setup-thumbnail-column
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCampaignConfig } from '@/data/campaigns';
import { addThumbnailColumnHeader } from '@/lib/google-sheets';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const config = getCampaignConfig(slug);

  if (!config) {
    return NextResponse.json(
      { error: 'Campaign not found' },
      { status: 404 }
    );
  }

  try {
    const success = await addThumbnailColumnHeader(config.spreadsheetId);

    if (success) {
      return NextResponse.json({
        success: true,
        message: 'Thumbnail URL column header added to sheet'
      });
    } else {
      return NextResponse.json(
        { error: 'Failed to add column header - check sheet permissions' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Setup thumbnail column error:', error);
    return NextResponse.json(
      { error: 'Failed to add column header' },
      { status: 500 }
    );
  }
}
