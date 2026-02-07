'use client';

import { use } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import DashboardHeader from '@/components/broke/dashboard/DashboardHeader';
import StatCard from '@/components/broke/dashboard/cards/StatCard';
import BrokeLoading from '@/components/broke/BrokeLoading';
import { useMetricsData } from '@/hooks/dashboard/useMetricsData';
import { useDateRange } from '@/hooks/dashboard/useDateRange';
import { formatNumber, formatDelta, formatDate, getProfileUrl } from '@/lib/dashboard/formatters';
import { getPlatformColor } from '@/lib/dashboard/colors';
import type { Platform, PlatformMetrics } from '@/lib/dashboard/types';

export default function CreatorDetailPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = use(params);
  const searchParams = useSearchParams();
  const platform = (searchParams.get('platform') || 'tiktok') as Platform;

  const { data: records, isLoading, error } = useMetricsData();
  const { preset, setPreset, setCustomDateRange } = useDateRange();

  const decodedHandle = decodeURIComponent(handle);

  // Find all records for this creator
  const creatorRecords = (records || []).filter((record) => {
    const metrics = record[platform];
    return metrics?.handle === decodedHandle;
  });

  // Sort by date ascending for chart
  const sortedRecords = [...creatorRecords].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );

  // Get latest record
  const latestRecord = sortedRecords[sortedRecords.length - 1];
  const latestMetrics = latestRecord?.[platform] as PlatformMetrics | null;

  // Build chart data
  const chartData = sortedRecords.map((record) => {
    const metrics = record[platform] as PlatformMetrics;
    return {
      date: record.timestamp,
      dateLabel: formatDate(record.timestamp),
      followers: metrics?.followers || 0,
    };
  });

  const platformColor = getPlatformColor(platform);
  const platformLabel = {
    tiktok: 'TikTok',
    instagram: 'Instagram',
    twitter: 'Twitter',
  }[platform];
  const delta7d = latestMetrics?.delta7d ?? latestMetrics?.deltaFollowers ?? 0;

  if (isLoading) {
    return (
      <>
        <DashboardHeader title="Fanpage Detail" preset={preset} onPresetChange={setPreset} onCustomRangeChange={setCustomDateRange} />
        <div className="broke-dashboard-content">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '24rem' }}>
            <BrokeLoading size="lg" text="Loading fanpage" />
          </div>
        </div>
      </>
    );
  }

  if (error || !latestMetrics) {
    return (
      <>
        <DashboardHeader title="Fanpage Detail" preset={preset} onPresetChange={setPreset} onCustomRangeChange={setCustomDateRange} />
        <div className="broke-dashboard-content">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '24rem' }}>
            <div style={{ color: 'var(--dash-muted)', marginBottom: '1rem' }}>Fanpage not found</div>
            <Link href="/broke/dashboard/leaderboard" style={{ color: 'var(--dash-accent)' }}>
              Back to Leaderboard
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <DashboardHeader title={decodedHandle} preset={preset} onPresetChange={setPreset} onCustomRangeChange={setCustomDateRange} />
      <div className="broke-dashboard-content">
        {/* Back link */}
        <Link
          href="/broke/dashboard/leaderboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: 'var(--dash-muted)',
            marginBottom: '1.5rem',
            fontSize: '0.875rem',
            textDecoration: 'none',
          }}
        >
          <span>←</span>
          <span>Back to Leaderboard</span>
        </Link>

        {/* Creator header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="broke-dash-card"
          style={{ padding: '1.5rem', marginBottom: '1.5rem' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--dash-foreground)', margin: 0 }}>{decodedHandle}</h2>
                <span className={`broke-dash-badge broke-dash-badge-${platform}`}>
                  {platformLabel}
                </span>
                <a
                  href={getProfileUrl(decodedHandle, platform)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="broke-dash-btn"
                  style={{
                    padding: '0.25rem 0.75rem',
                    fontSize: '0.75rem',
                    border: '1px solid rgba(255, 214, 0, 0.5)',
                    color: 'var(--dash-accent)',
                    background: 'transparent',
                  }}
                >
                  View Profile ↗
                </a>
              </div>
              <div style={{ color: 'var(--dash-muted)', fontSize: '0.875rem' }}>
                Last updated: {formatDate(latestRecord.timestamp)}
              </div>
            </div>

            <div style={{ fontSize: '2.5rem', fontWeight: 300, color: platformColor }} className="broke-dash-glow">
              {formatNumber(latestMetrics.followers)}
              <span style={{ fontSize: '0.875rem', color: 'var(--dash-muted)', marginLeft: '0.5rem' }}>followers</span>
            </div>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="broke-dash-grid-4" style={{ marginBottom: '1.5rem' }}>
          <StatCard
            label="Followers"
            value={latestMetrics.followers}
            delay={0}
          />
          <StatCard
            label="Growth (7d)"
            value={delta7d}
            prefix={delta7d >= 0 ? '+' : ''}
            delay={0.1}
          />
          <StatCard
            label="Posts (7d)"
            value={latestMetrics.postsLast7d}
            delay={0.2}
          />
          <StatCard
            label="Total Posts"
            value={latestMetrics.posts}
            delay={0.3}
          />
        </div>

        {/* Growth Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="broke-dash-card"
          style={{ padding: '1.5rem', marginBottom: '1.5rem' }}
        >
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--dash-foreground)', marginBottom: '1rem' }}>
            Follower Growth History
          </h3>

          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradientCreator" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={platformColor} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={platformColor} stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />

                <XAxis
                  dataKey="dateLabel"
                  stroke="rgba(255,255,255,0.2)"
                  tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />

                <YAxis
                  stroke="rgba(255,255,255,0.2)"
                  tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => formatNumber(value)}
                />

                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="broke-dash-card" style={{ padding: '0.75rem', borderColor: 'rgba(255, 214, 0, 0.3)' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--dash-muted)', marginBottom: '0.25rem' }}>{label}</div>
                        <div style={{ color: 'var(--dash-foreground)', fontWeight: 500 }}>
                          {formatNumber(payload[0].value as number)} followers
                        </div>
                      </div>
                    );
                  }}
                />

                <Area
                  type="monotone"
                  dataKey="followers"
                  stroke={platformColor}
                  strokeWidth={2}
                  fill="url(#gradientCreator)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Platform-specific metrics */}
        {platform === 'tiktok' && latestMetrics.likes !== undefined && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="broke-dash-card"
            style={{ padding: '1.5rem' }}
          >
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--dash-foreground)', marginBottom: '1rem' }}>
              TikTok Specific
            </h3>
            <div className="broke-dash-grid-3">
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 300, color: 'var(--dash-accent)', marginBottom: '0.25rem' }} className="broke-dash-glow">
                  {formatNumber(latestMetrics.likes || 0)}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--dash-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total Likes</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 300, color: 'var(--dash-accent)', marginBottom: '0.25rem' }} className="broke-dash-glow">
                  {formatDelta(latestMetrics.deltaLikes || 0)}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--dash-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Likes (7d)</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 300, color: 'var(--dash-accent)', marginBottom: '0.25rem' }} className="broke-dash-glow">
                  {latestMetrics.videos || 0}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--dash-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Videos</div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </>
  );
}
