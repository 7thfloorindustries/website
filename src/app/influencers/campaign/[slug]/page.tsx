'use client';

import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useCampaign } from '@/hooks/influencer/useCampaign';
import StatCard from '@/components/influencer/StatCard';
import PostTable from '@/components/influencer/PostTable';
import GenreBadge from '@/components/influencer/GenreBadge';
import BudgetBadge from '@/components/influencer/BudgetBadge';
import PlatformBadge from '@/components/influencer/PlatformBadge';
import Pagination from '@/components/influencer/Pagination';
import { isRecommendationFeatureEnabledClient } from '@/lib/influencer/flags';

function formatNumber(n: unknown): string {
  const num = Number(n ?? 0) || 0;
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toLocaleString();
}

const DEFAULT_POSTS_PAGE = 1;
const DEFAULT_POST_SORT = 'views';
const DEFAULT_SORT_DIR: 'asc' | 'desc' = 'desc';
const VALID_POST_SORT_COLUMNS = new Set(['username', 'platform', 'views', 'post_date', 'post_status', 'post_url']);

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function normalizePostSort(value: string | null): string {
  if (!value || !VALID_POST_SORT_COLUMNS.has(value)) return DEFAULT_POST_SORT;
  return value;
}

function getSortDir(value: string | null): 'asc' | 'desc' {
  return value === 'asc' ? 'asc' : 'desc';
}

function getSafeFrom(value: string | null, fallback: string): string {
  if (!value || !value.startsWith('/influencers')) return fallback;
  return value;
}

interface CampaignGenreChip {
  confidence: number;
  genre: string;
  weight: number;
}

