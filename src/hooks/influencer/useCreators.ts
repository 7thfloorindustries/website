import { useQuery } from '@tanstack/react-query';

interface CreatorParams {
  agency?: string;
  campaign_slug?: string;
  genre?: string;
  page?: number;
  min_genre_fit?: number;
  review?: 'all' | 'needs_review';
  search?: string;
  sort?: string;
  limit?: number;
}

async function fetchCreators(params: CreatorParams) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.search) searchParams.set('search', params.search);
  if (params.agency) searchParams.set('agency', params.agency);
  if (params.sort) searchParams.set('sort', params.sort);
  if (params.genre) searchParams.set('genre', params.genre);
  if (params.campaign_slug) searchParams.set('campaign_slug', params.campaign_slug);
  if (params.min_genre_fit != null) searchParams.set('min_genre_fit', String(params.min_genre_fit));
  if (params.review) searchParams.set('review', params.review);
  if (params.limit) searchParams.set('limit', String(params.limit));

  const res = await fetch(`/api/influencers/creators?${searchParams.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch creators');
  return res.json();
}

export function useCreators(params: CreatorParams = {}) {
  return useQuery({
    queryKey: ['creators', params],
    queryFn: () => fetchCreators(params),
    staleTime: 5 * 60 * 1000,
  });
}
