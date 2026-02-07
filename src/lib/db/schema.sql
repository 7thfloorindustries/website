-- Social Metrics Platform Database Schema
-- Immutable metrics snapshots - NEVER deleted, only appended

-- Main snapshots table
CREATE TABLE IF NOT EXISTS metrics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Creator identification
  handle VARCHAR(255) NOT NULL,
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'twitter')),
  marketing_rep VARCHAR(255),

  -- Core metrics (nullable for platforms that don't have all)
  followers INTEGER NOT NULL DEFAULT 0,
  likes BIGINT DEFAULT 0,
  posts INTEGER DEFAULT 0,
  videos INTEGER DEFAULT 0,

  -- Timestamp (immutable - when this snapshot was taken)
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure we don't duplicate exact same snapshot
  CONSTRAINT unique_snapshot UNIQUE (handle, platform, scraped_at)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_snapshots_handle_platform ON metrics_snapshots(handle, platform);
CREATE INDEX IF NOT EXISTS idx_snapshots_handle_platform_time_desc ON metrics_snapshots(handle, platform, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_scraped_at ON metrics_snapshots(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_platform_time ON metrics_snapshots(platform, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_marketing_rep ON metrics_snapshots(marketing_rep);

-- View for latest metrics per creator (used by dashboard)
CREATE OR REPLACE VIEW latest_metrics AS
SELECT DISTINCT ON (handle, platform)
  id,
  handle,
  platform,
  marketing_rep,
  followers,
  likes,
  posts,
  videos,
  scraped_at
FROM metrics_snapshots
ORDER BY handle, platform, scraped_at DESC;

-- View for calculating deltas using window functions
CREATE OR REPLACE VIEW metrics_with_deltas AS
WITH ranked AS (
  SELECT
    id,
    handle,
    platform,
    marketing_rep,
    followers,
    likes,
    posts,
    videos,
    scraped_at,
    LAG(followers) OVER (PARTITION BY handle, platform ORDER BY scraped_at) as prev_followers,
    LAG(likes) OVER (PARTITION BY handle, platform ORDER BY scraped_at) as prev_likes,
    LAG(posts) OVER (PARTITION BY handle, platform ORDER BY scraped_at) as prev_posts,
    LAG(scraped_at) OVER (PARTITION BY handle, platform ORDER BY scraped_at) as prev_scraped_at
  FROM metrics_snapshots
)
SELECT
  id,
  handle,
  platform,
  marketing_rep,
  followers,
  likes,
  posts,
  videos,
  scraped_at,
  prev_followers,
  prev_likes,
  prev_posts,
  prev_scraped_at,
  followers - COALESCE(prev_followers, followers) as delta_followers,
  likes - COALESCE(prev_likes, likes) as delta_likes,
  posts - COALESCE(prev_posts, posts) as delta_posts,
  EXTRACT(EPOCH FROM (scraped_at - prev_scraped_at)) / 3600 as hours_since_prev
FROM ranked;
