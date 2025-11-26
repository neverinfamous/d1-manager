-- ============================================
-- Migration: Add Job History Tables
-- ============================================
-- Version: 1.1.0
-- Description: Adds bulk_jobs and job_audit_events tables for job history tracking
-- Run this migration on existing installations to add job history support
-- ============================================

-- Bulk operation jobs (for tracking bulk operations)
CREATE TABLE IF NOT EXISTS bulk_jobs (
  job_id TEXT PRIMARY KEY,
  database_id TEXT NOT NULL,
  operation_type TEXT NOT NULL, -- 'database_export', 'database_import', 'database_delete', 'database_rename', 'database_optimize', 'table_export', 'table_delete', 'table_clone'
  status TEXT NOT NULL, -- 'queued', 'running', 'completed', 'failed', 'cancelled'
  total_items INTEGER,
  processed_items INTEGER,
  error_count INTEGER,
  percentage REAL DEFAULT 0, -- Progress percentage (0-100)
  started_at DATETIME,
  completed_at DATETIME,
  user_email TEXT,
  metadata TEXT -- JSON object for operation-specific data (e.g., database names, table names)
);

CREATE INDEX IF NOT EXISTS idx_bulk_jobs_status ON bulk_jobs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulk_jobs_user ON bulk_jobs(user_email, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulk_jobs_database ON bulk_jobs(database_id, started_at DESC);

-- Job audit events (for tracking job lifecycle events)
CREATE TABLE IF NOT EXISTS job_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'started', 'progress', 'completed', 'failed', 'cancelled'
  user_email TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  details TEXT, -- JSON object with event-specific data (processed_items, error_count, percentage, error_message, etc.)
  FOREIGN KEY (job_id) REFERENCES bulk_jobs(job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_audit_events_job_id ON job_audit_events(job_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_job_audit_events_user ON job_audit_events(user_email, timestamp DESC);

-- ============================================
-- END OF MIGRATION
-- ============================================

