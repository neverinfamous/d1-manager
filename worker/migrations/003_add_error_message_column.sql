-- ============================================
-- Migration: Add error_message column to bulk_jobs
-- ============================================
-- Version: 1.1.2
-- Description: Adds error_message column to bulk_jobs table for displaying error details
-- Run this migration on existing installations that have v1.1.0+ with job history
-- ============================================

-- Add error_message column to bulk_jobs (safe to run multiple times)
ALTER TABLE bulk_jobs ADD COLUMN error_message TEXT;

-- ============================================
-- END OF MIGRATION
-- ============================================

