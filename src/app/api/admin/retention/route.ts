import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { archiveOldSnapshots, getArchiveStats } from '@/lib/db/retention';

export const dynamic = 'force-dynamic';

/** GET /api/admin/retention - Get archive stats (admin only) */
export async function GET(request: NextRequest) {
  const result = await requireRole(request, 'admin');
  if (result instanceof NextResponse) return result;

  try {
    const stats = await getArchiveStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Failed to get archive stats:', error);
    return NextResponse.json({ error: 'Failed to get archive stats' }, { status: 500 });
  }
}

/** POST /api/admin/retention - Trigger archival (admin only) */
export async function POST(request: NextRequest) {
  const result = await requireRole(request, 'admin');
  if (result instanceof NextResponse) return result;

  try {
    const body = await request.json().catch(() => ({}));
    const retentionDays = typeof body?.retentionDays === 'number' && body.retentionDays > 0
      ? body.retentionDays
      : 90;

    const archiveResult = await archiveOldSnapshots(retentionDays);
    return NextResponse.json(archiveResult);
  } catch (error) {
    console.error('Failed to archive snapshots:', error);
    return NextResponse.json({ error: 'Failed to archive snapshots' }, { status: 500 });
  }
}
