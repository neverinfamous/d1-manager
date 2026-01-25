import type { Env } from "../types";
import { CF_API } from "../types";
import { logInfo, logWarning } from "./error-logger";

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
  env: Env,
): Promise<string | null> {
  try {
    logInfo(`Getting current bookmark for database: ${databaseId}`, {
      module: "time_travel",
      operation: "get_bookmark",
      databaseId,
    });

    const cfHeaders = {
      Authorization: `Bearer ${env.API_KEY}`,
      "Content-Type": "application/json",
    };

    // Call the Export API with polling mode to get the current bookmark
    // This doesn't actually start an export - it just returns the current bookmark
    const response = await fetch(
      `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${databaseId}/export`,
      {
        method: "POST",
        headers: cfHeaders,
        body: JSON.stringify({ output_format: "polling" }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      logWarning(`Export API error: ${String(response.status)} ${errorText}`, {
        module: "time_travel",
        operation: "get_bookmark",
        databaseId,
        metadata: { status: response.status, errorText },
      });
      return null;
    }

    const data: { success: boolean; result?: { at_bookmark?: string } } =
      await response.json();

    if (!data.success || !data.result?.at_bookmark) {
      logWarning(`No bookmark in response: ${JSON.stringify(data)}`, {
        module: "time_travel",
        operation: "get_bookmark",
        databaseId,
      });
      return null;
    }

    logInfo(`Got bookmark: ${data.result.at_bookmark}`, {
      module: "time_travel",
      operation: "get_bookmark",
      databaseId,
      metadata: { bookmark: data.result.at_bookmark },
    });
    return data.result.at_bookmark;
  } catch (err) {
    logWarning(
      `Error getting bookmark: ${err instanceof Error ? err.message : String(err)}`,
      {
        module: "time_travel",
        operation: "get_bookmark",
        databaseId,
        metadata: { error: err instanceof Error ? err.message : String(err) },
      },
    );
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
  userEmail?: string,
): Promise<string | null> {
  try {
    logInfo(`Capturing bookmark before operation: ${operationType}`, {
      module: "time_travel",
      operation: "capture_bookmark",
      databaseId,
      ...(databaseName ? { databaseName } : {}),
      metadata: { operationType },
    });

    // Get the current bookmark
    const bookmark = await getCurrentBookmark(databaseId, env);

    if (!bookmark) {
      logWarning(
        "Could not get bookmark - operation will proceed without checkpoint",
        {
          module: "time_travel",
          operation: "capture_bookmark",
          databaseId,
          metadata: { operationType },
        },
      );
      return null;
    }

    // Store in metadata database
    try {
      await env.METADATA.prepare(
        `INSERT INTO bookmark_history (database_id, database_name, bookmark, operation_type, description, user_email)
           VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          databaseId,
          databaseName ?? null,
          bookmark,
          operationType,
          description ?? null,
          userEmail ?? null,
        )
        .run();

      logInfo("Bookmark stored in metadata DB", {
        module: "time_travel",
        operation: "capture_bookmark",
        databaseId,
        metadata: { bookmark, operationType },
      });

      // Clean up old bookmarks (keep last 50 per database)
      await cleanupOldBookmarks(databaseId, env);
    } catch (dbErr) {
      logWarning(
        `Failed to store bookmark in metadata DB: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
        {
          module: "time_travel",
          operation: "capture_bookmark",
          databaseId,
          metadata: {
            error: dbErr instanceof Error ? dbErr.message : String(dbErr),
          },
        },
      );
      // Don't fail the operation - bookmark capture is best-effort
    }

    return bookmark;
  } catch (err) {
    logWarning(
      `Error capturing bookmark: ${err instanceof Error ? err.message : String(err)}`,
      {
        module: "time_travel",
        operation: "capture_bookmark",
        databaseId,
        metadata: { error: err instanceof Error ? err.message : String(err) },
      },
    );
    return null;
  }
}

/**
 * Get bookmark history for a database from metadata DB
 */
export async function getBookmarkHistory(
  databaseId: string,
  env: Env,
  limit = 20,
): Promise<BookmarkHistoryEntry[]> {
  try {
    const result = await env.METADATA.prepare(
      `SELECT id, database_id, database_name, bookmark, operation_type, description, captured_at, user_email
       FROM bookmark_history
       WHERE database_id = ?
       ORDER BY captured_at DESC
       LIMIT ?`,
    )
      .bind(databaseId, limit)
      .all<BookmarkHistoryEntry>();

    return result.results;
  } catch (err) {
    logWarning(
      `Error getting bookmark history: ${err instanceof Error ? err.message : String(err)}`,
      {
        module: "time_travel",
        operation: "get_history",
        databaseId,
        metadata: { error: err instanceof Error ? err.message : String(err) },
      },
    );
    return [];
  }
}

/**
 * Delete a bookmark from history
 */
export async function deleteBookmarkEntry(
  bookmarkId: number,
  env: Env,
): Promise<boolean> {
  try {
    await env.METADATA.prepare("DELETE FROM bookmark_history WHERE id = ?")
      .bind(bookmarkId)
      .run();

    return true;
  } catch (err) {
    logWarning(
      `Error deleting bookmark entry: ${err instanceof Error ? err.message : String(err)}`,
      {
        module: "time_travel",
        operation: "delete_bookmark",
        metadata: {
          bookmarkId,
          error: err instanceof Error ? err.message : String(err),
        },
      },
    );
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
  keepCount = 50,
): Promise<void> {
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
       )`,
    )
      .bind(databaseId, databaseId, keepCount)
      .run();
  } catch (err) {
    logWarning(
      `Error cleaning up old bookmarks: ${err instanceof Error ? err.message : String(err)}`,
      {
        module: "time_travel",
        operation: "cleanup_bookmarks",
        databaseId,
        metadata: {
          keepCount,
          error: err instanceof Error ? err.message : String(err),
        },
      },
    );
  }
}

/**
 * Generate CLI restore command for a bookmark
 */
export function generateRestoreCommand(
  databaseName: string,
  bookmark: string,
): string {
  return `wrangler d1 time-travel restore ${databaseName} --bookmark=${bookmark}`;
}

/**
 * Generate CLI command to get bookmark for a specific timestamp
 */
export function generateTimestampCommand(
  databaseName: string,
  timestamp: string,
): string {
  return `wrangler d1 time-travel info ${databaseName} --timestamp="${timestamp}"`;
}
