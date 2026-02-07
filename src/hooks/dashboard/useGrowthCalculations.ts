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
    let totalRangeGrowth = 0;
    const activeCreators = new Set<string>();

    const byPlatform = {
      tiktok: { followers: 0, growth: 0, creators: 0 },
      instagram: { followers: 0, growth: 0, creators: 0 },
      twitter: { followers: 0, growth: 0, creators: 0 },
    };

    for (const record of latestRecords) {
      if (record.tiktok) {
        const history = getFollowerHistory(filteredRecords, record.tiktok.handle, 'tiktok');
        const { growth } = calculateRangeGrowth(history, record.tiktok.followers);
        totalFollowers += record.tiktok.followers;
        totalRangeGrowth += growth;
        byPlatform.tiktok.followers += record.tiktok.followers;
        byPlatform.tiktok.growth += growth;
        byPlatform.tiktok.creators++;
        activeCreators.add(record.tiktok.handle);
      }

      if (record.instagram) {
        const history = getFollowerHistory(filteredRecords, record.instagram.handle, 'instagram');
        const { growth } = calculateRangeGrowth(history, record.instagram.followers);
        totalFollowers += record.instagram.followers;
        totalRangeGrowth += growth;
        byPlatform.instagram.followers += record.instagram.followers;
        byPlatform.instagram.growth += growth;
        byPlatform.instagram.creators++;
        activeCreators.add(record.instagram.handle);
      }

      if (record.twitter) {
        const history = getFollowerHistory(filteredRecords, record.twitter.handle, 'twitter');
        const { growth } = calculateRangeGrowth(history, record.twitter.followers);
        totalFollowers += record.twitter.followers;
        totalRangeGrowth += growth;
        byPlatform.twitter.followers += record.twitter.followers;
        byPlatform.twitter.growth += growth;
        byPlatform.twitter.creators++;
        activeCreators.add(record.twitter.handle);
      }
    }

    return {
      totalFollowers,
      rangeGrowth: totalRangeGrowth,
      totalGrowth7d: totalRangeGrowth,
      activeCreators: activeCreators.size,
      byPlatform,
    };
  }, [filteredRecords]);

  const topPerformers = useMemo<TopPerformer[]>(() => {
    const latestRecords = getLatestRecordsByCreator(filteredRecords);
    const performers: TopPerformer[] = [];

    for (const record of latestRecords) {
      if (record.tiktok) {
        const history = getFollowerHistory(filteredRecords, record.tiktok.handle, 'tiktok');
        const { growth, growthPercent } = calculateRangeGrowth(history, record.tiktok.followers);
        if (growth > 0) {
          performers.push({
            handle: record.tiktok.handle,
            platform: 'tiktok',
            followers: record.tiktok.followers,
            growth,
            growthPercent,
          });
        }
      }

      if (record.instagram) {
        const history = getFollowerHistory(filteredRecords, record.instagram.handle, 'instagram');
        const { growth, growthPercent } = calculateRangeGrowth(history, record.instagram.followers);
        if (growth > 0) {
          performers.push({
            handle: record.instagram.handle,
            platform: 'instagram',
            followers: record.instagram.followers,
            growth,
            growthPercent,
          });
        }
      }

      if (record.twitter) {
        const history = getFollowerHistory(filteredRecords, record.twitter.handle, 'twitter');
        const { growth, growthPercent } = calculateRangeGrowth(history, record.twitter.followers);
        if (growth > 0) {
          performers.push({
            handle: record.twitter.handle,
            platform: 'twitter',
            followers: record.twitter.followers,
            growth,
            growthPercent,
          });
        }
      }
    }

    return performers.sort((a, b) => b.growth - a.growth).slice(0, 3);
  }, [filteredRecords]);

  const leaderboard = useMemo<LeaderboardEntry[]>(() => {
    const latestRecords = getLatestRecordsByCreator(filteredRecords);
    const entries: LeaderboardEntry[] = [];

    for (const record of latestRecords) {
      if (record.tiktok) {
        const history = getFollowerHistory(filteredRecords, record.tiktok.handle, 'tiktok');
        const range = calculateRangeGrowth(history, record.tiktok.followers);
        // Engagement rate: average likes per video as % of followers
        const videos = record.tiktok.videos ?? 0;
        const likes = record.tiktok.likes ?? 0;
        const avgLikesPerVideo = videos > 0 ? likes / videos : 0;
        const engagementRate = record.tiktok.followers > 0 && avgLikesPerVideo > 0
          ? (avgLikesPerVideo / record.tiktok.followers) * 100
          : undefined;
        // Conversion rate: total followers / total likes (what % of likers are followers)
        const conversionRate = likes > 0
          ? (record.tiktok.followers / likes) * 100
          : undefined;

        // Use pre-calculated deltas from API if available, otherwise compute client-side
        const apiDelta1d = record.tiktok.delta1d;
        const apiDelta7d = record.tiktok.delta7d;
        const computedDeltas = (apiDelta1d === undefined || apiDelta7d === undefined)
          ? calculateDeltas(history, record.tiktok.followers)
          : { delta1d: undefined, delta7d: undefined };

        entries.push({
          rank: 0,
          handle: record.tiktok.handle,
          platform: 'tiktok' as Platform,
          followers: record.tiktok.followers,
          deltaFollowers: range.growth,
          delta1d: apiDelta1d ?? computedDeltas.delta1d,
          delta7d: apiDelta7d ?? computedDeltas.delta7d,
          growthPercent: range.growthPercent,
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
        const history = getFollowerHistory(filteredRecords, record.instagram.handle, 'instagram');
        const range = calculateRangeGrowth(history, record.instagram.followers);

        // Use pre-calculated deltas from API if available
        const apiDelta1d = record.instagram.delta1d;
        const apiDelta7d = record.instagram.delta7d;
        const computedDeltas = (apiDelta1d === undefined || apiDelta7d === undefined)
          ? calculateDeltas(history, record.instagram.followers)
          : { delta1d: undefined, delta7d: undefined };

        entries.push({
          rank: 0,
          handle: record.instagram.handle,
          platform: 'instagram' as Platform,
          followers: record.instagram.followers,
          deltaFollowers: range.growth,
          delta1d: apiDelta1d ?? computedDeltas.delta1d,
          delta7d: apiDelta7d ?? computedDeltas.delta7d,
          growthPercent: range.growthPercent,
          postsLast7d: record.instagram.postsLast7d,
          deltaPosts: record.instagram.deltaPosts,
          history,
          marketingRep: record.marketingRep,
        });
      }

      if (record.twitter) {
        const history = getFollowerHistory(filteredRecords, record.twitter.handle, 'twitter');
        const range = calculateRangeGrowth(history, record.twitter.followers);

        // Use pre-calculated deltas from API if available
        const apiDelta1d = record.twitter.delta1d;
        const apiDelta7d = record.twitter.delta7d;
        const computedDeltas = (apiDelta1d === undefined || apiDelta7d === undefined)
          ? calculateDeltas(history, record.twitter.followers)
          : { delta1d: undefined, delta7d: undefined };

        entries.push({
          rank: 0,
          handle: record.twitter.handle,
          platform: 'twitter' as Platform,
          followers: record.twitter.followers,
          deltaFollowers: range.growth,
          delta1d: apiDelta1d ?? computedDeltas.delta1d,
          delta7d: apiDelta7d ?? computedDeltas.delta7d,
          growthPercent: range.growthPercent,
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
    return buildGrowthTrendData(filteredRecords);
  }, [filteredRecords]);

  const repStats = useMemo<RepStats[]>(() => {
    const latestRecords = getLatestRecordsByCreator(filteredRecords);
    const repMap = new Map<string, { followers: number; growth: number; count: number; baselineFollowers: number }>();

    for (const record of latestRecords) {
      const rep = record.marketingRep || 'Unassigned';
      if (!repMap.has(rep)) {
        repMap.set(rep, { followers: 0, growth: 0, count: 0, baselineFollowers: 0 });
      }
      const stats = repMap.get(rep)!;

      stats.count++;

      if (record.tiktok) {
        const history = getFollowerHistory(filteredRecords, record.tiktok.handle, 'tiktok');
        const range = calculateRangeGrowth(history, record.tiktok.followers);
        stats.followers += record.tiktok.followers;
        stats.growth += range.growth;
        stats.baselineFollowers += range.baselineFollowers;
      }
      if (record.instagram) {
        const history = getFollowerHistory(filteredRecords, record.instagram.handle, 'instagram');
        const range = calculateRangeGrowth(history, record.instagram.followers);
        stats.followers += record.instagram.followers;
        stats.growth += range.growth;
        stats.baselineFollowers += range.baselineFollowers;
      }
      if (record.twitter) {
        const history = getFollowerHistory(filteredRecords, record.twitter.handle, 'twitter');
        const range = calculateRangeGrowth(history, record.twitter.followers);
        stats.followers += record.twitter.followers;
        stats.growth += range.growth;
        stats.baselineFollowers += range.baselineFollowers;
      }
    }

    return Array.from(repMap.entries()).map(([rep, data]) => ({
      rep,
      totalFollowers: data.followers,
      rangeGrowth: data.growth,
      totalGrowth7d: data.growth,
      fanpageCount: data.count,
      avgGrowthPercent: data.baselineFollowers > 0 ? (data.growth / data.baselineFollowers) * 100 : 0,
    })).sort((a, b) => b.totalFollowers - a.totalFollowers);
  }, [filteredRecords]);

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
    // Build a unique key that includes platform to avoid collisions
    // when the same handle exists on multiple platforms
    const platforms: string[] = [];
    if (record.tiktok?.handle) platforms.push(`tiktok:${record.tiktok.handle}`);
    if (record.instagram?.handle) platforms.push(`instagram:${record.instagram.handle}`);
    if (record.twitter?.handle) platforms.push(`twitter:${record.twitter.handle}`);

    const key = platforms.sort().join('|');
    if (!key) continue;

    const existing = creatorMap.get(key);
    if (!existing || record.timestamp > existing.timestamp) {
      creatorMap.set(key, record);
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

export function calculateDeltas(
  history: { date: Date; followers: number }[],
  currentFollowers: number
): { delta1d?: number; delta7d?: number } {
  if (history.length < 2) {
    return {};
  }

  // Sort history by date descending to get the latest record
  const sorted = [...history].sort((a, b) => b.date.getTime() - a.date.getTime());
  const latestRecord = sorted[0];

  let delta1d: number | undefined;
  // True 24h delta: use the latest snapshot at least 24 hours old.
  const record1d = findPreviousRecord(history, latestRecord, 24 * 60 * 60 * 1000);
  if (record1d) {
    delta1d = currentFollowers - record1d.followers;
  }

  let delta7d: number | undefined;
  // True 7d delta: use the latest snapshot at least 7 days old.
  const record7d = findPreviousRecord(history, latestRecord, 7 * 24 * 60 * 60 * 1000);
  if (record7d) {
    delta7d = currentFollowers - record7d.followers;
  }

  return { delta1d, delta7d };
}

export function calculateRangeGrowth(
  history: { date: Date; followers: number }[],
  currentFollowers: number
): { growth: number; growthPercent: number; baselineFollowers: number } {
  if (history.length === 0) {
    return { growth: 0, growthPercent: 0, baselineFollowers: currentFollowers };
  }

  const baselineFollowers = history[0].followers;
  const growth = currentFollowers - baselineFollowers;
  const growthPercent = baselineFollowers > 0 ? (growth / baselineFollowers) * 100 : 0;

  return { growth, growthPercent, baselineFollowers };
}

function findPreviousRecord(
  history: { date: Date; followers: number }[],
  latestRecord: { date: Date; followers: number },
  minAgeMs: number
): { date: Date; followers: number } | null {
  const cutoff = latestRecord.date.getTime() - minAgeMs;

  // Find records older than cutoff, sorted newest first
  const candidates = history
    .filter(r => r.date.getTime() < cutoff)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  return candidates[0] || null;
}

interface GrowthTrendPoint {
  date: Date;
  tiktok: number;
  instagram: number;
  twitter: number;
  total: number;
}

interface DailyPlatformSnapshot {
  platform: Platform;
  followers: number;
  timestampMs: number;
}

interface GrowthTrendBucket {
  date: Date;
  snapshotsByHandle: Map<string, DailyPlatformSnapshot>;
}

function updateDailySnapshot(
  bucket: GrowthTrendBucket,
  platform: Platform,
  handle: string,
  followers: number,
  timestampMs: number
): void {
  const key = `${platform}:${handle}`;
  const existing = bucket.snapshotsByHandle.get(key);

  if (!existing || timestampMs >= existing.timestampMs) {
    bucket.snapshotsByHandle.set(key, {
      platform,
      followers,
      timestampMs,
    });
  }
}

export function buildGrowthTrendData(records: CreatorRecord[]): GrowthTrendPoint[] {
  const dateMap = new Map<string, GrowthTrendBucket>();

  for (const record of records) {
    const dateKey = record.timestamp.toISOString().split('T')[0];
    const timestampMs = record.timestamp.getTime();

    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, {
        date: new Date(dateKey),
        snapshotsByHandle: new Map<string, DailyPlatformSnapshot>(),
      });
    }

    const bucket = dateMap.get(dateKey)!;

    if (record.tiktok) {
      updateDailySnapshot(bucket, 'tiktok', record.tiktok.handle, record.tiktok.followers, timestampMs);
    }
    if (record.instagram) {
      updateDailySnapshot(bucket, 'instagram', record.instagram.handle, record.instagram.followers, timestampMs);
    }
    if (record.twitter) {
      updateDailySnapshot(bucket, 'twitter', record.twitter.handle, record.twitter.followers, timestampMs);
    }
  }

  const trend: GrowthTrendPoint[] = [];

  for (const bucket of dateMap.values()) {
    let tiktok = 0;
    let instagram = 0;
    let twitter = 0;

    for (const snapshot of bucket.snapshotsByHandle.values()) {
      if (snapshot.platform === 'tiktok') tiktok += snapshot.followers;
      if (snapshot.platform === 'instagram') instagram += snapshot.followers;
      if (snapshot.platform === 'twitter') twitter += snapshot.followers;
    }

    trend.push({
      date: bucket.date,
      tiktok,
      instagram,
      twitter,
      total: tiktok + instagram + twitter,
    });
  }

  return trend.sort((a, b) => a.date.getTime() - b.date.getTime());
}
