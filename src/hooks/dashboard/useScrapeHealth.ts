'use client';

import { useQuery } from '@tanstack/react-query';
import type { ScrapeHealthReport, ScrapeHealthPlatform } from '@/lib/dashboard/types';

interface RawScrapeHealthPlatform extends Omit<ScrapeHealthPlatform, 'latestSnapshotAt'> {
  latestSnapshotAt: string | null;
}

interface RawScrapeHealthReport extends Omit<ScrapeHealthReport, 'generatedAt' | 'latestSnapshotAt' | 'platforms'> {
  generatedAt: string;
  latestSnapshotAt: string | null;
  platforms: RawScrapeHealthPlatform[];
}

export const SCRAPE_HEALTH_POLL_INTERVAL_MS = 60 * 1000;

async function fetchScrapeHealth(): Promise<ScrapeHealthReport> {
  const response = await fetch('/api/admin/scrape-health', {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch scrape health (${response.status})`);
  }

  const payload = await response.json() as RawScrapeHealthReport;

  return {
    ...payload,
    generatedAt: new Date(payload.generatedAt),
    latestSnapshotAt: payload.latestSnapshotAt ? new Date(payload.latestSnapshotAt) : null,
    platforms: payload.platforms.map((platform) => ({
      ...platform,
      latestSnapshotAt: platform.latestSnapshotAt ? new Date(platform.latestSnapshotAt) : null,
    })),
  };
}

export function useScrapeHealth() {
  return useQuery<ScrapeHealthReport>({
    queryKey: ['scrapeHealth'],
    queryFn: fetchScrapeHealth,
    staleTime: SCRAPE_HEALTH_POLL_INTERVAL_MS,
    refetchInterval: SCRAPE_HEALTH_POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
}
