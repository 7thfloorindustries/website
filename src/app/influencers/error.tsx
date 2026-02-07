'use client';

export default function InfluencerError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      padding: '2rem',
      color: '#fff',
      background: '#0A0A0A',
      minHeight: '100vh',
      fontFamily: 'monospace',
    }}>
      <h2 style={{ color: '#C4A35A', marginBottom: '1rem' }}>Something went wrong</h2>
      <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0 }}>
        The influencer dashboard hit an unexpected error. Please try again.
      </p>
      <button
        onClick={reset}
        style={{
          marginTop: '1rem',
          padding: '0.5rem 1rem',
          background: '#C4A35A',
          color: '#000',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  );
}
