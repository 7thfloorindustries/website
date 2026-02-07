'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import type { LeaderboardEntry, Platform } from '@/lib/dashboard/types';
import { formatNumber, formatDelta, formatPercent, getProfileUrl } from '@/lib/dashboard/formatters';
import { getPlatformColor } from '@/lib/dashboard/colors';
import Sparkline from '../charts/Sparkline';

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  selectable?: boolean;
  selectedHandles?: Set<string>;
  onSelectionChange?: (handle: string, platform: Platform, selected: boolean) => void;
}

type SortKey = 'rank' | 'followers' | 'delta1d' | 'delta7d' | 'deltaFollowers' | 'growthPercent' | 'deltaPosts' | 'postsLast7d' | 'engagementRate' | 'conversionRate';
type SortDirection = 'asc' | 'desc';

export default function LeaderboardTable({
  entries,
  selectable = false,
  selectedHandles = new Set(),
  onSelectionChange
}: LeaderboardTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('followers');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  const sortedEntries = [...entries].sort((a, b) => {
    const multiplier = sortDirection === 'asc' ? 1 : -1;
    const aVal = a[sortKey] ?? 0;
    const bVal = b[sortKey] ?? 0;
    return ((aVal as number) - (bVal as number)) * multiplier;
  });

  const hasTikTokEntries = entries.some(e => e.platform === 'tiktok');

  const platformLabel = (platform: Platform) => ({
    tiktok: 'TikTok',
    instagram: 'Instagram',
    twitter: 'Twitter',
  }[platform]);

  const SortIcon = ({ active, direction }: { active: boolean; direction: SortDirection }) => (
    <span style={{ marginLeft: '4px', color: active ? 'var(--dash-accent)' : 'var(--dash-muted)' }}>
      {direction === 'asc' ? '\u2191' : '\u2193'}
    </span>
  );

  const sortableProps = (key: SortKey) => ({
    className: 'sortable',
    role: 'columnheader' as const,
    'aria-sort': (sortKey === key
      ? (sortDirection === 'asc' ? 'ascending' : 'descending')
      : 'none') as 'ascending' | 'descending' | 'none',
    tabIndex: 0,
    onClick: () => handleSort(key),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleSort(key);
      }
    },
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="broke-dash-card"
      style={{ overflow: 'hidden' }}
    >
      {/* Mobile card view */}
      <div className="broke-dash-mobile-cards">
        {sortedEntries.map((entry) => {
          const platformColor = getPlatformColor(entry.platform);
          return (
            <div key={`${entry.handle}-${entry.platform}`} className="broke-dash-mobile-card">
              <div className="broke-dash-mobile-card-header">
                <span
                  className="broke-dash-rank"
                  style={{ backgroundColor: `${platformColor}15`, color: platformColor }}
                >
                  {entry.rank}
                </span>
                <div className="broke-dash-mobile-card-handle">
                  <Link
                    href={`/broke/dashboard/creator/${encodeURIComponent(entry.handle)}?platform=${entry.platform}`}
                    style={{ color: 'var(--dash-foreground)', fontWeight: 500, textDecoration: 'none' }}
                  >
                    {entry.handle}
                  </Link>
                  <span className={`broke-dash-badge broke-dash-badge-${entry.platform}`} style={{ fontSize: '0.6rem', padding: '0.15rem 0.5rem' }}>
                    {platformLabel(entry.platform)}
                  </span>
                </div>
              </div>
              <div className="broke-dash-mobile-card-stats">
                <div className="broke-dash-mobile-card-stat">
                  <span className="broke-dash-mobile-card-stat-label">Followers</span>
                  <span style={{ fontFamily: 'monospace', color: 'var(--dash-foreground)' }}>
                    {formatNumber(entry.followers)}
                  </span>
                </div>
                <div className="broke-dash-mobile-card-stat">
                  <span className="broke-dash-mobile-card-stat-label">24H</span>
                  <span style={{
                    fontFamily: 'monospace',
                    color: (entry.delta1d ?? 0) >= 0 ? 'var(--dash-positive)' : 'var(--dash-negative)',
                  }}>
                    {entry.delta1d !== undefined ? formatDelta(entry.delta1d) : '—'}
                  </span>
                </div>
                <div className="broke-dash-mobile-card-stat">
                  <span className="broke-dash-mobile-card-stat-label">7D %</span>
                  <span style={{
                    color: entry.growthPercent >= 0 ? 'var(--dash-positive)' : 'var(--dash-negative)',
                  }}>
                    {formatPercent(entry.growthPercent)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop table view */}
      <div className="broke-dash-desktop-table" style={{ overflowX: 'auto' }}>
        <table className="broke-dash-table">
          <thead>
            <tr>
              {selectable && (
                <th style={{ textAlign: 'center', width: '40px' }}>
                  Select
                </th>
              )}
              <th {...sortableProps('rank')}>
                Rank
                <SortIcon active={sortKey === 'rank'} direction={sortDirection} />
              </th>
              <th>Handle</th>
              <th>Platform</th>
              <th>Rep</th>
              <th {...sortableProps('followers')} style={{ textAlign: 'right' }}>
                Followers
                <SortIcon active={sortKey === 'followers'} direction={sortDirection} />
              </th>
              <th {...sortableProps('delta1d')} style={{ textAlign: 'right' }}>
                24H
                <SortIcon active={sortKey === 'delta1d'} direction={sortDirection} />
              </th>
              <th {...sortableProps('delta7d')} style={{ textAlign: 'right' }}>
                7D
                <SortIcon active={sortKey === 'delta7d'} direction={sortDirection} />
              </th>
              <th {...sortableProps('growthPercent')} style={{ textAlign: 'right' }}>
                7D %
                <SortIcon active={sortKey === 'growthPercent'} direction={sortDirection} />
              </th>
              <th {...sortableProps('deltaPosts')} style={{ textAlign: 'right' }}>
                Posts (24h)
                <SortIcon active={sortKey === 'deltaPosts'} direction={sortDirection} />
              </th>
              <th {...sortableProps('postsLast7d')} style={{ textAlign: 'right' }}>
                Posts (7d)
                <SortIcon active={sortKey === 'postsLast7d'} direction={sortDirection} />
              </th>
              {hasTikTokEntries && (
                <>
                  <th {...sortableProps('engagementRate')} style={{ textAlign: 'right' }} title="7-day likes / followers">
                    Engage %
                    <SortIcon active={sortKey === 'engagementRate'} direction={sortDirection} />
                  </th>
                  <th {...sortableProps('conversionRate')} style={{ textAlign: 'right' }} title="New followers / likes">
                    Conv %
                    <SortIcon active={sortKey === 'conversionRate'} direction={sortDirection} />
                  </th>
                </>
              )}
              <th style={{ textAlign: 'center' }}>Trend</th>
            </tr>
          </thead>
          <tbody>
            {sortedEntries.map((entry, index) => {
              const platformColor = getPlatformColor(entry.platform);
              const isPositiveGrowth = entry.deltaFollowers >= 0;
              const selectionKey = `${entry.handle}-${entry.platform}`;
              const isSelected = selectedHandles.has(selectionKey);

              return (
                <motion.tr
                  key={selectionKey}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  style={{
                    background: isSelected ? 'rgba(255, 214, 0, 0.05)' : undefined,
                  }}
                >
                  {selectable && (
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => onSelectionChange?.(entry.handle, entry.platform, e.target.checked)}
                      />
                    </td>
                  )}

                  <td>
                    <span
                      className="broke-dash-rank"
                      style={{
                        backgroundColor: `${platformColor}15`,
                        color: platformColor,
                      }}
                    >
                      {entry.rank}
                    </span>
                  </td>

                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Link
                        href={`/broke/dashboard/creator/${encodeURIComponent(entry.handle)}?platform=${entry.platform}`}
                        style={{ color: 'var(--dash-foreground)', fontWeight: 500, textDecoration: 'none' }}
                      >
                        {entry.handle}
                      </Link>
                      <a
                        href={getProfileUrl(entry.handle, entry.platform)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--dash-muted)', fontSize: '0.75rem', textDecoration: 'none' }}
                        title={`View on ${entry.platform}`}
                      >
                        ↗
                      </a>
                    </div>
                  </td>

                  <td>
                    <span className={`broke-dash-badge broke-dash-badge-${entry.platform}`}>
                      {platformLabel(entry.platform)}
                    </span>
                  </td>

                  <td>
                    <span style={{ color: 'var(--dash-muted)', fontSize: '0.875rem' }}>
                      {entry.marketingRep || '—'}
                    </span>
                  </td>

                  <td style={{ textAlign: 'right' }}>
                    <span style={{ color: 'var(--dash-foreground)', fontFamily: 'monospace', fontSize: '0.875rem' }}>
                      {formatNumber(entry.followers)}
                    </span>
                  </td>

                  <td style={{ textAlign: 'right' }}>
                    {entry.delta1d !== undefined ? (
                      <span
                        style={{
                          fontSize: '0.875rem',
                          fontFamily: 'monospace',
                          color: entry.delta1d >= 0 ? 'var(--dash-positive)' : 'var(--dash-negative)',
                        }}
                      >
                        {formatDelta(entry.delta1d)}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--dash-muted)', fontSize: '0.875rem' }}>—</span>
                    )}
                  </td>

                  <td style={{ textAlign: 'right' }}>
                    {entry.delta7d !== undefined ? (
                      <span
                        className={`broke-dash-growth ${entry.delta7d >= 0 ? 'broke-dash-growth-positive' : 'broke-dash-growth-negative'}`}
                      >
                        {formatDelta(entry.delta7d)}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--dash-muted)', fontSize: '0.875rem' }}>—</span>
                    )}
                  </td>

                  <td style={{ textAlign: 'right' }}>
                    <span
                      style={{
                        fontSize: '0.875rem',
                        color: entry.growthPercent >= 0 ? 'var(--dash-positive)' : 'var(--dash-negative)',
                      }}
                    >
                      {formatPercent(entry.growthPercent)}
                    </span>
                  </td>

                  <td style={{ textAlign: 'right' }}>
                    <span
                      style={{
                        fontSize: '0.875rem',
                        fontFamily: 'monospace',
                        color: entry.deltaPosts > 0 ? 'var(--dash-positive)' : 'var(--dash-muted)',
                      }}
                    >
                      {entry.deltaPosts > 0 ? `+${entry.deltaPosts}` : entry.deltaPosts || '0'}
                    </span>
                  </td>

                  <td style={{ textAlign: 'right' }}>
                    <span style={{ color: 'var(--dash-muted)', fontSize: '0.875rem' }}>{entry.postsLast7d}</span>
                  </td>

                  {hasTikTokEntries && (
                    <>
                      <td style={{ textAlign: 'right' }}>
                        {entry.engagementRate !== undefined ? (
                          <span style={{ color: 'var(--dash-accent)', fontSize: '0.875rem', fontFamily: 'monospace' }}>
                            {entry.engagementRate.toFixed(1)}%
                          </span>
                        ) : (
                          <span style={{ color: 'var(--dash-muted)', fontSize: '0.875rem' }}>—</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {entry.conversionRate !== undefined ? (
                          <span style={{ color: '#60a5fa', fontSize: '0.875rem', fontFamily: 'monospace' }}>
                            {entry.conversionRate.toFixed(2)}%
                          </span>
                        ) : (
                          <span style={{ color: 'var(--dash-muted)', fontSize: '0.875rem' }}>—</span>
                        )}
                      </td>
                    </>
                  )}

                  <td>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <Sparkline
                        data={entry.history}
                        platform={entry.platform}
                        width={80}
                        height={24}
                      />
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
