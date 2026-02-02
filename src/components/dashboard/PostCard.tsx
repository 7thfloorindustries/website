'use client';

import Sparkline from './Sparkline';
import type { Post } from '@/lib/campaign-data';

interface PostCardProps {
  post: Post;
  index: number;
}

function formatCompact(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

export default function PostCard({ post, index }: PostCardProps) {
  return (
    <a
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      className="dashboard-post-card"
      style={{ animationDelay: `${0.1 + index * 0.03}s` }}
    >
      <div className="dashboard-post-thumbnail">
        <div className="dashboard-thumbnail-placeholder">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15l-5-5L5 21"/>
          </svg>
        </div>
      </div>
      <div className="dashboard-post-header">
        <div className="dashboard-post-account">{post.account}</div>
        <div className="dashboard-post-platform">{post.platform}</div>
      </div>
      <div className="dashboard-post-stats">
        <div className="dashboard-post-views">{post.currentViews.toLocaleString()}</div>
        <div className="dashboard-post-views-label">views <span className="trend-arrow">↗</span></div>
      </div>
      <div className="dashboard-post-metrics">
        <div className="metric"><span className="metric-icon">♥</span><span className="metric-value">{formatCompact(post.likes)}</span></div>
        <div className="metric"><span className="metric-icon">💬</span><span className="metric-value">{formatCompact(post.comments)}</span></div>
        <div className="metric"><span className="metric-icon">↗</span><span className="metric-value">{formatCompact(post.shares)}</span></div>
      </div>
      <div className="dashboard-sparkline-container">
        <Sparkline data={post.sparklineData} width={100} height={24} />
      </div>
    </a>
  );
}
