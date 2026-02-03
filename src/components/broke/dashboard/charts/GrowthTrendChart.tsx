'use client';

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
import { formatNumber, formatDate } from '@/lib/dashboard/formatters';
import { colors } from '@/lib/dashboard/colors';

interface DataPoint {
  date: Date;
  tiktok: number;
  instagram: number;
  twitter: number;
  total: number;
}

interface GrowthTrendChartProps {
  data: DataPoint[];
}

export default function GrowthTrendChart({ data }: GrowthTrendChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    dateLabel: formatDate(d.date),
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="broke-dash-card"
      style={{ padding: '1.5rem' }}
    >
      <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--dash-foreground)', marginBottom: '1rem' }}>
        Follower Growth Trend
      </h3>

      <div className="broke-dash-chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradientTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.accent} stopOpacity={0.4} />
                <stop offset="100%" stopColor={colors.accent} stopOpacity={0} />
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
              cursor={false}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="broke-dash-card" style={{ padding: '0.75rem', borderColor: 'rgba(255, 214, 0, 0.3)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--dash-muted)', marginBottom: '0.5rem' }}>{label}</div>
                    {payload.map((entry) => (
                      <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: entry.color,
                          }}
                        />
                        <span style={{ color: 'var(--dash-muted)', textTransform: 'capitalize' }}>{entry.name}:</span>
                        <span style={{ color: 'var(--dash-foreground)', fontWeight: 500 }}>
                          {formatNumber(entry.value as number)}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />

            <Area
              type="monotone"
              dataKey="total"
              stroke={colors.accent}
              strokeWidth={2}
              fill="url(#gradientTotal)"
              name="total"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        marginTop: '1rem',
        paddingTop: '1rem',
        borderTop: '1px solid var(--dash-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: colors.accent }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--dash-muted)' }}>Total Followers</span>
        </div>
      </div>
    </motion.div>
  );
}
