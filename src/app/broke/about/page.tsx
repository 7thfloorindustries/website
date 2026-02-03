import Link from 'next/link';

export const metadata = {
  title: 'ABOUT — BROKE',
  description: 'BROKE is an independent record label founded in New York City, empowering culturally impactful artists through innovative marketing and storytelling.',
};

function ExternalLinkIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m4.5 19.5 15-15m0 0H8.25m11.25 0v11.25" />
    </svg>
  );
}

function ArrowIcon() {
  return (
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
  );
}

// Placeholder press articles - edit to update
const pressArticles = [
  {
    title: 'Article Title One — Publication Name',
    href: 'https://example.com',
  },
  {
    title: 'Article Title Two — Publication Name',
    href: 'https://example.com',
  },
  {
    title: 'Article Title Three — Publication Name',
    href: 'https://example.com',
  },
];

export default function AboutPage() {
  return (
    <main className="broke-main broke-about">
      {/* Hero Section */}
      <section className="broke-section broke-about-hero">
        <div className="broke-about-hero-tv">
          {/* Placeholder for TV image - replace with actual image */}
          <div
            style={{
              width: '100%',
              aspectRatio: '4/3',
              backgroundColor: '#111',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                color: 'rgba(255,255,255,0.3)',
                fontSize: '24px',
                letterSpacing: '0.1em',
              }}
            >
              TV IMAGE
            </div>
            <div className="broke-about-hero-tv-light" />
          </div>
        </div>
        <div>
          <h1>
            <span className="yellow">BROKE</span>
            <span>RECORDS</span>
          </h1>
          <p className="big">
            An independent record label founded in New York City, empowering
            culturally impactful artists through innovative marketing and
            storytelling.
          </p>
        </div>
      </section>

      {/* Services Section */}
      <section className="broke-section broke-about-services">
        <h1>SERVICES</h1>
        <ul>
          <li>
            <h2>ARTIST DEVELOPMENT</h2>
          </li>
          <li>
            <h2>MARKETING</h2>
          </li>
          <li>
            <h2>DISTRIBUTION</h2>
          </li>
          <li>
            <h2>CREATIVE DIRECTION</h2>
          </li>
          <li>
            <h2>BRAND PARTNERSHIPS</h2>
          </li>
        </ul>
      </section>

      {/* Press/Articles Section */}
      <section className="broke-section broke-about-articles">
        <h1>PRESS</h1>
        <ul>
          {pressArticles.map((article) => (
            <li key={article.title}>
              <Link href={article.href} target="_blank" rel="noopener noreferrer">
                {article.title} <ExternalLinkIcon />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Contact Section */}
      <section className="broke-section broke-about-contact">
        <div className="broke-about-contact-title">
          <h2>GET IN TOUCH</h2>
        </div>
        <div className="broke-contact-swipe-container left">
          <ul>
            <li>
              <Link href="mailto:hi@broke.nyc">
                EMAIL
                <ArrowIcon />
              </Link>
            </li>
          </ul>
        </div>
        <div className="broke-contact-swipe-container right">
          <ul>
            <li>
              <Link
                href="https://www.instagram.com/brokerecords/"
                target="_blank"
                rel="noopener noreferrer"
              >
                INSTA
                <ArrowIcon />
              </Link>
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}
