import type { Env } from "../types";

/**
 * Sessions API utility for D1 Metadata Database
 *
 * D1 Read Replication uses Sessions API to ensure sequential consistency.
 * This wrapper provides consistent session usage for metadata operations.
 *
 * Note: Sessions API is only available via D1 bindings (not REST API).
 * User databases accessed via REST API cannot use Sessions API.
 *
 * @see https://developers.cloudflare.com/d1/best-practices/read-replication/
 */

/**
 * Session initialization modes:
 * - 'first-primary': Start session from primary (latest data, higher latency)
 * - 'first-unconstrained': Start from any replica (faster, may be slightly stale)
 * - bookmark: Start from a specific state (sequential consistency)
 */
export type SessionMode = string;

/**
 * Get a D1 session for metadata database operations.
 * Uses 'first-primary' mode to ensure we always get the latest data.
 *
 * @param env - Worker environment with METADATA binding
 * @returns D1DatabaseSession for executing queries with sequential consistency
 */
export function getMetadataSession(env: Env): D1DatabaseSession {
  // Use 'first-primary' to ensure reads see the latest writes
  // This is important for operations like:
  // - Query history (see newly executed queries immediately)
  // - Bookmark history (see newly captured bookmarks)
  // - Job tracking (see job status updates)
  return env.METADATA.withSession("first-primary");
}

/**
 * Get a session that starts from any available replica.
 * Use this for read-only operations where slight staleness is acceptable.
 *
 * @param env - Worker environment with METADATA binding
 * @returns D1DatabaseSession for executing queries
 */
export function getMetadataReadSession(env: Env): D1DatabaseSession {
  // Use 'first-unconstrained' for faster reads when latest data isn't critical
  return env.METADATA.withSession("first-unconstrained");
}

/**
 * Get a session that continues from a previous session's state.
 * Pass a bookmark from a previous session to ensure sequential consistency.
 *
 * @param env - Worker environment with METADATA binding
 * @param bookmark - Bookmark from a previous session
 * @returns D1DatabaseSession for executing queries
 */
export function getMetadataSessionFromBookmark(
  env: Env,
  bookmark: string,
): D1DatabaseSession {
  return env.METADATA.withSession(bookmark);
}

/**
 * Execute a metadata operation with session-based consistency.
 * Automatically handles session creation and bookmark retrieval.
 *
 * @param env - Worker environment with METADATA binding
 * @param operation - Function that receives the session and executes queries
 * @returns Result of the operation along with the session's final bookmark
 */
export async function withMetadataSession<T>(
  env: Env,
  operation: (session: D1DatabaseSession) => Promise<T>,
): Promise<{ result: T; bookmark: string | null }> {
  const session = getMetadataSession(env);
  const result = await operation(session);
  const bookmark = session.getBookmark();

  return { result, bookmark };
}
