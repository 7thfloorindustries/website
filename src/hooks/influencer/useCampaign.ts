import { useQuery } from '@tanstack/react-query';

interface CampaignDetailParams {
  creatorsLimit?: number;
  creatorsPage?: number;
  postsLimit?: number;
  postsPage?: number;
  postsSort?: string;
  sortDir?: 'asc' | 'desc';
}

async function fetchCampaign(slug: string, params: CampaignDetailParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.postsPage) searchParams.set('posts_page', String(params.postsPage));
  if (params.postsLimit) searchParams.set('posts_limit', String(params.postsLimit));
  if (params.creatorsPage) searchParams.set('creators_page', String(params.creatorsPage));
  if (params.creatorsLimit) searchParams.set('creators_limit', String(params.creatorsLimit));
  if (params.postsSort) searchParams.set('posts_sort', params.postsSort);
  if (params.sortDir) searchParams.set('sort_dir', params.sortDir);

  const qs = searchParams.toString();
  const res = await fetch(`/api/influencers/campaign/${slug}${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error('Failed to fetch campaign');
  return res.json();
}

export function useCampaign(slug: string, params: CampaignDetailParams = {}) {
  return useQuery({
    queryKey: ['campaign', slug, params],
    queryFn: () => fetchCampaign(slug, params),
    staleTime: 5 * 60 * 1000,
    enabled: !!slug,
  });
}
