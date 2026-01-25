import type { Env, UndoHistoryEntry, UndoSnapshot } from "../types";
import { sanitizeIdentifier } from "../utils/helpers";
import {
  isProtectedDatabase,
  createProtectedDatabaseResponse,
  getDatabaseInfo,
} from "../utils/database-protection";
import {
  OperationType,
  startJobTracking,
  finishJobTracking,
} from "../utils/job-tracking";
import { logError, logInfo, logWarning } from "../utils/error-logger";

// Helper to create response headers with CORS
function jsonHeaders(corsHeaders: HeadersInit): HeadersInit {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json");
  return headers;
}

const CF_API = "https://api.cloudflare.com/client/v4";

/**
 * Execute a query on a D1 database via REST API
 */
async function executeQueryViaAPI(
  dbId: string,
  query: string,
  env: Env,
  params?: unknown[],
): Promise<{
  results: unknown[];
  meta?: Record<string, unknown>;
  success: boolean;
}> {
  const cfHeaders = {
    Authorization: `Bearer ${env.API_KEY}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(
    `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}/query`,
    {
      method: "POST",
      headers: cfHeaders,
      body: JSON.stringify({
        sql: query,
        params: params ?? [],
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Query failed: ${errorText}`);
  }

  const data: {
    result: {
      results: unknown[];
      meta?: Record<string, unknown>;
      success: boolean;
    }[];
  } = await response.json();
  const firstResult = data.result[0];
  if (!firstResult) {
    throw new Error("Empty result from D1 API");
  }
  return firstResult;
}

/**
 * Handle undo-related routes
 */
