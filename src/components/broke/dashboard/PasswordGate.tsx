'use client';

import { useState, useEffect, type FormEvent } from 'react';
import BrokeLoading from '@/components/broke/BrokeLoading';

const STORAGE_KEY = 'broke-dashboard-access';

interface PasswordGateProps {
  children: React.ReactNode;
}

export default function PasswordGate({ children }: PasswordGateProps) {
  const [hasAccess, setHasAccess] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user already has access
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored === 'granted') {
      setHasAccess(true);
    }
    setLoading(false);
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');

    // Check against environment variable
    // For client-side, we'll use a simple hash comparison
    // The actual password check happens via API for security
    fetch('/api/dashboard-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          sessionStorage.setItem(STORAGE_KEY, 'granted');
          setHasAccess(true);
        } else {
          setError('Incorrect password');
        }
      })
      .catch(() => {
        setError('Authentication failed');
      });
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
            autoFocus
          />
          <button type="submit">Enter</button>
        </form>
        {error && <div className="broke-dash-gate-error">{error}</div>}
      </div>
    </div>
  );
}
