import { NextRequest, NextResponse } from 'next/server';
import { getScrapeHealthReport, isDatabaseConfigured } from '@/lib/db';
import { hasBrokeSession } from '@/lib/broke/auth';

export const dynamic = 'force-dynamic';

function parsePositiveNumber(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const authorizedByCron = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
  const authorizedByDashboardSession = hasBrokeSession(request);

  if (!authorizedByCron && !authorizedByDashboardSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dbConfigured = await isDatabaseConfigured();
  if (!dbConfigured) {
    return NextResponse.json({ error: 'Database is not configured' }, { status: 500 });
  }

  const cadenceHours = parsePositiveNumber(request.nextUrl.searchParams.get('cadenceHours'), 24);
  const staleThresholdHours = parsePositiveNumber(
    request.nextUrl.searchParams.get('staleThresholdHours') || process.env.BROKE_SCRAPE_STALE_HOURS || null,
    26
  );

  try {
    const health = await getScrapeHealthReport(cadenceHours, staleThresholdHours);

    return NextResponse.json({
      generatedAt: health.generated_at.toISOString(),
      cadenceHours: health.cadence_hours,
      staleThresholdHours: health.stale_threshold_hours,
      latestSnapshotAt: health.latest_snapshot_at?.toISOString() ?? null,
      hoursSinceLatestSnapshot: health.hours_since_latest_snapshot,
      status: health.status,
      actionRequired: health.action_required,
      issues: health.issues,
      platforms: health.platforms.map((platform) => ({
        platform: platform.platform,
        latestSnapshotAt: platform.latest_snapshot_at?.toISOString() ?? null,
        hours_since_latest_snapshot: platform.hours_since_latest_snapshot,
        snapshots_last_24h: platform.snapshots_last_24h,
        handles_last_24h: platform.handles_last_24h,
        status: platform.status,
      })),
      troubleshooting: {
        manualScrapeCommand: 'curl -X POST https://brokedown.app/api/scrape -H "Authorization: Bearer $CRON_SECRET"',
        checks: [
          'Confirm Vercel cron ran /api/scrape on schedule',
          'Inspect /api/scrape response for failed handles and alert reasons',
          'Verify APIFY_API_TOKEN, RAPIDAPI_KEY, and GOOGLE_SHEET_ID env vars are present',
          'Run a manual scrape command if the latest snapshot is stale',
        ],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch scrape health';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
