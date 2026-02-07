'use client';

import { useQuery } from '@tanstack/react-query';
import type { CreatorRecord } from '@/lib/dashboard/types';

interface RawCreatorRecord extends Omit<CreatorRecord, 'timestamp'> {
  timestamp: string;
}

export const METRICS_POLL_INTERVAL_MS = 5 * 60 * 1000;

async function fetchMetrics(): Promise<CreatorRecord[]> {
  const response = await fetch('/api/metrics?mode=history&days=90');
  if (!response.ok) {
    throw new Error(`Failed to fetch metrics (${response.status})`);
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
    staleTime: METRICS_POLL_INTERVAL_MS,
    refetchInterval: METRICS_POLL_INTERVAL_MS,
  });
}
