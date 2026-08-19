-- Monitoring threshold configurations
CREATE TABLE IF NOT EXISTS monitoring_thresholds (
  id TEXT PRIMARY KEY,
  database_id TEXT NOT NULL,
  database_name TEXT NOT NULL,
  metric_type TEXT NOT NULL,          -- 'storage_usage' | 'query_latency' | 'error_rate' | 'row_volume' | 'analytics_unavailable'
  threshold_value REAL NOT NULL,       -- e.g. 80.0 for 80%, 200.0 for 200ms, 3.0 for consecutive failures
  comparison TEXT NOT NULL DEFAULT 'gt',
  cooldown_hours INTEGER NOT NULL DEFAULT 6,
  storage_limit_bytes INTEGER,         -- Only for storage_usage type
  enabled INTEGER NOT NULL DEFAULT 1,
  last_alert_at TEXT,
  last_value REAL,
  consecutive_failures INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_monitoring_thresholds_database 
  ON monitoring_thresholds(database_id);

CREATE INDEX IF NOT EXISTS idx_monitoring_thresholds_enabled 
  ON monitoring_thresholds(enabled, metric_type);
