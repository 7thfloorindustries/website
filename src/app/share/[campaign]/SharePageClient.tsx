'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import StatCard from '@/components/dashboard/StatCard';
import PostCard from '@/components/dashboard/PostCard';
import AreaChart from '@/components/dashboard/AreaChart';
import ElevatorLoader from '@/components/ElevatorLoader';
import CustomCursor from '@/components/CustomCursor';
import AnimatedBackground from '@/components/AnimatedBackground';
import type { CampaignData } from '@/lib/campaign-data';

interface SharePageClientProps {
  campaignName: string;
  campaignSlug: string;
  status: string;
  createdDate?: string;
  coverImage?: string;
  data: CampaignData;
}

function formatCompact(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

export default function SharePageClient({ campaignName, campaignSlug, status, createdDate, coverImage: initialCoverImage, data }: SharePageClientProps) {
  const [mounted, setMounted] = useState(false);
  const [coverImage, setCoverImage] = useState<string | undefined>(initialCoverImage);
  const [platformFilter, setPlatformFilter] = useState('all');
  const [sortBy, setSortBy] = useState('views');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [showLoader, setShowLoader] = useState(true);

  useEffect(() => {
    setMounted(true);

    // Check if user has visited this share page before
    const storageKey = `7thfloor-share-${campaignSlug}`;
    const hasVisited = sessionStorage.getItem(storageKey);
    if (hasVisited) {
      setShowLoader(false);
    }

    // Fetch cover image from blob manifest
    async function fetchCoverImage() {
      try {
        const response = await fetch(`/api/upload?campaign=${campaignSlug}`);
        const data = await response.json();
        if (data.coverImage) {
          setCoverImage(data.coverImage);
        }
      } catch (error) {
        console.error('Failed to fetch cover image:', error);
      }
    }
    fetchCoverImage();
  }, [campaignSlug]);

  const formattedDate = createdDate
    ? new Date(createdDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const filteredPosts = data.posts
    .filter(post => platformFilter === 'all' || post.platform === platformFilter)
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'views') comparison = b.currentViews - a.currentViews;
      else if (sortBy === 'likes') comparison = b.likes - a.likes;
      else if (sortBy === 'engagement') {
        const engA = a.likes + a.comments + a.shares;
        const engB = b.likes + b.comments + b.shares;
        comparison = engB - engA;
      }
      return sortOrder === 'asc' ? -comparison : comparison;
    });

  const handleLoaderComplete = () => {
    const storageKey = `7thfloor-share-${campaignSlug}`;
    sessionStorage.setItem(storageKey, 'true');
    setShowLoader(false);
  };

  return (
    <>
      <AnimatePresence>
        {showLoader && <ElevatorLoader onComplete={handleLoaderComplete} targetFloor={7} />}
      </AnimatePresence>
      <CustomCursor />
      <AnimatedBackground />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: showLoader ? 0 : 1 }}
        transition={{ duration: 0.5 }}
        className="dashboard-shareable-view"
      >
      {/* Film grain overlay */}
      <div className="dashboard-film-grain" />
      <div className="dashboard-atmosphere" />

      {/* Header */}
      <header className="dashboard-shareable-header">
        <div className="dashboard-header-artwork">
          {coverImage ? (
            <Image
              src={coverImage.startsWith('http') ? coverImage : `/${coverImage}`}
              alt={`${campaignName} cover`}
              width={100}
              height={100}
              className="dashboard-header-cover-image"
            />
          ) : (
            <div className="dashboard-artwork-placeholder">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="M21 15l-5-5L5 21"/>
              </svg>
            </div>
          )}
        </div>
        <div className="dashboard-header-info">
          <h1 className="dashboard-campaign-title">{campaignName}</h1>
          <div className="dashboard-title-underline" />
          <div className="dashboard-campaign-meta">
            <span className="meta-posts">{data.posts.length} Live Posts</span>
            <span className="meta-separator">•</span>
            <span className="meta-status">{status === 'active' ? 'In-Progress' : status}</span>
          </div>
        </div>
        <div className="dashboard-live-badge">
          <span className="live-dot" />
          LIVE
        </div>
      </header>

      {/* Main Stats */}
      <section className="dashboard-stats-grid">
        <StatCard label="Total Views" value={data.metrics.totalViews} />
        <StatCard label="Posts" value={data.posts.length} />
        <StatCard label="Platforms" value={data.platforms.length} />
        <StatCard label="Avg / Post" value={data.metrics.avgViewsPerPost} />
      </section>

      {/* Engagement Stats */}
      <section className="dashboard-engagement-stats-row">
        <div className="dashboard-mini-stat-card">
          <span className="mini-stat-icon">♥</span>
          <div className="mini-stat-data">
            <span className="mini-stat-value">{formatCompact(data.metrics.totalLikes)}</span>
            <span className="mini-stat-label">Likes</span>
          </div>
        </div>
        <div className="dashboard-mini-stat-card">
          <span className="mini-stat-icon">💬</span>
          <div className="mini-stat-data">
            <span className="mini-stat-value">{formatCompact(data.metrics.totalComments)}</span>
            <span className="mini-stat-label">Comments</span>
          </div>
        </div>
        <div className="dashboard-mini-stat-card">
          <span className="mini-stat-icon">↗</span>
          <div className="mini-stat-data">
            <span className="mini-stat-value">{formatCompact(data.metrics.totalShares)}</span>
            <span className="mini-stat-label">Shares</span>
          </div>
        </div>
        <div className="dashboard-mini-stat-card">
          <span className="mini-stat-icon">⬇</span>
          <div className="mini-stat-data">
            <span className="mini-stat-value">{formatCompact(data.metrics.totalDownloads)}</span>
            <span className="mini-stat-label">Downloads</span>
          </div>
        </div>
      </section>

      {/* Performance Chart */}
      {mounted && data.timelineData.length > 0 && (
        <section className="dashboard-chart-section">
          <div className="dashboard-chart-card dashboard-chart-card-full">
            <h3 className="dashboard-chart-title">Performance Over Time</h3>
            <div className="dashboard-chart-container">
              <AreaChart data={data.timelineData} width={600} height={200} />
            </div>
          </div>
        </section>
      )}

      {/* Posts Grid */}
      <section className="dashboard-posts-section">
        <h3 className="dashboard-section-title">Posts</h3>

        <div className="dashboard-filter-bar">
          <div className="dashboard-filter-section">
            <label className="filter-label">Platform</label>
            <select
              className="dashboard-filter-select"
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
            >
              <option value="all">All Platforms</option>
              {data.platforms.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="dashboard-filter-section">
            <label className="filter-label">Sort by</label>
            <select
              className="dashboard-filter-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="views">Views</option>
              <option value="likes">Likes</option>
              <option value="engagement">Engagement</option>
            </select>
          </div>
          <div className="dashboard-filter-section">
            <label className="filter-label">Order</label>
            <select
              className="dashboard-filter-select"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
            >
              <option value="desc">Highest First</option>
              <option value="asc">Lowest First</option>
            </select>
          </div>
          <div className="dashboard-filter-results">
            <span className="results-count">{filteredPosts.length}</span> posts
          </div>
        </div>

        <div className="dashboard-posts-grid">
          {filteredPosts.map((post, index) => (
            <PostCard key={post.url} post={post} index={index} />
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="dashboard-shareable-footer">
        <div className="dashboard-footer-divider" />
        <p className="dashboard-footer-text">
          Generated by <span className="dashboard-footer-brand">7th Floor Digital</span> •
          Campaign Tracking • {formattedDate}
        </p>
        <p className="dashboard-footer-updated">
          Last updated: {new Date(data.lastUpdated).toLocaleString()} • Auto-refreshes every 5 minutes
        </p>
      </footer>
      </motion.div>
    </>
  );
}
