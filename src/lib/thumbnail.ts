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
        // Extract tweet ID from URL
        const tweetId = extractTweetId(postUrl);
        if (!tweetId) return null;

        // Use Twitter's syndication API to get video/media thumbnails
        const syndicationUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=0`;
        const response = await fetch(syndicationUrl, {
          next: { revalidate: 86400 }
        });

        if (!response.ok) return null;

        const data = await response.json();

        // Check for video thumbnail
        if (data.video?.poster) {
          return data.video.poster;
        }

        // Check for media (images)
        if (data.mediaDetails && data.mediaDetails.length > 0) {
          const media = data.mediaDetails[0];
          // Video thumbnail
          if (media.video_info?.variants) {
            return media.media_url_https;
          }
          // Image
          return media.media_url_https;
        }

        // Check photos array
        if (data.photos && data.photos.length > 0) {
          return data.photos[0].url;
        }

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