export default function CampaignDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const postSortBy = normalizePostSort(searchParams.get('posts_sort'));
  const postSortDir = getSortDir(searchParams.get('sort_dir'));
  const postsPage = parsePositiveInt(searchParams.get('posts_page'), DEFAULT_POSTS_PAGE);
  const backHref = getSafeFrom(searchParams.get('from'), '/influencers');
  const backLabel = backHref.includes('/creator/') ? 'Back to Creator' : backHref.includes('/creators') ? 'Back to Creators' : 'Back to Campaigns';
  const currentPath = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const postsLimit = 100;

  const { data, isLoading, error } = useCampaign(slug, {
    postsPage,
    postsLimit,
    postsSort: postSortBy,
    sortDir: postSortDir,
    creatorsLimit: 200,
  });
  const recommendationsEnabled = isRecommendationFeatureEnabledClient();

  const updateQuery = (updates: Record<string, string | number | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (
        value === null ||
        value === '' ||
        (key === 'posts_page' && Number(value) === DEFAULT_POSTS_PAGE) ||
        (key === 'posts_sort' && value === DEFAULT_POST_SORT) ||
        (key === 'sort_dir' && value === DEFAULT_SORT_DIR)
      ) {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const handlePostSort = (column: string) => {
    if (!VALID_POST_SORT_COLUMNS.has(column)) return;

    if (postSortBy === column) {
      updateQuery({
        sort_dir: postSortDir === 'asc' ? 'desc' : 'asc',
        posts_page: DEFAULT_POSTS_PAGE,
      });
    } else {
      updateQuery({
        posts_sort: column,
        sort_dir: DEFAULT_SORT_DIR,
        posts_page: DEFAULT_POSTS_PAGE,
      });
    }
  };

  const buildCreatorHref = (username: string) => {
    return `/influencers/creator/${username}?from=${encodeURIComponent(currentPath)}`;
  };

  if (isLoading) {
    return (
      <div className="inf-dash-content">
        <div className="inf-dash-loading">
          <div className="inf-dash-spinner" />
        </div>
      </div>
    );
  }

  if (error || !data?.campaign) {
    return (
      <div className="inf-dash-content">
        <div className="inf-dash-error">Campaign not found</div>
      </div>
    );
  }

  const { campaign, creators, posts } = data;
  const postsPagination = data.postsPagination;
  const creatorsPagination = data.creatorsPagination;
  const campaignGenreLabels: CampaignGenreChip[] =
    Array.isArray(campaign.genres) && campaign.genres.length > 0
      ? campaign.genres.slice(0, 2)
      : [{ genre: campaign.genre || 'Unclassified', weight: 1, confidence: Number(campaign.genre_confidence || 0) }];

  const avgViews = posts?.length
    ? Math.round(posts.reduce((s: number, p: Record<string, unknown>) => s + Number(p.views || 0), 0) / posts.length)
    : 0;

  const deliveredCount = posts?.filter((p: { post_status: string }) => p.post_status?.toLowerCase() === 'delivered').length || 0;
  const successRate = posts?.length ? Math.round((deliveredCount / posts.length) * 100) : 0;
  const verifiedCoverage = Number(campaign.verified_views_coverage || 0);

  return (
    <>
      <div className="inf-dash-header">
        <div className="inf-dash-header-inner">
          <h1>{campaign.title}</h1>
        </div>
      </div>

      <div className="inf-dash-content">
        <Link href={backHref} className="inf-dash-back">
          &larr; {backLabel}
        </Link>

        {/* Header Meta */}
        <div className="inf-dash-detail-header">
          <div>
            <h2 className="inf-dash-detail-title">{campaign.title}</h2>
            <div className="inf-dash-detail-meta">
              <BudgetBadge amount={campaign.budget || 0} />
              {campaignGenreLabels.map((label: CampaignGenreChip) => (
                <GenreBadge
                  key={`${campaign.slug}:${label.genre}`}
                  genre={label.genre}
                  confidence={label.confidence}
                />
              ))}
              {campaign.is_pending_intake && (
                <span className="inf-dash-badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', border: '1px solid rgba(245, 158, 11, 0.35)' }}>
                  PENDING
                </span>
              )}
              {campaign.needs_review_campaign && !campaign.is_pending_intake && (
                <span className="inf-dash-badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3B82F6', border: '1px solid rgba(59, 130, 246, 0.35)' }}>
                  REVIEW
                </span>
              )}
              {campaign.is_new_campaign && (
                <span className="inf-dash-badge" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22C55E', border: '1px solid rgba(34, 197, 94, 0.35)' }}>
                  NEW
                </span>
              )}
              {(typeof campaign.platforms === 'string'
                ? campaign.platforms.split('|').map((s: string) => s.trim()).filter(Boolean)
                : campaign.platforms || []
              ).map((p: string) => (
                <PlatformBadge key={p} platform={p} />
              ))}
              {campaign.created_at && (
                <span style={{ fontSize: '0.8rem', color: 'var(--inf-muted)' }}>
                  {new Date(campaign.created_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="inf-dash-grid-4" style={{ marginBottom: '1.5rem' }}>
          <StatCard
            label="Verified Views"
            value={formatNumber(Number((campaign.verified_views ?? campaign.total_views) || 0))}
          />
          <StatCard
            label="Creators"
            value={creators?.length || 0}
          />
          <StatCard
            label="Posts"
            value={posts?.length || 0}
          />
          <StatCard
            label="Avg Views / Post"
            value={formatNumber(avgViews)}
          />
        </div>

        {verifiedCoverage > 0 && verifiedCoverage < 80 && (
          <div
            className="inf-dash-card"
            style={{
              marginBottom: '1.5rem',
              padding: '0.85rem 1rem',
              borderColor: 'rgba(245, 158, 11, 0.4)',
              color: '#F59E0B',
              fontSize: '0.85rem',
            }}
          >
            Verified view coverage is {verifiedCoverage.toFixed(1)}%. Some linked posts use invalid or unsupported source URLs.
          </div>
        )}

        <div className="inf-dash-grid-2" style={{ marginBottom: '1.5rem' }}>
          <StatCard
            label="Success Rate"
            value={`${successRate}%`}
            subtitle={`${deliveredCount} of ${posts?.length || 0} delivered`}
          />
          <StatCard
            label="Budget"
            value={`$${Number(campaign.budget || 0).toLocaleString()}`}
          />
        </div>

        {/* Recommendations are frozen until reliability and data quality targets are met. */}
        {!recommendationsEnabled && (
          <>
            <h3 className="inf-dash-section-title">Recommended Creators</h3>
            <div className="inf-dash-card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
              <div style={{ color: 'var(--inf-muted)', fontSize: '0.9rem' }}>
                Recommendations are temporarily disabled while data quality and relevance are being rebuilt.
              </div>
            </div>
          </>
        )}

        {/* Creators List */}
        {creators && creators.length > 0 && (
          <>
            <h3 className="inf-dash-section-title">
              Creators ({creatorsPagination?.total ?? creators.length})
            </h3>
            <div className="inf-dash-card" style={{ marginBottom: '1.5rem' }}>
              <div className="inf-dash-table-wrapper">
                <table className="inf-dash-table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Genres</th>
                      <th>Platforms</th>
                      <th>Posts</th>
                      <th>Views</th>
                      <th>Success</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creators.map((creator: { username: string; platforms: string; post_count: number; total_views: number; success_rate: number; top_genres?: Array<{ genre: string; confidence: number }> }) => (
                      <tr
                        key={creator.username}
                        className="clickable"
                        onClick={() => router.push(buildCreatorHref(creator.username))}
                      >
                        <td style={{ fontWeight: 500, color: 'var(--inf-foreground)' }}>
                          @{creator.username}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                            {(creator.top_genres && creator.top_genres.length > 0
                              ? creator.top_genres.slice(0, 2)
                              : [{ genre: 'Unclassified', confidence: 0 }]
                            ).map((label) => (
                              <GenreBadge
                                key={`${creator.username}:${label.genre}`}
                                genre={label.genre}
                                confidence={label.confidence}
                              />
                            ))}
                          </div>
                        </td>
                        <td style={{ color: 'var(--inf-muted)', fontSize: '0.8rem' }}>
                          {creator.platforms || '-'}
                        </td>
                        <td>{creator.post_count}</td>
                        <td>{formatNumber(creator.total_views || 0)}</td>
                        <td>
                          <span style={{ color: 'var(--inf-accent)', fontSize: '0.8rem' }}>
                            {Number(creator.success_rate || 0).toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Posts Table */}
        <h3 className="inf-dash-section-title">
          Posts ({postsPagination?.total ?? (posts?.length || 0)})
        </h3>
        <div className="inf-dash-card">
          <PostTable
            posts={posts || []}
            sortBy={postSortBy}
            sortDir={postSortDir}
            onSort={handlePostSort}
          />
        </div>
        {postsPagination && postsPagination.totalPages > 1 && (
          <Pagination
            currentPage={postsPage}
            totalPages={postsPagination.totalPages}
            onPageChange={(nextPage) => updateQuery({ posts_page: nextPage })}
          />
        )}
      </div>
    </>
  );
}
