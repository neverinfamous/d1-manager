-- Migration: Add webhooks table for external observability notifications
-- Run: npx wrangler d1 execute d1-manager-metadata --remote --file=worker/migrations/004_add_webhooks.sql

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

-- Index for querying enabled webhooks
CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled);

