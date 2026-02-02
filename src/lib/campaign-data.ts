/**
 * Campaign Data Transformation Utilities
 * Transforms raw Google Sheets data into dashboard-ready format
 */

export interface Post {
  account: string;
  url: string;
  currentViews: number;
  likes: number;
  comments: number;
  shares: number;
  downloads: number;
  platform: string;
  lastUpdated: string;
  sparklineData: number[];
  thumbnailUrl?: string;  // From sheet Column I, or fetched client-side
}

export interface Metrics {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalDownloads: number;
  totalEngagement: number;
  engagementRate: number;
  avgViewsPerPost: number;
  likesRate: number;
  commentsRate: number;
  sharesRate: number;
  downloadsRate: number;
}

export interface PlatformBreakdown {
  name: string;
  value: number;
  count: number;
}

export interface Activity {
  type: string;
  message: string;
  timestamp: string;
  count?: number;
}

export interface CampaignData {
  posts: Post[];
  metrics: Metrics;
  platforms: string[];
  timelineData: number[];
  timelineByPlatform: Record<string, number[]>;
  platformBreakdown: PlatformBreakdown[];
  activities: Activity[];
  topPerformers: Post[];
  dailyPostsData: number[];
  lastUpdated: string;
}

export interface CampaignConfig {
  name: string;
  slug?: string;
  spreadsheetId: string;
  spreadsheetUrl?: string;
  status?: string;
  created?: string;
  urls?: string[];
  platforms?: Record<string, number>;
  coverImage?: string;  // Path relative to public/, e.g., "campaigns/mike-will.jpg"
  spend?: number;       // Campaign spend in USD
}

export function detectPlatform(input: string): string {
  const str = String(input).toLowerCase();
  if (str.includes('twitter') || str.includes('x.com') || str === 'twitter') return 'X / Twitter';
  if (str.includes('tiktok') || str === 'tiktok') return 'TikTok';
  if (str.includes('instagram') || str === 'instagram') return 'Instagram';
  if (str.includes('youtube') || str === 'youtube') return 'YouTube';
  if (str.includes('facebook') || str === 'facebook') return 'Facebook';
  return 'Social';
}

function generateSparklineData(currentViews: number, points = 12): number[] {
  const data: number[] = [];
  let value = currentViews * 0.3;

  for (let i = 0; i < points; i++) {
    const growth = 1 + (Math.random() * 0.3);
    value = Math.min(value * growth, currentViews);
    data.push(Math.round(value));
  }

  data[data.length - 1] = currentViews;
  return data;
}

function calculateMetrics(posts: Post[]): Metrics {
  const totalViews = posts.reduce((sum, p) => sum + (p.currentViews || 0), 0);
  const totalLikes = posts.reduce((sum, p) => sum + (p.likes || 0), 0);
  const totalComments = posts.reduce((sum, p) => sum + (p.comments || 0), 0);
  const totalShares = posts.reduce((sum, p) => sum + (p.shares || 0), 0);
  const totalDownloads = posts.reduce((sum, p) => sum + (p.downloads || 0), 0);

  const totalEngagement = totalLikes + totalComments + totalShares;
  const engagementRate = totalViews > 0 ? ((totalEngagement / totalViews) * 100) : 0;
  const avgViewsPerPost = posts.length > 0 ? Math.round(totalViews / posts.length) : 0;

  return {
    totalViews,
    totalLikes,
    totalComments,
    totalShares,
    totalDownloads,
    totalEngagement,
    engagementRate: parseFloat(engagementRate.toFixed(1)),
    avgViewsPerPost,
    likesRate: totalViews > 0 ? (totalLikes / totalViews) * 100 : 0,
    commentsRate: totalViews > 0 ? (totalComments / totalViews) * 100 : 0,
    sharesRate: totalViews > 0 ? (totalShares / totalViews) * 100 : 0,
    downloadsRate: totalViews > 0 ? (totalDownloads / totalViews) * 100 : 0
  };
}

function generateTimelineData(posts: Post[], days = 14, seed = 0): number[] {
  const data: number[] = [];
  const totalViews = posts.reduce((sum, p) => sum + (p.currentViews || 0), 0);

  if (totalViews === 0) {
    return Array(days).fill(0);
  }

  // Use seed to create different curve characteristics per platform
  const curveShift = 0.25 + (seed % 5) * 0.1; // Varies between 0.25-0.65
  const steepness = 8 + (seed % 3) * 2; // Varies between 8-12

  // Add some randomness based on seed
  const pseudoRandom = (i: number) => {
    const x = Math.sin(seed * 9999 + i * 7777) * 10000;
    return x - Math.floor(x);
  };

  for (let i = 0; i < days; i++) {
    const dayProgress = i / (days - 1);
    // Base S-curve with varying steepness and shift point
    const growthFactor = 1 / (1 + Math.exp(-steepness * (dayProgress - curveShift)));
    // Add small daily variation (±5%)
    const variation = 1 + (pseudoRandom(i) - 0.5) * 0.1;
    data.push(Math.round(totalViews * growthFactor * variation));
  }

  // Ensure last point equals total views
  data[data.length - 1] = totalViews;

  return data;
}

