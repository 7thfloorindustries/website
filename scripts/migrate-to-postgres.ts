/**
 * One-time migration script to move existing Google Sheets data to PostgreSQL
 *
 * Run with: npx tsx scripts/migrate-to-postgres.ts
 *
 * This script:
 * 1. Fetches all historical data from Google Sheets
 * 2. Transforms it to the new schema format
 * 3. Inserts into PostgreSQL (append-only, never overwrites)
 *
 * Safe to run multiple times - uses ON CONFLICT DO NOTHING
 */

import { neon } from '@neondatabase/serverless';

interface SheetRow {
  timestamp: string;
  tiktokHandle: string;
  tiktokFollowers: string;
  tiktokDeltaFollowers: string;
  tiktokLikes: string;
  tiktokDeltaLikes: string;
  tiktokVideos: string;
  tiktokDeltaVideos: string;
  tiktokPosts7d: string;
  igHandle: string;
  igFollowers: string;
  igDeltaFollowers: string;
  igPosts: string;
  igDeltaPosts: string;
  igPosts7d: string;
  twitterHandle: string;
  twitterFollowers: string;
  twitterDeltaFollowers: string;
  tweets: string;
  twitterDeltaTweets: string;
  twitterPosts7d: string;
  marketingRep: string;
}

function parseNumber(val: string): number {
  if (!val || val === '' || val === 'N/A') return 0;
  return parseInt(val.replace(/,/g, ''), 10) || 0;
}

function parseRow(row: string[]): SheetRow {
  return {
    timestamp: row[0] || '',
    tiktokHandle: row[1] || '',
    tiktokFollowers: row[2] || '',
    tiktokDeltaFollowers: row[3] || '',
    tiktokLikes: row[4] || '',
    tiktokDeltaLikes: row[5] || '',
    tiktokVideos: row[6] || '',
    tiktokDeltaVideos: row[7] || '',
    tiktokPosts7d: row[8] || '',
    igHandle: row[9] || '',
    igFollowers: row[10] || '',
    igDeltaFollowers: row[11] || '',
    igPosts: row[12] || '',
    igDeltaPosts: row[13] || '',
    igPosts7d: row[14] || '',
    twitterHandle: row[15] || '',
    twitterFollowers: row[16] || '',
    twitterDeltaFollowers: row[17] || '',
    tweets: row[18] || '',
    twitterDeltaTweets: row[19] || '',
    twitterPosts7d: row[20] || '',
    marketingRep: row[21] || '',
  };
}

async function fetchAllSheetData(): Promise<SheetRow[]> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!sheetId || !apiKey) {
    throw new Error('GOOGLE_SHEET_ID and GOOGLE_API_KEY environment variables are required');
  }

  const range = 'Weekly Tracking!A2:V1000';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;

  console.log('Fetching data from Google Sheets...');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch sheet data: ${response.status}`);
  }

  const data = await response.json();
  const rows: string[][] = data.values || [];

  console.log(`Found ${rows.length} rows in Google Sheets`);

  return rows.map(parseRow);
}

async function initializeDatabase(connectionString: string): Promise<void> {
  const sql = neon(connectionString);
  console.log('Initializing database schema...');

  // Create table
  await sql`
    CREATE TABLE IF NOT EXISTS metrics_snapshots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      handle VARCHAR(255) NOT NULL,
      platform VARCHAR(20) NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'twitter')),
      marketing_rep VARCHAR(255),
      followers INTEGER NOT NULL DEFAULT 0,
      likes BIGINT DEFAULT 0,
      posts INTEGER DEFAULT 0,
      videos INTEGER DEFAULT 0,
      scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT unique_snapshot UNIQUE (handle, platform, scraped_at)
    )
  `;

  // Create indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_handle_platform ON metrics_snapshots(handle, platform)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_handle_platform_time_desc ON metrics_snapshots(handle, platform, scraped_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_scraped_at ON metrics_snapshots(scraped_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_platform_time ON metrics_snapshots(platform, scraped_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_marketing_rep ON metrics_snapshots(marketing_rep)`;

  console.log('Database schema initialized');
}

