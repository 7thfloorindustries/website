/**
 * Thumbnail API Route
 * Fetches thumbnails for social media posts with caching
 */

import { NextRequest, NextResponse } from 'next/server';
import { getThumbnailUrl, detectPlatformFromUrl } from '@/lib/thumbnail';

// In-memory cache with TTL (1 hour)
const cache = new Map<string, { url: string | null; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

function getCachedThumbnail(postUrl: string): string | null | undefined {
  const cached = cache.get(postUrl);
  if (!cached) return undefined;

  if (Date.now() - cached.timestamp > CACHE_TTL) {
    cache.delete(postUrl);
    return undefined;
  }

  return cached.url;
}

function setCachedThumbnail(postUrl: string, thumbnailUrl: string | null): void {
  cache.set(postUrl, { url: thumbnailUrl, timestamp: Date.now() });

  // Clean up old entries if cache gets too large
  if (cache.size > 1000) {
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        cache.delete(key);
      }
    }
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json(
      { error: 'Missing url parameter' },
      { status: 400 }
    );
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    return NextResponse.json(
      { error: 'Invalid URL format' },
      { status: 400 }
    );
  }

  // Check in-memory cache first
  const cachedUrl = getCachedThumbnail(url);
  if (cachedUrl !== undefined) {
    return NextResponse.json(
      { thumbnailUrl: cachedUrl, platform: detectPlatformFromUrl(url), cached: true },
      {
        headers: {
          'Cache-Control': 'public, max-age=86400', // 24 hours browser cache
        },
      }
    );
  }

  try {
    const thumbnailUrl = await getThumbnailUrl(url);

    // Cache the result (including null results to avoid repeated failures)
    setCachedThumbnail(url, thumbnailUrl);

    return NextResponse.json(
      { thumbnailUrl, platform: detectPlatformFromUrl(url), cached: false },
      {
        headers: {
          'Cache-Control': 'public, max-age=86400', // 24 hours browser cache
        },
      }
    );
  } catch (error) {
    console.error('Thumbnail API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch thumbnail', thumbnailUrl: null },
      { status: 200 } // Return 200 with null for graceful degradation
    );
  }
}
