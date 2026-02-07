'use client';

const PLATFORMS = [
  { value: 'tiktok', label: 'TikTok', color: '#00f2ea' },
  { value: 'instagram', label: 'Instagram', color: '#E1306C' },
  { value: 'youtube', label: 'YouTube', color: '#FF0000' },
  { value: 'x', label: 'X', color: '#1DA1F2' },
];

interface PlatformFilterProps {
  value: string;
  onChange: (value: string) => void;
}

export default function PlatformFilter({ value, onChange }: PlatformFilterProps) {
  return (
    <div className="inf-dash-platform-filter">
      {PLATFORMS.map((platform) => {
        const isActive = value === platform.value;
        return (
          <button
            key={platform.value}
            className={`inf-dash-platform-btn ${isActive ? 'active' : ''}`}
            onClick={() => onChange(isActive ? '' : platform.value)}
            style={isActive ? {
              backgroundColor: `${platform.color}15`,
              color: platform.color,
              borderColor: `${platform.color}40`,
            } : undefined}
          >
            {platform.label}
          </button>
        );
      })}
    </div>
  );
}
