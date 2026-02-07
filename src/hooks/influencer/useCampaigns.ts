import { useQuery } from '@tanstack/react-query';

interface CampaignParams {
  enabled?: boolean;
  intake?: 'all' | 'main' | 'pending';
  page?: number;
  review?: 'all' | 'needs_review';
  search?: string;
  genre?: string;
  platform?: string;
  sort?: string;
  limit?: number;
}

async function fetchCampaigns(params: CampaignParams) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.search) searchParams.set('search', params.search);
  if (params.genre) searchParams.set('genre', params.genre);
  if (params.platform) searchParams.set('platform', params.platform);
  if (params.sort) searchParams.set('sort', params.sort);
  if (params.intake) searchParams.set('intake', params.intake);
  if (params.review) searchParams.set('review', params.review);
  if (params.limit) searchParams.set('limit', String(params.limit));

  const res = await fetch(`/api/influencers/campaigns?${searchParams.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch campaigns');
  return res.json();
}

export function useCampaigns(params: CampaignParams = {}) {
  const { enabled = true, ...queryParams } = params;
  return useQuery({
    queryKey: ['campaigns', queryParams],
    queryFn: () => fetchCampaigns(queryParams),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}
