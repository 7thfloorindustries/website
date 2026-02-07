import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { gatherReportData, generateWeeklyReportHtml } from '@/lib/reports/weekly-report';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function POST(request: NextRequest) {
  // Auth via CRON_SECRET (same pattern as /api/scrape)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
  }

  const recipientsRaw = process.env.REPORT_RECIPIENTS || '';
  const recipients = recipientsRaw.split(',').map((e) => e.trim()).filter(Boolean);
  if (recipients.length === 0) {
    return NextResponse.json({ error: 'REPORT_RECIPIENTS not configured' }, { status: 500 });
  }

  try {
    const data = await gatherReportData();
    const html = generateWeeklyReportHtml(data);

    const resend = new Resend(resendApiKey);
    const fromAddress = process.env.REPORT_FROM_EMAIL || 'reports@brokedown.app';

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    const subject = `Broke Records Weekly Report - ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} to ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    const result = await resend.emails.send({
      from: fromAddress,
      to: recipients,
      subject,
      html,
    });

    return NextResponse.json({
      success: true,
      emailId: result.data?.id,
      recipients: recipients.length,
      totalCreators: data.totalCreators,
      totalFollowers: data.totalFollowers,
      weeklyGrowth: data.weeklyGrowth,
    });
  } catch (error) {
    console.error('Failed to send weekly report:', error);
    return NextResponse.json(
      { error: 'Failed to send weekly report', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
