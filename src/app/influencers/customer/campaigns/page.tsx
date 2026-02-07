'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCreators } from '@/hooks/influencer/useCreators';
import GenreBadge from '@/components/influencer/GenreBadge';
import PlatformBadge from '@/components/influencer/PlatformBadge';

interface SessionResponse {
  authenticated: boolean;
  session: {
    role: 'viewer' | 'analyst' | 'admin' | 'customer';
  } | null;
}

interface BriefState {
  budget: string;
  genre: string;
  objective: string;
  platforms: string;
  song: string;
}

const DEFAULT_BRIEF: BriefState = {
  song: '',
  genre: '',
  budget: '',
  objective: 'maximize_views',
  platforms: 'TikTok',
};

function formatNumber(value: unknown): string {
  const n = Number(value ?? 0) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function CustomerCampaignBuilderPage() {
  const [brief, setBrief] = useState<BriefState>(DEFAULT_BRIEF);
  const [appliedBrief, setAppliedBrief] = useState<BriefState | null>(null);
  const [selectedCreators, setSelectedCreators] = useState<string[]>([]);

  const { data: sessionData, isLoading: isSessionLoading } = useQuery({
    queryKey: ['influencer-auth-session'],
    queryFn: async (): Promise<SessionResponse> => {
      const res = await fetch('/api/influencers/auth');
      if (!res.ok) throw new Error('Failed to fetch session');
      return res.json() as Promise<SessionResponse>;
    },
    staleTime: 60_000,
  });

  const role = sessionData?.session?.role;
  const roleAllowed = role === 'customer' || role === 'admin';
  const activeGenreFilter = (appliedBrief?.genre || '').trim();
  const { data, isLoading, error } = useCreators({
    genre: activeGenreFilter || undefined,
    sort: 'genre_fit_desc',
    limit: 100,
    min_genre_fit: activeGenreFilter ? 0.2 : undefined,
  });

  const creators = useMemo(
    () => (Array.isArray(data?.creators) ? data.creators : []),
    [data]
  );

  const toggleCreator = (username: string) => {
    setSelectedCreators((prev) => (
      prev.includes(username)
        ? prev.filter((id) => id !== username)
        : [...prev, username]
    ));
  };

  const applyBrief = () => {
    setAppliedBrief(brief);
    setSelectedCreators([]);
  };

  return (
    <>
      <div className="inf-dash-header">
        <div className="inf-dash-header-inner">
          <h1>Customer Campaign Builder</h1>
        </div>
      </div>

      <div className="inf-dash-content">
        {isSessionLoading ? (
          <div className="inf-dash-loading">
            <div className="inf-dash-spinner" />
          </div>
        ) : !roleAllowed ? (
          <div className="inf-dash-error">Customer workflow is available to customer/admin roles only.</div>
        ) : (
          <>
            <div className="inf-dash-card" style={{ marginBottom: '1rem', padding: '1rem' }}>
              <h3 className="inf-dash-section-title" style={{ marginBottom: '0.75rem' }}>Campaign Brief</h3>
              <div className="inf-dash-grid-4">
                <input
                  type="text"
                  placeholder="Song name or artist"
                  value={brief.song}
                  onChange={(event) => setBrief((prev) => ({ ...prev, song: event.target.value }))}
                  className="inf-dash-input"
                />
                <input
                  type="text"
                  placeholder="Genre (e.g. Underground Rap)"
                  value={brief.genre}
                  onChange={(event) => setBrief((prev) => ({ ...prev, genre: event.target.value }))}
                  className="inf-dash-input"
                />
                <input
                  type="number"
                  min={0}
                  placeholder="Budget (USD)"
                  value={brief.budget}
                  onChange={(event) => setBrief((prev) => ({ ...prev, budget: event.target.value }))}
                  className="inf-dash-input"
                />
                <input
                  type="text"
                  placeholder="Platforms (comma-separated)"
                  value={brief.platforms}
                  onChange={(event) => setBrief((prev) => ({ ...prev, platforms: event.target.value }))}
                  className="inf-dash-input"
                />
              </div>
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <select
                  value={brief.objective}
                  onChange={(event) => setBrief((prev) => ({ ...prev, objective: event.target.value }))}
                  className="inf-dash-input"
                  style={{ maxWidth: '240px' }}
                >
                  <option value="maximize_views">Maximize Views</option>
                  <option value="engagement">Increase Engagement</option>
                  <option value="cost_efficiency">Cost Efficiency</option>
                </select>
                <button
                  type="button"
                  onClick={applyBrief}
                  style={{
                    border: '1px solid rgba(196, 163, 90, 0.4)',
                    background: 'rgba(196, 163, 90, 0.12)',
                    color: 'var(--inf-accent)',
                    borderRadius: '0.6rem',
                    padding: '0.5rem 0.85rem',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                  }}
                >
                  Generate Manual Shortlist
                </button>
              </div>
              <p style={{ color: 'var(--inf-muted)', fontSize: '0.78rem', marginTop: '0.65rem' }}>
                Recommendations/swipes remain frozen. This view supports manual genre-based shortlisting only.
              </p>
            </div>

            {appliedBrief && (
              <div className="inf-dash-card" style={{ marginBottom: '1rem', padding: '0.85rem 1rem' }}>
                <strong style={{ color: 'var(--inf-foreground)' }}>Active Brief:</strong>{' '}
                <span style={{ color: 'var(--inf-muted)' }}>
                  {appliedBrief.song || 'Untitled'} | {appliedBrief.genre || 'Unclassified'} | ${Number(appliedBrief.budget || 0).toLocaleString()} | {appliedBrief.platforms}
                </span>
              </div>
            )}

            <div className="inf-dash-card">
              {isLoading ? (
                <div className="inf-dash-loading">
                  <div className="inf-dash-spinner" />
                </div>
              ) : error ? (
                <div className="inf-dash-error">Failed to load creators</div>
              ) : (
                <div className="inf-dash-table-wrapper">
                  <table className="inf-dash-table">
                    <thead>
                      <tr>
                        <th>Select</th>
                        <th>Creator</th>
                        <th>Top Genres</th>
                        <th>Platforms</th>
                        <th>Total Views</th>
                        <th>Genre Fit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {creators.map((creator: Record<string, unknown>) => {
                        const username = String(creator.username || '');
                        const topGenres = Array.isArray(creator.top_genres)
                          ? creator.top_genres.slice(0, 2)
                          : [];
                        const platforms = Array.isArray(creator.platforms) ? creator.platforms : [];
                        const selected = selectedCreators.includes(username);

                        return (
                          <tr key={username}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleCreator(username)}
                              />
                            </td>
                            <td style={{ color: 'var(--inf-foreground)', fontWeight: 500 }}>@{username}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                {topGenres.length > 0 ? topGenres.map((label) => {
                                  const row = label as Record<string, unknown>;
                                  const genre = String(row.genre || 'Unclassified');
                                  const confidence = Number(row.confidence || 0);
                                  return (
                                    <GenreBadge
                                      key={`${username}:${genre}`}
                                      genre={genre}
                                      confidence={confidence}
                                    />
                                  );
                                }) : <GenreBadge genre="Unclassified" confidence={0} />}
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                {platforms.length > 0 ? platforms.map((platform) => (
                                  <PlatformBadge key={`${username}:${String(platform)}`} platform={String(platform)} />
                                )) : '-'}
                              </div>
                            </td>
                            <td>{formatNumber(creator.total_views)}</td>
                            <td>{Math.round((Number(creator.genre_fit_score || 0) || 0) * 100)}%</td>
                          </tr>
                        );
                      })}
                      {creators.length === 0 && (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', color: 'var(--inf-muted)', padding: '2.5rem 1rem' }}>
                            No creators found for the selected brief filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="inf-dash-card" style={{ marginTop: '1rem', padding: '0.85rem 1rem' }}>
              <strong style={{ color: 'var(--inf-foreground)' }}>Shortlist:</strong>{' '}
              <span style={{ color: 'var(--inf-muted)' }}>
                {selectedCreators.length === 0 ? 'No creators selected yet.' : `${selectedCreators.length} creators selected`}
              </span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
