import { NextRequest, NextResponse } from 'next/server';
import { getAgencyPlatformRates, upsertAgencyPlatformRates, type AgencyRateInput } from '@/lib/db/creatorcore';
import { getInfluencerSession } from '@/lib/influencer/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = getInfluencerSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rates = await getAgencyPlatformRates(session);
    return NextResponse.json({ rates });
  } catch (error) {
    console.error('Failed to fetch agency rates:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch agency rates' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const session = getInfluencerSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const rawRates = Array.isArray(body?.rates)
      ? body.rates
      : (body && typeof body === 'object' ? [body] : []);

    const rates: AgencyRateInput[] = rawRates
      .map((item: unknown) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        return {
          agency_key: String(row.agency_key || ''),
          platform: String(row.platform || ''),
          rate_per_post_usd: Number(row.rate_per_post_usd),
          currency: row.currency == null ? undefined : String(row.currency),
        };
      })
      .filter((item: AgencyRateInput | null): item is AgencyRateInput => item != null);

    const updated = await upsertAgencyPlatformRates(session, rates);
    return NextResponse.json({ success: true, rates: updated });
  } catch (error) {
    console.error('Failed to update agency rates:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update agency rates' },
      { status: 500 }
    );
  }
}
