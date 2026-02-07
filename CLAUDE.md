# Project Context for Claude

## Overview

This is a **shared monorepo** hosting two separate websites on one Vercel deployment:

| Site | Domain | Route | Purpose |
|------|--------|-------|---------|
| **7th Floor Digital** | `7thfloor.digital` | `/` (root) | Creative agency website |
| **Brokedown** | `brokedown.app` | `/broke/*` | Social metrics dashboard |

The `src/proxy.ts` handles host-based routing: requests to `brokedown.app` are rewritten to `/broke/*`.

---

## 7th Floor Digital

Creative agency website at **7thfloor.digital**

### Key Files

- `/src/app/page.tsx` - Landing page with animations
- `/src/app/dashboard/` - Campaign dashboards
- `/src/app/creators/` - Creator pages
- `/src/components/` - Shared UI (CustomCursor, AnimatedBackground, TiltCard, etc.)
- `/src/data/caseStudies.ts` - Case study content

### Features

- Custom cursor, magnetic elements, parallax
- Video backgrounds
- Contact form with Turnstile CAPTCHA
- Campaign dashboards

### Campaign Dashboards

Live at `/dashboard/[campaign-slug]` - pulls data from Google Sheets.

**Adding a New Campaign** - Edit `src/data/campaigns.ts`:
```typescript
'campaign-slug': {
  name: 'Campaign Name',
  slug: 'campaign-slug',
  spreadsheetId: 'GOOGLE_SHEET_ID',
  spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/SHEET_ID/edit',
  status: 'active',
  created: '2026-01-31T00:00:00.000Z',
  platforms: { twitter: 10, tiktok: 20 },
  coverImage: 'campaigns/cover.jpg',
  spend: 5000
}
```

**Current Campaigns:**
| Campaign | Slug | Sheet ID |
|----------|------|----------|
| Mike Will Made It Promo | `mike-will-made-it-promo-campaign` | `1R8lWipD1Y_zCGmIBc7W7eyZUjZrqSephGn929FI2eCo` |

**Sheet Format (Expected Columns):**
| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| Account | URL | Views | Likes | Comments | Shares | Platform | Last Updated |

**Key Files:**
- `src/data/campaigns.ts` - Campaign configs
- `src/app/dashboard/[campaign]/page.tsx` - Dashboard page
- `src/lib/google-sheets.ts` - Sheets API
- `src/lib/campaign-data.ts` - Data transforms

**Scraping Tools** (in `~/clawd/tools/campaign-manager/`):
- TikTok: `clockworks~free-tiktok-scraper` (Apify) - use `postURLs` input
- Twitter: Manual or paid APIs
- Instagram: `apify~instagram-scraper` - limited, often returns 0 for views

**CRITICAL - Scraping Rules:**
1. Views = actual view count field, NEVER use engagement as proxy
2. If API fails, mark as "API_FAILED" - NEVER fabricate data
3. Short TikTok URLs (tiktok.com/t/xxx) must be resolved individually to get correct video IDs
4. Always verify data after updating sheets

---

## Brokedown

Social metrics dashboard at **brokedown.app**

### Data Architecture

**Google Sheets** (INPUT only - roster management):
- Sheet ID: `1rmnCVq9PT2vHFB0uoZAviwBdiZsWXaiab5oK5fChexc`
- Tab: `fan_page_tracker_data`
- Columns: A=Team Member, B=Artist, C=IG Handle, D=Twitter Handle, E=TikTok Handle

**Neon PostgreSQL** (OUTPUT - metrics storage):
- Project: `social-metrics-db`
- Project ID: `young-dust-22739945`
- Database: `neondb`
- Table: `metrics_snapshots` (immutable, append-only)

### Scraping Services

