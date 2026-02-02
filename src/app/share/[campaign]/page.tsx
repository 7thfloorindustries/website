/**
 * Public Shareable Campaign View
 * This is what clients see when they access the share link
 */

import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCampaignConfig } from '@/data/campaigns';
import { fetchSheetData } from '@/lib/google-sheets';
import { transformSheetData, formatNumber, formatDate } from '@/lib/campaign-data';
import SharePageClient from './SharePageClient';

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
    title: `${config.name} - Campaign Report | 7th Floor Digital`,
    description: `Live campaign analytics and performance metrics for ${config.name}`,
    openGraph: {
      title: `${config.name} - Campaign Report`,
      description: `Live campaign analytics and performance metrics`,
      type: 'website',
    },
  };
}

export default async function SharePage({ params }: PageProps) {
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
    // Return placeholder data on error
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
    <SharePageClient
      campaignName={config.name}
      campaignSlug={campaign}
      status={config.status || 'active'}
      createdDate={config.created}
      coverImage={config.coverImage}
      data={data}
    />
  );
}
