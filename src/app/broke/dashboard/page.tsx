'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import DashboardHeader from '@/components/broke/dashboard/DashboardHeader';
import StatCard from '@/components/broke/dashboard/cards/StatCard';
import TopPerformerCard from '@/components/broke/dashboard/cards/TopPerformerCard';
import GrowthTrendChart from '@/components/broke/dashboard/charts/GrowthTrendChart';
import PlatformDonut from '@/components/broke/dashboard/charts/PlatformDonut';
import PlatformBarChart from '@/components/broke/dashboard/charts/PlatformBarChart';
import EngagementScatter from '@/components/broke/dashboard/charts/EngagementScatter';
import RepFilter from '@/components/broke/dashboard/RepFilter';
import BrokeLoading from '@/components/broke/BrokeLoading';
import { useMetricsData } from '@/hooks/dashboard/useMetricsData';
import { useGrowthCalculations } from '@/hooks/dashboard/useGrowthCalculations';
import { useDateRange } from '@/hooks/dashboard/useDateRange';
import { formatNumber, formatDelta } from '@/lib/dashboard/formatters';

export default function OverviewPage() {
  const { data: records, isLoading, error } = useMetricsData();
  const { dateRange, dateLabel, preset, setPreset, setCustomDateRange } = useDateRange();
  const [selectedRep, setSelectedRep] = useState<string | null>(null);
  const { aggregatedStats, topPerformers, growthTrendData, leaderboard, repStats, availableReps } = useGrowthCalculations(records || [], dateRange, selectedRep);

  if (isLoading) {
    return (
      <>
        <DashboardHeader title="Overview" preset={preset} onPresetChange={setPreset} onCustomRangeChange={setCustomDateRange} />
        <div className="broke-dashboard-content">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '24rem' }}>
            <BrokeLoading size="lg" text="Loading metrics" />
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <DashboardHeader title="Overview" preset={preset} onPresetChange={setPreset} onCustomRangeChange={setCustomDateRange} />
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
      <DashboardHeader title="Overview" preset={preset} onPresetChange={setPreset} onCustomRangeChange={setCustomDateRange} />
      <div className="broke-dashboard-content">
        {/* Rep Filter */}
        {availableReps.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <RepFilter
              reps={availableReps}
              selectedRep={selectedRep}
              onChange={setSelectedRep}
            />
            {selectedRep && (
              <span style={{ fontSize: '0.875rem', color: 'var(--dash-muted)' }}>
                Showing data for <span style={{ color: 'var(--dash-accent)', fontWeight: 500 }}>{selectedRep}</span>
              </span>
            )}
          </div>
        )}

        {/* Stats Grid */}
        <div className="broke-dash-grid-4" style={{ marginBottom: '1.5rem' }}>
          <StatCard
            label="Total Followers"
            value={aggregatedStats.totalFollowers}
            delay={0}
          />
          <StatCard
            label={`Growth (${dateLabel})`}
            value={aggregatedStats.totalGrowth7d}
            prefix={aggregatedStats.totalGrowth7d >= 0 ? '+' : ''}
            delay={0.1}
          />
          <StatCard
            label="Active Fanpages"
            value={aggregatedStats.activeCreators}
            delay={0.2}
          />
          <StatCard
            label="Platforms"
            value="3"
            delay={0.3}
          />
        </div>

        {/* Charts Grid */}
        <div className="broke-dash-grid-3" style={{ marginBottom: '1.5rem' }}>
          <div className="broke-dash-col-span-2">
            <GrowthTrendChart data={growthTrendData} />
          </div>
          <div>
            <PlatformDonut data={aggregatedStats.byPlatform} />
          </div>
        </div>

        {/* Platform Analysis Charts */}
        <div className="broke-dash-grid-2" style={{ marginBottom: '1.5rem' }}>
          <PlatformBarChart data={aggregatedStats.byPlatform} metric="growth" />
          <EngagementScatter entries={leaderboard} />
        </div>

        {/* Rep Performance Summary */}
        {repStats.length > 0 && !selectedRep && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            style={{ marginBottom: '1.5rem' }}
          >
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--dash-foreground)', marginBottom: '1rem' }}>
              Rep Performance
            </h2>
            <div className="broke-dash-grid-3">
              {repStats.map((rep, index) => (
                <motion.div
                  key={rep.rep}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.5 + index * 0.1 }}
                  className="broke-dash-card"
                  style={{ padding: '1rem' }}
                  onClick={() => setSelectedRep(rep.rep === 'Unassigned' ? null : rep.rep)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <h3 style={{ color: 'var(--dash-foreground)', fontWeight: 500 }}>{rep.rep}</h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--dash-muted)' }}>{rep.fanpageCount} fanpages</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--dash-muted)' }}>Total Followers</span>
                      <span style={{ color: 'var(--dash-foreground)', fontFamily: 'monospace', fontSize: '0.875rem' }}>{formatNumber(rep.totalFollowers)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--dash-muted)' }}>7D Growth</span>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.875rem', color: rep.totalGrowth7d >= 0 ? 'var(--dash-positive)' : 'var(--dash-negative)' }}>
                        {formatDelta(rep.totalGrowth7d)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--dash-muted)' }}>Avg Growth %</span>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.875rem', color: rep.avgGrowthPercent >= 0 ? 'var(--dash-positive)' : 'var(--dash-negative)' }}>
                        {rep.avgGrowthPercent >= 0 ? '+' : ''}{rep.avgGrowthPercent.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Top Performers */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--dash-foreground)', marginBottom: '1rem' }}>
            Top Performers ({dateLabel})
          </h2>
          <div className="broke-dash-grid-3">
            {topPerformers.map((performer, index) => (
              <TopPerformerCard
                key={`${performer.handle}-${performer.platform}`}
                performer={performer}
                rank={index + 1}
                delay={0.5 + index * 0.1}
              />
            ))}
          </div>
        </motion.div>
      </div>
    </>
  );
}
