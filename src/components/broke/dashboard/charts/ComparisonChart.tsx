'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { motion } from 'framer-motion';
import type { LeaderboardEntry } from '@/lib/dashboard/types';
import { formatNumber, formatDate } from '@/lib/dashboard/formatters';

interface ComparisonChartProps {
  entries: LeaderboardEntry[];
}

const COMPARISON_COLORS = ['#ffd600', '#00f2ea', '#E1306C', '#1DA1F2'];

export default function ComparisonChart({ entries }: ComparisonChartProps) {
  const chartData = useMemo(() => {
    if (entries.length === 0) return [];

    const allDates = new Set<string>();
    entries.forEach((entry) => {
      entry.history.forEach((h) => {
        allDates.add(h.date.toISOString().split('T')[0]);
      });
    });

    const sortedDates = Array.from(allDates).sort();

    return sortedDates.map((dateStr) => {
      const date = new Date(dateStr);
      const dataPoint: Record<string, unknown> = {
        date,
        dateLabel: formatDate(date),
      };

      entries.forEach((entry) => {
        const key = `${entry.handle}-${entry.platform}`;
        const historyPoint = entry.history.find(
          (h) => h.date.toISOString().split('T')[0] === dateStr
        );
        dataPoint[key] = historyPoint?.followers || null;
      });

      return dataPoint;
    });
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="broke-dash-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
        <p style={{ color: 'var(--dash-muted)' }}>Select fanpages to compare</p>
      </div>
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
        Follower Growth Comparison
      </h3>

      <div className="broke-dash-chart-tall">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
              cursor={false}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="broke-dash-card" style={{ padding: '0.75rem', borderColor: 'rgba(255, 214, 0, 0.3)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--dash-muted)', marginBottom: '0.5rem' }}>{label}</div>
                    {payload.map((p, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', fontSize: '0.875rem' }}>
                        <span style={{ color: p.color }}>{p.name}</span>
                        <span style={{ color: 'var(--dash-foreground)', fontWeight: 500 }}>
                          {formatNumber(p.value as number)}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />

            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              formatter={(value) => <span style={{ fontSize: '0.875rem', color: 'var(--dash-muted)' }}>{value}</span>}
            />

            {entries.map((entry, index) => {
              const key = `${entry.handle}-${entry.platform}`;
              const color = COMPARISON_COLORS[index % COMPARISON_COLORS.length];
              return (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={`${entry.handle} (${entry.platform})`}
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
