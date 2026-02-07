# Platform API Evaluation: Direct APIs vs. Scraping Services

**Date:** February 2026
**Context:** Brokedown social metrics dashboard currently uses Apify (TikTok, Instagram) and RapidAPI (Twitter) for scraping. This document evaluates whether migrating to direct platform APIs would improve reliability, cost, or data quality.

---

## Current Stack (Baseline)

| Platform   | Provider                              | Cost           | Reliability | Data Freshness |
|------------|---------------------------------------|----------------|-------------|----------------|
| TikTok     | Apify (`clockworks~tiktok-profile-scraper`) | ~$0.006/query  | Medium      | Same-day       |
| Instagram  | Apify (`apify~instagram-profile-scraper`)   | ~$0.008/query  | Low-Medium  | Same-day       |
| Twitter    | RapidAPI (`twitter241`)               | ~$10-30/mo     | Medium      | Same-day       |

**Current monthly cost estimate:** ~$15-40/month for ~30 creators across 3 platforms.

---

## TikTok Research API

### Overview
TikTok's official Research API provides access to public data about content and accounts.

### Access Requirements
- **Eligibility:** Restricted to academic researchers at non-profit universities in the US and Europe
- **Application:** Must submit research plans and agree to strict data use terms
- **Approval time:** Weeks to months
- **Commercial use:** Not permitted

### Capabilities
- Search public videos, comments, users
- 1,000 requests/day (up to 100,000 records/day)
- Followers/following lists: up to 2M records/day

### Cost
- Free (if approved)

### Assessment

| Factor             | Score (1-5) | Notes                                                |
|--------------------|-------------|------------------------------------------------------|
| Cost               | 5           | Free                                                 |
| Reliability        | 4           | Official API, stable                                 |
| Data freshness     | 4           | Real-time via API calls                              |
| Setup complexity   | 1           | Academic-only, long approval, not for commercial use |
| Maintenance        | 4           | Well-documented, versioned                           |

**Verdict:** Not viable for commercial use. The academic-only restriction is a hard blocker. No commercial alternative exists from TikTok directly.

---

## Instagram Graph API

### Overview
Meta's official API for accessing Instagram Business and Creator account data.

### Access Requirements
- **Account type:** Instagram Business or Creator account (each creator must have one)
- **Facebook Page:** Must be linked to a Facebook Page
- **App Review:** Must pass Meta App Review for public-facing permissions
- **OAuth:** Each creator must authorize your app via Meta Login
- **Deprecation:** Instagram Basic Display API was deprecated December 4, 2024

### Capabilities
- Read profile info (followers, media count, biography)
- Read media insights (reach, impressions, engagement)
- No access to: other accounts' follower lists, private profiles, or competitor data

### Rate Limits
- 200 API calls per hour per Instagram account
- Sufficient for daily dashboard updates

### Cost
- Free (API itself)
- Development time for App Review, OAuth flow, token management

### Assessment

| Factor             | Score (1-5) | Notes                                                        |
|--------------------|-------------|--------------------------------------------------------------|
| Cost               | 5           | Free                                                         |
| Reliability        | 5           | Official Meta API, very stable                               |
| Data freshness     | 5           | Real-time                                                    |
| Setup complexity   | 2           | Each creator must authorize; App Review process is lengthy   |
| Maintenance        | 3           | Token refresh required; Meta deprecation cycles are frequent |

**Verdict:** Strong option if creators are willing to authorize. The main challenge is the OAuth flow - each creator must individually authorize your app through a Facebook Login flow. For a managed roster of ~30 creators, this requires significant onboarding effort and ongoing token management.

---

## Twitter/X API v2

### Overview
X (formerly Twitter) provides API v2 for reading and writing tweet/user data.

### Pricing Tiers

| Tier       | Cost        | Read Limit         | Write Limit         |
|------------|-------------|--------------------|--------------------|
| Free       | $0/mo       | None (write-only)  | 1,500 tweets/mo    |
| Basic      | $200/mo     | 15,000 tweets/mo   | 50,000 tweets/mo   |
| Pro        | $5,000/mo   | 1M tweets/mo       | 300K tweets/mo     |
| Enterprise | $42,000+/mo | Full firehose      | Custom              |

### Access Requirements
- Developer account application
- Phone number verification
- Use case description
- Approval time: days to weeks

### Capabilities (Basic tier)
- User lookup (followers, following, tweet count)
- Tweet search and retrieval
- Rate limited per 15-minute windows

### Assessment

| Factor             | Score (1-5) | Notes                                                      |
|--------------------|-------------|-------------------------------------------------------------|
| Cost               | 1           | $200/mo minimum for read access (vs. ~$10/mo via RapidAPI) |
| Reliability        | 4           | Official API, though X has been unstable with API changes   |
| Data freshness     | 5           | Real-time                                                   |
| Setup complexity   | 3           | Developer portal, application, but straightforward          |
| Maintenance        | 2           | X changes API terms and pricing unpredictably               |

**Verdict:** Not cost-effective. The Basic tier at $200/month is 10-20x what we pay for equivalent data via RapidAPI unofficial scrapers. The Free tier no longer allows reading. Only justified if data accuracy and official compliance are critical requirements.

---

## Recommendation Matrix

| Platform   | Recommended Approach             | Why                                                    |
|------------|----------------------------------|--------------------------------------------------------|
| TikTok     | **Keep Apify**                   | No commercial API available; Apify is cheap and works  |
| Instagram  | **Evaluate Graph API migration** | Free, reliable, but requires creator OAuth onboarding  |
| Twitter    | **Keep RapidAPI**                | Direct API is 10-20x more expensive for same data      |

### Priority Actions

1. **Short-term (now):** No changes needed. Current stack works and is cost-effective at ~$30/mo.

2. **Medium-term (if scale grows to 100+ creators):**
   - Evaluate Instagram Graph API migration for better reliability
   - Build OAuth onboarding flow for creators
   - Implement token refresh/management system

3. **Long-term (if compliance becomes a concern):**
   - Monitor TikTok commercial API developments
   - Evaluate X API pay-per-use pilot when it exits beta
   - Consider aggregator services (Phyllo, Data365) as middle-ground options

### Risk Assessment

| Risk                          | Likelihood | Impact | Mitigation                              |
|-------------------------------|------------|--------|-----------------------------------------|
| Apify TikTok scraper breaks   | Medium     | High   | Monitor; switch to alternative Apify actors |
| RapidAPI Twitter scraper dies  | Medium     | Medium | Have backup RapidAPI endpoints identified   |
| Instagram scraper rate-limited | High       | Medium | Migrate to Graph API for owned accounts     |
| Platform blocks scraping IPs   | Low        | High   | Apify handles proxy rotation                |

---

## References

- [TikTok Research API](https://developers.tiktok.com/products/research-api/)
- [TikTok Research API FAQ](https://developers.tiktok.com/doc/research-api-faq)
- [Instagram Graph API Guide 2026](https://elfsight.com/blog/instagram-graph-api-complete-developer-guide-for-2026/)
- [Instagram API Pricing](https://www.getphyllo.com/post/instagram-api-pricing-explained-iv)
- [X/Twitter API Pricing 2026](https://getlate.dev/blog/twitter-api-pricing)
- [X API Pricing Tiers 2025](https://twitterapi.io/blog/twitter-api-pricing-2025)
- [Apify Pricing](https://apify.com/pricing)
- [Apify Review 2026](https://hackceleration.com/apify-review/)
