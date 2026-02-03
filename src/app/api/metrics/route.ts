import { NextResponse } from 'next/server';
import { fetchSheetData } from '@/lib/dashboard/googleSheets';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // 5 minutes

export async function GET() {
  try {
    const records = await fetchSheetData();

    // Convert dates to ISO strings for JSON serialization
    const serialized = records.map(record => ({
      ...record,
      timestamp: record.timestamp.toISOString(),
    }));

    return NextResponse.json(serialized);
  } catch (error) {
    console.error('Error fetching metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}
