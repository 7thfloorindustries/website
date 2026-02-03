import Link from 'next/link';

function ArrowIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m4.5 19.5 15-15m0 0H8.25m11.25 0v11.25"
      />
    </svg>
  );
}

interface ArtistLinkProps {
  name: string;
  href?: string;
}

export default function ArtistLink({ name, href }: ArtistLinkProps) {
  const content = (
    <>
      {name}
      <ArrowIcon />
    </>
  );

  if (href) {
    return (
      <div className="broke-artist">
        <Link href={href} target="_blank" rel="noopener noreferrer">
          {content}
        </Link>
      </div>
    );
  }

  return (
    <div className="broke-artist">
      <span style={{ display: 'flex', gap: '0.22em', color: 'rgba(255, 255, 255, 0.99)' }}>
        {content}
      </span>
    </div>
  );
}
