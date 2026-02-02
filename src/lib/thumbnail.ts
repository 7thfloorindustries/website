/**
 * Thumbnail Extraction Utility
 * Fetches thumbnails from social media post URLs using oEmbed endpoints
 */

export type Platform = 'tiktok' | 'twitter' | 'unknown';

export function detectPlatformFromUrl(url: string): Platform {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('tiktok.com')) return 'tiktok';
  if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) return 'twitter';
  return 'unknown';
}

/**
 * Extracts tweet ID from Twitter/X URLs
 * Handles formats like:
 * - https://twitter.com/user/status/123456789
 * - https://x.com/user/status/123456789
 */
function extractTweetId(url: string): string | null {
  const patterns = [
    /twitter\.com\/\w+\/status\/(\d+)/,
    /x\.com\/\w+\/status\/(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

interface OEmbedResponse {
  thumbnail_url?: string;
  url?: string;
  // Twitter oEmbed returns different structure
  [key: string]: unknown;
}

/**
 * Fetches thumbnail URL for a social media post
 * Uses platform-specific oEmbed endpoints
 * @param postUrl - The URL of the social media post
 * @returns The thumbnail URL or null if not available
 */
export async function getThumbnailUrl(postUrl: string): Promise<string | null> {
  const platform = detectPlatformFromUrl(postUrl);

  try {
    switch (platform) {
      case 'tiktok': {
        const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(postUrl)}`;
        const response = await fetch(oembedUrl, {
          next: { revalidate: 86400 } // Cache for 24 hours
        });

        if (!response.ok) return null;

        const data: OEmbedResponse = await response.json();
        return data.thumbnail_url || null;
      }

      case 'twitter': {
        // Twitter API access requires paid tier ($100+/month)
        // Manual thumbnails can be added via Column I in the Google Sheet
        return null;
      }

      default:
        return null;
    }
  } catch (error) {
    console.error(`Failed to fetch thumbnail for ${postUrl}:`, error);
    return null;
  }
}
