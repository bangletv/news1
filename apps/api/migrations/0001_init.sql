-- D1 / SQLite initial schema for TheOpenSource.news

CREATE TABLE IF NOT EXISTS sources (
  source_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  country TEXT,
  continent TEXT NOT NULL,
  language TEXT NOT NULL,
  source_priority INTEGER NOT NULL CHECK (source_priority BETWEEN 1 AND 4),
  feed_url TEXT NOT NULL,
  feed_type TEXT NOT NULL CHECK (feed_type IN ('rss', 'atom', 'sitemap')),
  license TEXT NOT NULL,
  logo_permitted INTEGER NOT NULL DEFAULT 0,
  terms_checked_at TEXT,
  robots_ok INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'disabled')),
  last_success_at TEXT,
  owner TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(source_id),
  source_priority INTEGER NOT NULL CHECK (source_priority BETWEEN 1 AND 4),
  item_index INTEGER NOT NULL,
  cluster_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_logo TEXT,
  original_language TEXT NOT NULL,
  continent TEXT NOT NULL,
  country TEXT,
  pillar TEXT NOT NULL,
  category TEXT NOT NULL,
  published_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  deadline_at TEXT,
  expires_at TEXT,
  verified_at TEXT,
  recheck_at TEXT,
  canonical_url TEXT NOT NULL,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('verified', 'held', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_items_feed ON items(verification_status, continent, pillar, category, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_cluster ON items(cluster_id, source_priority);
CREATE INDEX IF NOT EXISTS idx_items_hash ON items(content_hash);
CREATE INDEX IF NOT EXISTS idx_items_recheck ON items(verification_status, recheck_at);

CREATE TABLE IF NOT EXISTS nonces (
  nonce TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  country TEXT,
  notes TEXT NOT NULL,
  submitted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kill_switches (
  scope_key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_samples (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  link_ok INTEGER NOT NULL,
  sea_beach_ok INTEGER NOT NULL,
  category_ok INTEGER NOT NULL,
  notes TEXT,
  audited_by TEXT NOT NULL,
  audited_at TEXT NOT NULL
);
