/**
 * Campaign API Route
 * Returns live campaign data from Google Sheets
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchSheetData } from '@/lib/google-sheets';
import { transformSheetData } from '@/lib/campaign-data';
import { getCampaignConfig } from '@/data/campaigns';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const forceRefresh = request.nextUrl.searchParams.get('refresh') === 'true';

    const config = getCampaignConfig(slug);
    if (!config) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (!config.spreadsheetId) {
      return NextResponse.json({ error: 'Campaign has no spreadsheet configured' }, { status: 400 });
    }

    const sheetData = await fetchSheetData(config.spreadsheetId, forceRefresh);
    const liveData = transformSheetData(sheetData, config);

    return NextResponse.json({
      campaign: {
        name: config.name,
        slug: config.slug || slug,
        status: config.status,
        created: config.created,
        spreadsheetUrl: config.spreadsheetUrl
      },
      ...liveData
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      }
    });
  } catch (error) {
    console.error('Campaign API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
