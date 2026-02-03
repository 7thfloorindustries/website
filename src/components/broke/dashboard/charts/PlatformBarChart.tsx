'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { motion } from 'framer-motion';
import type { AggregatedStats } from '@/lib/dashboard/types';
import { formatNumber } from '@/lib/dashboard/formatters';
import { colors } from '@/lib/dashboard/colors';

interface PlatformBarChartProps {
  data: AggregatedStats['byPlatform'];
  metric: 'followers' | 'growth';
}

export default function PlatformBarChart({ data, metric }: PlatformBarChartProps) {
  const chartData = useMemo(() => {
    return [
      {
        platform: 'TikTok',
        value: data.tiktok[metric],
        color: colors.platform.tiktok,
      },
      {
        platform: 'Instagram',
        value: data.instagram[metric],
        color: colors.platform.instagram,
      },
      {
        platform: 'Twitter',
        value: data.twitter[metric],
        color: colors.platform.twitter,
      },
    ].filter((d) => d.value !== 0);
  }, [data, metric]);

  const title = metric === 'followers' ? 'Followers by Platform' : 'Growth by Platform';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="broke-dash-card"
      style={{ padding: '1.5rem' }}
    >
      <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--dash-foreground)', marginBottom: '1rem' }}>
        {title}
      </h3>

      <div className="broke-dash-chart" style={{ height: '250px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />

            <XAxis
              type="number"
              stroke="rgba(255,255,255,0.2)"
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => formatNumber(value)}
            />

            <YAxis
              type="category"
              dataKey="platform"
              stroke="rgba(255,255,255,0.2)"
              tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={80}
            />

            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="broke-dash-card" style={{ padding: '0.75rem', borderColor: 'rgba(255, 214, 0, 0.3)' }}>
                    <div style={{ fontSize: '0.875rem', color: 'var(--dash-foreground)', fontWeight: 500 }}>{d.platform}</div>
                    <div style={{ fontSize: '1.125rem', fontFamily: 'monospace', marginTop: '0.25rem', color: d.color }}>
                      {metric === 'growth' && d.value >= 0 ? '+' : ''}
                      {formatNumber(d.value)}
                    </div>
                  </div>
                );
              }}
            />

            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
