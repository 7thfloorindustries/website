# Enterprise-Grade Social Metrics Platform - Implementation Summary

## Session Date: 2026-02-03

---

## Overview

Transformed the Google Sheets-based dashboard into a scalable platform with:
- **PostgreSQL (Neon)** for permanent historical data storage
- **Vercel Cron** for automated scraping every 6 hours
- **Proper cache invalidation** so data appears instantly after scrapes
- **Immutable data model** that never loses historical records

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA FLOW                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Google Sheet (INPUT ONLY)         PostgreSQL (OUTPUT)          │
│   ┌─────────────────────┐           ┌─────────────────────┐     │
│   │ Creator Roster      │           │ metrics_snapshots   │     │
│   │ - TikTok handles    │           │ - id (uuid)         │     │
│   │ - IG handles        │           │ - handle            │     │
│   │ - Twitter handles   │           │ - platform          │     │
│   │ - Marketing rep     │           │ - followers         │     │
│   └─────────┬───────────┘           │ - likes             │     │
│             │                       │ - posts             │     │
│             ▼                       │ - scraped_at        │     │
│   ┌─────────────────────┐           │ - marketing_rep     │     │
│   │ Vercel Cron         │           └─────────┬───────────┘     │
│   │ (Every 6 hours)     │                     │                 │
│   │                     │                     │                 │
│   │ 1. Read roster      │                     ▼                 │
│   │ 2. Scrape platforms │           ┌─────────────────────┐     │
│   │ 3. INSERT to DB     │──────────▶│ Dashboard API       │     │
│   │ 4. Revalidate cache │           │ /api/metrics        │     │
│   └─────────────────────┘           └─────────┬───────────┘     │
│                                               │                 │
│                                               ▼                 │
│                                     ┌─────────────────────┐     │
│                                     │ Dashboard UI        │     │
│                                     │ /broke/dashboard    │     │
│                                     └─────────────────────┘     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files Created

| File | Purpose |
|------|---------|
| `src/lib/db/schema.sql` | Database schema with immutable `metrics_snapshots` table, indexes |
| `src/lib/db/index.ts` | Type-safe database client with insert/query functions |
| `src/app/api/scrape/route.ts` | Cron endpoint: reads roster, scrapes via Apify, inserts to DB, revalidates cache |
| `scripts/migrate-to-postgres.ts` | One-time migration from Google Sheets to PostgreSQL |
| `scripts/init-db.ts` | Database schema initialization script |

---

## Files Modified

| File | Changes |
|------|---------|
| `vercel.json` | Added `/api/scrape` cron job (`0 */6 * * *` - every 6 hours) |
| `src/app/api/metrics/route.ts` | Queries PostgreSQL first, falls back to Google Sheets; returns pre-calculated deltas |
| `src/lib/dashboard/types.ts` | Added `delta1d` and `delta7d` fields to `PlatformMetrics` |
| `src/hooks/dashboard/useGrowthCalculations.ts` | Uses pre-calculated deltas from API when available |
| `package.json` | Added `@neondatabase/serverless` and `tsx` dependencies |

---

## Database Schema

```sql
CREATE TABLE metrics_snapshots (
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
);

-- Indexes for fast queries
CREATE INDEX idx_snapshots_handle_platform ON metrics_snapshots(handle, platform);
CREATE INDEX idx_snapshots_scraped_at ON metrics_snapshots(scraped_at DESC);
CREATE INDEX idx_snapshots_platform_time ON metrics_snapshots(platform, scraped_at DESC);
CREATE INDEX idx_snapshots_marketing_rep ON metrics_snapshots(marketing_rep);
```

---

## Environment Variables Required

Add to Vercel project settings:

```bash
# Neon/PostgreSQL Database
DATABASE_URL=postgres://username:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require

# Apify (for scraping TikTok, Instagram, Twitter)
APIFY_API_TOKEN=your-apify-token

# Cron authentication (generate a secure random string)
CRON_SECRET=your-secret-here

# Existing variables (keep these)
GOOGLE_SHEET_ID=...
GOOGLE_API_KEY=...
```

---

## Setup Steps

### 1. Create Neon Database

Neon MCP Server was configured via:
```bash
npx neonctl@latest init
```

After restarting Claude CLI, the Neon tools will be available to create the database directly.

Alternatively, create manually at [console.neon.tech](https://console.neon.tech):
- Create project: `social-metrics-db`
- Copy connection string to `DATABASE_URL`

### 2. Initialize Database Schema

```bash
DATABASE_URL="postgres://..." npx tsx scripts/init-db.ts
```

### 3. Migrate Existing Data

```bash
DATABASE_URL="postgres://..." GOOGLE_SHEET_ID="..." GOOGLE_API_KEY="..." npx tsx scripts/migrate-to-postgres.ts
```

### 4. Add Environment Variables to Vercel

- `DATABASE_URL`
- `APIFY_API_TOKEN`
- `CRON_SECRET`

### 5. Deploy

Push to Vercel. The cron job will automatically run every 6 hours.

---

## API Endpoints

### GET /api/metrics
Returns creator metrics with pre-calculated deltas.
- Primary source: PostgreSQL
- Fallback: Google Sheets

### POST /api/scrape
Triggered by Vercel Cron every 6 hours.
- Requires `Authorization: Bearer {CRON_SECRET}`
- Reads roster from Google Sheets
- Scrapes TikTok, Instagram, Twitter via Apify
- Inserts snapshots to PostgreSQL
- Revalidates dashboard cache

---

## Key Benefits

| Before | After |
|--------|-------|
| Data can be accidentally deleted | Immutable append-only snapshots |
| Must hard-refresh for new data | Auto-revalidation after scrapes |
| Delta calculation in JS (fragile) | Delta calculation in SQL (reliable) |
| Manual scrape runs | Automated every 6 hours |
| Google Sheets is bottleneck | PostgreSQL scales infinitely |
| No audit trail | Full history preserved forever |

---

## Rollback Plan

If issues arise:
1. Google Sheets data remains untouched (input-only)
2. Revert `/api/metrics` to read from Sheets only
3. PostgreSQL data preserved for debugging

---

## Next Steps

1. Restart Claude CLI to enable Neon MCP tools
2. Create Neon database project
3. Run init and migration scripts
4. Configure Apify API token for scraping
5. Deploy to Vercel

---

## Dependencies Added

```json
{
  "dependencies": {
    "@neondatabase/serverless": "^0.x.x"
  },
  "devDependencies": {
    "tsx": "^4.x.x"
  }
}
```
