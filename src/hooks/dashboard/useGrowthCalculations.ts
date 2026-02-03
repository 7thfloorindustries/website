'use client';

import { useMemo } from 'react';
import type {
  CreatorRecord,
  AggregatedStats,
  TopPerformer,
  LeaderboardEntry,
  Platform,
  DateRange,
  RepStats
} from '@/lib/dashboard/types';

export function useGrowthCalculations(
  records: CreatorRecord[],
  dateRange?: DateRange,
  selectedRep?: string | null
) {
  const dateFilteredRecords = useMemo(() => {
    if (!dateRange) return records;
    return records.filter(record => {
      const timestamp = record.timestamp.getTime();
      return timestamp >= dateRange.start.getTime() && timestamp <= dateRange.end.getTime();
    });
  }, [records, dateRange]);

  const filteredRecords = useMemo(() => {
    if (!selectedRep) return dateFilteredRecords;
    return dateFilteredRecords.filter(r => r.marketingRep === selectedRep);
  }, [dateFilteredRecords, selectedRep]);

  const aggregatedStats = useMemo<AggregatedStats>(() => {
    const latestRecords = getLatestRecordsByCreator(filteredRecords);

    let totalFollowers = 0;
    let totalGrowth = 0;
    const activeCreators = new Set<string>();

    const byPlatform = {
      tiktok: { followers: 0, growth: 0, creators: 0 },
      instagram: { followers: 0, growth: 0, creators: 0 },
      twitter: { followers: 0, growth: 0, creators: 0 },
    };

    for (const record of latestRecords) {
      if (record.tiktok) {
        totalFollowers += record.tiktok.followers;
        totalGrowth += record.tiktok.deltaFollowers;
        byPlatform.tiktok.followers += record.tiktok.followers;
        byPlatform.tiktok.growth += record.tiktok.deltaFollowers;
        byPlatform.tiktok.creators++;
        activeCreators.add(record.tiktok.handle);
      }

      if (record.instagram) {
        totalFollowers += record.instagram.followers;
        totalGrowth += record.instagram.deltaFollowers;
        byPlatform.instagram.followers += record.instagram.followers;
        byPlatform.instagram.growth += record.instagram.deltaFollowers;
        byPlatform.instagram.creators++;
        activeCreators.add(record.instagram.handle);
      }

      if (record.twitter) {
        totalFollowers += record.twitter.followers;
        totalGrowth += record.twitter.deltaFollowers;
        byPlatform.twitter.followers += record.twitter.followers;
        byPlatform.twitter.growth += record.twitter.deltaFollowers;
        byPlatform.twitter.creators++;
        activeCreators.add(record.twitter.handle);
      }
    }

    return {
      totalFollowers,
      totalGrowth7d: totalGrowth,
      activeCreators: activeCreators.size,
      byPlatform,
    };
  }, [filteredRecords]);

  const topPerformers = useMemo<TopPerformer[]>(() => {
    const latestRecords = getLatestRecordsByCreator(filteredRecords);
    const performers: TopPerformer[] = [];

    for (const record of latestRecords) {
      if (record.tiktok && record.tiktok.deltaFollowers > 0) {
        const prevFollowers = record.tiktok.followers - record.tiktok.deltaFollowers;
        performers.push({
          handle: record.tiktok.handle,
          platform: 'tiktok',
          followers: record.tiktok.followers,
          growth: record.tiktok.deltaFollowers,
          growthPercent: prevFollowers > 0 ? (record.tiktok.deltaFollowers / prevFollowers) * 100 : 0,
        });
      }

      if (record.instagram && record.instagram.deltaFollowers > 0) {
        const prevFollowers = record.instagram.followers - record.instagram.deltaFollowers;
        performers.push({
          handle: record.instagram.handle,
          platform: 'instagram',
          followers: record.instagram.followers,
          growth: record.instagram.deltaFollowers,
          growthPercent: prevFollowers > 0 ? (record.instagram.deltaFollowers / prevFollowers) * 100 : 0,
        });
      }

      if (record.twitter && record.twitter.deltaFollowers > 0) {
        const prevFollowers = record.twitter.followers - record.twitter.deltaFollowers;
        performers.push({
          handle: record.twitter.handle,
          platform: 'twitter',
          followers: record.twitter.followers,
          growth: record.twitter.deltaFollowers,
          growthPercent: prevFollowers > 0 ? (record.twitter.deltaFollowers / prevFollowers) * 100 : 0,
        });
      }
    }

    return performers.sort((a, b) => b.growth - a.growth).slice(0, 3);
  }, [filteredRecords]);

  const leaderboard = useMemo<LeaderboardEntry[]>(() => {
    const latestRecords = getLatestRecordsByCreator(filteredRecords);
    const entries: LeaderboardEntry[] = [];

    for (const record of latestRecords) {
      if (record.tiktok) {
        const prevFollowers = record.tiktok.followers - record.tiktok.deltaFollowers;
        const growthPercent = prevFollowers > 0 ? (record.tiktok.deltaFollowers / prevFollowers) * 100 : 0;
        // Engagement rate: average likes per video as % of followers
        // This measures how engaged followers are with content
        const videos = record.tiktok.videos ?? 0;
        const likes = record.tiktok.likes ?? 0;
        const avgLikesPerVideo = videos > 0 ? likes / videos : 0;
        const engagementRate = record.tiktok.followers > 0 && avgLikesPerVideo > 0
          ? (avgLikesPerVideo / record.tiktok.followers) * 100
          : undefined;
        // Conversion rate: follower growth per like gained (how well likes convert to follows)
        const conversionRate = record.tiktok.deltaLikes && record.tiktok.deltaLikes > 0 && record.tiktok.deltaFollowers > 0
          ? (record.tiktok.deltaFollowers / record.tiktok.deltaLikes) * 100
          : undefined;
        const history = getFollowerHistory(filteredRecords, record.tiktok.handle, 'tiktok');
        const { delta1d, delta7d } = calculateDeltas(history, record.tiktok.followers);
        entries.push({
          rank: 0,
          handle: record.tiktok.handle,
          platform: 'tiktok' as Platform,
          followers: record.tiktok.followers,
          deltaFollowers: record.tiktok.deltaFollowers,
          delta1d,
          delta7d,
          growthPercent,
          postsLast7d: record.tiktok.postsLast7d,
          deltaPosts: record.tiktok.deltaPosts,
          deltaLikes: record.tiktok.deltaLikes,
          engagementRate,
          conversionRate,
          history,
          marketingRep: record.marketingRep,
        });
      }

      if (record.instagram) {
        const prevFollowers = record.instagram.followers - record.instagram.deltaFollowers;
        const growthPercent = prevFollowers > 0 ? (record.instagram.deltaFollowers / prevFollowers) * 100 : 0;
        const history = getFollowerHistory(filteredRecords, record.instagram.handle, 'instagram');
        const { delta1d, delta7d } = calculateDeltas(history, record.instagram.followers);
        entries.push({
          rank: 0,
          handle: record.instagram.handle,
          platform: 'instagram' as Platform,
          followers: record.instagram.followers,
          deltaFollowers: record.instagram.deltaFollowers,
          delta1d,
          delta7d,
          growthPercent,
          postsLast7d: record.instagram.postsLast7d,
          deltaPosts: record.instagram.deltaPosts,
          history,
          marketingRep: record.marketingRep,
        });
      }

      if (record.twitter) {
        const prevFollowers = record.twitter.followers - record.twitter.deltaFollowers;
        const growthPercent = prevFollowers > 0 ? (record.twitter.deltaFollowers / prevFollowers) * 100 : 0;
        const history = getFollowerHistory(filteredRecords, record.twitter.handle, 'twitter');
        const { delta1d, delta7d } = calculateDeltas(history, record.twitter.followers);
        entries.push({
          rank: 0,
          handle: record.twitter.handle,
          platform: 'twitter' as Platform,
          followers: record.twitter.followers,
          deltaFollowers: record.twitter.deltaFollowers,
          delta1d,
          delta7d,
          growthPercent,
          postsLast7d: record.twitter.postsLast7d,
          deltaPosts: record.twitter.deltaPosts,
          history,
          marketingRep: record.marketingRep,
        });
      }
    }

    entries.sort((a, b) => b.followers - a.followers);
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return entries;
  }, [filteredRecords]);

  const growthTrendData = useMemo(() => {
    const dateMap = new Map<string, { date: Date; tiktok: number; instagram: number; twitter: number; total: number }>();

    for (const record of filteredRecords) {
      const dateKey = record.timestamp.toISOString().split('T')[0];

      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, {
          date: new Date(dateKey),
          tiktok: 0,
          instagram: 0,
          twitter: 0,
          total: 0,
        });
      }

      const entry = dateMap.get(dateKey)!;

      if (record.tiktok) {
        entry.tiktok += record.tiktok.followers;
        entry.total += record.tiktok.followers;
      }
      if (record.instagram) {
        entry.instagram += record.instagram.followers;
        entry.total += record.instagram.followers;
      }
      if (record.twitter) {
        entry.twitter += record.twitter.followers;
        entry.total += record.twitter.followers;
      }
    }

    return Array.from(dateMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [filteredRecords]);

  const repStats = useMemo<RepStats[]>(() => {
    const latestRecords = getLatestRecordsByCreator(dateFilteredRecords);
    const repMap = new Map<string, { followers: number; growth: number; count: number; prevFollowers: number }>();

    for (const record of latestRecords) {
      const rep = record.marketingRep || 'Unassigned';
      if (!repMap.has(rep)) {
        repMap.set(rep, { followers: 0, growth: 0, count: 0, prevFollowers: 0 });
      }
      const stats = repMap.get(rep)!;

      stats.count++;

      if (record.tiktok) {
        stats.followers += record.tiktok.followers;
        stats.growth += record.tiktok.deltaFollowers;
        stats.prevFollowers += record.tiktok.followers - record.tiktok.deltaFollowers;
      }
      if (record.instagram) {
        stats.followers += record.instagram.followers;
        stats.growth += record.instagram.deltaFollowers;
        stats.prevFollowers += record.instagram.followers - record.instagram.deltaFollowers;
      }
      if (record.twitter) {
        stats.followers += record.twitter.followers;
        stats.growth += record.twitter.deltaFollowers;
        stats.prevFollowers += record.twitter.followers - record.twitter.deltaFollowers;
      }
    }

    return Array.from(repMap.entries()).map(([rep, data]) => ({
      rep,
      totalFollowers: data.followers,
      totalGrowth7d: data.growth,
      fanpageCount: data.count,
      avgGrowthPercent: data.prevFollowers > 0 ? (data.growth / data.prevFollowers) * 100 : 0,
    })).sort((a, b) => b.totalFollowers - a.totalFollowers);
  }, [dateFilteredRecords]);

  const availableReps = useMemo(() => {
    const reps = new Set<string>();
    for (const record of records) {
      if (record.marketingRep) {
        reps.add(record.marketingRep);
      }
    }
    return Array.from(reps).sort();
  }, [records]);

  return {
    aggregatedStats,
    topPerformers,
    leaderboard,
    growthTrendData,
    repStats,
    availableReps,
  };
}

