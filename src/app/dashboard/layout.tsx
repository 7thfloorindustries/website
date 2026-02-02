/**
 * Dashboard Layout - Internal campaign management
 * Has navigation back to main site
 */

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Campaign Dashboard | 7th Floor Digital',
  description: 'Internal campaign management and analytics',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dashboard-layout">
      {/* Dashboard navigation bar */}
      <nav className="dashboard-topnav">
        <Link href="/" className="dashboard-topnav-brand">
          7TH FLOOR DIGITAL
        </Link>
        <div className="dashboard-topnav-links">
          <Link href="/" className="dashboard-topnav-link">
            ← Back to Site
          </Link>
        </div>
      </nav>
      {children}
    </div>
  );
}
