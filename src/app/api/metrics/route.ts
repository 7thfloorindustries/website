import { NextResponse } from 'next/server';
import { getMetricsWithDeltas, isDatabaseConfigured, type MetricWithDeltas } from '@/lib/db';
import { fetchSheetData } from '@/lib/dashboard/googleSheets';
import type { CreatorRecord, PlatformMetrics } from '@/lib/dashboard/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0; // No cache - data updates after scrapes via revalidatePath

/**
 * Transform PostgreSQL metrics to CreatorRecord format (one record per platform entry)
 */
function transformToFlatRecords(metrics: MetricWithDeltas[]): CreatorRecord[] {
  return metrics.map(metric => {
    // For TikTok, use videos for posts metrics; for others use posts
    const isTikTok = metric.platform === 'tiktok';
    const postsValue = isTikTok ? metric.videos : metric.posts;
    const deltaPostsValue = isTikTok ? (metric.delta_videos || 0) : (metric.delta_posts || 0);
    const posts7dValue = isTikTok ? (metric.delta_videos_7d || 0) : (metric.delta_posts_7d || 0);

    const platformMetrics: PlatformMetrics = {
      handle: metric.handle,
      followers: metric.followers,
      deltaFollowers: metric.delta_followers || 0,
      posts: postsValue,
      deltaPosts: deltaPostsValue,
      postsLast7d: posts7dValue,
      likes: metric.likes,
      deltaLikes: metric.delta_likes || 0,
      videos: metric.videos,
      deltaVideos: metric.delta_videos || 0,
      // Pre-calculated deltas from database
      delta1d: metric.delta_1d,
      delta7d: metric.delta_7d,
    };

    return {
      timestamp: new Date(metric.scraped_at),
      tiktok: metric.platform === 'tiktok' ? platformMetrics : null,
      instagram: metric.platform === 'instagram' ? platformMetrics : null,
      twitter: metric.platform === 'twitter' ? platformMetrics : null,
      marketingRep: metric.marketing_rep || undefined,
    };
  });
}

export async function GET() {
  try {
    // Check if PostgreSQL is configured
    const dbConfigured = await isDatabaseConfigured();

    if (dbConfigured) {
      // Use PostgreSQL - primary data source
      console.log('Fetching metrics from PostgreSQL...');

      const metrics = await getMetricsWithDeltas();

      if (metrics.length === 0) {
        // Database is configured but empty - fall back to Google Sheets
        console.log('PostgreSQL empty, falling back to Google Sheets...');
        return await fetchFromGoogleSheets();
      }

      // Transform to expected format
      const records = transformToFlatRecords(metrics);

      // Serialize dates
      const serialized = records.map(record => ({
        ...record,
        timestamp: record.timestamp.toISOString(),
      }));

      return NextResponse.json(serialized);
    } else {
      // Fall back to Google Sheets
      console.log('PostgreSQL not configured, using Google Sheets...');
      return await fetchFromGoogleSheets();
    }
  } catch (error) {
    console.error('Error fetching metrics:', error);

    // Try Google Sheets as fallback on any error
    try {
      console.log('Error with PostgreSQL, falling back to Google Sheets...');
      return await fetchFromGoogleSheets();
    } catch (fallbackError) {
      console.error('Fallback to Google Sheets also failed:', fallbackError);
      return NextResponse.json(
        { error: 'Failed to fetch metrics' },
        { status: 500 }
      );
    }
  }
}

/**
 * Fetch from Google Sheets (legacy/fallback)
 */
async function fetchFromGoogleSheets() {
  const records = await fetchSheetData();

  // Convert dates to ISO strings for JSON serialization
  const serialized = records.map(record => ({
    ...record,
    timestamp: record.timestamp.toISOString(),
  }));

  return NextResponse.json(serialized);
}