function getLatestRecordsByCreator(records: CreatorRecord[]): CreatorRecord[] {
  const creatorMap = new Map<string, CreatorRecord>();

  for (const record of records) {
    const handles = [
      record.tiktok?.handle,
      record.instagram?.handle,
      record.twitter?.handle,
    ].filter(Boolean).join('|');

    if (!handles) continue;

    const existing = creatorMap.get(handles);
    if (!existing || record.timestamp > existing.timestamp) {
      creatorMap.set(handles, record);
    }
  }

  return Array.from(creatorMap.values());
}

function getFollowerHistory(
  records: CreatorRecord[],
  handle: string,
  platform: Platform
): { date: Date; followers: number }[] {
  const history: { date: Date; followers: number }[] = [];

  for (const record of records) {
    const metrics = record[platform];
    if (metrics && metrics.handle === handle) {
      history.push({
        date: record.timestamp,
        followers: metrics.followers,
      });
    }
  }

  return history.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function calculateDeltas(
  history: { date: Date; followers: number }[],
  currentFollowers: number
): { delta1d?: number; delta7d?: number } {
  if (history.length < 2) {
    return {};
  }

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  let delta1d: number | undefined;
  const record1d = findClosestRecord(history, oneDayAgo, 24 * 60 * 60 * 1000);
  if (record1d) {
    delta1d = currentFollowers - record1d.followers;
  }

  let delta7d: number | undefined;
  const record7d = findClosestRecord(history, sevenDaysAgo, 2 * 24 * 60 * 60 * 1000);
  if (record7d) {
    delta7d = currentFollowers - record7d.followers;
  }

  return { delta1d, delta7d };
}

function findClosestRecord(
  history: { date: Date; followers: number }[],
  targetDate: Date,
  maxDiffMs: number
): { date: Date; followers: number } | null {
  let closest: { date: Date; followers: number } | null = null;
  let closestDiff = Infinity;

  for (const record of history) {
    const diff = Math.abs(record.date.getTime() - targetDate.getTime());
    if (diff < closestDiff && diff <= maxDiffMs) {
      closestDiff = diff;
      closest = record;
    }
  }

  return closest;
}
