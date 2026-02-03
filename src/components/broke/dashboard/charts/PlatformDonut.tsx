'use client';

import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatNumber } from '@/lib/dashboard/formatters';
import { colors } from '@/lib/dashboard/colors';

interface PlatformData {
  tiktok: { followers: number; growth: number; creators: number };
  instagram: { followers: number; growth: number; creators: number };
  twitter: { followers: number; growth: number; creators: number };
}

interface PlatformDonutProps {
  data: PlatformData;
}

export default function PlatformDonut({ data }: PlatformDonutProps) {
  const chartData = [
    { name: 'TikTok', value: data.tiktok.followers, color: colors.platform.tiktok },
    { name: 'Instagram', value: data.instagram.followers, color: colors.platform.instagram },
    { name: 'Twitter', value: data.twitter.followers, color: colors.platform.twitter },
  ].filter(d => d.value > 0);

  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="broke-dash-card"
      style={{ padding: '1.5rem' }}
    >
      <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--dash-foreground)', marginBottom: '1rem' }}>
        Followers by Platform
      </h3>

      <div className="broke-dash-chart" style={{ height: '200px', position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
              stroke="none"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                const percent = ((d.value / total) * 100).toFixed(1);
                return (
                  <div className="broke-dash-card" style={{ padding: '0.75rem', borderColor: 'rgba(255, 214, 0, 0.3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: d.color,
                        }}
                      />
                      <span style={{ color: 'var(--dash-foreground)', fontWeight: 500 }}>{d.name}</span>
                    </div>
                    <div style={{ color: 'var(--dash-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      {formatNumber(d.value)} ({percent}%)
                    </div>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Center text */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div className="broke-dash-glow" style={{ fontSize: '1.5rem', fontWeight: 300, color: 'var(--dash-accent)' }}>
              {formatNumber(total)}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--dash-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Total
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        marginTop: '1rem',
        paddingTop: '1rem',
        borderTop: '1px solid var(--dash-border)',
      }}>
        {chartData.map((entry) => {
          const percent = ((entry.value / total) * 100).toFixed(1);
          return (
            <div key={entry.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '2px',
                    backgroundColor: entry.color,
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--dash-muted)' }}>{entry.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--dash-foreground)', fontWeight: 500 }}>
                  {formatNumber(entry.value)}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--dash-muted)', width: '3rem', textAlign: 'right' }}>
                  {percent}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
