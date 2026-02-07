'use client';

import { useRouter } from 'next/navigation';
import GenreBadge from './GenreBadge';
import BudgetBadge from './BudgetBadge';

function formatNumber(n: unknown): string {
  const num = Number(n ?? 0) || 0;
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toLocaleString();
}

interface Campaign {
  slug: string;
  title: string;
  total_views: string | number;
  verified_views?: string | number;
  budget: string | number | null;
  genre: string | null;
  genre_confidence?: number | string | null;
  genres?: Array<{ genre: string; weight: number; confidence: number }>;
  actual_creators: string | number;
  created_at: string | null;
  is_new_campaign?: boolean;
  is_pending_intake?: boolean;
  needs_review_campaign?: boolean;
}

interface CampaignTableProps {
  campaigns: Campaign[];
  sortBy: string;
  sortDir: 'asc' | 'desc';
  onSort: (column: string) => void;
  buildCampaignHref?: (slug: string) => string;
}

const COLUMNS = [
  { key: 'title', label: 'Title' },
  { key: 'total_views', label: 'Views' },
  { key: 'budget', label: 'Budget' },
  { key: 'genre', label: 'Genre' },
  { key: 'actual_creators', label: 'Creators' },
  { key: 'created_at', label: 'Date' },
];

export default function CampaignTable({ campaigns, sortBy, sortDir, onSort, buildCampaignHref }: CampaignTableProps) {
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
          {campaigns.map((campaign) => (
            <tr
              key={campaign.slug}
              className="clickable"
              onClick={() => router.push(buildCampaignHref ? buildCampaignHref(campaign.slug) : `/influencers/campaign/${campaign.slug}`)}
            >
              <td style={{ fontWeight: 500, color: 'var(--inf-foreground)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>{campaign.title}</span>
                  {campaign.is_pending_intake && (
                    <span
                      className="inf-dash-badge"
                      style={{
                        background: 'rgba(245, 158, 11, 0.15)',
                        color: '#F59E0B',
                        border: '1px solid rgba(245, 158, 11, 0.35)',
                        padding: '0.15rem 0.5rem',
                        fontSize: '0.6rem',
                      }}
                    >
                      PENDING
                    </span>
                  )}
                  {campaign.needs_review_campaign && !campaign.is_pending_intake && (
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
                  {campaign.is_new_campaign && (
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
              <td>{formatNumber(Number((campaign.verified_views ?? campaign.total_views) || 0))}</td>
              <td><BudgetBadge amount={Number(campaign.budget || 0)} /></td>
              <td>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                    {(Array.isArray(campaign.genres) && campaign.genres.length > 0
                      ? campaign.genres.slice(0, 2)
                      : [
                          {
                            genre: campaign.genre || 'Unclassified',
                            weight: 1,
                            confidence: Number(campaign.genre_confidence || 0),
                          },
                        ]
                    ).map((genreLabel) => (
                      <GenreBadge
                        key={`${campaign.slug}:${genreLabel.genre}`}
                        genre={genreLabel.genre}
                        confidence={genreLabel.confidence}
                      />
                    ))}
                  </div>
                </div>
              </td>
              <td>{Number(campaign.actual_creators || 0).toLocaleString()}</td>
              <td style={{ color: 'var(--inf-muted)', fontSize: '0.8rem' }}>
                {campaign.created_at ? new Date(campaign.created_at).toLocaleDateString() : '-'}
              </td>
            </tr>
          ))}
          {campaigns.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', color: 'var(--inf-muted)', padding: '3rem 1rem' }}>
                No campaigns found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
