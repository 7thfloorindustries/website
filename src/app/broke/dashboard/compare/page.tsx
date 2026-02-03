'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import DashboardHeader from '@/components/broke/dashboard/DashboardHeader';
import LeaderboardTable from '@/components/broke/dashboard/tables/LeaderboardTable';
import ComparisonChart from '@/components/broke/dashboard/charts/ComparisonChart';
import SearchInput from '@/components/broke/dashboard/SearchInput';
import PlatformFilter from '@/components/broke/dashboard/PlatformFilter';
import BrokeLoading from '@/components/broke/BrokeLoading';
import { useMetricsData } from '@/hooks/dashboard/useMetricsData';
import { useGrowthCalculations } from '@/hooks/dashboard/useGrowthCalculations';
import { useDateRange } from '@/hooks/dashboard/useDateRange';
import { formatNumber, formatDelta, formatPercent } from '@/lib/dashboard/formatters';
import { getPlatformColor } from '@/lib/dashboard/colors';
import type { Platform } from '@/lib/dashboard/types';

const MAX_SELECTIONS = 4;

export default function ComparePage() {
  const { data: records, isLoading, error } = useMetricsData();
  const { dateRange, dateLabel, preset, setPreset, setCustomDateRange } = useDateRange();
  const { leaderboard } = useGrowthCalculations(records || [], dateRange);

  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const filteredLeaderboard = useMemo(() => {
    return leaderboard.filter((entry) => {
      const matchesSearch = searchQuery === '' ||
        entry.handle.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPlatform = platformFilter === 'all' || entry.platform === platformFilter;
      return matchesSearch && matchesPlatform;
    });
  }, [leaderboard, searchQuery, platformFilter]);

  const selectedEntries = useMemo(() => {
    return leaderboard.filter((entry) =>
      selectedKeys.has(`${entry.handle}-${entry.platform}`)
    );
  }, [leaderboard, selectedKeys]);

  const handleSelectionChange = useCallback((handle: string, platform: Platform, selected: boolean) => {
    const key = `${handle}-${platform}`;
    setSelectedKeys((prev) => {
      const newSet = new Set(prev);
      if (selected) {
        if (newSet.size < MAX_SELECTIONS) {
          newSet.add(key);
        }
      } else {
        newSet.delete(key);
      }
      return newSet;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  if (isLoading) {
    return (
      <>
        <DashboardHeader title="Compare" preset={preset} onPresetChange={setPreset} onCustomRangeChange={setCustomDateRange} />
        <div className="broke-dashboard-content">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '24rem' }}>
            <BrokeLoading size="lg" text="Loading data" />
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <DashboardHeader title="Compare" preset={preset} onPresetChange={setPreset} onCustomRangeChange={setCustomDateRange} />
        <div className="broke-dashboard-content">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '24rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#ef4444', marginBottom: '0.5rem' }}>Error loading data</div>
              <div style={{ color: 'var(--dash-muted)', fontSize: '0.875rem' }}>{(error as Error).message}</div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <DashboardHeader title="Compare Fanpages" preset={preset} onPresetChange={setPreset} onCustomRangeChange={setCustomDateRange} />
      <div className="broke-dashboard-content">
        {/* Selected creators comparison */}
        {selectedEntries.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ marginBottom: '1.5rem' }}
          >
            {/* Selected creators cards */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--dash-foreground)' }}>
                Comparing {selectedEntries.length} Fanpage{selectedEntries.length > 1 ? 's' : ''}
              </h2>
              <button
                onClick={clearSelection}
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--dash-muted)',
                  background: 'none',
                  border: 'none',
                }}
              >
                Clear all
              </button>
            </div>

            {/* Comparison cards grid */}
            <div className="broke-dash-grid-4" style={{ marginBottom: '1.5rem' }}>
              {selectedEntries.map((entry, index) => {
                const platformColor = getPlatformColor(entry.platform);
                return (
                  <motion.div
                    key={`${entry.handle}-${entry.platform}`}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                    className="broke-dash-card"
                    style={{ padding: '1rem', borderLeft: `3px solid ${platformColor}` }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <span style={{ color: 'var(--dash-foreground)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.handle}
                      </span>
                      <button
                        onClick={() => handleSelectionChange(entry.handle, entry.platform, false)}
                        style={{ color: 'var(--dash-muted)', background: 'none', border: 'none' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                        <span style={{ color: 'var(--dash-muted)' }}>Followers</span>
                        <span style={{ color: 'var(--dash-foreground)', fontFamily: 'monospace' }}>{formatNumber(entry.followers)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                        <span style={{ color: 'var(--dash-muted)' }}>Growth ({dateLabel})</span>
                        <span style={{ color: entry.deltaFollowers >= 0 ? 'var(--dash-positive)' : 'var(--dash-negative)' }}>
                          {formatDelta(entry.deltaFollowers)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                        <span style={{ color: 'var(--dash-muted)' }}>Growth %</span>
                        <span style={{ color: entry.growthPercent >= 0 ? 'var(--dash-positive)' : 'var(--dash-negative)' }}>
                          {formatPercent(entry.growthPercent)}
                        </span>
                      </div>
                      {entry.engagementRate !== undefined && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                          <span style={{ color: 'var(--dash-muted)' }}>Engagement</span>
                          <span style={{ color: 'var(--dash-accent)' }}>{entry.engagementRate.toFixed(1)}%</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}

              {/* Placeholder slots */}
              {Array.from({ length: MAX_SELECTIONS - selectedEntries.length }).map((_, i) => (
                <div
                  key={`placeholder-${i}`}
                  className="broke-dash-card"
                  style={{
                    padding: '1rem',
                    borderStyle: 'dashed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ color: 'var(--dash-muted)', fontSize: '0.875rem' }}>Select a fanpage</span>
                </div>
              ))}
            </div>

            {/* Comparison chart */}
            <ComparisonChart entries={selectedEntries} />
          </motion.div>
        )}

        {/* Selection table */}
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--dash-foreground)', marginBottom: '1rem' }}>
            Select Fanpages to Compare (max {MAX_SELECTIONS})
          </h2>

          {/* Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ width: '16rem' }}>
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search by handle..."
              />
            </div>
            <PlatformFilter
              value={platformFilter}
              onChange={setPlatformFilter}
            />
          </div>

          <LeaderboardTable
            entries={filteredLeaderboard}
            selectable
            selectedHandles={selectedKeys}
            onSelectionChange={handleSelectionChange}
          />
        </div>
      </div>
    </>
  );
}
