'use client';

import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useCreator } from '@/hooks/influencer/useCreator';
import StatCard from '@/components/influencer/StatCard';
import GenreBadge from '@/components/influencer/GenreBadge';
import BudgetBadge from '@/components/influencer/BudgetBadge';
import PlatformBadge from '@/components/influencer/PlatformBadge';

function formatNumber(n: unknown): string {
  const num = Number(n ?? 0) || 0;
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toLocaleString();
}

function getSafeFrom(value: string | null, fallback: string): string {
  if (!value || !value.startsWith('/influencers')) return fallback;
  return value;
}

export default function CreatorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const username = params.username as string;
  const backHref = getSafeFrom(searchParams.get('from'), '/influencers/creators');
  const backLabel = backHref.startsWith('/influencers/campaign/') ? 'Back to Campaign' : backHref.startsWith('/influencers') && !backHref.startsWith('/influencers/creators') ? 'Back to Campaigns' : 'Back to Creators';
  const currentPath = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const { data, isLoading, error } = useCreator(username);

  if (isLoading) {
    return (
      <div className="inf-dash-content">
        <div className="inf-dash-loading">
          <div className="inf-dash-spinner" />
        </div>
      </div>
    );
  }

  if (error || !data?.creator) {
    return (
      <div className="inf-dash-content">
        <div className="inf-dash-error">Creator not found</div>
      </div>
    );
  }

  const { creator, campaigns, platformBreakdown } = data;

  return (
    <>
      <div className="inf-dash-header">
        <div className="inf-dash-header-inner">
          <h1>@{creator.username}</h1>
        </div>
      </div>

      <div className="inf-dash-content">
        <Link href={backHref} className="inf-dash-back">
          &larr; {backLabel}
        </Link>

        {/* Header */}
        <div className="inf-dash-detail-header">
          <div>
            <h2 className="inf-dash-detail-title">@{creator.username}</h2>
            <div className="inf-dash-detail-meta">
              {creator.is_new_creator && (
                <span
                  className="inf-dash-badge"
                  style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22C55E', border: '1px solid rgba(34, 197, 94, 0.35)' }}
                >
                  NEW
                </span>
              )}
              {(creator.platforms || []).filter((p: string) => p).map((p: string) => (
                <PlatformBadge key={p} platform={p} />
              ))}
              <span style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                {(creator.top_genres && creator.top_genres.length > 0
                  ? creator.top_genres.slice(0, 2)
                  : [{ genre: 'Unclassified', confidence: 0 }]
                ).map((label: { genre: string; confidence: number }) => (
                  <GenreBadge
                    key={`${creator.username}:${label.genre}`}
                    genre={label.genre}
                    confidence={label.confidence}
                  />
                ))}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--inf-muted)' }}>
                {Number(creator.campaign_count || 0)} campaign{Number(creator.campaign_count) !== 1 ? 's' : ''}
              </span>
              {(creator.agencies || []).map((agency: { key: string; name: string }) => (
                <span
                  key={`${creator.username}:agency:${agency.key}`}
                  className="inf-dash-badge"
                  style={{
                    background: 'rgba(148, 163, 184, 0.16)',
                    color: 'var(--inf-foreground)',
                    border: '1px solid rgba(148, 163, 184, 0.35)',
                    padding: '0.14rem 0.5rem',
                    fontSize: '0.62rem',
                  }}
                >
                  {agency.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="inf-dash-grid-4" style={{ marginBottom: '1.5rem' }}>
          <StatCard
            label="Total Views"
            value={formatNumber(Number(creator.total_views || 0))}
          />
          <StatCard
            label="Campaigns"
            value={Number(creator.campaign_count || 0).toLocaleString()}
          />
          <StatCard
            label="Avg Views"
            value={formatNumber(Number(creator.avg_views || 0))}
          />
          <StatCard
            label="Success Rate"
            value={`${Number(creator.success_rate || 0).toFixed(0)}%`}
          />
          <StatCard
            label="Genre Flexibility"
            value={`${Math.round(Number(creator.genre_diversity_score || 0) * 100)}%`}
          />
          <StatCard
            label="Creator Cost"
            value={creator.cost_total_usd == null ? '-' : `$${Number(creator.cost_total_usd).toLocaleString()}`}
            subtitle={
              creator.cost_source === 'api'
                ? 'Source: API'
                : creator.cost_source === 'rate_override'
                  ? 'Source: Rate Override'
                  : creator.cost_source === 'mixed'
                    ? 'Source: Mixed'
                    : 'Source: N/A'
            }
          />
        </div>

        {/* Platform Breakdown */}
        {platformBreakdown && platformBreakdown.length > 0 && (
          <>
            <h3 className="inf-dash-section-title">Platform Breakdown</h3>
            <div className="inf-dash-grid-3" style={{ marginBottom: '1.5rem' }}>
              {platformBreakdown.map((pb: Record<string, unknown>) => (
                <div key={String(pb.platform)} className="inf-dash-card inf-dash-stat-card">
                  <PlatformBadge platform={String(pb.platform)} />
                  <div className="inf-dash-stat-value inf-dash-glow" style={{ marginTop: '0.75rem' }}>
                    {formatNumber(Number(pb.total_views || 0))}
                  </div>
                  <div className="inf-dash-stat-label">views across {Number(pb.post_count || 0)} posts</div>
                  <div className="inf-dash-stat-subtitle">
                    Avg: {formatNumber(Number(pb.avg_views || 0))} per post
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Campaign History */}
        {campaigns && campaigns.length > 0 && (
          <>
            <h3 className="inf-dash-section-title">Campaign History ({campaigns.length})</h3>
            <div className="inf-dash-card">
              <div className="inf-dash-table-wrapper">
                <table className="inf-dash-table">
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th>Genre</th>
                      <th>Budget</th>
                      <th>Posts</th>
                      <th>Views</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c: Record<string, unknown>, i: number) => (
                      <tr
                        key={String(c.slug || i)}
                        className="clickable"
                        onClick={() => router.push(`/influencers/campaign/${c.slug}?from=${encodeURIComponent(currentPath)}`)}
                      >
                        <td style={{ fontWeight: 500, color: 'var(--inf-foreground)' }}>
                          {String(c.title || '')}
                        </td>
                        <td><GenreBadge genre={String(c.genre || 'Unclassified')} /></td>
                        <td><BudgetBadge amount={Number(c.budget || 0)} /></td>
                        <td>{Number(c.post_count || 0).toLocaleString()}</td>
                        <td>{formatNumber(Number(c.total_views || 0))}</td>
                        <td style={{ color: 'var(--inf-muted)', fontSize: '0.8rem' }}>
                          {c.created_at ? new Date(String(c.created_at)).toLocaleDateString() : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
