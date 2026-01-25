import type { Env, QueryHistoryEntry } from "../types";
import { validateQuery, parseD1Error } from "../utils/helpers";
import {
  isProtectedDatabase,
  createProtectedDatabaseResponse,
  getDatabaseInfo,
} from "../utils/database-protection";
import { logError, logInfo, logWarning } from "../utils/error-logger";

// Helper to create response headers with CORS
function jsonHeaders(corsHeaders: HeadersInit): Headers {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json");
  return headers;
}

/**
 * Sanitize error message for client response.
 * Security: This function extracts only the SQL-relevant error message,
 * removing any stack traces, file paths, or internal details.
 * Returns a generic message if the error cannot be safely sanitized.
 */
function sanitizeErrorForClient(rawError: string): string {
  // Strip stack traces (at Function (file:line:col) patterns)
  let msg = rawError
    .replace(/\s+at\s+\S+\s+\([^)]+:\d+:\d+\)/g, "")
    .replace(/\s+at\s+[^\n]+/g, "")
    .replace(/\n\s*at\s+/g, " ")
    .trim();

  // Remove SQLite error suffixes
  msg = msg
    .replace(/: SQLITE_ERROR$/, "")
    .replace(/: SQLITE_AUTH$/, "")
    .replace(/: SQLITE_CONSTRAINT$/, "");

  // Try to extract D1 API error message
  const jsonMatch = /Query failed: \d+ - (.+)/.exec(msg);
  if (jsonMatch?.[1]) {
    try {
      const parsed = JSON.parse(jsonMatch[1]) as {
        errors?: { message?: string; error?: string }[];
      };
      const firstError = parsed.errors?.[0];
      if (firstError?.message) {
        msg = firstError.message;
      } else if (firstError?.error) {
        msg = firstError.error;
      }
    } catch {
      // Keep current msg if parse fails
    }
  }

  // Security: Remove any remaining paths or sensitive patterns
  msg = msg
    .replace(/\/[^\s:]+\.[a-z]+/gi, "[path]") // File paths
    .replace(/[A-Z]:\\[^\s:]+/gi, "[path]") // Windows paths
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "[ip]"); // IP addresses

  // Truncate to reasonable length
  if (msg.length > 500) {
    msg = msg.substring(0, 497) + "...";
  }

  // If message is empty or only whitespace, return generic error
  if (!msg.trim()) {
    return "Query execution failed";
  }

  return msg;
}

interface QueryBody {
  query: string;
  params?: unknown[];
  skipValidation?: boolean;
}

interface BatchQueryBody {
  queries: { query: string; params?: unknown[] }[];
}

interface D1ApiResponse {
  success: boolean;
  result?: {
    results: unknown[];
    meta?: Record<string, unknown>;
    success: boolean;
  }[];
  errors?: { message: string }[];
}

