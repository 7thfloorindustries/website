/**
 * API Route to format a campaign's Google Sheet
 * POST /api/campaign/[slug]/format-sheet
 */

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getCampaignConfig } from '@/data/campaigns';
import { createOAuthClient } from '@/lib/google-sheets';

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
    const auth = await createOAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = config.spreadsheetId;

    // Get sheet ID
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetId = spreadsheet.data.sheets?.[0].properties?.sheetId;

    if (sheetId === undefined) {
      return NextResponse.json(
        { error: 'Could not find sheet' },
        { status: 500 }
      );
    }

    // Set text wrap for Column H (index 7)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          repeatCell: {
            range: {
              sheetId: sheetId,
              startColumnIndex: 7,
              endColumnIndex: 8
            },
            cell: {
              userEnteredFormat: {
                wrapStrategy: 'WRAP'
              }
            },
            fields: 'userEnteredFormat.wrapStrategy'
          }
        }]
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Column H text wrap enabled'
    });
  } catch (error) {
    console.error('Format sheet error:', error);
    return NextResponse.json(
      { error: 'Failed to format sheet' },
      { status: 500 }
    );
  }
}
