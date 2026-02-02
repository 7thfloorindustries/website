/**
 * Internal Campaign Dashboard
 * Full dashboard with all analytics and controls
 */

import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCampaignConfig } from '@/data/campaigns';
import { fetchSheetData } from '@/lib/google-sheets';
import { transformSheetData } from '@/lib/campaign-data';
import DashboardPageClient from './DashboardPageClient';

interface PageProps {
  params: Promise<{ campaign: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { campaign } = await params;
  const config = getCampaignConfig(campaign);

  if (!config) {
    return { title: 'Campaign Not Found' };
  }

  return {
    title: `${config.name} - Dashboard | 7th Floor Digital`,
    description: `Campaign analytics and management for ${config.name}`,
  };
}

export default async function DashboardPage({ params }: PageProps) {
  const { campaign } = await params;
  const config = getCampaignConfig(campaign);

  if (!config || !config.spreadsheetId) {
    notFound();
  }

  // Fetch live data from Google Sheets
  let data;
  try {
    const sheetData = await fetchSheetData(config.spreadsheetId);
    data = transformSheetData(sheetData, config);
  } catch (error) {
    console.error('Failed to fetch campaign data:', error);
    data = {
      posts: [],
      metrics: {
        totalViews: 0,
        totalLikes: 0,
        totalComments: 0,
        totalShares: 0,
        totalDownloads: 0,
        totalEngagement: 0,
        engagementRate: 0,
        avgViewsPerPost: 0,
        likesRate: 0,
        commentsRate: 0,
        sharesRate: 0,
        downloadsRate: 0,
      },
      platforms: [],
      timelineData: [],
      platformBreakdown: [],
      activities: [],
      topPerformers: [],
      dailyPostsData: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  return (
    <DashboardPageClient
      campaignName={config.name}
      campaignSlug={campaign}
      status={config.status || 'active'}
      createdDate={config.created}
      spreadsheetUrl={config.spreadsheetUrl}
      data={data}
    />
  );
}