export async function handleQueryRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string | null,
): Promise<Response> {
  logInfo("Handling query operation", {
    module: "queries",
    operation: "request",
    ...(userEmail !== null && { userId: userEmail }),
  });

  // Extract database ID from URL (format: /api/query/:dbId/...)
  const pathParts = url.pathname.split("/");
  const dbId = pathParts[3];

  if (!dbId) {
    return new Response(
      JSON.stringify({
        error: "Database ID required",
      }),
      {
        status: 400,
        headers: jsonHeaders(corsHeaders),
      },
    );
  }

  // Check if accessing a protected database
  if (!isLocalDev) {
    const dbInfo = await getDatabaseInfo(dbId, env);
    if (dbInfo && isProtectedDatabase(dbInfo.name)) {
      logWarning(`Attempted to query protected database: ${dbInfo.name}`, {
        module: "queries",
        operation: "access_check",
        databaseId: dbId,
        databaseName: dbInfo.name,
      });
      return createProtectedDatabaseResponse(corsHeaders);
    }
  }

  try {
    // Execute query
    if (
      request.method === "POST" &&
      url.pathname === `/api/query/${dbId}/execute`
    ) {
      const body: QueryBody = await request.json();
      logInfo(`Executing query: ${body.query.substring(0, 100)}`, {
        module: "queries",
        operation: "execute",
        databaseId: dbId,
      });

      // Validate query unless explicitly skipped
      if (!body.skipValidation) {
        const validation = validateQuery(body.query);
        if (!validation.valid) {
          return new Response(
            JSON.stringify({
              error: "Query validation failed",
              warning: validation.warning,
            }),
            {
              status: 400,
              headers: jsonHeaders(corsHeaders),
            },
          );
        }
      }

      // Mock response for local development
      if (isLocalDev) {
        return new Response(
          JSON.stringify({
            result: {
              results: [
                { id: 1, name: "Mock Result 1" },
                { id: 2, name: "Mock Result 2" },
              ],
              meta: {
                duration: 0.5,
                rows_read: 2,
                rows_written: 0,
                served_by_region: "MOCK",
                served_by_primary: true,
              },
              success: true,
            },
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      const startTime = Date.now();

      try {
        // Execute query via REST API
        const result = await executeQueryViaAPI(
          dbId,
          body.query,
          body.params,
          env,
        );
        const duration = Date.now() - startTime;

        // Store in query history
        if (userEmail) {
          await storeQueryHistory(
            dbId,
            body.query,
            duration,
            (result.meta["rows_written"] as number | undefined) ?? 0,
            null,
            userEmail,
            env,
          );
        }

        return new Response(
          JSON.stringify({
            result,
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      } catch (err: unknown) {
        const duration = Date.now() - startTime;
        const rawErrorMsg = parseD1Error(err);

        // Log full error details on server
        void logError(
          env,
          rawErrorMsg,
          { module: "queries", operation: "execute", databaseId: dbId },
          isLocalDev,
        );

        // Sanitize error message for client (removes stack traces, paths, etc.)
        const clientErrorMsg = sanitizeErrorForClient(rawErrorMsg);

        // Store error in query history
        if (userEmail) {
          await storeQueryHistory(
            dbId,
            body.query,
            duration,
            0,
            clientErrorMsg,
            userEmail,
            env,
          ).catch(
            (histErr: unknown) =>
              void logError(
                env,
                histErr instanceof Error ? histErr : String(histErr),
                { module: "queries", operation: "store_history" },
                isLocalDev,
              ),
          );
        }

        // Return sanitized SQL error message to authenticated admin users
        // Note: D1 Manager is an admin tool behind Zero Trust auth
        return new Response(
          JSON.stringify({
            error: clientErrorMsg,
            message: clientErrorMsg,
          }),
          {
            status: 400,
            headers: jsonHeaders(corsHeaders),
          },
        );
      }
    }

    // Execute batch queries
    if (
      request.method === "POST" &&
      url.pathname === `/api/query/${dbId}/batch`
    ) {
      const body: BatchQueryBody = await request.json();
      logInfo(`Executing batch: ${String(body.queries.length)} queries`, {
        module: "queries",
        operation: "batch",
        databaseId: dbId,
        metadata: { queryCount: body.queries.length },
      });

      // Mock response for local development
      if (isLocalDev) {
        return new Response(
          JSON.stringify({
            result: body.queries.map(() => ({
              results: [],
              meta: { duration: 0.5, rows_read: 0, rows_written: 1 },
              success: true,
            })),
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      // Execute queries sequentially (REST API doesn't support true batch)
      const results: {
        results: unknown[];
        meta: Record<string, unknown>;
        success: boolean;
      }[] = [];
      for (const q of body.queries) {
        const result = await executeQueryViaAPI(dbId, q.query, q.params, env);
        results.push(result);
      }

      return new Response(
        JSON.stringify({
          result: results,
          success: true,
        }),
        {
          headers: jsonHeaders(corsHeaders),
        },
      );
    }

    // Get query history
    if (
      request.method === "GET" &&
      url.pathname === `/api/query/${dbId}/history`
    ) {
      const limit = parseInt(url.searchParams.get("limit") ?? "10");
      logInfo(`Getting query history, limit: ${String(limit)}`, {
        module: "queries",
        operation: "history",
        databaseId: dbId,
        metadata: { limit },
      });

      // Mock response for local development
      if (isLocalDev) {
        return new Response(
          JSON.stringify({
            result: [
              {
                id: 1,
                database_id: dbId,
                query: "SELECT * FROM users LIMIT 10",
                executed_at: new Date().toISOString(),
                duration_ms: 1.5,
                rows_affected: 10,
              },
            ],
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      // Query history from metadata database
      const stmt = env.METADATA.prepare(
        "SELECT * FROM query_history WHERE database_id = ? ORDER BY executed_at DESC LIMIT ?",
      ).bind(dbId, limit);

      const result = await stmt.all<QueryHistoryEntry>();

      return new Response(
        JSON.stringify({
          result: result.results,
          success: true,
        }),
        {
          headers: jsonHeaders(corsHeaders),
        },
      );
    }

    // Route not found
    return new Response(
      JSON.stringify({
        error: "Route not found",
      }),
      {
        status: 404,
        headers: jsonHeaders(corsHeaders),
      },
    );
  } catch (err) {
    // Log full error details on server only (never expose to client)
    void logError(
      env,
      err instanceof Error ? err : String(err),
      { module: "queries", operation: "request", databaseId: dbId },
      isLocalDev,
    );

    // Return generic static error message to client
    // Security: Never expose error details, stack traces, or database information to end users
    return new Response(
      JSON.stringify({
        error: "Query operation failed",
        message: "Unable to complete query operation. Please try again.",
      }),
      {
        status: 500,
        headers: jsonHeaders(corsHeaders),
      },
    );
  }
}

/**
 * Execute a query against a specific D1 database using the REST API
 */
async function executeQueryViaAPI(
  databaseId: string,
  query: string,
  params: unknown[] | undefined,
  env: Env,
): Promise<{
  results: unknown[];
  meta: Record<string, unknown>;
  success: boolean;
}> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sql: query,
        params: params ?? [],
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    logWarning(`Query error: ${errorText}`, {
      module: "queries",
      operation: "execute_api",
      databaseId,
      metadata: { status: response.status },
    });
    throw new Error(`Query failed: ${String(response.status)} - ${errorText}`);
  }

  const data: D1ApiResponse = await response.json();

  const firstResult = data.result?.[0];
  logInfo("D1 API response", {
    module: "queries",
    operation: "execute_api",
    databaseId,
    metadata: {
      success: data.success,
      resultLength: data.result?.length,
      firstResultSuccess: firstResult?.success,
    },
  });

  // REST API returns array of results, take the first one
  if (!firstResult) {
    throw new Error("Empty result from D1 API");
  }
  return {
    results: firstResult.results,
    meta: firstResult.meta ?? {},
    success: firstResult.success,
  };
}

/**
 * Store query execution in history
 */
async function storeQueryHistory(
  databaseId: string,
  query: string,
  durationMs: number,
  rowsAffected: number,
  error: string | null,
  userEmail: string,
  env: Env,
): Promise<void> {
  try {
    const stmt = env.METADATA.prepare(
      `INSERT INTO query_history 
       (database_id, query, duration_ms, rows_affected, error, user_email) 
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(databaseId, query, durationMs, rowsAffected, error, userEmail);

    await stmt.run();

    // Clean up old history (keep last 100 per database)
    const cleanupStmt = env.METADATA.prepare(
      `DELETE FROM query_history 
       WHERE database_id = ? 
       AND id NOT IN (
         SELECT id FROM query_history 
         WHERE database_id = ? 
         ORDER BY executed_at DESC 
         LIMIT 100
       )`,
    ).bind(databaseId, databaseId);

    await cleanupStmt.run();
  } catch (err) {
    logWarning(
      `Failed to store query history: ${err instanceof Error ? err.message : String(err)}`,
      { module: "queries", operation: "store_history", databaseId },
    );
    // Don't fail the request if history storage fails
  }
}
