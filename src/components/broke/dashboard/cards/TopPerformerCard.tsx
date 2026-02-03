'use client';

import { motion } from 'framer-motion';
import type { TopPerformer } from '@/lib/dashboard/types';
import { formatNumber, formatDelta, formatPercent, getProfileUrl } from '@/lib/dashboard/formatters';
import { getPlatformColor } from '@/lib/dashboard/colors';

interface TopPerformerCardProps {
  performer: TopPerformer;
  rank: number;
  delay?: number;
}

export default function TopPerformerCard({ performer, rank, delay = 0 }: TopPerformerCardProps) {
  const platformColor = getPlatformColor(performer.platform);

  const platformLabel = {
    tiktok: 'TikTok',
    instagram: 'Instagram',
    twitter: 'Twitter',
  }[performer.platform];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="broke-dash-card"
      style={{ padding: '1.25rem' }}
    >
      {/* Rank badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div
          className="broke-dash-rank"
          style={{ backgroundColor: `${platformColor}20`, color: platformColor }}
        >
          #{rank}
        </div>
        <span className={`broke-dash-badge broke-dash-badge-${performer.platform}`}>
          {platformLabel}
        </span>
      </div>

      {/* Handle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
        <span style={{ color: 'var(--dash-foreground)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {performer.handle}
        </span>
        <a
          href={getProfileUrl(performer.handle, performer.platform)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--dash-muted)', fontSize: '0.75rem', flexShrink: 0, transition: 'color 0.2s' }}
          title={`View on ${performer.platform}`}
        >
          ↗
        </a>
      </div>

      {/* Followers */}
      <div style={{ color: 'var(--dash-muted)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
        {formatNumber(performer.followers)} followers
      </div>

      {/* Growth stats */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: '0.75rem',
        borderTop: '1px solid var(--dash-border)',
      }}>
        <span className="broke-dash-growth broke-dash-growth-positive">
          {formatDelta(performer.growth)}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--dash-positive)' }}>
          {formatPercent(performer.growthPercent)}
        </span>
      </div>
    </motion.div>
  );
}
