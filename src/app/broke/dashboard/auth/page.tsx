export default function DashboardAuthPage() {
  return (
    <div
      className="broke-dash-card"
      style={{
        margin: '2rem auto',
        maxWidth: '32rem',
        padding: '1.5rem',
        textAlign: 'center',
      }}
    >
      <h2 style={{ marginBottom: '0.75rem', color: 'var(--dash-foreground)' }}>
        Dashboard Authentication
      </h2>
      <p style={{ color: 'var(--dash-muted)', margin: 0 }}>
        Enter your dashboard password to continue.
      </p>
    </div>
  );
}
