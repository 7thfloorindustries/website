import { logger } from '@/lib/logger';
import type { Anomaly } from '@/lib/anomaly';
import type { Platform } from '@/lib/db';

interface PlatformStat {
  attempted: number;
  succeeded: number;
  failed: string[];
  successRatio?: number;
}

interface ScrapeAlertPayload {
  timestamp: string;
  reasons: string[];
  platformStats: Record<Platform, PlatformStat>;
  database: {
    inserted: number;
    skipped: number;
    failed: number;
  };
  anomalies?: Anomaly[];
  durationMs?: number;
}

function platformEmoji(platform: string): string {
  switch (platform) {
    case 'tiktok': return 'TikTok';
    case 'instagram': return 'Instagram';
    case 'twitter': return 'Twitter/X';
    default: return platform;
  }
}

function buildSlackBlocks(payload: ScrapeAlertPayload): object[] {
  const blocks: object[] = [];

  // Header
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: 'Brokedown Scrape Alert',
      emoji: true,
    },
  });

  // Reasons summary
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Alert Reasons:*\n${payload.reasons.map((r) => `- ${r}`).join('\n')}`,
    },
  });

  // Scrape summary
  const platformLines = (['tiktok', 'instagram', 'twitter'] as Platform[]).map((p) => {
    const stat = payload.platformStats[p];
    const ratio = stat.successRatio !== undefined
      ? ` (${Math.round(stat.successRatio * 100)}%)`
      : '';
    return `*${platformEmoji(p)}:* ${stat.succeeded}/${stat.attempted} succeeded${ratio}`;
  });

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Scrape Summary:*\n${platformLines.join('\n')}\n\n*Database:* ${payload.database.inserted} inserted, ${payload.database.skipped} skipped, ${payload.database.failed} failed`,
    },
  });

  // Failed handles
  const failedHandles: string[] = [];
  for (const platform of ['tiktok', 'instagram', 'twitter'] as Platform[]) {
    const stat = payload.platformStats[platform];
    if (stat.failed.length > 0) {
      failedHandles.push(`*${platformEmoji(platform)}:* ${stat.failed.join(', ')}`);
    }
  }
  if (failedHandles.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Failed Handles:*\n${failedHandles.join('\n')}`,
      },
    });
  }

  // Anomalies
  if (payload.anomalies && payload.anomalies.length > 0) {
    const anomalyLines = payload.anomalies.map((a) => {
      const severity = a.severity === 'likely_error' ? 'LIKELY ERROR' : 'SUSPICIOUS';
      return `[${severity}] *${a.handle}* (${platformEmoji(a.platform)}): ${a.metric} dropped ${Math.round(a.dropPercent)}% (${a.previousValue.toLocaleString()} -> ${a.newValue.toLocaleString()})`;
    });

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Anomalies Detected (${payload.anomalies.length}):*\n${anomalyLines.join('\n')}`,
      },
    });
  }

  // Timestamp footer
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Timestamp: ${payload.timestamp}${payload.durationMs ? ` | Duration: ${(payload.durationMs / 1000).toFixed(1)}s` : ''}`,
      },
    ],
  });

  return blocks;
}

/**
 * Send a scrape alert to Slack using Block Kit formatting.
 * Uses SLACK_WEBHOOK_URL env var. Falls back to SCRAPE_ALERT_WEBHOOK_URL for backward compat.
 */
export async function sendSlackAlert(payload: ScrapeAlertPayload): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL || process.env.SCRAPE_ALERT_WEBHOOK_URL;
  if (!webhookUrl) return false;

  try {
    const blocks = buildSlackBlocks(payload);
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `Scrape Alert: ${payload.reasons.join(', ')}`,
        blocks,
      }),
    });

    if (!response.ok) {
      logger.error('Slack webhook returned non-OK', { status: response.status });
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Failed to send Slack alert', { error: String(error) });
    return false;
  }
}
