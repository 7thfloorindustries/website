/**
 * Share Layout - Public pages for clients
 * Minimal layout without main site navigation
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Campaign Report | 7th Floor Digital',
  description: 'Live campaign analytics and performance metrics',
};

export default function ShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dashboard-layout">
      {children}
    </div>
  );
}
