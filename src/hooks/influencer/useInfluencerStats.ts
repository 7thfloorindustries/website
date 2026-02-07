import { useQuery } from '@tanstack/react-query';

async function fetchStats() {
  const res = await fetch('/api/influencers/stats');
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export function useInfluencerStats() {
  return useQuery({
    queryKey: ['influencer-stats'],
    queryFn: fetchStats,
    staleTime: 5 * 60 * 1000,
  });
}
