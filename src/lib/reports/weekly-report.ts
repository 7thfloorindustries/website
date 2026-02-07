import { getMetricsWithDeltas, getRepStats } from '@/lib/db';

interface ReportData {
  totalCreators: number;
  totalFollowers: number;
  weeklyGrowth: number;
  topGrowers: { handle: string; platform: string; followers: number; delta_7d: number }[];
  repSummary: { rep: string; total_followers: number; total_growth: number; creator_count: number }[];
  generatedAt: string;
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function deltaArrow(n: number): string {
  if (n > 0) return `&#9650; +${formatNumber(n)}`;
  if (n < 0) return `&#9660; ${formatNumber(n)}`;
  return '&#8212; 0';
}

function deltaColor(n: number): string {
  if (n > 0) return '#4ade80';
  if (n < 0) return '#f87171';
  return '#9ca3af';
}

export async function gatherReportData(): Promise<ReportData> {
  const [metrics, repStats] = await Promise.all([
    getMetricsWithDeltas(),
    getRepStats(),
  ]);

  const uniqueHandles = new Set(metrics.map((m) => m.handle));
  const totalFollowers = metrics.reduce((sum, m) => sum + m.followers, 0);
  const weeklyGrowth = metrics.reduce((sum, m) => sum + (m.delta_7d || 0), 0);

  // Top growers by 7-day follower delta
  const topGrowers = [...metrics]
    .filter((m) => (m.delta_7d || 0) > 0)
    .sort((a, b) => (b.delta_7d || 0) - (a.delta_7d || 0))
    .slice(0, 10)
    .map((m) => ({
      handle: m.handle,
      platform: m.platform,
      followers: m.followers,
      delta_7d: m.delta_7d || 0,
    }));

  return {
    totalCreators: uniqueHandles.size,
    totalFollowers,
    weeklyGrowth,
    topGrowers,
    repSummary: repStats as ReportData['repSummary'],
    generatedAt: new Date().toISOString(),
  };
}

export function generateWeeklyReportHtml(data: ReportData): string {
  const topGrowersRows = data.topGrowers
    .map(
      (g) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #333;color:#fff;">@${g.handle}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #333;color:#9ca3af;text-transform:capitalize;">${g.platform}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #333;color:#fff;text-align:right;">${formatNumber(g.followers)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #333;color:${deltaColor(g.delta_7d)};text-align:right;">${deltaArrow(g.delta_7d)}</td>
      </tr>`
    )
    .join('');

  const repRows = data.repSummary
    .map(
      (r) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #333;color:#fff;">${r.rep}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #333;color:#fff;text-align:right;">${r.creator_count}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #333;color:#fff;text-align:right;">${formatNumber(r.total_followers)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #333;color:${deltaColor(r.total_growth)};text-align:right;">${deltaArrow(r.total_growth)}</td>
      </tr>`
    )
    .join('');

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const dateRange = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#000;padding:20px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#111;border-radius:12px;overflow:hidden;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#000 0%,#1a1a1a 100%);padding:32px 24px;text-align:center;border-bottom:2px solid #ffd600;">
          <h1 style="margin:0;font-size:28px;font-weight:700;color:#ffd600;letter-spacing:1px;">BROKE RECORDS</h1>
          <p style="margin:8px 0 0;font-size:14px;color:#9ca3af;">Weekly Performance Report &bull; ${dateRange}</p>
        </td></tr>

        <!-- Summary Cards -->
        <tr><td style="padding:24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="33%" style="padding:8px;">
                <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:16px;text-align:center;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Creators</p>
                  <p style="margin:8px 0 0;font-size:24px;font-weight:700;color:#fff;">${data.totalCreators}</p>
                </div>
              </td>
              <td width="33%" style="padding:8px;">
                <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:16px;text-align:center;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Total Followers</p>
                  <p style="margin:8px 0 0;font-size:24px;font-weight:700;color:#fff;">${formatNumber(data.totalFollowers)}</p>
                </div>
              </td>
              <td width="33%" style="padding:8px;">
                <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:16px;text-align:center;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">7D Growth</p>
                  <p style="margin:8px 0 0;font-size:24px;font-weight:700;color:${deltaColor(data.weeklyGrowth)};">${deltaArrow(data.weeklyGrowth)}</p>
                </div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Top Growers -->
        <tr><td style="padding:0 24px 24px;">
          <h2 style="margin:0 0 12px;font-size:16px;color:#ffd600;text-transform:uppercase;letter-spacing:1px;">Top Growers (7-Day)</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #333;border-radius:8px;overflow:hidden;">
            <tr style="background:#1a1a1a;">
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#9ca3af;text-transform:uppercase;">Handle</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#9ca3af;text-transform:uppercase;">Platform</th>
              <th style="padding:8px 12px;text-align:right;font-size:12px;color:#9ca3af;text-transform:uppercase;">Followers</th>
              <th style="padding:8px 12px;text-align:right;font-size:12px;color:#9ca3af;text-transform:uppercase;">7D Change</th>
            </tr>
            ${topGrowersRows || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#9ca3af;">No growth data available</td></tr>'}
          </table>
        </td></tr>

        <!-- Rep Summary -->
        <tr><td style="padding:0 24px 24px;">
          <h2 style="margin:0 0 12px;font-size:16px;color:#ffd600;text-transform:uppercase;letter-spacing:1px;">Team Summary</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #333;border-radius:8px;overflow:hidden;">
            <tr style="background:#1a1a1a;">
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#9ca3af;text-transform:uppercase;">Rep</th>
              <th style="padding:8px 12px;text-align:right;font-size:12px;color:#9ca3af;text-transform:uppercase;">Creators</th>
              <th style="padding:8px 12px;text-align:right;font-size:12px;color:#9ca3af;text-transform:uppercase;">Followers</th>
              <th style="padding:8px 12px;text-align:right;font-size:12px;color:#9ca3af;text-transform:uppercase;">24H Growth</th>
            </tr>
            ${repRows || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#9ca3af;">No rep data available</td></tr>'}
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 24px;border-top:1px solid #333;text-align:center;">
          <p style="margin:0;font-size:12px;color:#666;">Broke Records &bull; brokedown.app &bull; Generated ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
