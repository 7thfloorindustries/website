/**
 * One-time migration script to move the creator roster from Google Sheets to the creators table.
 *
 * Run with: npx tsx scripts/migrate-roster.ts
 *
 * Requires env vars: GOOGLE_SHEET_ID, GOOGLE_API_KEY, DATABASE_URL
 *
 * Safe to run multiple times - uses ON CONFLICT (artist lowercase) DO UPDATE.
 */

import { neon } from '@neondatabase/serverless';

interface RosterRow {
  teamMember: string;
  artist: string;
  igHandle: string | null;
  twitterHandle: string | null;
  tiktokHandle: string | null;
}

async function fetchRosterFromSheets(): Promise<RosterRow[]> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!sheetId || !apiKey) {
    throw new Error('GOOGLE_SHEET_ID and GOOGLE_API_KEY must be set');
  }

  const range = 'fan_page_tracker_data!A2:E1000';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch roster sheet: ${response.status}`);
  }

  const data = await response.json();
  const rows: string[][] = data.values || [];

  const roster: RosterRow[] = [];
  for (const row of rows) {
    const teamMember = row[0]?.trim();
    const artist = row[1]?.trim();
    if (!teamMember || !artist) continue;

    roster.push({
      teamMember,
      artist,
      igHandle: row[2]?.trim().replace('@', '') || null,
      twitterHandle: row[3]?.trim().replace('@', '') || null,
      tiktokHandle: row[4]?.trim().replace('@', '') || null,
    });
  }

  return roster;
}

async function main() {
  console.log('Fetching roster from Google Sheets...');
  const roster = await fetchRosterFromSheets();
  console.log(`Found ${roster.length} creators in sheet`);

  if (roster.length === 0) {
    console.log('No creators found, exiting.');
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL must be set');
  }

  const sql = neon(connectionString);

  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const entry of roster) {
    try {
      const result = await sql`
        INSERT INTO creators (team_member, artist, ig_handle, twitter_handle, tiktok_handle)
        VALUES (${entry.teamMember}, ${entry.artist}, ${entry.igHandle}, ${entry.twitterHandle}, ${entry.tiktokHandle})
        ON CONFLICT ((LOWER(artist))) DO UPDATE SET
          team_member = EXCLUDED.team_member,
          ig_handle = EXCLUDED.ig_handle,
          twitter_handle = EXCLUDED.twitter_handle,
          tiktok_handle = EXCLUDED.tiktok_handle,
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_insert
      `;
      if (result[0]?.is_insert) {
        inserted++;
      } else {
        updated++;
      }
    } catch (error) {
      failed++;
      console.error(`Failed to upsert "${entry.artist}":`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`\nMigration complete:`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Failed:   ${failed}`);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
