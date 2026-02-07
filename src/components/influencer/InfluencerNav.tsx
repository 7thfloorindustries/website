'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { path: '/influencers', label: 'Campaigns', icon: '📋' },
  { path: '/influencers/creators', label: 'Creators', icon: '👤' },
  { path: '/influencers/customer/campaigns', label: 'Customer', icon: '🎯' },
];

export default function InfluencerNav() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === '/influencers') {
      return pathname === '/influencers';
    }
    return pathname.startsWith(path);
  };

  return (
    <aside className="inf-dash-sidebar">
      <div className="inf-dash-sidebar-brand">
        <h2>7TH FLOOR</h2>
        <p>Influencer Data</p>
      </div>

      <nav className="inf-dash-sidebar-nav">
        {navItems.map((item) => (
          <Link
            key={item.path}
            href={item.path}
            className={isActive(item.path) ? 'active' : ''}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="inf-dash-sidebar-footer">
        7th Floor Digital
      </div>
    </aside>
  );
}
