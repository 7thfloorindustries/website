const PLATFORM_CONFIG: Record<string, { color: string; className: string }> = {
  tiktok: { color: '#00f2ea', className: 'inf-dash-badge-tiktok' },
  instagram: { color: '#E1306C', className: 'inf-dash-badge-instagram' },
  twitter: { color: '#1DA1F2', className: 'inf-dash-badge-twitter' },
  x: { color: '#1DA1F2', className: 'inf-dash-badge-x' },
  youtube: { color: '#FF0000', className: 'inf-dash-badge-youtube' },
};

interface PlatformBadgeProps {
  platform: string;
}

export default function PlatformBadge({ platform }: PlatformBadgeProps) {
  const config = PLATFORM_CONFIG[platform.toLowerCase()] || {
    color: '#6B7280',
    className: '',
  };

  const label = platform.charAt(0).toUpperCase() + platform.slice(1);

  return (
    <span
      className={`inf-dash-badge ${config.className}`}
      style={!config.className ? {
        backgroundColor: `${config.color}15`,
        color: config.color,
        border: `1px solid ${config.color}40`,
      } : undefined}
    >
      {label}
    </span>
  );
}
