'use client';

import PlatformBadge from './PlatformBadge';

function formatNumber(n: unknown): string {
  const num = Number(n ?? 0) || 0;
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toLocaleString();
}

interface Post {
  post_id: string | number;
  username: string;
  platform: string;
  views: number;
  post_date: string;
  post_status: string;
  post_url: string | null;
  post_url_reason?: string | null;
  post_url_valid?: boolean;
}

interface PostTableProps {
  posts: Post[];
  sortBy: string;
  sortDir: 'asc' | 'desc';
  onSort: (column: string) => void;
}

const COLUMNS = [
  { key: 'username', label: 'Creator' },
  { key: 'platform', label: 'Platform' },
  { key: 'views', label: 'Views' },
  { key: 'post_date', label: 'Date' },
  { key: 'post_status', label: 'Status' },
  { key: 'post_url', label: 'Link' },
];

function getStatusClass(status: string): string {
  switch (status?.toLowerCase()) {
    case 'delivered': return 'inf-dash-status-delivered';
    case 'pending': return 'inf-dash-status-pending';
    case 'missing': return 'inf-dash-status-missing';
    default: return 'inf-dash-status-pending';
  }
}

export default function PostTable({ posts, sortBy, sortDir, onSort }: PostTableProps) {
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
          {posts.map((post) => (
            <tr key={post.post_id}>
              <td style={{ fontWeight: 500, color: 'var(--inf-foreground)' }}>
                @{post.username}
              </td>
              <td><PlatformBadge platform={post.platform} /></td>
              <td>{formatNumber(post.views)}</td>
              <td style={{ color: 'var(--inf-muted)', fontSize: '0.8rem' }}>
                {post.post_date ? new Date(post.post_date).toLocaleDateString() : '-'}
              </td>
              <td>
                <span className={`inf-dash-status ${getStatusClass(post.post_status)}`}>
                  {post.post_status || 'Pending'}
                </span>
              </td>
              <td>
                {post.post_url && post.post_url_valid !== false ? (
                  <a
                    href={post.post_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--inf-accent)', fontSize: '0.8rem' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    View
                  </a>
                ) : (
                  <span style={{ color: 'var(--inf-muted)', fontSize: '0.8rem' }}>
                    {post.post_url_valid === false ? (post.post_url_reason || 'Invalid URL') : '-'}
                  </span>
                )}
              </td>
            </tr>
          ))}
          {posts.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', color: 'var(--inf-muted)', padding: '3rem 1rem' }}>
                No posts found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
