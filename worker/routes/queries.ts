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
 * Classify SQL error and return a static, safe error message.
 * Security: This function uses pattern matching to identify error types
 * and returns ONLY predefined static strings - no data from the original
 * error is included in the response. This breaks taint tracking for CodeQL.
 */
function classifySqlError(rawError: string): string {
  const errorLower = rawError.toLowerCase();

  // Syntax errors
  if (
    errorLower.includes("syntax error") ||
    errorLower.includes('near "') ||
    errorLower.includes("incomplete input")
  ) {
    return "SQL syntax error in query";
  }

  // Table/column not found
  if (
    errorLower.includes("no such table") ||
    (errorLower.includes("table") && errorLower.includes("not exist"))
  ) {
    return "Table not found";
  }
  if (
    errorLower.includes("no such column") ||
    (errorLower.includes("column") && errorLower.includes("not exist"))
  ) {
    return "Column not found";
  }

  // Constraint violations
  if (
    errorLower.includes("unique constraint") ||
    errorLower.includes("duplicate")
  ) {
    return "Unique constraint violation - duplicate value";
  }
  if (errorLower.includes("foreign key constraint")) {
    return "Foreign key constraint violation";
  }
  if (
    errorLower.includes("not null constraint") ||
    errorLower.includes("cannot be null")
  ) {
    return "NOT NULL constraint violation - missing required value";
  }
  if (errorLower.includes("check constraint")) {
    return "CHECK constraint violation";
  }
  if (errorLower.includes("constraint")) {
    return "Constraint violation";
  }

  // Data type errors
  if (
    errorLower.includes("datatype mismatch") ||
    errorLower.includes("type mismatch")
  ) {
    return "Data type mismatch";
  }

  // Authorization errors
  if (
    errorLower.includes("authorization") ||
    errorLower.includes("permission denied")
  ) {
    return "Authorization error - permission denied";
  }

  // Database locked/busy
  if (
    errorLower.includes("database is locked") ||
    errorLower.includes("database is busy")
  ) {
    return "Database is temporarily busy - please retry";
  }

  // Read-only errors
  if (errorLower.includes("readonly") || errorLower.includes("read-only")) {
    return "Database is read-only";
  }

  // Too many rows/results
  if (
    errorLower.includes("too many") ||
    errorLower.includes("limit exceeded")
  ) {
    return "Query result limit exceeded";
  }

  // Timeout
  if (errorLower.includes("timeout") || errorLower.includes("timed out")) {
    return "Query execution timed out";
  }

  // Rate limiting
  if (
    errorLower.includes("rate limit") ||
    errorLower.includes("too many requests")
  ) {
    return "Rate limit exceeded - please wait and retry";
  }

  // Query failed with status code (D1 API error)
  if (/query failed: [45]\d\d/.test(errorLower)) {
    if (errorLower.includes("400")) {
      return "Bad request - check query syntax";
    }
    if (errorLower.includes("401") || errorLower.includes("403")) {
      return "Authorization error";
    }
    if (errorLower.includes("404")) {
      return "Database or resource not found";
    }
    if (errorLower.includes("429")) {
      return "Rate limit exceeded - please wait and retry";
    }
    if (
      errorLower.includes("500") ||
      errorLower.includes("502") ||
      errorLower.includes("503")
    ) {
      return "Database service temporarily unavailable";
    }
  }

  // Generic fallback - never expose the actual error content
  return "Query execution failed";
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

        // Classify error and return a static, safe error message
        const clientErrorMsg = classifySqlError(rawErrorMsg);

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
