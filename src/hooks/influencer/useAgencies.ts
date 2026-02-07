import { useQuery } from '@tanstack/react-query';

interface AgencyRow {
  key: string;
  name: string;
}

interface AgenciesResponse {
  agencies: AgencyRow[];
}

async function fetchAgencies(): Promise<AgenciesResponse> {
  const res = await fetch('/api/influencers/agencies');
  if (!res.ok) throw new Error('Failed to fetch agencies');
  return res.json();
}

export function useAgencies() {
  return useQuery({
    queryKey: ['agencies'],
    queryFn: fetchAgencies,
    staleTime: 5 * 60 * 1000,
  });
}

