'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
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
  // Use thumbnail from sheet if available, otherwise fetch from API
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(post.thumbnailUrl || null);
  const [thumbnailLoading, setThumbnailLoading] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);
  const cardRef = useRef<HTMLAnchorElement>(null);
  const hasFetched = useRef(false);

  useEffect(() => {
    // Skip API fetch if we already have a thumbnail from the sheet
    if (post.thumbnailUrl) {
      hasFetched.current = true;
      return;
    }

    if (!cardRef.current || hasFetched.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasFetched.current) {
            hasFetched.current = true;
            fetchThumbnail();
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '100px', // Start fetching slightly before card enters viewport
        threshold: 0,
      }
    );

    observer.observe(cardRef.current);

    return () => observer.disconnect();
  }, [post.url, post.thumbnailUrl]);

  const fetchThumbnail = async () => {
    if (!post.url) return;

    setThumbnailLoading(true);
    try {
      const response = await fetch(`/api/thumbnail?url=${encodeURIComponent(post.url)}`);
      const data = await response.json();

      if (data.thumbnailUrl) {
        setThumbnailUrl(data.thumbnailUrl);
      }
    } catch (error) {
      console.error('Failed to fetch thumbnail:', error);
      setThumbnailError(true);
    } finally {
      setThumbnailLoading(false);
    }
  };

  return (
    <a
      ref={cardRef}
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      className="dashboard-post-card"
      style={{ animationDelay: `${0.1 + index * 0.03}s` }}
    >
      <div className="dashboard-post-thumbnail">
        {thumbnailUrl && !thumbnailError ? (
          <Image
            src={thumbnailUrl}
            alt={`${post.account} post thumbnail`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="dashboard-thumbnail-image"
            onError={() => setThumbnailError(true)}
          />
        ) : (
          <div className={`dashboard-thumbnail-placeholder ${thumbnailLoading ? 'loading' : ''}`}>
            {thumbnailLoading ? (
              <div className="thumbnail-spinner" />
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="M21 15l-5-5L5 21"/>
              </svg>
            )}
          </div>
        )}
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
