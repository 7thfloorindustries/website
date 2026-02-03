'use client';

import { motion } from 'framer-motion';
import type { Platform } from '@/lib/dashboard/types';
import { getPlatformColor, colors } from '@/lib/dashboard/colors';

interface PlatformFilterProps {
  value: Platform | 'all';
  onChange: (value: Platform | 'all') => void;
}

const platforms: { value: Platform | 'all'; label: string }[] = [
  { value: 'all', label: 'All Platforms' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'twitter', label: 'Twitter' },
];

export default function PlatformFilter({ value, onChange }: PlatformFilterProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="broke-dash-platform-filter"
    >
      {platforms.map((platform) => {
        const isSelected = value === platform.value;
        const color = platform.value === 'all' ? colors.accent : getPlatformColor(platform.value as Platform);

        return (
          <button
            key={platform.value}
            onClick={() => onChange(platform.value)}
            className={`broke-dash-platform-btn ${isSelected ? 'active' : ''}`}
            style={
              isSelected
                ? {
                    backgroundColor: `${color}20`,
                    color: color,
                    borderColor: `${color}40`,
                  }
                : undefined
            }
          >
            {platform.label}
          </button>
        );
      })}
    </motion.div>
  );
}