| Platform | Service | Notes |
|----------|---------|-------|
| TikTok | Apify (`clockworks~tiktok-profile-scraper`) | Returns followers, likes, videos |
| Instagram | Apify (`apify~instagram-profile-scraper`) | Returns followers, posts (no total likes) |
| Twitter | RapidAPI (`twitter241`) | Returns followers, tweets |

### Metrics

- **Conversion Rate**: TikTok only = (Total Followers / Total Likes) × 100
- **Engagement Rate**: TikTok only = (Avg Likes per Video / Followers) × 100
- **Deltas**: Calculated from historical snapshots (1d, 7d)

### Workflow

1. **Add/remove creators**: Edit `fan_page_tracker_data` tab in Google Sheets
2. **Daily cron** (`/api/scrape` at 6 AM UTC): Reads roster → Scrapes platforms → Stores in PostgreSQL
3. **Dashboard** (`/broke/dashboard`): Reads from PostgreSQL, password protected

### Key Files

- `/src/app/broke/` - All Brokedown routes
- `/src/app/api/scrape/route.ts` - Cron endpoint, reads from `fan_page_tracker_data`
- `/src/app/api/metrics/route.ts` - Dashboard API, queries PostgreSQL
- `/src/lib/db/index.ts` - Database client and queries
- `/src/hooks/dashboard/useGrowthCalculations.ts` - Metrics calculations

---

## Shared Infrastructure

### Routing (src/proxy.ts)

- Host-based routing: `brokedown.app/*` → `/broke/*`
- CSP headers with per-request nonce
- Rate limiting: 5 POST requests per 60s on `/api/*` (Redis with in-memory fallback)

### Environment Variables (Vercel Production)

| Variable | Used By | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | Brokedown | Neon PostgreSQL connection string |
| `GOOGLE_SHEET_ID` | Brokedown | Google Sheets ID for roster |
| `GOOGLE_API_KEY` | Brokedown | Google Sheets API key |
| `APIFY_API_TOKEN` | Brokedown | Apify for TikTok/Instagram scraping |
| `RAPIDAPI_KEY` | Brokedown | RapidAPI for Twitter scraping |
| `CRON_SECRET` | Brokedown | Auth for cron endpoint |
| `DASHBOARD_PASSWORD` | Brokedown | Dashboard access password (required, no default fallback) |
| `BROKE_SESSION_SECRET` | Brokedown | Optional signing secret for dashboard session cookie (`broke_session`) |
| `BROKE_AUTH_ENFORCED` | Brokedown | Optional override for server-side Brokedown auth enforcement |
| `TURNSTILE_SECRET_KEY` | 7th Floor | Cloudflare Turnstile for contact form |

### Cron Jobs (vercel.json)

| Schedule | Endpoint | Purpose |
|----------|----------|---------|
| `0 0 * * *` (midnight UTC) | `/api/cron/snapshot` | Database snapshot |
| `0 6 * * *` (6 AM UTC) | `/api/scrape` | Scrape social metrics |

---

## Quick Reference

### Brokedown Management

| Task | How |
|------|-----|
| Add/remove creators | Edit Google Sheet `fan_page_tracker_data` tab |
| View dashboard | `brokedown.app/dashboard` (auth via configured `DASHBOARD_PASSWORD`) |
| Manual scrape | `curl -X POST https://brokedown.app/api/scrape -H "Authorization: Bearer $CRON_SECRET"` |
| Query metrics | `SELECT * FROM metrics_snapshots ORDER BY created_at DESC LIMIT 10` |

### Development

```bash
npm run dev      # Start local dev server
npm run build    # Production build
npm run lint     # Run ESLint
```

---

## Limitations

- **Vercel Pro plan**: 60s function timeout, sub-daily cron cadence supported
- **Instagram**: No total likes available (only per-post likes)
- **Conversion rate**: TikTok only (requires total likes metric)

---

## Notes

- When working with external APIs, verify endpoint format in official docs first
- For metrics calculations, clarify delta-based vs total-based before implementing
- Long-running tasks may need background jobs due to 10s timeout
