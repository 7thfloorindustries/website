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

type SortKey = 'rank' | 'followers' | 'delta1d' | 'delta7d' | 'deltaFollowers' | 'growthPercent' | 'postsLast7d' | 'engagementRate' | 'conversionRate';
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
      {direction === 'asc' ? '↑' : '↓'}
    </span>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="broke-dash-card"
      style={{ overflow: 'hidden' }}
    >
      <div style={{ overflowX: 'auto' }}>
        <table className="broke-dash-table">
          <thead>
            <tr>
              {selectable && (
                <th style={{ textAlign: 'center', width: '40px' }}>
                  Select
                </th>
              )}
              <th
                className="sortable"
                onClick={() => handleSort('rank')}
              >
                Rank
                <SortIcon active={sortKey === 'rank'} direction={sortDirection} />
              </th>
              <th>Handle</th>
              <th>Platform</th>
              <th>Rep</th>
              <th
                className="sortable"
                style={{ textAlign: 'right' }}
                onClick={() => handleSort('followers')}
              >
                Followers
                <SortIcon active={sortKey === 'followers'} direction={sortDirection} />
              </th>
              <th
                className="sortable"
                style={{ textAlign: 'right' }}
                onClick={() => handleSort('delta1d')}
              >
                1D
                <SortIcon active={sortKey === 'delta1d'} direction={sortDirection} />
              </th>
              <th
                className="sortable"
                style={{ textAlign: 'right' }}
                onClick={() => handleSort('delta7d')}
              >
                7D
                <SortIcon active={sortKey === 'delta7d'} direction={sortDirection} />
              </th>
              <th
                className="sortable"
                style={{ textAlign: 'right' }}
                onClick={() => handleSort('growthPercent')}
              >
                7D %
                <SortIcon active={sortKey === 'growthPercent'} direction={sortDirection} />
              </th>
              <th
                className="sortable"
                style={{ textAlign: 'right' }}
                onClick={() => handleSort('postsLast7d')}
              >
                Posts (7d)
                <SortIcon active={sortKey === 'postsLast7d'} direction={sortDirection} />
              </th>
              {hasTikTokEntries && (
                <>
                  <th
                    className="sortable"
                    style={{ textAlign: 'right' }}
                    onClick={() => handleSort('engagementRate')}
                    title="7-day likes / followers"
                  >
                    Engage %
                    <SortIcon active={sortKey === 'engagementRate'} direction={sortDirection} />
                  </th>
                  <th
                    className="sortable"
                    style={{ textAlign: 'right' }}
                    onClick={() => handleSort('conversionRate')}
                    title="New followers / likes"
                  >
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
