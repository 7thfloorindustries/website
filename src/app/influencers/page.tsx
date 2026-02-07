'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCampaigns } from '@/hooks/influencer/useCampaigns';
import { useInfluencerStats } from '@/hooks/influencer/useInfluencerStats';
import StatCard from '@/components/influencer/StatCard';
import CampaignTable from '@/components/influencer/CampaignTable';
import SearchBar from '@/components/influencer/SearchBar';
import GenreFilter from '@/components/influencer/GenreFilter';
import PlatformFilter from '@/components/influencer/PlatformFilter';
import SortControls from '@/components/influencer/SortControls';
import Pagination from '@/components/influencer/Pagination';
import CampaignTabs from '@/components/influencer/CampaignTabs';

function formatNumber(n: unknown): string {
  const num = Number(n ?? 0) || 0;
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toLocaleString();
}

function formatCurrency(n: unknown): string {
  const num = Number(n ?? 0) || 0;
  if (num >= 1_000_000) return '$' + (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return '$' + (num / 1_000).toFixed(1) + 'K';
  return '$' + num.toLocaleString();
}

const DEFAULT_PAGE = 1;
const DEFAULT_MAIN_SORT = 'views_desc';
const DEFAULT_INTAKE_SORT = 'newest_desc';
type CampaignTab = 'main' | 'intake';

const SORT_TO_COLUMN: Record<string, string> = {
  views: 'total_views',
  budget: 'budget',
  newest: 'created_at',
  date: 'created_at',
  creators: 'actual_creators',
  genre: 'genre',
};

const COLUMN_TO_SORT: Record<string, string> = {
  total_views: 'views',
  budget: 'budget',
  created_at: 'newest',
  actual_creators: 'creators',
  genre: 'genre',
};

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function normalizeSort(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const normalized = value.includes('_') ? value : `${value}_desc`;
  const base = normalized.replace(/_(asc|desc)$/, '');
  if (!SORT_TO_COLUMN[base]) return fallback;
  if (normalized.endsWith('_asc') || normalized.endsWith('_desc')) return normalized;
  return `${base}_desc`;
}

function getSortState(sort: string): { sortBy: string; sortDir: 'asc' | 'desc' } {
  const base = sort.replace(/_(asc|desc)$/, '');
  return {
    sortBy: SORT_TO_COLUMN[base] ?? 'total_views',
    sortDir: sort.endsWith('_asc') ? 'asc' : 'desc',
  };
}

export default function CampaignsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeTab: CampaignTab = searchParams.get('tab') === 'intake' ? 'intake' : 'main';
  const search = searchParams.get('search') ?? '';
  const genre = searchParams.get('genre') ?? '';
  const platform = searchParams.get('platform') ?? '';
  const review = searchParams.get('review') === 'needs_review' ? 'needs_review' : '';
  const legacyPage = searchParams.get('page');
  const legacySort = searchParams.get('sort');
  const mainPage = parsePositiveInt(searchParams.get('main_page') ?? (activeTab === 'main' ? legacyPage : null), DEFAULT_PAGE);
  const intakePage = parsePositiveInt(searchParams.get('intake_page') ?? (activeTab === 'intake' ? legacyPage : null), DEFAULT_PAGE);
  const mainSort = normalizeSort(searchParams.get('main_sort') ?? (activeTab === 'main' ? legacySort : null), DEFAULT_MAIN_SORT);
  const intakeSort = normalizeSort(searchParams.get('intake_sort') ?? (activeTab === 'intake' ? legacySort : null), DEFAULT_INTAKE_SORT);
  const mainSortState = getSortState(mainSort);
  const intakeSortState = getSortState(intakeSort);
  const activeSort = activeTab === 'main' ? mainSort : intakeSort;
  const activeSortState = activeTab === 'main' ? mainSortState : intakeSortState;
  const activePage = activeTab === 'main' ? mainPage : intakePage;
  const currentPath = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

  const { data: stats } = useInfluencerStats();
  const { data: mainData, isLoading: isMainLoading, error: mainError } = useCampaigns({
    enabled: activeTab === 'main',
    page: mainPage,
    search,
    genre,
    platform,
    sort: mainSort,
    intake: 'main',
    review: review === 'needs_review' ? 'needs_review' : undefined,
    limit: 50,
  });
  const {
    data: pendingData,
    isLoading: isPendingLoading,
    error: pendingError,
  } = useCampaigns({
    enabled: activeTab === 'intake',
    page: intakePage,
    search,
    genre,
    platform,
    sort: intakeSort,
    intake: 'pending',
    review: review === 'needs_review' ? 'needs_review' : undefined,
    limit: 20,
  });

  const updateQuery = (updates: Record<string, string | number | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (
        value === null ||
        value === '' ||
        (key === 'tab' && value === 'main') ||
        (key === 'main_page' && Number(value) === DEFAULT_PAGE) ||
        (key === 'intake_page' && Number(value) === DEFAULT_PAGE) ||
        (key === 'main_sort' && value === DEFAULT_MAIN_SORT) ||
        (key === 'intake_sort' && value === DEFAULT_INTAKE_SORT)
      ) {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    }
    params.delete('page');
    params.delete('sort');

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const handleSort = (column: string) => {
    const sortKey = COLUMN_TO_SORT[column];
    if (!sortKey) return;

    const nextDir: 'asc' | 'desc' =
      activeSortState.sortBy === column ? (activeSortState.sortDir === 'asc' ? 'desc' : 'asc') : 'desc';
    if (activeTab === 'main') {
      updateQuery({
        main_sort: `${sortKey}_${nextDir}`,
        main_page: DEFAULT_PAGE,
      });
      return;
    }
    updateQuery({
      intake_sort: `${sortKey}_${nextDir}`,
      intake_page: DEFAULT_PAGE,
    });
  };

  const handleSearch = (value: string) => {
    updateQuery({
      search: value,
      main_page: DEFAULT_PAGE,
      intake_page: DEFAULT_PAGE,
    });
  };

  const handleGenre = (value: string) => {
    updateQuery({
      genre: value,
      main_page: DEFAULT_PAGE,
      intake_page: DEFAULT_PAGE,
    });
  };

  const handlePlatform = (value: string) => {
    updateQuery({
      platform: value,
      main_page: DEFAULT_PAGE,
      intake_page: DEFAULT_PAGE,
    });
  };

  const handleSortControl = (value: string) => {
    if (activeTab === 'main') {
      updateQuery({
        main_sort: normalizeSort(value, DEFAULT_MAIN_SORT),
        main_page: DEFAULT_PAGE,
      });
      return;
    }
    updateQuery({
      intake_sort: normalizeSort(value, DEFAULT_INTAKE_SORT),
      intake_page: DEFAULT_PAGE,
    });
  };

  const toggleReviewFilter = () => {
    updateQuery({
      review: review === 'needs_review' ? null : 'needs_review',
      main_page: DEFAULT_PAGE,
      intake_page: DEFAULT_PAGE,
    });
  };

  const handleTabChange = (tab: CampaignTab) => {
    updateQuery({ tab });
  };

  const buildCampaignHref = (slug: string) => {
    return `/influencers/campaign/${slug}?from=${encodeURIComponent(currentPath)}`;
  };

  return (
    <>
      <div className="inf-dash-header">
        <div className="inf-dash-header-inner">
          <h1>Campaigns</h1>
        </div>
      </div>

      <div className="inf-dash-content">
        {/* Stats Row */}
        <div className="inf-dash-grid-4" style={{ marginBottom: '1.5rem' }}>
          <StatCard
            label="Total Campaigns"
            value={stats ? formatNumber(Number(stats.total_campaigns)) : '-'}
            icon="📋"
          />
          <StatCard
            label="Total Creators"
            value={stats ? formatNumber(Number(stats.total_creators)) : '-'}
            icon="👤"
          />
          <StatCard
            label="Total Views"
            value={stats ? formatNumber(Number(stats.total_views)) : '-'}
            icon="👁"
          />
          <StatCard
            label="Total Budget"
            value={stats ? formatCurrency(Number(stats.total_budget)) : '-'}
            icon="💰"
          />
        </div>
        <div className="inf-dash-grid-4" style={{ marginBottom: '1.5rem' }}>
          <StatCard
            label="New Campaigns (24h)"
            value={stats ? formatNumber(Number(stats.new_campaigns_24h || 0)) : '-'}
          />
          <StatCard
            label="New Creators (24h)"
            value={stats ? formatNumber(Number(stats.new_creators_24h || 0)) : '-'}
          />
          <StatCard
            label="Pending Intake"
            value={stats ? formatNumber(Number(stats.pending_campaigns_total || 0)) : '-'}
          />
          <StatCard
            label="Need Review"
            value={stats ? formatNumber(Number(stats.campaigns_needing_review || 0)) : '-'}
          />
        </div>

        {/* Filter Bar */}
        <div className="inf-dash-filter-bar">
          <SearchBar
            value={search}
            onChange={handleSearch}
            placeholder="Search campaigns..."
          />
          <GenreFilter value={genre} onChange={handleGenre} />
          <PlatformFilter value={platform} onChange={handlePlatform} />
          <SortControls value={activeSort} onChange={handleSortControl} />
          <button
            type="button"
            onClick={toggleReviewFilter}
            style={{
              padding: '0.55rem 0.85rem',
              borderRadius: '0.65rem',
              border: review === 'needs_review' ? '1px solid rgba(59,130,246,0.55)' : '1px solid var(--inf-border)',
              background: review === 'needs_review' ? 'rgba(59,130,246,0.12)' : 'var(--inf-surface)',
              color: 'var(--inf-foreground)',
              fontSize: '0.78rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {review === 'needs_review' ? 'Showing Needs Review' : 'Needs Review'}
          </button>
        </div>

        <CampaignTabs
          activeTab={activeTab}
          intakeCount={Number(pendingData?.pagination?.total || 0)}
          onChange={handleTabChange}
        />
        <div style={{ marginTop: '-0.25rem', marginBottom: '1rem', color: 'var(--inf-muted)', fontSize: '0.78rem' }}>
          Intake queue includes campaigns first seen in the last 14 days (after a 30-minute grace window) with missing posts, placeholder links only, or missing core metadata.
        </div>

        {/* Campaign Table */}
        {activeTab === 'main' && isMainLoading ? (
          <div className="inf-dash-loading">
            <div className="inf-dash-spinner" />
          </div>
        ) : activeTab === 'main' && mainError ? (
          <div className="inf-dash-error">Failed to load campaigns</div>
        ) : activeTab === 'intake' && isPendingLoading ? (
          <div className="inf-dash-loading">
            <div className="inf-dash-spinner" />
          </div>
        ) : activeTab === 'intake' && pendingError ? (
          <div className="inf-dash-error">Failed to load pending campaigns</div>
        ) : (
          <>
            {activeTab === 'main' ? (
              <>
                <h3 className="inf-dash-section-title">Main Hub</h3>
                <div className="inf-dash-card">
                  <CampaignTable
                    campaigns={mainData?.campaigns || []}
                    sortBy={mainSortState.sortBy}
                    sortDir={mainSortState.sortDir}
                    onSort={handleSort}
                    buildCampaignHref={buildCampaignHref}
                  />
                </div>
                <Pagination
                  currentPage={activePage}
                  totalPages={mainData?.pagination?.totalPages || 1}
                  onPageChange={(nextPage) => updateQuery({ main_page: nextPage })}
                />
              </>
            ) : (
              <>
                <h3 className="inf-dash-section-title">Intake Queue</h3>
                <div className="inf-dash-card">
                  <CampaignTable
                    campaigns={pendingData?.campaigns || []}
                    sortBy={intakeSortState.sortBy}
                    sortDir={intakeSortState.sortDir}
                    onSort={handleSort}
                    buildCampaignHref={buildCampaignHref}
                  />
                </div>
                <Pagination
                  currentPage={activePage}
                  totalPages={pendingData?.pagination?.totalPages || 1}
                  onPageChange={(nextPage) => updateQuery({ intake_page: nextPage })}
                />
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
