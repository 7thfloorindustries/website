/**
 * CreatorCore API client
 * Fetches campaigns and posts with cursor-based pagination
 * No auth required
 */

export const DEFAULT_CREATORCORE_BASE_URL = 'https://app.creatorcore.co/api/1.1/obj';
const PAGE_LIMIT = 100;

export interface CCApiCampaign {
  _id: string;
  title?: string;
  slug?: string;
  Slug?: string;
  budget?: number | null;
  Budget?: number | null;
  currency?: string | null;
  Currency?: string;
  organization?: string;
  'Org ID'?: string;
  displayPlatforms?: string[] | null;
  platforms?: string | null;
  Platforms?: string;
  'Created Date'?: string;
  created_at?: string;
  Archive?: boolean;
  Archived?: boolean;
  creatorProfiles?: string[] | null;
  'Creator Count'?: number;
  posts?: string[] | null;
  'Total Posts'?: number;
  thumbnail?: string | null;
  'Campaign Thumbnail'?: string;
  [key: string]: unknown;
}

export interface CCApiPost {
  _id: string;
  campaign?: string;
  Campaign?: string;
  username?: string;
  Username?: string;
  platform?: string;
  Platform?: string;
  postUrl?: string;
  'Post URL'?: string;
  'latestViews/Engagement'?: number;
  Views?: number;
  postDate?: string;
  'Post Date'?: string;
  status?: string;
  'Post Status'?: string;
  'Created Date'?: string;
  [key: string]: unknown;
}

interface CCApiResponse<T> {
  response: {
    results: T[];
    remaining: number;
    count: number;
    cursor: number;
  };
}

interface CCApiItemResponse<T> {
  response: T;
}

function getBaseUrl(baseUrl?: string): string {
  const normalized = (baseUrl || DEFAULT_CREATORCORE_BASE_URL).trim();
  return normalized.replace(/\/+$/, '');
}

async function fetchPage<T>(
  endpoint: string,
  cursor: number,
  limit: number = PAGE_LIMIT,
  baseUrl?: string
): Promise<{ results: T[]; remaining: number; cursor: number; count: number }> {
  const safeLimit = Math.min(PAGE_LIMIT, Math.max(1, limit));
  const url = `${getBaseUrl(baseUrl)}/${endpoint}?cursor=${cursor}&limit=${safeLimit}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`CreatorCore API error: ${response.status} ${response.statusText}`);
  }

  const data: CCApiResponse<T> = await response.json();
  return {
    results: data.response.results,
    remaining: data.response.remaining,
    cursor: data.response.cursor,
    count: data.response.count,
  };
}

interface FetchOptions {
  baseUrl?: string;
  limit?: number;
  maxPages?: number;
}

export async function fetchCampaigns(
  startCursor: number = 0,
  options: FetchOptions = {}
): Promise<{ campaigns: CCApiCampaign[]; nextCursor: number; hasMore: boolean; pages: number }> {
  const maxPages = Math.max(1, options.maxPages ?? 10);
  const limit = Math.min(PAGE_LIMIT, Math.max(1, options.limit ?? PAGE_LIMIT));
  const all: CCApiCampaign[] = [];
  let cursor = startCursor;
  let hasMore = true;
  let pages = 0;

  while (hasMore && pages < maxPages) {
    const page = await fetchPage<CCApiCampaign>('campaign', cursor, limit, options.baseUrl);
    all.push(...page.results);
    cursor = page.cursor + page.count;
    hasMore = page.remaining > 0 && page.results.length > 0;
    pages++;
  }

  return { campaigns: all, nextCursor: cursor, hasMore, pages };
}

export async function fetchCampaignById(
  campaignId: string,
  options: { baseUrl?: string } = {}
): Promise<CCApiCampaign | null> {
  const normalized = campaignId.trim();
  if (!normalized) return null;

  const response = await fetch(`${getBaseUrl(options.baseUrl)}/campaign/${encodeURIComponent(normalized)}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`CreatorCore API error: ${response.status} ${response.statusText}`);
  }

  const data: CCApiItemResponse<CCApiCampaign> = await response.json();
  return data.response ?? null;
}

export async function fetchPostById(
  postId: string,
  options: { baseUrl?: string } = {}
): Promise<CCApiPost | null> {
  const normalized = postId.trim();
  if (!normalized) return null;

  const response = await fetch(`${getBaseUrl(options.baseUrl)}/post/${encodeURIComponent(normalized)}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`CreatorCore API error: ${response.status} ${response.statusText}`);
  }

  const data: CCApiItemResponse<CCApiPost> = await response.json();
  return data.response ?? null;
}

export async function fetchPosts(
  startCursor: number = 0,
  options: FetchOptions = {}
): Promise<{ posts: CCApiPost[]; nextCursor: number; hasMore: boolean; pages: number }> {
  const maxPages = Math.max(1, options.maxPages ?? 20);
  const limit = Math.min(PAGE_LIMIT, Math.max(1, options.limit ?? PAGE_LIMIT));
  const all: CCApiPost[] = [];
  let cursor = startCursor;
  let hasMore = true;
  let pages = 0;

  while (hasMore && pages < maxPages) {
    const page = await fetchPage<CCApiPost>('post', cursor, limit, options.baseUrl);
    all.push(...page.results);
    cursor = page.cursor + page.count;
    hasMore = page.remaining > 0 && page.results.length > 0;
    pages++;
  }

  return { posts: all, nextCursor: cursor, hasMore, pages };
}
