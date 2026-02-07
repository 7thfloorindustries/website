import Link from 'next/link';

export const metadata = {
  title: 'GUIDE — BROKE',
  description: 'Learn how to use the BROKE Social Metrics Dashboard to track creator growth across TikTok, Instagram, and Twitter.',
};

export default function GuidePage() {
  return (
    <main className="broke-main broke-guide">
      {/* Hero Section */}
      <section className="broke-section">
        <h1>
          <span className="yellow">HOW TO</span>
          <span>USE</span>
        </h1>
        <p className="big">
          The BROKE Social Metrics Dashboard tracks follower growth, engagement,
          and performance across TikTok, Instagram, and Twitter for all managed creators.
        </p>
      </section>

      {/* Getting Started */}
      <section className="broke-section broke-about-services">
        <h1>GETTING STARTED</h1>
        <ul>
          <li>
            <h2>1. ACCESS THE DASHBOARD</h2>
            <p style={{ marginTop: '0.5em', opacity: 0.7 }}>
              Click DASHBOARD in the navigation and enter the password to access metrics.
            </p>
          </li>
          <li>
            <h2>2. SELECT DATE RANGE</h2>
            <p style={{ marginTop: '0.5em', opacity: 0.7 }}>
              Use the date picker in the header to view data for 7, 14, 30, or 90 days.
            </p>
          </li>
          <li>
            <h2>3. FILTER BY PLATFORM</h2>
            <p style={{ marginTop: '0.5em', opacity: 0.7 }}>
              Filter creators by TikTok, Instagram, or Twitter to focus on specific platforms.
            </p>
          </li>
        </ul>
      </section>

      {/* Dashboard Pages */}
      <section className="broke-section broke-about-services">
        <h1>DASHBOARD PAGES</h1>
        <ul>
          <li>
            <h2>OVERVIEW</h2>
            <p style={{ marginTop: '0.5em', opacity: 0.7 }}>
              See total followers, growth trends, platform distribution, and top performers at a glance.
            </p>
          </li>
          <li>
            <h2>LEADERBOARD</h2>
            <p style={{ marginTop: '0.5em', opacity: 0.7 }}>
              Sortable table of all creators ranked by followers, growth, engagement rate, and more. Click any creator to view their detailed profile.
            </p>
          </li>
          <li>
            <h2>COMPARE</h2>
            <p style={{ marginTop: '0.5em', opacity: 0.7 }}>
              Select up to 4 creators to compare their growth side-by-side on a single chart.
            </p>
          </li>
        </ul>
      </section>

      {/* Understanding Metrics */}
      <section className="broke-section broke-about-services">
        <h1>KEY METRICS</h1>
        <ul>
          <li>
            <h2>FOLLOWERS</h2>
            <p style={{ marginTop: '0.5em', opacity: 0.7 }}>
              Current total follower count on each platform.
            </p>
          </li>
          <li>
            <h2>7D GROWTH</h2>
            <p style={{ marginTop: '0.5em', opacity: 0.7 }}>
              Net new followers gained in the selected time period.
            </p>
          </li>
          <li>
            <h2>ENGAGEMENT RATE</h2>
            <p style={{ marginTop: '0.5em', opacity: 0.7 }}>
              TikTok only: (7-day likes / followers) × 100. Higher = more engaged audience.
            </p>
          </li>
          <li>
            <h2>CONVERSION RATE</h2>
            <p style={{ marginTop: '0.5em', opacity: 0.7 }}>
              TikTok only: (new followers / likes) × 100. Shows how well likes convert to follows.
            </p>
          </li>
        </ul>
      </section>

      {/* Tips */}
      <section className="broke-section broke-about-services">
        <h1>TIPS</h1>
        <ul>
          <li>
            <h2>EXPORT DATA</h2>
            <p style={{ marginTop: '0.5em', opacity: 0.7 }}>
              Use the Export CSV button on the Leaderboard to download data for reporting.
            </p>
          </li>
          <li>
            <h2>SPARKLINES</h2>
            <p style={{ marginTop: '0.5em', opacity: 0.7 }}>
              The small trend lines show follower direction—green trending up, red trending down.
            </p>
          </li>
          <li>
            <h2>AUTO-REFRESH</h2>
            <p style={{ marginTop: '0.5em', opacity: 0.7 }}>
              The dashboard polls data every 5 minutes. Scrapes run every 24 hours. "Last poll" and "Last scrape" are shown separately in the header.
            </p>
          </li>
        </ul>
      </section>

      {/* CTA */}
      <section className="broke-section broke-about-contact">
        <div className="broke-about-contact-title">
          <h2>READY TO START?</h2>
        </div>
        <div className="broke-contact-swipe-container left">
          <ul>
            <li>
              <Link href="/broke/dashboard">
                DASHBOARD
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  style={{ width: 'inherit', height: 'inherit' }}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m4.5 19.5 15-15m0 0H8.25m11.25 0v11.25"
                  />
                </svg>
              </Link>
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}
