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
        // Twitter oEmbed has limited thumbnail support
        // It primarily returns HTML for embedding, not thumbnails
        // We could try to extract from the HTML or use a fallback
        const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(postUrl)}`;
        const response = await fetch(oembedUrl, {
          next: { revalidate: 86400 }
        });

        if (!response.ok) return null;

        // Twitter oEmbed doesn't return thumbnail_url directly
        // Return null to show placeholder - could be enhanced with image extraction
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