export async function handleUndoRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string | null,
): Promise<Response> {
  logInfo("Handling undo operation", {
    module: "undo",
    operation: "request",
    ...(userEmail !== null && { userId: userEmail }),
  });

  // Extract database ID from URL (format: /api/undo/:dbId/...)
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
      logWarning(`Attempted to access protected database: ${dbInfo.name}`, {
        module: "undo",
        operation: "access_check",
        databaseId: dbId,
        databaseName: dbInfo.name,
      });
      return createProtectedDatabaseResponse(corsHeaders);
    }
  }

  try {
    // GET /api/undo/:dbId/history - List undo history for database
    if (
      request.method === "GET" &&
      url.pathname === `/api/undo/${dbId}/history`
    ) {
      logInfo(`Getting history for database: ${dbId}`, {
        module: "undo",
        operation: "history",
        databaseId: dbId,
      });

      // Mock response for local development
      if (isLocalDev) {
        const mockHistory: Omit<UndoHistoryEntry, "snapshot_data">[] = [
          {
            id: 1,
            database_id: dbId,
            operation_type: "DROP_TABLE",
            target_table: "users",
            description: 'Dropped table "users"',
            executed_at: new Date(Date.now() - 3600000).toISOString(),
            user_email: "dev@localhost",
          },
          {
            id: 2,
            database_id: dbId,
            operation_type: "DELETE_ROW",
            target_table: "posts",
            description: 'Deleted 5 row(s) from table "posts"',
            executed_at: new Date(Date.now() - 1800000).toISOString(),
            user_email: "dev@localhost",
          },
        ];

        return new Response(
          JSON.stringify({
            history: mockHistory,
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      // Query undo history from metadata database
      try {
        const stmt = env.METADATA.prepare(
          `SELECT id, database_id, operation_type, target_table, target_column, description, executed_at, user_email
           FROM undo_history
           WHERE database_id = ?
           ORDER BY executed_at DESC
           LIMIT 10`,
        ).bind(dbId);

        const result = await stmt.all();
        const history = result.results as Omit<
          UndoHistoryEntry,
          "snapshot_data"
        >[];

        return new Response(
          JSON.stringify({
            history,
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      } catch {
        // If table doesn't exist yet, return empty history
        logInfo("Table may not exist yet, returning empty history", {
          module: "undo",
          operation: "history",
          databaseId: dbId,
        });
        return new Response(
          JSON.stringify({
            history: [],
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      }
    }

    // POST /api/undo/:dbId/restore/:undoId - Restore from undo snapshot
    if (
      request.method === "POST" &&
      /^\/api\/undo\/[^/]+\/restore\/\d+$/.exec(url.pathname)
    ) {
      const undoId = parseInt(pathParts[5] ?? "", 10);
      logInfo(`Restoring from undo ID: ${undoId}`, {
        module: "undo",
        operation: "restore",
        databaseId: dbId,
        metadata: { undoId },
      });

      // Mock response for local development
      if (isLocalDev) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Mock restore completed",
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      // Get the undo entry
      let result: UndoHistoryEntry | null = null;
      try {
        const stmt = env.METADATA.prepare(
          `SELECT * FROM undo_history WHERE id = ? AND database_id = ?`,
        ).bind(undoId, dbId);

        result = await stmt.first();
      } catch {
        logInfo("Table may not exist yet", {
          module: "undo",
          operation: "restore",
          databaseId: dbId,
        });
        return new Response(
          JSON.stringify({
            error: "Undo entry not found",
          }),
          {
            status: 404,
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      if (!result) {
        return new Response(
          JSON.stringify({
            error: "Undo entry not found",
          }),
          {
            status: 404,
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      // Parse snapshot
      const snapshot = JSON.parse(result.snapshot_data) as UndoSnapshot;

      // Start job tracking
      const jobId = await startJobTracking(
        env,
        OperationType.UNDO_RESTORE,
        dbId,
        userEmail ?? "unknown",
        isLocalDev,
        {
          undoId,
          tableName: result.target_table,
          operationType: snapshot.operation_type,
        },
      );

      // Restore based on operation type
      try {
        await restoreFromSnapshot(dbId, result.target_table, snapshot, env);

        // Delete the undo entry after successful restore
        const deleteStmt = env.METADATA.prepare(
          `DELETE FROM undo_history WHERE id = ?`,
        ).bind(undoId);
        await deleteStmt.run();

        // Complete job tracking
        await finishJobTracking(
          env,
          jobId,
          "completed",
          userEmail ?? "unknown",
          isLocalDev,
          { processedItems: 1, errorCount: 0 },
        );

        return new Response(
          JSON.stringify({
            success: true,
            message: `Successfully restored ${result.description}`,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      } catch (restoreErr) {
        void logError(
          env,
          restoreErr instanceof Error ? restoreErr : String(restoreErr),
          {
            module: "undo",
            operation: "restore",
            databaseId: dbId,
            metadata: { undoId },
          },
          isLocalDev,
        );

        // Mark job as failed
        await finishJobTracking(
          env,
          jobId,
          "failed",
          userEmail ?? "unknown",
          isLocalDev,
          {
            processedItems: 0,
            errorCount: 1,
            errorMessage:
              restoreErr instanceof Error
                ? restoreErr.message
                : "Unknown error",
          },
        );

        return new Response(
          JSON.stringify({
            error: "Restore operation failed",
            message:
              "Unable to restore the selected operation. Please try again or contact support if the issue persists.",
          }),
          {
            status: 500,
            headers: jsonHeaders(corsHeaders),
          },
        );
      }
    }

    // DELETE /api/undo/:dbId/clear - Clear undo history for database
    if (
      request.method === "DELETE" &&
      url.pathname === `/api/undo/${dbId}/clear`
    ) {
      logInfo(`Clearing history for database: ${dbId}`, {
        module: "undo",
        operation: "clear",
        databaseId: dbId,
      });

      // Mock response for local development
      if (isLocalDev) {
        return new Response(
          JSON.stringify({
            success: true,
            cleared: 5,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      // Delete all undo history for this database
      try {
        const stmt = env.METADATA.prepare(
          `DELETE FROM undo_history WHERE database_id = ?`,
        ).bind(dbId);

        const result = await stmt.run();

        return new Response(
          JSON.stringify({
            success: true,
            cleared: result.meta.changes,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      } catch {
        // If table doesn't exist yet, return success with 0 cleared
        logInfo("Table may not exist yet", {
          module: "undo",
          operation: "clear",
          databaseId: dbId,
        });
        return new Response(
          JSON.stringify({
            success: true,
            cleared: 0,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      }
    }

    // Unknown endpoint
    return new Response(
      JSON.stringify({
        error: "Unknown undo endpoint",
      }),
      {
        status: 404,
        headers: jsonHeaders(corsHeaders),
      },
    );
  } catch (err) {
    void logError(
      env,
      err instanceof Error ? err : String(err),
      { module: "undo", operation: "request", databaseId: dbId },
      isLocalDev,
    );
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message:
          "An unexpected error occurred while processing your request. Please try again later.",
      }),
      {
        status: 500,
        headers: jsonHeaders(corsHeaders),
      },
    );
  }
}

/**
 * Restore from undo snapshot
 */
async function restoreFromSnapshot(
  dbId: string,
  tableName: string,
  snapshot: UndoSnapshot,
  env: Env,
): Promise<void> {
  switch (snapshot.operation_type) {
    case "DROP_TABLE":
      await restoreDroppedTable(dbId, snapshot, env);
      break;
    case "DROP_COLUMN":
      await restoreDroppedColumn(dbId, tableName, snapshot, env);
      break;
    case "DELETE_ROW":
      await restoreDeletedRows(dbId, tableName, snapshot, env);
      break;
    default:
      throw new Error(
        `Unknown operation type: ${String(snapshot.operation_type)}`,
      );
  }
}

/**
 * Restore a dropped table from snapshot
 */
async function restoreDroppedTable(
  dbId: string,
  snapshot: UndoSnapshot,
  env: Env,
): Promise<void> {
  if (!snapshot.tableSchema) {
    throw new Error("Invalid snapshot: missing tableSchema");
  }

  const { createStatement, indexes, data } = snapshot.tableSchema;

  // Extract table name from CREATE statement first
  // Handles both regular tables (CREATE TABLE) and virtual tables (CREATE VIRTUAL TABLE for FTS5)
  const tableNameMatch =
    /CREATE\s+(?:VIRTUAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?/i.exec(
      createStatement,
    );
  if (!tableNameMatch?.[1]) {
    throw new Error(
      `Could not extract table name from CREATE statement: ${createStatement.substring(0, 100)}`,
    );
  }
  const tableName = tableNameMatch[1];
  const sanitizedTable = sanitizeIdentifier(tableName);

  // 1. Drop existing table if it exists (for STRICT mode undo and similar cases)
  // This replaces the modified version with the original
  try {
    await executeQueryViaAPI(
      dbId,
      `DROP TABLE IF EXISTS "${sanitizedTable}"`,
      env,
    );
  } catch (dropErr) {
    logWarning(
      `Failed to drop existing table before restore: ${dropErr instanceof Error ? dropErr.message : String(dropErr)}`,
      { module: "undo", operation: "restore_table" },
    );
    // Continue - the CREATE might still work if table doesn't exist
  }

  // 2. Recreate table
  await executeQueryViaAPI(dbId, createStatement, env);

  // 3. Recreate indexes
  for (const indexSql of indexes) {
    try {
      await executeQueryViaAPI(dbId, indexSql, env);
    } catch (err) {
      logWarning(
        `Failed to recreate index: ${err instanceof Error ? err.message : String(err)}`,
        { module: "undo", operation: "restore_table" },
      );
      // Continue even if index creation fails
    }
  }

  // 4. Re-insert data
  const firstDataRow = data[0];
  if (data.length > 0 && firstDataRow) {
    // Get columns from first row
    const columns = Object.keys(firstDataRow);
    const columnsList = columns
      .map((col) => `"${sanitizeIdentifier(col)}"`)
      .join(", ");

    // Insert data in batches of 50 rows
    const batchSize = 50;
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);

      const values = batch
        .map((row) => {
          const rowValues = columns
            .map((col) => {
              const val = row[col];
              if (val === null) return "NULL";
              if (typeof val === "number") return val.toString();
              if (typeof val === "string")
                return `'${val.replace(/'/g, "''")}'`;
              if (typeof val === "boolean") return val ? "1" : "0";
              const strVal =
                typeof val === "object"
                  ? JSON.stringify(val)
                  : JSON.stringify(val);
              return `'${strVal.replace(/'/g, "''")}'`;
            })
            .join(", ");
          return `(${rowValues})`;
        })
        .join(", ");

      const insertQuery = `INSERT INTO "${sanitizedTable}" (${columnsList}) VALUES ${values}`;
      await executeQueryViaAPI(dbId, insertQuery, env);
    }
  }
}

/**
 * Restore a dropped column from snapshot
 */
async function restoreDroppedColumn(
  dbId: string,
  tableName: string,
  snapshot: UndoSnapshot,
  env: Env,
): Promise<void> {
  if (!snapshot.columnData) {
    throw new Error("Invalid snapshot: missing columnData");
  }

  const { columnName, columnType, notNull, defaultValue, rowData } =
    snapshot.columnData;
  const sanitizedTable = sanitizeIdentifier(tableName);
  const sanitizedColumn = sanitizeIdentifier(columnName);

  // 1. Add the column back
  let alterQuery = `ALTER TABLE "${sanitizedTable}" ADD COLUMN "${sanitizedColumn}" ${columnType}`;
  if (notNull) {
    alterQuery += " NOT NULL";
  }
  if (defaultValue !== null) {
    alterQuery += ` DEFAULT ${defaultValue}`;
  }

  await executeQueryViaAPI(dbId, alterQuery, env);

  // 2. Update rows with saved column values
  if (rowData.length > 0) {
    // Get primary key column(s) to identify rows
    const schemaResult = await executeQueryViaAPI(
      dbId,
      `PRAGMA table_info("${sanitizedTable}")`,
      env,
    );
    const columns = schemaResult.results as { name: string; pk: number }[];
    const pkColumns = columns
      .filter((col) => col.pk > 0)
      .map((col) => col.name);

    if (pkColumns.length === 0) {
      logWarning("No primary key found, cannot restore column values", {
        module: "undo",
        operation: "restore_column",
      });
      return;
    }

    // Update each row
    for (const row of rowData) {
      const columnValue = row[columnName];
      if (columnValue === undefined) continue;

      // Build WHERE clause using primary key(s)
      const whereConditions = pkColumns
        .map((pk) => {
          const pkValue = row[pk];
          if (pkValue === null) return `"${sanitizeIdentifier(pk)}" IS NULL`;
          if (typeof pkValue === "number")
            return `"${sanitizeIdentifier(pk)}" = ${String(pkValue)}`;
          if (typeof pkValue === "string")
            return `"${sanitizeIdentifier(pk)}" = '${pkValue.replace(/'/g, "''")}'`;
          const strPkVal =
            typeof pkValue === "object"
              ? JSON.stringify(pkValue)
              : JSON.stringify(pkValue);
          return `"${sanitizeIdentifier(pk)}" = '${strPkVal.replace(/'/g, "''")}'`;
        })
        .join(" AND ");

      // Build SET clause
      const setValue =
        columnValue === null
          ? "NULL"
          : typeof columnValue === "number"
            ? columnValue.toString()
            : typeof columnValue === "string"
              ? `'${columnValue.replace(/'/g, "''")}'`
              : `'${(typeof columnValue === "object" ? JSON.stringify(columnValue) : JSON.stringify(columnValue)).replace(/'/g, "''")}'`;

      const updateQuery = `UPDATE "${sanitizedTable}" SET "${sanitizedColumn}" = ${setValue} WHERE ${whereConditions}`;
      await executeQueryViaAPI(dbId, updateQuery, env);
    }
  }
}

/**
 * Restore deleted rows from snapshot
 */
async function restoreDeletedRows(
  dbId: string,
  tableName: string,
  snapshot: UndoSnapshot,
  env: Env,
): Promise<void> {
  if (!snapshot.rowData) {
    throw new Error("Invalid snapshot: missing rowData");
  }

  const { rows } = snapshot.rowData;
  const firstRow = rows[0];

  if (rows.length === 0 || !firstRow) {
    return; // Nothing to restore
  }

  const sanitizedTable = sanitizeIdentifier(tableName);

  // Get columns from first row
  const columns = Object.keys(firstRow);
  const columnsList = columns
    .map((col) => `"${sanitizeIdentifier(col)}"`)
    .join(", ");

  // Insert rows back into table in batches
  const batchSize = 50;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    const values = batch
      .map((row) => {
        const rowValues = columns
          .map((col) => {
            const val = row[col];
            if (val === null) return "NULL";
            if (typeof val === "number") return val.toString();
            if (typeof val === "string") return `'${val.replace(/'/g, "''")}'`;
            if (typeof val === "boolean") return val ? "1" : "0";
            const strVal =
              typeof val === "object"
                ? JSON.stringify(val)
                : JSON.stringify(val);
            return `'${strVal.replace(/'/g, "''")}'`;
          })
          .join(", ");
        return `(${rowValues})`;
      })
      .join(", ");

    const insertQuery = `INSERT INTO "${sanitizedTable}" (${columnsList}) VALUES ${values}`;
    await executeQueryViaAPI(dbId, insertQuery, env);
  }
}
