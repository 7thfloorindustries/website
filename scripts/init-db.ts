/**
 * Initialize the PostgreSQL database schema
 *
 * Run with: npx tsx scripts/init-db.ts
 *
 * This script creates the metrics_snapshots table and indexes.
 * Safe to run multiple times - uses IF NOT EXISTS.
 */

import { neon } from '@neondatabase/serverless';

async function initializeDatabase(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const sql = neon(connectionString);

  console.log('Creating metrics_snapshots table...');

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

  console.log('Creating indexes...');

  // Create indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_handle_platform ON metrics_snapshots(handle, platform)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_handle_platform_time_desc ON metrics_snapshots(handle, platform, scraped_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_scraped_at ON metrics_snapshots(scraped_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_platform_time ON metrics_snapshots(platform, scraped_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_marketing_rep ON metrics_snapshots(marketing_rep)`;

  console.log('Database schema initialized successfully!');

  // Verify by showing table info
  const tableCheck = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'metrics_snapshots'
    ORDER BY ordinal_position
  `;

  console.log('\nTable structure:');
  for (const col of tableCheck) {
    console.log(`  ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'required'})`);
  }

  // Check record count
  const countResult = await sql`SELECT COUNT(*) as count FROM metrics_snapshots`;
  console.log(`\nCurrent record count: ${countResult[0].count}`);
}

// Run initialization
initializeDatabase().catch((error) => {
  console.error('Initialization failed:', error);
  process.exit(1);
});
