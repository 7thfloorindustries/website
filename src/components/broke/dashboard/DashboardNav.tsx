'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCursorMode } from './CursorContext';

const navItems = [
  { path: '/broke/dashboard', label: 'Overview', icon: '📊' },
  { path: '/broke/dashboard/leaderboard', label: 'Leaderboard', icon: '🏆' },
  { path: '/broke/dashboard/compare', label: 'Compare', icon: '⚖️' },
];

export default function DashboardNav() {
  const pathname = usePathname();
  const { mode, toggleMode } = useCursorMode();

  const isActive = (path: string) => {
    if (path === '/broke/dashboard') {
      return pathname === '/broke/dashboard';
    }
    return pathname.startsWith(path);
  };

  return (
    <aside className="broke-dashboard-sidebar">
      <div className="broke-dashboard-sidebar-brand">
        <h2>BROKE</h2>
        <p>Social Metrics</p>
      </div>

      <nav className="broke-dashboard-sidebar-nav">
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

      {/* Money Mode Toggle */}
      <div className="broke-dashboard-sidebar-toggle">
        <button
          onClick={toggleMode}
          className={`broke-dash-money-toggle ${mode === 'money' ? 'active' : ''}`}
          title={mode === 'money' ? 'Switch to Logo cursor' : 'Enable Money Mode'}
        >
          <span className="toggle-icon">{mode === 'money' ? '💸' : '🪙'}</span>
          <span className="toggle-label">Money Mode</span>
          <span className={`toggle-switch ${mode === 'money' ? 'on' : ''}`}>
            <span className="toggle-knob" />
          </span>
        </button>
      </div>

      <div className="broke-dashboard-sidebar-footer">
        Auto-refresh: 5 min
      </div>
    </aside>
  );
}
