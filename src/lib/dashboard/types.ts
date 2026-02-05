export type Platform = 'tiktok' | 'instagram' | 'twitter';

export interface PlatformMetrics {
  handle: string;
  followers: number;
  deltaFollowers: number;
  posts: number;
  deltaPosts: number;
  postsLast7d: number;
  // TikTok specific
  likes?: number;
  deltaLikes?: number;
  videos?: number;
  deltaVideos?: number;
  // Pre-calculated deltas from database (when available)
  delta1d?: number;
  delta7d?: number;
  // Calculated fields
  engagementRate?: number;
}

export interface CreatorRecord {
  timestamp: Date;
  tiktok: PlatformMetrics | null;
  instagram: PlatformMetrics | null;
  twitter: PlatformMetrics | null;
  marketingRep?: string;
}

export interface Creator {
  id: string;
  handles: {
    tiktok?: string;
    instagram?: string;
    twitter?: string;
  };
  latestMetrics: CreatorRecord | null;
  history: CreatorRecord[];
}

export interface AggregatedStats {
  totalFollowers: number;
  totalGrowth7d: number;
  activeCreators: number;
  byPlatform: {
    tiktok: { followers: number; growth: number; creators: number };
    instagram: { followers: number; growth: number; creators: number };
    twitter: { followers: number; growth: number; creators: number };
  };
}

export interface TopPerformer {
  handle: string;
  platform: Platform;
  followers: number;
  growth: number;
  growthPercent: number;
}

export interface LeaderboardEntry {
  rank: number;
  handle: string;
  platform: Platform;
  followers: number;
  deltaFollowers: number;
  delta1d?: number;
  delta7d?: number;
  growthPercent: number;
  postsLast7d: number;
  deltaPosts: number;
  deltaLikes?: number;
  engagementRate?: number;
  conversionRate?: number;
  history: { date: Date; followers: number }[];
  marketingRep?: string;
}

export interface RepStats {
  rep: string;
  totalFollowers: number;
  totalGrowth7d: number;
  fanpageCount: number;
  avgGrowthPercent: number;
}

export interface DateRange {
  start: Date;
  end: Date;
  label: string;
  days: number;
}

export type DateRangePreset = '7d' | '14d' | '30d' | '90d' | 'custom';

export interface CompareSelection {
  entries: LeaderboardEntry[];
  maxSelections: number;
}
