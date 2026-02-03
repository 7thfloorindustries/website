// BROKE Dashboard color palette
// Uses BROKE yellow (#ffd600) as primary accent instead of gold

export const colors = {
  background: '#0A0A0A',
  foreground: '#FFFFFF',
  accent: '#ffd600',  // BROKE yellow (was gold #C4A35A)
  accentLight: '#ffe233',
  accentGlow: 'rgba(255, 214, 0, 0.3)',
  muted: 'rgba(255, 255, 255, 0.4)',
  cardBgStart: '#111111',
  cardBgEnd: '#0D0D0D',
  borderSubtle: 'rgba(255, 255, 255, 0.08)',

  platform: {
    tiktok: '#00f2ea',
    instagram: '#E1306C',
    twitter: '#1DA1F2',
  },

  growth: {
    positive: '#22C55E',
    negative: '#EF4444',
  },
};

export const chartGradients = {
  accent: {
    start: 'rgba(255, 214, 0, 0.4)',
    end: 'rgba(255, 214, 0, 0)',
  },
  tiktok: {
    start: 'rgba(0, 242, 234, 0.4)',
    end: 'rgba(0, 242, 234, 0)',
  },
  instagram: {
    start: 'rgba(225, 48, 108, 0.4)',
    end: 'rgba(225, 48, 108, 0)',
  },
  twitter: {
    start: 'rgba(29, 161, 242, 0.4)',
    end: 'rgba(29, 161, 242, 0)',
  },
};

export function getPlatformColor(platform: 'tiktok' | 'instagram' | 'twitter'): string {
  return colors.platform[platform];
}
