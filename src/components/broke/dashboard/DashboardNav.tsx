'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCursorMode } from './CursorContext';

const navItems = [
  { path: '/broke/dashboard', label: 'Overview', icon: '📊' },
  { path: '/broke/dashboard/leaderboard', label: 'Leaderboard', icon: '🏆' },
  { path: '/broke/dashboard/compare', label: 'Compare', icon: '⚖️' },
];

export default function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { mode, toggleMode } = useCursorMode();
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/dashboard-auth', { method: 'DELETE' });
      router.push('/broke/dashboard/auth');
    } catch {
      setLoggingOut(false);
    }
  };

  const isActive = (path: string) => {
    if (path === '/broke/dashboard') {
      return pathname === '/broke/dashboard';
    }
    return pathname.startsWith(path);
  };

  return (
    <>
      {/* Mobile hamburger toggle */}
      <button
        className="broke-dash-mobile-toggle"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
      >
        {mobileOpen ? '\u2715' : '\u2630'}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="broke-dash-mobile-overlay"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`broke-dashboard-sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="broke-dashboard-sidebar-brand">
          <h2>BROKE</h2>
          <p>Social Metrics</p>
        </div>

        <nav className="broke-dashboard-sidebar-nav" aria-label="Dashboard navigation">
          {navItems.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={isActive(item.path) ? 'active' : ''}
              onClick={() => setMobileOpen(false)}
              aria-label={item.label}
              aria-current={isActive(item.path) ? 'page' : undefined}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Logout */}
        <div className="broke-dashboard-sidebar-logout">
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="broke-dash-logout-btn"
          >
            <span>{loggingOut ? '...' : 'Logout'}</span>
          </button>
        </div>

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
          Dashboard poll: every 5 min
          <br />
          Scrape cadence: every 24h
        </div>
      </aside>
    </>
  );
}
