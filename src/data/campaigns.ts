/**
 * Campaign Configurations
 * Maps campaign slugs to their Google Sheet IDs and metadata
 */

import type { CampaignConfig } from '@/lib/campaign-data';

// Campaign configurations - add new campaigns here
export const campaigns: Record<string, CampaignConfig> = {
  'mike-will-made-it-promo-campaign': {
    name: 'Mike Will Made It Promo Campaign',
    slug: 'mike-will-made-it-promo-campaign',
    spreadsheetId: '1RjSNpFMoKjMUtO6AotdCSEgm1xHKemvX2_1uJK5UOv4',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/1RjSNpFMoKjMUtO6AotdCSEgm1xHKemvX2_1uJK5UOv4/edit',
    status: 'active',
    created: '2026-01-31T00:00:00.000Z',
    platforms: {
      twitter: 13,
      tiktok: 23
    },
    coverImage: 'campaigns/mike-will-made-it.jpg',
    spend: 5000
  }
};

export function getCampaignConfig(slug: string): CampaignConfig | null {
  // Normalize slug (handle various formats)
  const normalizedSlug = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // Direct match
  if (campaigns[normalizedSlug]) {
    return campaigns[normalizedSlug];
  }

  // Try to find by partial match
  const matchingKey = Object.keys(campaigns).find(key =>
    key.includes(normalizedSlug) || normalizedSlug.includes(key)
  );

  return matchingKey ? campaigns[matchingKey] : null;
}

export function getAllCampaigns(): CampaignConfig[] {
  return Object.values(campaigns);
}
