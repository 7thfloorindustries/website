'use client';

import { useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
} from 'recharts';
import { motion } from 'framer-motion';
import type { LeaderboardEntry } from '@/lib/dashboard/types';
import { formatNumber } from '@/lib/dashboard/formatters';
import { colors } from '@/lib/dashboard/colors';

interface EngagementScatterProps {
  entries: LeaderboardEntry[];
}

export default function EngagementScatter({ entries }: EngagementScatterProps) {
  const chartData = useMemo(() => {
    return entries
      .filter((e) => e.platform === 'tiktok' && e.engagementRate !== undefined)
      .map((e) => ({
        handle: e.handle,
        followers: e.followers,
        engagementRate: e.engagementRate || 0,
        growth: e.deltaFollowers,
      }));
  }, [entries]);

  if (chartData.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="broke-dash-card"
        style={{ padding: '1.5rem' }}
      >
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--dash-foreground)', marginBottom: '1rem' }}>
          Engagement Analysis
        </h3>
        <div style={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: 'var(--dash-muted)', fontSize: '0.875rem' }}>No TikTok engagement data available</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="broke-dash-card"
      style={{ padding: '1.5rem' }}
    >
      <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--dash-foreground)', marginBottom: '1rem' }}>
        Engagement vs Followers (TikTok)
      </h3>

      <div className="broke-dash-chart" style={{ height: '250px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />

            <XAxis
              type="number"
              dataKey="followers"
              name="Followers"
              stroke="rgba(255,255,255,0.2)"
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => formatNumber(value)}
            />

            <YAxis
              type="number"
              dataKey="engagementRate"
              name="Engagement Rate"
              stroke="rgba(255,255,255,0.2)"
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value.toFixed(0)}%`}
              domain={[0, 'auto']}
            />

            <ZAxis
              type="number"
              dataKey="growth"
              range={[50, 400]}
              name="Growth"
            />

            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="broke-dash-card" style={{ padding: '0.75rem', borderColor: 'rgba(255, 214, 0, 0.3)' }}>
                    <div style={{ fontSize: '0.875rem', color: 'var(--dash-foreground)', fontWeight: 500, marginBottom: '0.5rem' }}>
                      {d.handle}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                        <span style={{ color: 'var(--dash-muted)' }}>Followers</span>
                        <span style={{ color: 'var(--dash-foreground)' }}>{formatNumber(d.followers)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                        <span style={{ color: 'var(--dash-muted)' }}>Engagement</span>
                        <span style={{ color: 'var(--dash-accent)' }}>{d.engagementRate.toFixed(1)}%</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                        <span style={{ color: 'var(--dash-muted)' }}>Growth</span>
                        <span style={{ color: d.growth >= 0 ? 'var(--dash-positive)' : 'var(--dash-negative)' }}>
                          {d.growth >= 0 ? '+' : ''}{formatNumber(d.growth)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />

            <Scatter
              name="Fanpages"
              data={chartData}
              fill={colors.platform.tiktok}
              fillOpacity={0.7}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--dash-muted)', textAlign: 'center' }}>
        Bubble size represents growth • X-axis: Followers • Y-axis: Engagement Rate
      </div>
    </motion.div>
  );
}
