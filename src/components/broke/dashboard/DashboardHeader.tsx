'use client';

import { useMemo } from 'react';
import { useMetricsData, METRICS_POLL_INTERVAL_MS } from '@/hooks/dashboard/useMetricsData';
import { useScrapeHealth } from '@/hooks/dashboard/useScrapeHealth';
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
  const {
    data,
    dataUpdatedAt,
    isFetching,
    isError: metricsRefreshError,
    error: metricsError,
  } = useMetricsData();
  const {
    data: scrapeHealth,
    isError: scrapeHealthError,
    error: scrapeHealthFetchError,
  } = useScrapeHealth();

  const latestRecordTimestamp = useMemo(() => {
    if (!data || data.length === 0) return null;
    return data.reduce<Date | null>((latest, record) => {
      if (!latest || record.timestamp > latest) return record.timestamp;
      return latest;
    }, null);
  }, [data]);

  const lastPollAt = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const lastScrapeAt = latestRecordTimestamp || scrapeHealth?.latestSnapshotAt || null;
  const pollMinutes = Math.round(METRICS_POLL_INTERVAL_MS / (60 * 1000));

  const stalePlatforms = scrapeHealth?.platforms.filter((platform) => platform.status !== 'fresh') || [];
  const stalePlatformSummary = stalePlatforms
    .map((platform) => `${platform.platform.toUpperCase()} (${platform.hours_since_latest_snapshot ?? 'n/a'}h)`)
    .join(', ');

  const showScrapeAlert = Boolean(scrapeHealth && scrapeHealth.status !== 'healthy');
  const showAlert = metricsRefreshError || scrapeHealthError || showScrapeAlert;

  const alertTitle = metricsRefreshError
    ? 'Dashboard refresh failed'
    : scrapeHealthError
      ? 'Scrape health check failed'
      : scrapeHealth?.status === 'stale'
        ? 'CRITICAL: scrape is stale'
        : 'WARNING: scrape coverage is degraded';

  const alertBody = metricsRefreshError
    ? (metricsError instanceof Error ? metricsError.message : 'Unable to refresh /api/metrics')
    : scrapeHealthError
      ? (scrapeHealthFetchError instanceof Error ? scrapeHealthFetchError.message : 'Unable to load /api/admin/scrape-health')
      : scrapeHealth?.issues[0] || 'One or more platform snapshots are stale.';

  const troubleshootingChecks = scrapeHealth?.troubleshooting?.checks || [
    'Confirm /api/scrape ran successfully and returned 200.',
    'Verify APIFY_API_TOKEN, RAPIDAPI_KEY, and GOOGLE_SHEET_ID are configured.',
    'Re-authenticate at /broke/dashboard/auth if API calls are unauthorized.',
  ];

  const manualScrapeCommand = scrapeHealth?.troubleshooting?.manualScrapeCommand
    || 'curl -X POST https://brokedown.app/api/scrape -H "Authorization: Bearer $CRON_SECRET"';

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
            POLLING
          </div>

          <div className="broke-dash-meta">
            <div>Poll every {pollMinutes}m{lastPollAt ? ` · last poll ${timeAgo(lastPollAt)}` : ''}</div>
            <div>Last scrape {lastScrapeAt ? timeAgo(lastScrapeAt) : 'unknown'}</div>
          </div>
        </div>
      </div>

      {showAlert && (
        <div className={`broke-dash-alert ${metricsRefreshError || scrapeHealth?.status === 'stale' ? 'critical' : 'warning'}`}>
          <div className="broke-dash-alert-title">{alertTitle}</div>
          <div className="broke-dash-alert-body">{alertBody}</div>

          {stalePlatformSummary && (
            <div className="broke-dash-alert-body">Affected platforms: {stalePlatformSummary}</div>
          )}

          <div className="broke-dash-alert-section">Troubleshooting</div>
          <ul className="broke-dash-alert-list">
            {troubleshootingChecks.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>

          <div className="broke-dash-alert-section">Manual scrape command</div>
          <code className="broke-dash-alert-code">
            {manualScrapeCommand}
          </code>

          {scrapeHealth?.latestSnapshotAt && (
            <div style={{ fontSize: '0.75rem', color: 'var(--dash-muted)', marginTop: '0.5rem' }}>
              Snapshot timestamp: {scrapeHealth.latestSnapshotAt.toISOString()}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
