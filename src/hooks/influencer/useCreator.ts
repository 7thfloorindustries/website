import { useQuery } from '@tanstack/react-query';

async function fetchCreator(username: string) {
  const res = await fetch(`/api/influencers/creator/${username}`);
  if (!res.ok) throw new Error('Failed to fetch creator');
  return res.json();
}

export function useCreator(username: string) {
  return useQuery({
    queryKey: ['creator', username],
    queryFn: () => fetchCreator(username),
    staleTime: 5 * 60 * 1000,
    enabled: !!username,
  });
}
