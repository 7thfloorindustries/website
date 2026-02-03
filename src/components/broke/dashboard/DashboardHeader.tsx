'use client';

import { useMetricsData } from '@/hooks/dashboard/useMetricsData';
import { timeAgo } from '@/lib/dashboard/formatters';
import DateRangePicker from './DateRangePicker';
import type { DateRangePreset } from '@/lib/dashboard/types';

interface DashboardHeaderProps {
  title: string;
  preset: DateRangePreset;
  onPresetChange: (preset: DateRangePreset) => void;
  onCustomRangeChange?: (start: Date, end: Date) => void;
}

export default function DashboardHeader({
  title,
  preset,
  onPresetChange,
  onCustomRangeChange,
}: DashboardHeaderProps) {
  const { data, dataUpdatedAt, isFetching } = useMetricsData();

  const lastRecord = data?.[0];
  const lastUpdated = lastRecord?.timestamp || (dataUpdatedAt ? new Date(dataUpdatedAt) : null);

  return (
    <header className="broke-dashboard-header">
      <div className="broke-dashboard-header-inner">
        <h1>{title}</h1>

        <div className="broke-dashboard-header-controls">
          <DateRangePicker
            preset={preset}
            onPresetChange={onPresetChange}
            onCustomRangeChange={onCustomRangeChange}
          />

          <div className="broke-dash-live">
            <span className={`broke-dash-live-dot ${isFetching ? 'pulse' : ''}`} />
            LIVE
          </div>

          {lastUpdated && (
            <div style={{ fontSize: '0.75rem', color: 'var(--dash-muted)' }}>
              Updated {timeAgo(lastUpdated)}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
