'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import BrokeLoading from '@/components/broke/BrokeLoading';

interface PasswordGateProps {
  children: React.ReactNode;
}

export default function PasswordGate({ children }: PasswordGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [hasAccess, setHasAccess] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [csrfToken, setCsrfToken] = useState('');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const checkAccess = async () => {
      try {
        const response = await fetch('/api/dashboard-auth', {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          if (active) {
            setHasAccess(false);
          }
          return;
        }

        const data = await response.json() as { authenticated?: boolean; csrfToken?: string };
        if (active) {
          setHasAccess(Boolean(data.authenticated));
          if (data.csrfToken) {
            setCsrfToken(data.csrfToken);
          }
        }
      } catch {
        if (active) {
          setHasAccess(false);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void checkAccess();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!hasAccess || pathname !== '/broke/dashboard/auth') {
      return;
    }

    const nextPath = searchParams.get('next');
    const destination = nextPath && nextPath.startsWith('/broke/dashboard')
      ? nextPath
      : '/broke/dashboard';

    router.replace(destination);
  }, [hasAccess, pathname, router, searchParams]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/dashboard-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, csrfToken }),
      });

      const data = await response.json() as { success?: boolean; error?: string };

      if (response.ok && data.success) {
        setPassword('');
        setHasAccess(true);
        return;
      }

      setError(data.error || 'Incorrect password');
    } catch {
      setError('Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="broke-dash-gate">
        <BrokeLoading size="lg" />
      </div>
    );
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  return (
    <div className="broke-dash-gate">
      <div className="broke-dash-gate-box">
        <h2>Dashboard Access</h2>
        <p>Enter password to continue</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            disabled={isSubmitting}
            autoFocus
          />
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Checking...' : 'Enter'}
          </button>
        </form>
        {error && <div className="broke-dash-gate-error">{error}</div>}
      </div>
    </div>
  );
}
