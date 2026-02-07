'use client';

import '@/styles/influencer-dashboard.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import InfluencerNav from '@/components/influencer/InfluencerNav';
import InfluencerPasswordGate from '@/components/influencer/InfluencerPasswordGate';

export default function InfluencerLayout({
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
      <InfluencerPasswordGate>
        <div className="inf-dash">
          <InfluencerNav />
          <main className="inf-dash-main">
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
              background: 'radial-gradient(ellipse at 50% 0%, rgba(196, 163, 90, 0.08) 0%, transparent 60%)',
            }}
          />
        </div>
      </InfluencerPasswordGate>
    </QueryClientProvider>
  );
}
