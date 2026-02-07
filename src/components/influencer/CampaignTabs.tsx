'use client';

type CampaignTab = 'main' | 'intake';

interface CampaignTabsProps {
  activeTab: CampaignTab;
  intakeCount?: number;
  onChange: (tab: CampaignTab) => void;
}

export default function CampaignTabs({ activeTab, intakeCount = 0, onChange }: CampaignTabsProps) {
  return (
    <div
      className="inf-dash-card"
      style={{
        display: 'inline-flex',
        padding: '0.3rem',
        borderRadius: '0.75rem',
        gap: '0.3rem',
        marginBottom: '1rem',
      }}
    >
      <button
        type="button"
        onClick={() => onChange('main')}
        style={{
          border: 'none',
          background: activeTab === 'main' ? 'rgba(196, 163, 90, 0.16)' : 'transparent',
          color: activeTab === 'main' ? 'var(--inf-accent)' : 'var(--inf-foreground)',
          fontSize: '0.82rem',
          fontWeight: 600,
          padding: '0.5rem 0.9rem',
          borderRadius: '0.6rem',
        }}
      >
        Main Hub
      </button>
      <button
        type="button"
        onClick={() => onChange('intake')}
        style={{
          border: 'none',
          background: activeTab === 'intake' ? 'rgba(245, 158, 11, 0.14)' : 'transparent',
          color: activeTab === 'intake' ? '#F59E0B' : 'var(--inf-foreground)',
          fontSize: '0.82rem',
          fontWeight: 600,
          padding: '0.5rem 0.9rem',
          borderRadius: '0.6rem',
        }}
      >
        Intake Queue ({intakeCount})
      </button>
    </div>
  );
}
