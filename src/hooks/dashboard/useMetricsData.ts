'use client';

import { useQuery } from '@tanstack/react-query';
import type { CreatorRecord } from '@/lib/dashboard/types';

interface RawCreatorRecord extends Omit<CreatorRecord, 'timestamp'> {
  timestamp: string;
}

async function fetchMetrics(): Promise<CreatorRecord[]> {
  const response = await fetch('/api/metrics');
  if (!response.ok) {
    throw new Error('Failed to fetch metrics');
  }
  const data: RawCreatorRecord[] = await response.json();

  // Convert timestamp strings back to Date objects
  return data.map(record => ({
    ...record,
    timestamp: new Date(record.timestamp),
  }));
}

export function useMetricsData() {
  return useQuery<CreatorRecord[]>({
    queryKey: ['metricsData'],
    queryFn: fetchMetrics,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
  });
}
