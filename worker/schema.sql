-- ============================================
-- D1 Database Manager - Metadata Schema
-- ============================================
-- Authentication: Cloudflare Zero Trust (Cloudflare Access)
-- This database stores query history and saved queries
-- ============================================

-- Track managed databases (for future reference)
DROP TABLE IF EXISTS databases;
CREATE TABLE databases (
  database_id TEXT PRIMARY KEY,
  database_name TEXT NOT NULL,
  first_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Query execution history
DROP TABLE IF EXISTS query_history;
CREATE TABLE query_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  database_id TEXT NOT NULL,
  query TEXT NOT NULL,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  duration_ms REAL,
  rows_affected INTEGER,
  error TEXT,
  user_email TEXT
);

-- Index for faster queries
CREATE INDEX idx_query_history_database ON query_history(database_id, executed_at DESC);
CREATE INDEX idx_query_history_user ON query_history(user_email, executed_at DESC);

-- Saved queries
DROP TABLE IF EXISTS saved_queries;
CREATE TABLE saved_queries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  database_id TEXT,
  query TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_email TEXT,
  UNIQUE(name, user_email)
);

CREATE INDEX idx_saved_queries_user ON saved_queries(user_email);
CREATE INDEX idx_saved_queries_database ON saved_queries(database_id);

-- ============================================
-- NOTES:
-- ============================================
-- Query history is limited to last 100 queries per database
-- Saved queries are per-user
-- All dates stored in UTC
-- ============================================

