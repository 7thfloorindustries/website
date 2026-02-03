import type { CreatorRecord, PlatformMetrics } from './types';

interface SheetRow {
  timestamp: string;
  tiktokHandle: string;
  tiktokFollowers: string;
  tiktokDeltaFollowers: string;
  tiktokLikes: string;
  tiktokDeltaLikes: string;
  tiktokVideos: string;
  tiktokDeltaVideos: string;
  tiktokPosts7d: string;
  igHandle: string;
  igFollowers: string;
  igDeltaFollowers: string;
  igPosts: string;
  igDeltaPosts: string;
  igPosts7d: string;
  twitterHandle: string;
  twitterFollowers: string;
  twitterDeltaFollowers: string;
  tweets: string;
  twitterDeltaTweets: string;
  twitterPosts7d: string;
  marketingRep: string;
}

function parseNumber(val: string): number {
  if (!val || val === '' || val === 'N/A') return 0;
  return parseInt(val.replace(/,/g, ''), 10) || 0;
}

function parseRow(row: string[]): SheetRow {
  return {
    timestamp: row[0] || '',
    tiktokHandle: row[1] || '',
    tiktokFollowers: row[2] || '',
    tiktokDeltaFollowers: row[3] || '',
    tiktokLikes: row[4] || '',
    tiktokDeltaLikes: row[5] || '',
    tiktokVideos: row[6] || '',
    tiktokDeltaVideos: row[7] || '',
    tiktokPosts7d: row[8] || '',
    igHandle: row[9] || '',
    igFollowers: row[10] || '',
    igDeltaFollowers: row[11] || '',
    igPosts: row[12] || '',
    igDeltaPosts: row[13] || '',
    igPosts7d: row[14] || '',
    twitterHandle: row[15] || '',
    twitterFollowers: row[16] || '',
    twitterDeltaFollowers: row[17] || '',
    tweets: row[18] || '',
    twitterDeltaTweets: row[19] || '',
    twitterPosts7d: row[20] || '',
    marketingRep: row[21] || '',
  };
}

function rowToCreatorRecord(row: SheetRow): CreatorRecord {
  const tiktok: PlatformMetrics | null = row.tiktokHandle ? {
    handle: row.tiktokHandle,
    followers: parseNumber(row.tiktokFollowers),
    deltaFollowers: parseNumber(row.tiktokDeltaFollowers),
    likes: parseNumber(row.tiktokLikes),
    deltaLikes: parseNumber(row.tiktokDeltaLikes),
    videos: parseNumber(row.tiktokVideos),
    deltaVideos: parseNumber(row.tiktokDeltaVideos),
    posts: parseNumber(row.tiktokVideos),
    deltaPosts: parseNumber(row.tiktokDeltaVideos),
    postsLast7d: parseNumber(row.tiktokPosts7d),
  } : null;

  const instagram: PlatformMetrics | null = row.igHandle ? {
    handle: row.igHandle,
    followers: parseNumber(row.igFollowers),
    deltaFollowers: parseNumber(row.igDeltaFollowers),
    posts: parseNumber(row.igPosts),
    deltaPosts: parseNumber(row.igDeltaPosts),
    postsLast7d: parseNumber(row.igPosts7d),
  } : null;

  const twitter: PlatformMetrics | null = row.twitterHandle ? {
    handle: row.twitterHandle,
    followers: parseNumber(row.twitterFollowers),
    deltaFollowers: parseNumber(row.twitterDeltaFollowers),
    posts: parseNumber(row.tweets),
    deltaPosts: parseNumber(row.twitterDeltaTweets),
    postsLast7d: parseNumber(row.twitterPosts7d),
  } : null;

  return {
    timestamp: row.timestamp ? new Date(row.timestamp) : new Date(),
    tiktok,
    instagram,
    twitter,
    marketingRep: row.marketingRep || undefined,
  };
}

