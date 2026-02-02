/**
 * API endpoint to retrieve campaign historical data
 */

import { NextResponse } from 'next/server';
import { getCampaignSnapshots, isRedisConfigured } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '14');

  if (!isRedisConfigured()) {
    return NextResponse.json({ snapshots: [], configured: false });
  }

  try {
    const snapshots = await getCampaignSnapshots(slug, days);

    return NextResponse.json({
      snapshots,
      configured: true,
      count: snapshots.length,
    });
  } catch (error) {
    console.error('Failed to fetch campaign history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history', snapshots: [] },
      { status: 500 }
    );
  }
}
