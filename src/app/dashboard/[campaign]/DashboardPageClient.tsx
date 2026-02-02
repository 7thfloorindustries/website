'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import StatCard from '@/components/dashboard/StatCard';
import PostCard from '@/components/dashboard/PostCard';
import AreaChart from '@/components/dashboard/AreaChart';
import DonutChart from '@/components/dashboard/DonutChart';
import ElevatorLoader from '@/components/ElevatorLoader';
import CustomCursor from '@/components/CustomCursor';
import AnimatedBackground from '@/components/AnimatedBackground';
import MagneticButton from '@/components/MagneticButton';
import type { CampaignData } from '@/lib/campaign-data';

interface DashboardPageClientProps {
  campaignName: string;
  campaignSlug: string;
  status: string;
  createdDate?: string;
  spreadsheetUrl?: string;
  coverImage?: string;
  data: CampaignData;
}

type TabType = 'overview' | 'posts' | 'analytics' | 'settings';

function formatCompact(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

function formatTimeAgo(timestamp: string): string {
  if (!timestamp) return '';
  const now = new Date();
  const date = new Date(timestamp);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function DashboardPageClient({
  campaignName,
  campaignSlug,
  status,
  createdDate,
  spreadsheetUrl,
  coverImage: initialCoverImage,
  data
}: DashboardPageClientProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [mounted, setMounted] = useState(false);
  const [platformFilter, setPlatformFilter] = useState('all');
  const [sortBy, setSortBy] = useState('views');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [showLoader, setShowLoader] = useState(true);

  // Cover image upload state
  const [coverImage, setCoverImage] = useState<string | undefined>(initialCoverImage);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);

    // Check if user has visited this dashboard before
    const storageKey = `7thfloor-dashboard-${campaignSlug}`;
    const hasVisited = sessionStorage.getItem(storageKey);
    if (hasVisited) {
      setShowLoader(false);
    }

    // Handle hash navigation
    const hash = window.location.hash.replace('#', '') as TabType;
    if (['overview', 'posts', 'analytics', 'settings'].includes(hash)) {
      setActiveTab(hash);
    }

    // Fetch cover image from blob manifest (may override static config)
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus('uploading');
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('campaignSlug', campaignSlug);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      setCoverImage(result.url);
      setUploadStatus('success');

      // Reset status after 3 seconds
      setTimeout(() => setUploadStatus('idle'), 3000);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
      setUploadStatus('error');
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    window.location.hash = tab;
  };

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/share/${campaignSlug}`
    : `/share/${campaignSlug}`;

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

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareUrl);
    alert('Share link copied!');
  };

  const exportData = (format: 'csv' | 'json') => {
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${campaignSlug}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = ['Account', 'Platform', 'Views', 'Likes', 'Comments', 'Shares', 'URL'];
      const rows = data.posts.map(p => [p.account, p.platform, p.currentViews, p.likes, p.comments, p.shares, p.url]);
      const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${campaignSlug}-export.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleLoaderComplete = () => {
    const storageKey = `7thfloor-dashboard-${campaignSlug}`;
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
        className="dashboard-app-container"
      >
      {/* Film grain */}
      <div className="dashboard-film-grain" />
      <div className="dashboard-atmosphere" />

      {/* Sidebar */}
      <aside className="dashboard-sidebar">
        <div className="dashboard-sidebar-header">
          <div className="dashboard-sidebar-brand">7TH FLOOR</div>
          {coverImage && (
            <div className="dashboard-sidebar-cover">
              <Image
                src={coverImage.startsWith('http') ? coverImage : `/${coverImage}`}
                alt={`${campaignName} cover`}
                width={200}
                height={112}
                className="dashboard-cover-image"
              />
            </div>
          )}
          <div className="dashboard-sidebar-campaign">{campaignName}</div>
        </div>

        <nav className="dashboard-sidebar-nav">
          {(['overview', 'posts', 'analytics', 'settings'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`dashboard-nav-item ${activeTab === tab ? 'active' : ''}`}
            >
              <span className="dashboard-nav-label">{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
            </button>
          ))}
        </nav>

        <div className="dashboard-sidebar-footer">
          <div className="dashboard-sidebar-actions">
            <Link href={shareUrl} target="_blank" className="dashboard-sidebar-btn">
              Share Link
            </Link>
            {spreadsheetUrl && (
              <Link href={spreadsheetUrl} target="_blank" className="dashboard-sidebar-btn">
                Google Sheet
              </Link>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="dashboard-main-content">
        <header className="dashboard-main-header">
          <h1 className="dashboard-main-title">{campaignName}</h1>
          <div className="dashboard-main-actions">
            <div className="dashboard-live-badge">
              <span className="live-dot" />
              LIVE
            </div>
          </div>
        </header>

        <div className="dashboard-view-container">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="dashboard-overview-view animate-fade-in">
              <section className="dashboard-stats-grid">
                <StatCard label="Total Views" value={data.metrics.totalViews} />
                <StatCard label="Posts" value={data.posts.length} />
                <StatCard label="Platforms" value={data.platforms.length} />
                <StatCard label="Engagement %" value={data.metrics.engagementRate} />
              </section>

              <div className="dashboard-overview-grid">
                <div className="dashboard-info-card">
                  <h3 className="dashboard-card-title">Campaign Info</h3>
                  <div className="dashboard-info-list">
                    <div className="dashboard-info-item">
                      <span className="info-label">Status</span>
                      <span className={`dashboard-status-badge status-${status}`}>
                        <span className="status-dot" />
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    </div>
                    <div className="dashboard-info-item">
                      <span className="info-label">Created</span>
                      <span className="info-value">
                        {createdDate ? new Date(createdDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                      </span>
                    </div>
                    <div className="dashboard-info-item">
                      <span className="info-label">Platforms</span>
                      <span className="info-value platforms-list">
                        {data.platforms.map(p => (
                          <span key={p} className="platform-tag">{p}</span>
                        ))}
                      </span>
                    </div>
                    <div className="dashboard-info-item">
                      <span className="info-label">Avg Views/Post</span>
                      <span className="info-value highlight">{data.metrics.avgViewsPerPost.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="dashboard-activity-card">
                  <h3 className="dashboard-card-title">
                    Recent Activity
                    <span className="activity-count">{data.activities.length}</span>
                  </h3>
                  <div className="dashboard-activity-feed">
                    {data.activities.map((activity, i) => (
                      <div key={i} className="dashboard-activity-item" style={{ animationDelay: `${0.1 + i * 0.05}s` }}>
                        <div className="activity-icon">
                          {activity.type === 'posts_added' ? '✓' : activity.type === 'data_refreshed' ? '↻' : '★'}
                        </div>
                        <div className="activity-content">
                          <span className="activity-message">{activity.message}</span>
                          {activity.count && <span className="activity-count-badge">+{activity.count}</span>}
                        </div>
                        <div className="activity-time">{formatTimeAgo(activity.timestamp)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Posts Tab */}
          {activeTab === 'posts' && (
            <div className="dashboard-posts-view animate-fade-in">
              <section className="dashboard-stats-grid dashboard-stats-grid-5">
                <StatCard label="Views" value={data.metrics.totalViews} />
                <StatCard label="Likes" value={data.metrics.totalLikes} />
                <StatCard label="Comments" value={data.metrics.totalComments} />
                <StatCard label="Shares" value={data.metrics.totalShares} />
                <StatCard label="Downloads" value={data.metrics.totalDownloads} />
              </section>

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
            </div>
          )}

          {/* Analytics Tab */}
          {activeTab === 'analytics' && mounted && (
            <div className="dashboard-analytics-view animate-fade-in">
              <section className="dashboard-stats-grid">
                <StatCard label="Total Views" value={data.metrics.totalViews} />
                <StatCard label="Engagement %" value={data.metrics.engagementRate} />
                <StatCard label="Total Engagement" value={data.metrics.totalEngagement} />
                <StatCard label="Avg / Post" value={data.metrics.avgViewsPerPost} />
              </section>

              <div className="dashboard-charts-grid">
                <div className="dashboard-chart-card dashboard-chart-card-large">
                  <h3 className="dashboard-chart-title">Views Over Time</h3>
                  <div className="dashboard-chart-container">
                    <AreaChart data={data.timelineData} width={600} height={200} />
                  </div>
                </div>
                <div className="dashboard-chart-card">
                  <h3 className="dashboard-chart-title">Platform Breakdown</h3>
                  <div className="dashboard-chart-container dashboard-chart-donut">
                    <DonutChart data={data.platformBreakdown} size={160} />
                  </div>
                  <div className="dashboard-chart-legend">
                    {data.platformBreakdown.map((p, i) => (
                      <div key={p.name} className="legend-item">
                        <span className="legend-color" style={{ background: ['#C4A35A', '#A8893A', '#D4B86A', '#8B7355', '#6B5B45'][i % 5] }} />
                        <span className="legend-label">{p.name}</span>
                        <span className="legend-value">{formatCompact(p.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="dashboard-engagement-section">
                <h3 className="dashboard-section-title">Engagement Breakdown</h3>
                <div className="dashboard-engagement-grid">
                  <div className="dashboard-engagement-card">
                    <div className="engagement-icon">♥</div>
                    <div className="engagement-data">
                      <div className="engagement-value">{formatCompact(data.metrics.totalLikes)}</div>
                      <div className="engagement-label">Likes</div>
                    </div>
                    <div className="engagement-rate">{data.metrics.likesRate.toFixed(2)}% of views</div>
                  </div>
                  <div className="dashboard-engagement-card">
                    <div className="engagement-icon">💬</div>
                    <div className="engagement-data">
                      <div className="engagement-value">{formatCompact(data.metrics.totalComments)}</div>
                      <div className="engagement-label">Comments</div>
                    </div>
                    <div className="engagement-rate">{data.metrics.commentsRate.toFixed(2)}% of views</div>
                  </div>
                  <div className="dashboard-engagement-card">
                    <div className="engagement-icon">↗</div>
                    <div className="engagement-data">
                      <div className="engagement-value">{formatCompact(data.metrics.totalShares)}</div>
                      <div className="engagement-label">Shares</div>
                    </div>
                    <div className="engagement-rate">{data.metrics.sharesRate.toFixed(2)}% of views</div>
                  </div>
                  <div className="dashboard-engagement-card">
                    <div className="engagement-icon">⬇</div>
                    <div className="engagement-data">
                      <div className="engagement-value">{formatCompact(data.metrics.totalDownloads)}</div>
                      <div className="engagement-label">Downloads</div>
                    </div>
                    <div className="engagement-rate">{data.metrics.downloadsRate.toFixed(2)}% of views</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="dashboard-settings-view animate-fade-in">
              <section className="dashboard-settings-section">
                <h2 className="dashboard-section-title">Campaign Settings</h2>
                <div className="dashboard-settings-card">
                  <div className="dashboard-setting-item">
                    <div className="setting-info">
                      <label className="setting-label">Campaign Name</label>
                      <p className="setting-description">The display name for this campaign</p>
                    </div>
                    <div className="setting-control">
                      <input type="text" className="dashboard-setting-input" value={campaignName} readOnly />
                    </div>
                  </div>
                  <div className="dashboard-setting-item">
                    <div className="setting-info">
                      <label className="setting-label">Status</label>
                      <p className="setting-description">Current campaign status</p>
                    </div>
                    <div className="setting-control">
                      <span className={`dashboard-status-badge status-${status}`}>
                        <span className="status-dot" />
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    </div>
                  </div>
                  {spreadsheetUrl && (
                    <div className="dashboard-setting-item">
                      <div className="setting-info">
                        <label className="setting-label">Google Sheet</label>
                        <p className="setting-description">Live data source</p>
                      </div>
                      <div className="setting-control">
                        <Link href={spreadsheetUrl} target="_blank" className="dashboard-btn dashboard-btn-secondary">
                          Open Sheet
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className="dashboard-settings-section">
                <h2 className="dashboard-section-title">Cover Image</h2>
                <div className="dashboard-settings-card">
                  <div className="dashboard-cover-upload-section">
                    <div className="dashboard-cover-preview">
                      {coverImage ? (
                        <Image
                          src={coverImage.startsWith('http') ? coverImage : `/${coverImage}`}
                          alt="Campaign cover"
                          width={200}
                          height={112}
                          className="cover-preview-image"
                        />
                      ) : (
                        <div className="cover-preview-placeholder">
                          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <path d="M21 15l-5-5L5 21"/>
                          </svg>
                          <span>No cover image</span>
                        </div>
                      )}
                    </div>
                    <div className="dashboard-cover-upload-controls">
                      <p className="setting-description">
                        Upload a cover image for this campaign. Recommended size: 800x450px (16:9 ratio).
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={handleFileUpload}
                        className="dashboard-file-input"
                        id="cover-upload"
                      />
                      <label htmlFor="cover-upload" className="dashboard-btn dashboard-btn-secondary dashboard-upload-btn">
                        {uploadStatus === 'uploading' ? (
                          <>
                            <span className="upload-spinner" />
                            Uploading...
                          </>
                        ) : (
                          'Choose Image'
                        )}
                      </label>
                      {uploadStatus === 'success' && (
                        <span className="upload-success">Image uploaded successfully!</span>
                      )}
                      {uploadStatus === 'error' && (
                        <span className="upload-error">{uploadError}</span>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="dashboard-settings-section">
                <h2 className="dashboard-section-title">Shareable Link</h2>
                <div className="dashboard-settings-card">
                  <p className="setting-description">
                    Share this link with clients to give them view-only access.
                  </p>
                  <div className="dashboard-share-link-row">
                    <input type="text" className="dashboard-share-link-input" value={shareUrl} readOnly />
                    <button onClick={copyShareLink} className="dashboard-btn dashboard-btn-secondary">
                      Copy
                    </button>
                    <Link href={shareUrl} target="_blank" className="dashboard-btn dashboard-btn-primary">
                      Open
                    </Link>
                  </div>
                </div>
              </section>

              <section className="dashboard-settings-section">
                <h2 className="dashboard-section-title">Export Data</h2>
                <div className="dashboard-settings-card">
                  <p className="setting-description">Export campaign data for reporting.</p>
                  <div className="dashboard-export-buttons">
                    <button onClick={() => exportData('csv')} className="dashboard-export-btn">
                      <span className="export-label">Export CSV</span>
                      <span className="export-description">Spreadsheet format</span>
                    </button>
                    <button onClick={() => exportData('json')} className="dashboard-export-btn">
                      <span className="export-label">Export JSON</span>
                      <span className="export-description">Data interchange</span>
                    </button>
                    <button onClick={() => window.print()} className="dashboard-export-btn">
                      <span className="export-label">Print Report</span>
                      <span className="export-description">PDF or paper</span>
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>

        <div className="dashboard-last-updated-bar">
          Last updated: {new Date(data.lastUpdated).toLocaleString()} • Auto-refreshes every 5 minutes
        </div>
      </main>
      </motion.div>
    </>
  );
}
