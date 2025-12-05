-- ============================================
-- Migration: Add Color Tags Tables
-- ============================================
-- Version: 1.2.0
-- Description: Adds database_colors and table_colors tables for visual organization
-- Safe to run multiple times (uses IF NOT EXISTS)
-- ============================================

-- Database color tags
CREATE TABLE IF NOT EXISTS database_colors (
  database_id TEXT PRIMARY KEY,
  color TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_database_colors_updated ON database_colors(updated_at DESC);

-- Table color tags
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

-- ============================================
-- END OF MIGRATION
-- ============================================

