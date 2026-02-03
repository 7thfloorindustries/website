'use client';

import { useState, useMemo } from 'react';
import DashboardHeader from '@/components/broke/dashboard/DashboardHeader';
import LeaderboardTable from '@/components/broke/dashboard/tables/LeaderboardTable';
import SearchInput from '@/components/broke/dashboard/SearchInput';
import PlatformFilter from '@/components/broke/dashboard/PlatformFilter';
import RepFilter from '@/components/broke/dashboard/RepFilter';
import ExportButton from '@/components/broke/dashboard/ExportButton';
import BrokeLoading from '@/components/broke/BrokeLoading';
import { useMetricsData } from '@/hooks/dashboard/useMetricsData';
import { useGrowthCalculations } from '@/hooks/dashboard/useGrowthCalculations';
import { useDateRange } from '@/hooks/dashboard/useDateRange';
import type { Platform } from '@/lib/dashboard/types';

export default function LeaderboardPage() {
  const { data: records, isLoading, error } = useMetricsData();
  const { dateRange, preset, setPreset, setCustomDateRange } = useDateRange();
  const [selectedRep, setSelectedRep] = useState<string | null>(null);
  const { leaderboard, availableReps } = useGrowthCalculations(records || [], dateRange, selectedRep);

  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all');

  const filteredLeaderboard = useMemo(() => {
    return leaderboard.filter((entry) => {
      const matchesSearch = searchQuery === '' ||
        entry.handle.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPlatform = platformFilter === 'all' || entry.platform === platformFilter;
      return matchesSearch && matchesPlatform;
    });
  }, [leaderboard, searchQuery, platformFilter]);

  if (isLoading) {
    return (
      <>
        <DashboardHeader title="Leaderboard" preset={preset} onPresetChange={setPreset} onCustomRangeChange={setCustomDateRange} />
        <div className="broke-dashboard-content">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '24rem' }}>
            <BrokeLoading size="lg" text="Loading leaderboard" />
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <DashboardHeader title="Leaderboard" preset={preset} onPresetChange={setPreset} onCustomRangeChange={setCustomDateRange} />
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
      <DashboardHeader title="Leaderboard" preset={preset} onPresetChange={setPreset} onCustomRangeChange={setCustomDateRange} />
      <div className="broke-dashboard-content">
        {/* Filters bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
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
          <RepFilter
            reps={availableReps}
            selectedRep={selectedRep}
            onChange={setSelectedRep}
          />
          <div style={{ flex: 1 }} />
          <ExportButton data={filteredLeaderboard} filename="leaderboard" />
        </div>

        {/* Summary bar */}
        <div className="broke-dash-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', padding: '1rem' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--dash-muted)' }}>
            Showing <span style={{ color: 'var(--dash-accent)', fontWeight: 500 }}>{filteredLeaderboard.length}</span> of{' '}
            <span style={{ color: 'var(--dash-foreground)' }}>{leaderboard.length}</span> fanpages
            {searchQuery && (
              <span style={{ marginLeft: '0.5rem' }}>
                matching &quot;<span style={{ color: 'var(--dash-accent)' }}>{searchQuery}</span>&quot;
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--dash-muted)' }}>
            Click on a fanpage to view details
          </div>
        </div>

        {/* Leaderboard Table */}
        <LeaderboardTable entries={filteredLeaderboard} />
      </div>
    </>
  );
}
