'use client';

import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { colors } from '@/lib/dashboard/colors';

interface SparklineProps {
  data: { date: Date; followers: number }[];
  platform: 'tiktok' | 'instagram' | 'twitter';
  width?: number;
  height?: number;
}

export default function Sparkline({
  data,
  width = 80,
  height = 24,
}: SparklineProps) {
  if (!data || data.length < 2) {
    return (
      <div
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.6rem',
          color: 'var(--dash-muted)',
        }}
      >
        No data
      </div>
    );
  }

  const chartData = data.map((d) => ({ value: d.followers }));

  // Calculate if trending up or down
  const first = data[0].followers;
  const last = data[data.length - 1].followers;
  const isPositive = last >= first;

  return (
    <div className="broke-dash-chart" style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={isPositive ? colors.growth.positive : colors.growth.negative}
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
