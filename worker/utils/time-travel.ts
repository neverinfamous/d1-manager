import type { Env } from '../types';
import { CF_API } from '../types';

/**
 * Time Travel utility functions for D1 databases
 * 
 * Bookmarks are D1's mechanism for point-in-time recovery.
 * They are lexicographically sortable and derived deterministically from timestamps.
 * Format: 00000085-0000024c-00004c6d-8e61117bf38d7adb71b934ebbf891683
 */

export interface BookmarkInfo {
  bookmark: string;
  capturedAt: string;
  databaseId: string;
  databaseName?: string;
}

export interface BookmarkHistoryEntry {
  id: number;
  database_id: string;
  database_name: string | null;
  bookmark: string;
  operation_type: string;
  description: string | null;
  captured_at: string;
  user_email: string | null;
}

/**
 * Get the current bookmark for a database by calling the Export API
 * The Export API returns at_bookmark in its initial response
 */
export async function getCurrentBookmark(
  databaseId: string,
  env: Env
): Promise<string | null> {
  try {
    console.log('[TimeTravel] Getting current bookmark for database:', databaseId);
    
    const cfHeaders = {
      'Authorization': `Bearer ${env.API_KEY}`,
      'Content-Type': 'application/json'
    };

    // Call the Export API with polling mode to get the current bookmark
    // This doesn't actually start an export - it just returns the current bookmark
    const response = await fetch(
      `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${databaseId}/export`,
      {
        method: 'POST',
        headers: cfHeaders,
        body: JSON.stringify({ output_format: 'polling' })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[TimeTravel] Export API error:', response.status, errorText);
      return null;
    }

    const data = await response.json() as {
      result: {
        at_bookmark?: string;
        status?: string;
      };
      success: boolean;
    };

    if (!data.success || !data.result?.at_bookmark) {
      console.error('[TimeTravel] No bookmark in response:', JSON.stringify(data));
      return null;
    }

    console.log('[TimeTravel] Got bookmark:', data.result.at_bookmark);
    return data.result.at_bookmark;
  } catch (err) {
    console.error('[TimeTravel] Error getting bookmark:', err);
    return null;
  }
}

/**
 * Capture a bookmark before a destructive operation and store it in metadata DB
 * This allows users to restore to the point just before the operation
 */
export async function captureBookmark(
  databaseId: string,
  databaseName: string | undefined,
  env: Env,
  operationType: string,
  description?: string,
  userEmail?: string
): Promise<string | null> {
  try {
    console.log('[TimeTravel] Capturing bookmark before operation:', operationType);
    
    // Get the current bookmark
    const bookmark = await getCurrentBookmark(databaseId, env);
    
    if (!bookmark) {
      console.warn('[TimeTravel] Could not get bookmark - operation will proceed without checkpoint');
      return null;
    }

    // Store in metadata database if available
    if (env.METADATA) {
      try {
        await env.METADATA.prepare(
          `INSERT INTO bookmark_history (database_id, database_name, bookmark, operation_type, description, user_email)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(
          databaseId,
          databaseName || null,
          bookmark,
          operationType,
          description || null,
          userEmail || null
        ).run();
        
        console.log('[TimeTravel] Bookmark stored in metadata DB');
        
        // Clean up old bookmarks (keep last 50 per database)
        await cleanupOldBookmarks(databaseId, env);
      } catch (dbErr) {
        console.error('[TimeTravel] Failed to store bookmark in metadata DB:', dbErr);
        // Don't fail the operation - bookmark capture is best-effort
      }
    }

    return bookmark;
  } catch (err) {
    console.error('[TimeTravel] Error capturing bookmark:', err);
    return null;
  }
}

/**
 * Get bookmark history for a database from metadata DB
 */
export async function getBookmarkHistory(
  databaseId: string,
  env: Env,
  limit: number = 20
): Promise<BookmarkHistoryEntry[]> {
  if (!env.METADATA) {
    return [];
  }

  try {
    const result = await env.METADATA.prepare(
      `SELECT id, database_id, database_name, bookmark, operation_type, description, captured_at, user_email
       FROM bookmark_history
       WHERE database_id = ?
       ORDER BY captured_at DESC
       LIMIT ?`
    ).bind(databaseId, limit).all<BookmarkHistoryEntry>();

    return result.results || [];
  } catch (err) {
    console.error('[TimeTravel] Error getting bookmark history:', err);
    return [];
  }
}

/**
 * Delete a bookmark from history
 */
export async function deleteBookmarkEntry(
  bookmarkId: number,
  env: Env
): Promise<boolean> {
  if (!env.METADATA) {
    return false;
  }

  try {
    await env.METADATA.prepare(
      'DELETE FROM bookmark_history WHERE id = ?'
    ).bind(bookmarkId).run();
    
    return true;
  } catch (err) {
    console.error('[TimeTravel] Error deleting bookmark entry:', err);
    return false;
  }
}

/**
 * Clean up old bookmarks to prevent unbounded growth
 * Keeps the most recent N bookmarks per database
 */
async function cleanupOldBookmarks(
  databaseId: string,
  env: Env,
  keepCount: number = 50
): Promise<void> {
  if (!env.METADATA) {
    return;
  }

  try {
    // Delete old bookmarks beyond the keep limit
    await env.METADATA.prepare(
      `DELETE FROM bookmark_history 
       WHERE database_id = ? 
       AND id NOT IN (
         SELECT id FROM bookmark_history 
         WHERE database_id = ? 
         ORDER BY captured_at DESC 
         LIMIT ?
       )`
    ).bind(databaseId, databaseId, keepCount).run();
  } catch (err) {
    console.error('[TimeTravel] Error cleaning up old bookmarks:', err);
  }
}

/**
 * Generate CLI restore command for a bookmark
 */
export function generateRestoreCommand(
  databaseName: string,
  bookmark: string
): string {
  return `wrangler d1 time-travel restore ${databaseName} --bookmark=${bookmark}`;
}

/**
 * Generate CLI command to get bookmark for a specific timestamp
 */
export function generateTimestampCommand(
  databaseName: string,
  timestamp: string
): string {
  return `wrangler d1 time-travel info ${databaseName} --timestamp="${timestamp}"`;
}

