/**
 * Cron endpoint to capture campaign data snapshots
 * Runs every 6 hours to collect historical data for timeline charts
 */

import { NextResponse } from 'next/server';
import { getAllCampaigns } from '@/data/campaigns';
import { fetchSheetData } from '@/lib/google-sheets';
import { detectPlatform } from '@/lib/campaign-data';
import { storeCampaignSnapshot, isRedisConfigured, type CampaignSnapshot } from '@/lib/redis';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for cron job

export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isRedisConfigured()) {
    return NextResponse.json(
      { error: 'Redis not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.' },
      { status: 500 }
    );
  }

  const campaigns = getAllCampaigns();
  const results: Record<string, { success: boolean; error?: string }> = {};

  for (const campaign of campaigns) {
    try {
      if (!campaign.spreadsheetId) {
        results[campaign.slug || campaign.name] = { success: false, error: 'No spreadsheet ID' };
        continue;
      }

      // Fetch current data from Google Sheets
      const sheetData = await fetchSheetData(campaign.spreadsheetId);
      const rows = sheetData.slice(1) || [];

      // Calculate totals
      let totalViews = 0;
      let totalLikes = 0;
      let totalComments = 0;
      let totalShares = 0;
      const byPlatform: Record<string, { views: number; likes: number; posts: number }> = {};

      for (const row of rows) {
        if (!row[1]) continue; // Skip rows without URL

        const views = parseInt(row[2]) || 0;
        const likes = parseInt(row[3]) || 0;
        const comments = parseInt(row[4]) || 0;
        const shares = parseInt(row[5]) || 0;
        const platform = detectPlatform(row[6] || row[1] || '');

        totalViews += views;
        totalLikes += likes;
        totalComments += comments;
        totalShares += shares;

        if (!byPlatform[platform]) {
          byPlatform[platform] = { views: 0, likes: 0, posts: 0 };
        }
        byPlatform[platform].views += views;
        byPlatform[platform].likes += likes;
        byPlatform[platform].posts += 1;
      }

      const snapshot: CampaignSnapshot = {
        timestamp: new Date().toISOString(),
        totalViews,
        totalLikes,
        totalComments,
        totalShares,
        postCount: rows.filter(r => r[1]).length,
        byPlatform,
      };

      await storeCampaignSnapshot(campaign.slug || campaign.name, snapshot);
      results[campaign.slug || campaign.name] = { success: true };

    } catch (error) {
      results[campaign.slug || campaign.name] = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  return NextResponse.json({
    message: 'Snapshot complete',
    timestamp: new Date().toISOString(),
    results,
  });
}