function generateTimelineByPlatform(posts: Post[], platforms: string[], days = 14): Record<string, number[]> {
  const result: Record<string, number[]> = {};

  platforms.forEach((platform, index) => {
    const platformPosts = posts.filter(p => p.platform === platform);
    // Use platform index as seed for different curve shapes
    result[platform] = generateTimelineData(platformPosts, days, index + 1);
  });

  return result;
}

function generatePlatformBreakdown(posts: Post[]): PlatformBreakdown[] {
  const breakdown: Record<string, { count: number; views: number }> = {};

  posts.forEach(post => {
    const platform = post.platform;
    if (!breakdown[platform]) {
      breakdown[platform] = { count: 0, views: 0 };
    }
    breakdown[platform].count++;
    breakdown[platform].views += post.currentViews || 0;
  });

  return Object.entries(breakdown).map(([name, data]) => ({
    name,
    value: data.views,
    count: data.count
  }));
}

function generateActivityFeed(posts: Post[], createdDate?: string): Activity[] {
  const activities: Activity[] = [];
  const now = new Date();

  activities.push({
    type: 'campaign_created',
    message: 'Campaign created',
    timestamp: createdDate || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  });

  const batches = Math.ceil(posts.length / 5);
  for (let i = 0; i < Math.min(batches, 3); i++) {
    const count = Math.min(5 + Math.floor(Math.random() * 5), posts.length - i * 5);
    if (count > 0) {
      activities.unshift({
        type: 'posts_added',
        message: `${count} posts added`,
        count,
        timestamp: new Date(now.getTime() - (i + 1) * 24 * 60 * 60 * 1000).toISOString()
      });
    }
  }

  activities.unshift({
    type: 'data_refreshed',
    message: 'Data refreshed',
    timestamp: new Date().toISOString()
  });

  return activities.slice(0, 6);
}

export function transformSheetData(sheetData: string[][], config?: CampaignConfig): CampaignData {
  const rows = sheetData.slice(1) || [];

  // Parse rows into post objects
  const posts: Post[] = rows.map(row => {
    const views = parseInt(row[2]) || 0;      // Column C - Views
    const likes = parseInt(row[3]) || 0;       // Column D - Likes
    const comments = parseInt(row[4]) || 0;    // Column E - Comments
    const shares = parseInt(row[5]) || 0;      // Column F - Shares
    const downloads = Math.floor(views * 0.007); // Estimate from views

    return {
      account: row[0] || 'Unknown',           // Column A
      url: row[1] || '',                      // Column B
      currentViews: views,
      likes,
      comments,
      shares,
      downloads,
      platform: detectPlatform(row[6] || row[1] || ''),  // Column G or URL fallback
      lastUpdated: row[7] || new Date().toISOString(),   // Column H if exists
      sparklineData: generateSparklineData(views),
      thumbnailUrl: row[8] || undefined       // Column I - Manual thumbnail URL
    };
  }).filter(post => post.url);

  // Calculate all derived data
  const metrics = calculateMetrics(posts);
  const platforms = [...new Set(posts.map(p => p.platform))];
  const timelineData = generateTimelineData(posts);
  const timelineByPlatform = generateTimelineByPlatform(posts, platforms);
  const platformBreakdown = generatePlatformBreakdown(posts);
  const activities = generateActivityFeed(posts, config?.created);

  // Top performers
  const topPerformers = [...posts]
    .sort((a, b) => b.currentViews - a.currentViews)
    .slice(0, 5);

  // Daily posts data
  const dailyPostsData = Array.from({ length: 14 }, () =>
    Math.floor(Math.random() * Math.max(1, posts.length / 7)) + 1
  );

  return {
    posts,
    metrics,
    platforms,
    timelineData,
    timelineByPlatform,
    platformBreakdown,
    activities,
    topPerformers,
    dailyPostsData,
    lastUpdated: new Date().toISOString()
  };
}

export function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

export function formatDate(dateStr?: string): string {
  if (!dateStr) return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTimeAgo(timestamp: string): string {
  if (!timestamp) return '';
  const now = new Date();
  const date = new Date(timestamp);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
