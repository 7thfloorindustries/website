# Project Context for Claude

## Brokedown

Social metrics dashboard at brokedown.app

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

- `/src/app/api/scrape/route.ts` - Cron endpoint, reads from `fan_page_tracker_data`
- `/src/app/api/metrics/route.ts` - Dashboard API, queries PostgreSQL
- `/src/lib/db/index.ts` - Database client and queries
- `/src/hooks/dashboard/useGrowthCalculations.ts` - Metrics calculations (conversion rate, engagement)

### Environment Variables (Vercel Production)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `GOOGLE_SHEET_ID` | Google Sheets ID for roster |
| `GOOGLE_API_KEY` | Google Sheets API key |
| `APIFY_API_TOKEN` | Apify for TikTok/Instagram scraping |
| `RAPIDAPI_KEY` | RapidAPI for Twitter scraping |
| `CRON_SECRET` | Auth for cron endpoint |
| `DASHBOARD_PASSWORD` | Dashboard access (`broke2024`) |

### Limitations

- **Vercel Hobby plan**: Daily cron only (not every 6 hours), 10s function timeout
- **Instagram**: No total likes available (only per-post likes)
- **Conversion rate**: TikTok only (requires total likes metric)

## API Integration

When working with external APIs, always verify the API version and endpoint format in official documentation before making requests. Test with a minimal curl command first.

## Data & Analytics

For metrics/analytics calculations, clarify whether values should be delta-based (change between periods) or total-based (cumulative) before implementing.

## Deployment

When deploying to Vercel, consider function timeout limits (default 10s on hobby, 60s on pro). Long-running tasks like scrapers may need background jobs or edge functions.