async function migrate(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const sql = neon(connectionString);

  // Initialize schema
  await initializeDatabase(connectionString);

  // Fetch all data from Google Sheets
  const sheetData = await fetchAllSheetData();

  let insertedCount = 0;
  let skippedCount = 0;

  console.log('Migrating data to PostgreSQL...');

  for (const row of sheetData) {
    const timestamp = row.timestamp ? new Date(row.timestamp) : new Date();

    // Validate timestamp
    if (isNaN(timestamp.getTime())) {
      console.warn(`Skipping row with invalid timestamp: ${row.timestamp}`);
      skippedCount++;
      continue;
    }

    // Insert TikTok data
    if (row.tiktokHandle) {
      try {
        await sql`
          INSERT INTO metrics_snapshots (handle, platform, marketing_rep, followers, likes, posts, videos, scraped_at)
          VALUES (
            ${row.tiktokHandle},
            'tiktok',
            ${row.marketingRep || null},
            ${parseNumber(row.tiktokFollowers)},
            ${parseNumber(row.tiktokLikes)},
            ${parseNumber(row.tiktokVideos)},
            ${parseNumber(row.tiktokVideos)},
            ${timestamp.toISOString()}
          )
          ON CONFLICT (handle, platform, scraped_at) DO NOTHING
        `;
        insertedCount++;
      } catch (error) {
        console.error(`Error inserting TikTok data for ${row.tiktokHandle}:`, error);
        skippedCount++;
      }
    }

    // Insert Instagram data
    if (row.igHandle) {
      try {
        await sql`
          INSERT INTO metrics_snapshots (handle, platform, marketing_rep, followers, likes, posts, videos, scraped_at)
          VALUES (
            ${row.igHandle},
            'instagram',
            ${row.marketingRep || null},
            ${parseNumber(row.igFollowers)},
            0,
            ${parseNumber(row.igPosts)},
            0,
            ${timestamp.toISOString()}
          )
          ON CONFLICT (handle, platform, scraped_at) DO NOTHING
        `;
        insertedCount++;
      } catch (error) {
        console.error(`Error inserting Instagram data for ${row.igHandle}:`, error);
        skippedCount++;
      }
    }

    // Insert Twitter data
    if (row.twitterHandle) {
      try {
        await sql`
          INSERT INTO metrics_snapshots (handle, platform, marketing_rep, followers, likes, posts, videos, scraped_at)
          VALUES (
            ${row.twitterHandle},
            'twitter',
            ${row.marketingRep || null},
            ${parseNumber(row.twitterFollowers)},
            0,
            ${parseNumber(row.tweets)},
            0,
            ${timestamp.toISOString()}
          )
          ON CONFLICT (handle, platform, scraped_at) DO NOTHING
        `;
        insertedCount++;
      } catch (error) {
        console.error(`Error inserting Twitter data for ${row.twitterHandle}:`, error);
        skippedCount++;
      }
    }
  }

  console.log('\n=== Migration Complete ===');
  console.log(`Inserted: ${insertedCount} records`);
  console.log(`Skipped: ${skippedCount} records`);

  // Verify migration
  const countResult = await sql`SELECT COUNT(*) as count FROM metrics_snapshots`;
  console.log(`Total records in database: ${countResult[0].count}`);

  // Show sample data
  const sampleResult = await sql`
    SELECT handle, platform, followers, scraped_at
    FROM metrics_snapshots
    ORDER BY scraped_at DESC
    LIMIT 5
  `;
  console.log('\nSample records:');
  for (const row of sampleResult) {
    console.log(`  ${row.handle} (${row.platform}): ${row.followers} followers @ ${row.scraped_at}`);
  }
}

// Run migration
migrate().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
