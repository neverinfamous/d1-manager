-- ============================================
-- D1 Database Manager - Metadata Schema
-- ============================================
-- Authentication: Cloudflare Zero Trust (Cloudflare Access)
-- This database stores query history and saved queries
-- ============================================

-- Schema version tracking for automated migrations
-- This table tracks which migrations have been applied
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  migration_name TEXT NOT NULL,
  applied_at TEXT DEFAULT (datetime('now'))
);

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

-- Undo history for rollback operations
DROP TABLE IF EXISTS undo_history;
CREATE TABLE undo_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  database_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_column TEXT,
  description TEXT NOT NULL,
  snapshot_data TEXT NOT NULL,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_email TEXT
);

CREATE INDEX idx_undo_history_database ON undo_history(database_id, executed_at DESC);
CREATE INDEX idx_undo_history_user ON undo_history(user_email, executed_at DESC);

-- Bulk operation jobs (for tracking bulk operations)
DROP TABLE IF EXISTS job_audit_events;
DROP TABLE IF EXISTS bulk_jobs;
CREATE TABLE bulk_jobs (
  job_id TEXT PRIMARY KEY,
  database_id TEXT NOT NULL,
  -- Operation types:
  -- Database: 'database_create', 'database_export', 'database_import', 'database_delete', 'database_rename', 'database_optimize'
  -- Table: 'table_create', 'table_export', 'table_delete', 'table_rename', 'table_clone', 'row_delete'
  -- Column: 'column_add', 'column_rename', 'column_modify', 'column_delete'
  -- Foreign Key: 'foreign_key_add', 'foreign_key_modify', 'foreign_key_delete'
  -- FTS5: 'fts5_create', 'fts5_create_from_table', 'fts5_delete', 'fts5_rebuild', 'fts5_optimize'
  -- Other: 'index_create', 'constraint_fix', 'undo_restore'
  operation_type TEXT NOT NULL,
  status TEXT NOT NULL, -- 'queued', 'running', 'completed', 'failed', 'cancelled'
  total_items INTEGER,
  processed_items INTEGER,
  error_count INTEGER,
  percentage REAL DEFAULT 0, -- Progress percentage (0-100)
  started_at DATETIME,
  completed_at DATETIME,
  user_email TEXT,
  metadata TEXT, -- JSON object for operation-specific data (e.g., database names, table names)
  error_message TEXT -- Error message for failed jobs
);

CREATE INDEX idx_bulk_jobs_status ON bulk_jobs(status, started_at DESC);
CREATE INDEX idx_bulk_jobs_user ON bulk_jobs(user_email, started_at DESC);
CREATE INDEX idx_bulk_jobs_database ON bulk_jobs(database_id, started_at DESC);

-- Job audit events (for tracking job lifecycle events)
CREATE TABLE job_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'started', 'progress', 'completed', 'failed', 'cancelled'
  user_email TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  details TEXT, -- JSON object with event-specific data (processed_items, error_count, percentage, error_message, etc.)
  FOREIGN KEY (job_id) REFERENCES bulk_jobs(job_id)
);

CREATE INDEX idx_job_audit_events_job_id ON job_audit_events(job_id, timestamp DESC);
CREATE INDEX idx_job_audit_events_user ON job_audit_events(user_email, timestamp DESC);

-- Time Travel bookmark history (for tracking database state before operations)
DROP TABLE IF EXISTS bookmark_history;
CREATE TABLE bookmark_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  database_id TEXT NOT NULL,
  database_name TEXT,
  bookmark TEXT NOT NULL,
  operation_type TEXT NOT NULL, -- 'manual', 'pre_drop_table', 'pre_delete_rows', 'pre_import', 'pre_rename'
  description TEXT,
  captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_email TEXT
);

CREATE INDEX idx_bookmark_history_database ON bookmark_history(database_id, captured_at DESC);
CREATE INDEX idx_bookmark_history_user ON bookmark_history(user_email, captured_at DESC);

-- Database colors for visual organization
CREATE TABLE IF NOT EXISTS database_colors (
  database_id TEXT PRIMARY KEY,
  color TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_database_colors_updated ON database_colors(updated_at DESC);

-- Table colors for visual organization (per database)
CREATE TABLE IF NOT EXISTS table_colors (
  database_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  color TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT,
  PRIMARY KEY (database_id, table_name)
);

CREATE INDEX IF NOT EXISTS idx_table_colors_database ON table_colors(database_id);
CREATE INDEX IF NOT EXISTS idx_table_colors_updated ON table_colors(updated_at DESC);

-- Webhook configurations for event notifications
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  events TEXT NOT NULL, -- JSON array of event types
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled);

-- Scheduled backup configurations for automated R2 backups
CREATE TABLE IF NOT EXISTS scheduled_backups (
  id TEXT PRIMARY KEY,
  database_id TEXT NOT NULL,
  database_name TEXT NOT NULL,
  schedule TEXT NOT NULL,        -- 'daily' | 'weekly' | 'monthly'
  day_of_week INTEGER,           -- 0-6 for weekly (0=Sunday)
  day_of_month INTEGER,          -- 1-28 for monthly
  hour INTEGER DEFAULT 0,        -- 0-23 UTC
  enabled INTEGER DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  last_job_id TEXT,              -- Reference to last backup job
  last_status TEXT,              -- 'success' | 'failed' | null
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  created_by TEXT,
  UNIQUE(database_id)            -- One schedule per database
);

CREATE INDEX IF NOT EXISTS idx_scheduled_backups_next_run 
  ON scheduled_backups(enabled, next_run_at);

CREATE INDEX IF NOT EXISTS idx_scheduled_backups_database 
  ON scheduled_backups(database_id);

-- ============================================
-- NOTES:
-- ============================================
-- Query history is limited to last 100 queries per database
-- Saved queries are per-user
-- Undo history is limited to last 10 operations per database
-- All dates stored in UTC
-- ============================================

