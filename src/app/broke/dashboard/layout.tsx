'use client';

import '@/styles/broke-dashboard.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import DashboardNav from '@/components/broke/dashboard/DashboardNav';
import PasswordGate from '@/components/broke/dashboard/PasswordGate';
import { CursorProvider } from '@/components/broke/dashboard/CursorContext';
import DashboardCursor from '@/components/broke/dashboard/DashboardCursor';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <CursorProvider>
        <PasswordGate>
          <a href="#main-content" className="skip-link">Skip to content</a>
          <div className="broke-dashboard">
            <DashboardNav />
            <main className="broke-dashboard-main" id="main-content">
              {children}
            </main>

            {/* Atmospheric gradient */}
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                height: '60vh',
                pointerEvents: 'none',
                zIndex: 0,
                background: 'radial-gradient(ellipse at 50% 0%, rgba(255, 214, 0, 0.08) 0%, transparent 60%)',
              }}
            />
          </div>
          <DashboardCursor />
        </PasswordGate>
      </CursorProvider>
    </QueryClientProvider>
  );
}
