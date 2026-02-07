'use client';

import { useState, useEffect, type FormEvent } from 'react';

interface InfluencerPasswordGateProps {
  children: React.ReactNode;
}

interface OrgChoice {
  id: string;
  name: string;
  role: string;
}

export default function InfluencerPasswordGate({ children }: InfluencerPasswordGateProps) {
  const [hasAccess, setHasAccess] = useState(false);
  const [email, setEmail] = useState('');
  const [orgId, setOrgId] = useState('');
  const [organizations, setOrganizations] = useState<OrgChoice[]>([]);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
      try {
        const res = await fetch('/api/influencers/auth', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setHasAccess(false);
          return;
        }

        const data = await res.json();
        if (!cancelled) {
          setHasAccess(Boolean(data.authenticated));
        }
      } catch {
        if (!cancelled) setHasAccess(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    checkSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');

    fetch('/api/influencers/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim() || undefined,
        orgId: orgId || undefined,
        password,
      }),
    })
      .then(async (res) => ({ ok: res.ok, data: await res.json() }))
      .then((data) => {
        if (data.ok && data.data.success) {
          setHasAccess(true);
          setPassword('');
          setError('');
          setOrganizations([]);
        } else {
          if (data.data?.requiresOrgSelection && Array.isArray(data.data.organizations)) {
            setOrganizations(data.data.organizations);
            if (!orgId && data.data.organizations.length > 0) {
              setOrgId(data.data.organizations[0].id);
            }
            setError('Choose an organization to continue');
            return;
          }
          setError(data.data?.error || 'Authentication failed');
        }
      })
      .catch(() => {
        setError('Authentication failed');
      });
  };

  if (loading) {
    return (
      <div className="inf-dash-gate">
        <div className="inf-dash-spinner" />
      </div>
    );
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  return (
    <div className="inf-dash-gate">
      <div className="inf-dash-gate-box">
        <h2>Influencer Data</h2>
        <p>Sign in to continue</p>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            autoCapitalize="none"
            autoComplete="username"
          />
          {organizations.length > 0 && (
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.role})
                </option>
              ))}
            </select>
          )}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            autoFocus
          />
          <button type="submit">Enter</button>
        </form>
        {error && <div className="inf-dash-gate-error">{error}</div>}
      </div>
    </div>
  );
}
