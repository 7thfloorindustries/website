'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCreators } from '@/hooks/influencer/useCreators';
import CreatorTable from '@/components/influencer/CreatorTable';
import SearchBar from '@/components/influencer/SearchBar';
import SortControls from '@/components/influencer/SortControls';
import Pagination from '@/components/influencer/Pagination';
import GenreFilter from '@/components/influencer/GenreFilter';
import AgencyFilter from '@/components/influencer/AgencyFilter';
import { useAgencies } from '@/hooks/influencer/useAgencies';

const CREATOR_SORT_OPTIONS = [
  { value: 'views_desc', label: 'Most Views' },
  { value: 'genre_fit_desc', label: 'Best Genre Fit' },
  { value: 'diversity_desc', label: 'Most Flexible' },
  { value: 'campaigns_desc', label: 'Most Campaigns' },
  { value: 'success_desc', label: 'Highest Success Rate' },
  { value: 'cost_desc', label: 'Highest Cost' },
  { value: 'newest_desc', label: 'Newest' },
];

const DEFAULT_PAGE = 1;
const DEFAULT_SORT = 'views_desc';

const SORT_TO_COLUMN: Record<string, string> = {
  views: 'total_views',
  genre_fit: 'genre_fit_score',
  diversity: 'genre_diversity_score',
  campaigns: 'campaign_count',
  success: 'success_rate',
  cost: 'cost_total_usd',
  newest: 'first_seen_at',
  posts: 'total_posts',
};

const COLUMN_TO_SORT: Record<string, string> = {
  total_views: 'views',
  genre_fit_score: 'genre_fit',
  genre_diversity_score: 'diversity',
  campaign_count: 'campaigns',
  total_posts: 'posts',
  success_rate: 'success',
  cost_total_usd: 'cost',
  first_seen_at: 'newest',
};

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function normalizeSort(value: string | null): string {
  if (!value) return DEFAULT_SORT;
  const normalized = value.includes('_') ? value : `${value}_desc`;
  const base = normalized.replace(/_(asc|desc)$/, '');
  if (!SORT_TO_COLUMN[base]) return DEFAULT_SORT;
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

export default function CreatorsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = parsePositiveInt(searchParams.get('page'), DEFAULT_PAGE);
  const search = searchParams.get('search') ?? '';
  const agency = searchParams.get('agency') ?? '';
  const genre = searchParams.get('genre') ?? '';
  const campaignSlug = searchParams.get('campaign_slug') ?? '';
  const sort = normalizeSort(searchParams.get('sort'));
  const minGenreFit = searchParams.has('min_genre_fit')
    ? Number(searchParams.get('min_genre_fit'))
    : undefined;
  const review = searchParams.get('review') === 'needs_review' ? 'needs_review' : '';
  const { sortBy, sortDir } = getSortState(sort);
  const currentPath = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

  const { data: agenciesData } = useAgencies();
  const { data, isLoading, error } = useCreators({
    page,
    search,
    agency: agency || undefined,
    genre,
    campaign_slug: campaignSlug || undefined,
    min_genre_fit: Number.isFinite(minGenreFit as number) ? minGenreFit : undefined,
    sort,
    review: review === 'needs_review' ? 'needs_review' : undefined,
    limit: 50,
  });

  const updateQuery = (updates: Record<string, string | number | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (
        value === null ||
        value === '' ||
        (key === 'page' && Number(value) === DEFAULT_PAGE) ||
        (key === 'sort' && value === DEFAULT_SORT)
      ) {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const handleSort = (column: string) => {
    const sortKey = COLUMN_TO_SORT[column];
    if (!sortKey) return;

    const nextDir: 'asc' | 'desc' = sortBy === column ? (sortDir === 'asc' ? 'desc' : 'asc') : 'desc';
    updateQuery({
      sort: `${sortKey}_${nextDir}`,
      page: DEFAULT_PAGE,
    });
  };

  const handleSearch = (value: string) => {
    updateQuery({
      search: value,
      page: DEFAULT_PAGE,
    });
  };

  const handleGenre = (value: string) => {
    updateQuery({
      genre: value,
      page: DEFAULT_PAGE,
    });
  };

  const handleAgency = (value: string) => {
    updateQuery({
      agency: value,
      page: DEFAULT_PAGE,
    });
  };

  const handleSortControl = (value: string) => {
    updateQuery({
      sort: normalizeSort(value),
      page: DEFAULT_PAGE,
    });
  };

  const toggleReviewFilter = () => {
    updateQuery({
      review: review === 'needs_review' ? null : 'needs_review',
      page: DEFAULT_PAGE,
    });
  };

  const buildCreatorHref = (username: string) => {
    return `/influencers/creator/${username}?from=${encodeURIComponent(currentPath)}`;
  };

  return (
    <>
      <div className="inf-dash-header">
        <div className="inf-dash-header-inner">
          <h1>Creators</h1>
        </div>
      </div>

      <div className="inf-dash-content">
        {/* Filter Bar */}
        <div className="inf-dash-filter-bar">
          <SearchBar
            value={search}
            onChange={handleSearch}
            placeholder="Search creators..."
          />
          <AgencyFilter
            agencies={agenciesData?.agencies || []}
            value={agency}
            onChange={handleAgency}
          />
          <GenreFilter value={genre} onChange={handleGenre} />
          <SortControls
            value={sort}
            onChange={handleSortControl}
            options={CREATOR_SORT_OPTIONS}
          />
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

        {/* Creator Table */}
        {isLoading ? (
          <div className="inf-dash-loading">
            <div className="inf-dash-spinner" />
          </div>
        ) : error ? (
          <div className="inf-dash-error">Failed to load creators</div>
        ) : (
          <>
            <div className="inf-dash-card">
              <CreatorTable
                creators={data?.creators || []}
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                buildCreatorHref={buildCreatorHref}
              />
            </div>
            <Pagination
              currentPage={page}
              totalPages={data?.pagination?.totalPages || 1}
              onPageChange={(nextPage) => updateQuery({ page: nextPage })}
            />
          </>
        )}
      </div>
    </>
  );
}