export async function fetchSheetData(): Promise<CreatorRecord[]> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!sheetId || !apiKey) {
    console.warn('Google Sheets credentials not set, using mock data');
    return getMockData();
  }

  const range = 'Weekly Tracking!A2:V1000';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;

  try {
    const response = await fetch(url, { next: { revalidate: 300 } }); // Cache for 5 minutes
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const rows: string[][] = data.values || [];

    return rows.map(parseRow).map(rowToCreatorRecord);
  } catch (error) {
    console.error('Error fetching sheet data:', error);
    return getMockData();
  }
}

function getMockData(): CreatorRecord[] {
  const now = new Date();
  const mockRecords: CreatorRecord[] = [];

  for (let week = 0; week < 4; week++) {
    const timestamp = new Date(now);
    timestamp.setDate(timestamp.getDate() - (week * 7));

    mockRecords.push({
      timestamp,
      marketingRep: 'Alex',
      tiktok: {
        handle: '@creator1',
        followers: 125000 - (week * 3500),
        deltaFollowers: week === 0 ? 3500 : 0,
        likes: 2400000 - (week * 50000),
        deltaLikes: week === 0 ? 50000 : 0,
        videos: 89 - week,
        deltaVideos: week === 0 ? 3 : 0,
        posts: 89 - week,
        deltaPosts: week === 0 ? 3 : 0,
        postsLast7d: 3,
      },
      instagram: {
        handle: '@creator1_ig',
        followers: 85000 - (week * 2100),
        deltaFollowers: week === 0 ? 2100 : 0,
        posts: 156 - week,
        deltaPosts: week === 0 ? 2 : 0,
        postsLast7d: 2,
      },
      twitter: {
        handle: '@creator1_x',
        followers: 45000 - (week * 800),
        deltaFollowers: week === 0 ? 800 : 0,
        posts: 892 - (week * 5),
        deltaPosts: week === 0 ? 5 : 0,
        postsLast7d: 5,
      },
    });

    mockRecords.push({
      timestamp,
      marketingRep: 'Jordan',
      tiktok: {
        handle: '@creator2',
        followers: 89000 - (week * 1200),
        deltaFollowers: week === 0 ? 1200 : 0,
        likes: 1800000 - (week * 30000),
        deltaLikes: week === 0 ? 30000 : 0,
        videos: 67 - week,
        deltaVideos: week === 0 ? 2 : 0,
        posts: 67 - week,
        deltaPosts: week === 0 ? 2 : 0,
        postsLast7d: 2,
      },
      instagram: {
        handle: '@creator2_ig',
        followers: 62000 - (week * 1500),
        deltaFollowers: week === 0 ? 1500 : 0,
        posts: 203 - week,
        deltaPosts: week === 0 ? 4 : 0,
        postsLast7d: 4,
      },
      twitter: {
        handle: '@creator2_x',
        followers: 28000 - (week * 600),
        deltaFollowers: week === 0 ? 600 : 0,
        posts: 534 - (week * 3),
        deltaPosts: week === 0 ? 3 : 0,
        postsLast7d: 3,
      },
    });

    mockRecords.push({
      timestamp,
      marketingRep: 'Sam',
      tiktok: {
        handle: '@creator3',
        followers: 234000 - (week * 5600),
        deltaFollowers: week === 0 ? 5600 : 0,
        likes: 4500000 - (week * 80000),
        deltaLikes: week === 0 ? 80000 : 0,
        videos: 145 - week,
        deltaVideos: week === 0 ? 4 : 0,
        posts: 145 - week,
        deltaPosts: week === 0 ? 4 : 0,
        postsLast7d: 4,
      },
      instagram: {
        handle: '@creator3_ig',
        followers: 178000 - (week * 4200),
        deltaFollowers: week === 0 ? 4200 : 0,
        posts: 312 - (week * 2),
        deltaPosts: week === 0 ? 3 : 0,
        postsLast7d: 3,
      },
      twitter: {
        handle: '@creator3_x',
        followers: 92000 - (week * 2300),
        deltaFollowers: week === 0 ? 2300 : 0,
        posts: 1456 - (week * 8),
        deltaPosts: week === 0 ? 8 : 0,
        postsLast7d: 8,
      },
    });
  }

  return mockRecords;
}
