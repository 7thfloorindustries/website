'use client';

import { useRouter } from 'next/navigation';
import PlatformBadge from './PlatformBadge';
import GenreBadge from './GenreBadge';

function formatNumber(n: unknown): string {
  const num = Number(n ?? 0) || 0;
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toLocaleString();
}

interface Creator {
  agencies?: Array<{ key: string; name: string }>;
  username: string;
  campaign_count: string | number;
  cost_source?: 'api' | 'rate_override' | 'mixed' | 'none';
  cost_total_usd?: string | number | null;
  total_posts: string | number;
  total_views: string | number | null;
  avg_views: string | number | null;
  success_rate: string | number;
  platforms: string[] | null;
  top_genres?: Array<{ genre: string; weight: number; confidence: number }>;
  genre_diversity_score?: string | number | null;
  genre_fit_score?: string | number | null;
  is_new_creator?: boolean;
  needs_review_creator?: boolean;
}

interface CreatorTableProps {
  creators: Creator[];
  sortBy: string;
  sortDir: 'asc' | 'desc';
  onSort: (column: string) => void;
  buildCreatorHref?: (username: string) => string;
}

const COLUMNS = [
  { key: 'username', label: 'Username' },
  { key: 'agencies', label: 'Agencies' },
  { key: 'campaign_count', label: 'Campaigns' },
  { key: 'total_posts', label: 'Posts' },
  { key: 'total_views', label: 'Total Views' },
  { key: 'avg_views', label: 'Avg Views' },
  { key: 'cost_total_usd', label: 'Cost' },
  { key: 'success_rate', label: 'Success Rate' },
  { key: 'top_genres', label: 'Top Genres' },
  { key: 'genre_diversity_score', label: 'Flex' },
  { key: 'platforms', label: 'Platforms' },
];

export default function CreatorTable({ creators, sortBy, sortDir, onSort, buildCreatorHref }: CreatorTableProps) {
  const router = useRouter();

  return (
    <div className="inf-dash-table-wrapper">
      <table className="inf-dash-table">
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className={`sortable ${sortBy === col.key ? 'sorted' : ''}`}
                onClick={() => onSort(col.key)}
              >
                {col.label}
                {sortBy === col.key && (
                  <span style={{ marginLeft: '0.25rem' }}>
                    {sortDir === 'asc' ? '\u2191' : '\u2193'}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {creators.map((creator) => (
            <tr
              key={creator.username}
              className="clickable"
              onClick={() => router.push(buildCreatorHref ? buildCreatorHref(creator.username) : `/influencers/creator/${creator.username}`)}
            >
              <td style={{ fontWeight: 500, color: 'var(--inf-foreground)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>@{creator.username}</span>
                  {creator.needs_review_creator && (
                    <span
                      className="inf-dash-badge"
                      style={{
                        background: 'rgba(59, 130, 246, 0.15)',
                        color: '#3B82F6',
                        border: '1px solid rgba(59, 130, 246, 0.35)',
                        padding: '0.15rem 0.5rem',
                        fontSize: '0.6rem',
                      }}
                    >
                      REVIEW
                    </span>
                  )}
                  {creator.is_new_creator && (
                    <span
                      className="inf-dash-badge"
                      style={{
                        background: 'rgba(34, 197, 94, 0.15)',
                        color: '#22C55E',
                        border: '1px solid rgba(34, 197, 94, 0.35)',
                        padding: '0.15rem 0.5rem',
                        fontSize: '0.6rem',
                      }}
                    >
                      NEW
                    </span>
                  )}
                </div>
              </td>
              <td>
                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                  {(creator.agencies || []).map((agency) => (
                    <span
                      key={`${creator.username}:agency:${agency.key}`}
                      className="inf-dash-badge"
                      style={{
                        background: 'rgba(148, 163, 184, 0.16)',
                        color: 'var(--inf-foreground)',
                        border: '1px solid rgba(148, 163, 184, 0.35)',
                        fontSize: '0.62rem',
                        padding: '0.14rem 0.45rem',
                      }}
                    >
                      {agency.name}
                    </span>
                  ))}
                  {(creator.agencies || []).length === 0 && (
                    <span style={{ color: 'var(--inf-muted)', fontSize: '0.74rem' }}>-</span>
                  )}
                </div>
              </td>
              <td>{Number(creator.campaign_count || 0).toLocaleString()}</td>
              <td>{Number(creator.total_posts || 0).toLocaleString()}</td>
              <td>{formatNumber(Number(creator.total_views || 0))}</td>
              <td>{formatNumber(Number(creator.avg_views || 0))}</td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {creator.cost_total_usd == null ? '-' : `$${Number(creator.cost_total_usd).toLocaleString()}`}
                  </span>
                  <span
                    className="inf-dash-badge"
                    style={{
                      background: 'rgba(148, 163, 184, 0.14)',
                      color: 'var(--inf-muted)',
                      border: '1px solid rgba(148, 163, 184, 0.28)',
                      padding: '0.1rem 0.36rem',
                      fontSize: '0.58rem',
                      textTransform: 'uppercase',
                    }}
                  >
                    {creator.cost_source === 'api'
                      ? 'API'
                      : creator.cost_source === 'rate_override'
                        ? 'Override'
                        : creator.cost_source === 'mixed'
                          ? 'Mixed'
                          : 'N/A'}
                  </span>
                </div>
              </td>
              <td>{Number(creator.success_rate || 0).toFixed(0)}%</td>
              <td>
                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                  {(creator.top_genres && creator.top_genres.length > 0
                    ? creator.top_genres.slice(0, 2)
                    : [{ genre: 'Unclassified', weight: 1, confidence: 0 }]
                  ).map((genreLabel) => (
                    <GenreBadge
                      key={`${creator.username}:${genreLabel.genre}`}
                      genre={genreLabel.genre}
                      confidence={genreLabel.confidence}
                    />
                  ))}
                </div>
              </td>
              <td>
                {Math.round(Number(creator.genre_diversity_score || 0) * 100)}%
              </td>
              <td>
                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                  {(creator.platforms || []).map((p) => (
                    <PlatformBadge key={p} platform={p} />
                  ))}
                </div>
              </td>
            </tr>
          ))}
          {creators.length === 0 && (
            <tr>
              <td colSpan={11} style={{ textAlign: 'center', color: 'var(--inf-muted)', padding: '3rem 1rem' }}>
                No creators found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
