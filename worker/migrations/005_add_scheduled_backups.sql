-- Migration 005: Add scheduled backups table
-- Enables automated R2 backups on daily, weekly, or monthly schedules

-- Scheduled backup configurations
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

