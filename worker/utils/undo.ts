import type { Env, UndoSnapshot, ColumnInfo, IndexInfo } from "../types";
import { sanitizeIdentifier } from "./helpers";
import { logWarning } from "./error-logger";

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

  const data: { result: { results: unknown[]; success: boolean }[] } =
    await response.json();
  const firstResult = data.result[0];
  if (!firstResult) {
    throw new Error("Empty result from D1 API");
  }
  return firstResult;
}

/**
 * Capture full table snapshot before DROP TABLE operation
 * Includes schema, indexes, and all data
 */
export async function captureTableSnapshot(
  dbId: string,
  tableName: string,
  env: Env,
): Promise<UndoSnapshot> {
  const sanitizedTable = sanitizeIdentifier(tableName);

  // 1. Get CREATE TABLE statement from sqlite_master
  const createResult = await executeQueryViaAPI(
    dbId,
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='${sanitizedTable}'`,
    env,
  );

  if (createResult.results.length === 0) {
    throw new Error(`Table ${tableName} not found`);
  }

  const createStatement = (createResult.results[0] as { sql: string }).sql;

  // 2. Get all indexes for this table
  const indexListResult = await executeQueryViaAPI(
    dbId,
    `PRAGMA index_list("${sanitizedTable}")`,
    env,
  );

  const indexes: string[] = [];
  if (indexListResult.results.length > 0) {
    for (const idx of indexListResult.results as IndexInfo[]) {
      // Skip auto-created indexes (origin 'pk' or 'u')
      if (idx.origin === "c") {
        // Get the CREATE INDEX statement
        const idxCreateResult = await executeQueryViaAPI(
          dbId,
          `SELECT sql FROM sqlite_master WHERE type='index' AND name='${idx.name}'`,
          env,
        );
        if (idxCreateResult.results.length > 0) {
          const sql = (idxCreateResult.results[0] as { sql: string | null })
            .sql;
          if (sql) {
            indexes.push(sql);
          }
        }
      }
    }
  }

  // 3. Get all table data
  const dataResult = await executeQueryViaAPI(
    dbId,
    `SELECT * FROM "${sanitizedTable}"`,
    env,
  );

  const data = dataResult.results as Record<string, unknown>[];

  // 4. Return snapshot
  return {
    operation_type: "DROP_TABLE",
    tableSchema: {
      createStatement,
      indexes,
      data,
    },
  };
}

/**
 * Capture column snapshot before DROP COLUMN operation
 * Includes column definition and all row values
 */
export async function captureColumnSnapshot(
  dbId: string,
  tableName: string,
  columnName: string,
  env: Env,
): Promise<UndoSnapshot> {
  const sanitizedTable = sanitizeIdentifier(tableName);

  // 1. Get column info from PRAGMA table_info
  const schemaResult = await executeQueryViaAPI(
    dbId,
    `PRAGMA table_info("${sanitizedTable}")`,
    env,
  );

  const columns = schemaResult.results as ColumnInfo[];
  const columnInfo = columns.find((col) => col.name === columnName);

  if (!columnInfo) {
    throw new Error(`Column ${columnName} not found in table ${tableName}`);
  }

  // 2. Get all row data with this column
  const dataResult = await executeQueryViaAPI(
    dbId,
    `SELECT * FROM "${sanitizedTable}"`,
    env,
  );

  const rowData = dataResult.results as Record<string, unknown>[];

  // 3. Return snapshot
  return {
    operation_type: "DROP_COLUMN",
    columnData: {
      columnName,
      columnType: columnInfo.type,
      notNull: columnInfo.notnull === 1,
      defaultValue: columnInfo.dflt_value,
      position: columnInfo.cid,
      rowData,
    },
  };
}

/**
 * Capture row snapshot before DELETE operation
 */
export async function captureRowSnapshot(
  dbId: string,
  tableName: string,
  whereClause: string,
  env: Env,
): Promise<UndoSnapshot> {
  const sanitizedTable = sanitizeIdentifier(tableName);

  // Get rows that will be deleted
  const query = `SELECT * FROM "${sanitizedTable}"${whereClause}`;
  const dataResult = await executeQueryViaAPI(dbId, query, env);

  const rows = dataResult.results as Record<string, unknown>[];

  return {
    operation_type: "DELETE_ROW",
    rowData: {
      whereClause,
      rows,
    },
  };
}

/**
 * Save undo snapshot to metadata database
 * Maintains 10-entry limit per database
 */
export async function saveUndoSnapshot(
  dbId: string,
  operationType: "DROP_TABLE" | "DROP_COLUMN" | "DELETE_ROW",
  targetTable: string,
  targetColumn: string | null,
  description: string,
  snapshot: UndoSnapshot,
  userEmail: string | null,
  env: Env,
): Promise<void> {
  // Serialize snapshot to JSON
  const snapshotData = JSON.stringify(snapshot);

  // Check size (warn if > 1MB)
  const sizeInBytes = new Blob([snapshotData]).size;
  if (sizeInBytes > 1024 * 1024) {
    logWarning(
      `Large snapshot detected: ${(sizeInBytes / 1024 / 1024).toFixed(2)}MB for ${targetTable}`,
      {
        module: "undo",
        operation: "save_snapshot",
        databaseId: dbId,
        metadata: {
          targetTable,
          sizeInBytes,
          sizeMB: (sizeInBytes / 1024 / 1024).toFixed(2),
        },
      },
    );
  }

  try {
    // Insert into undo_history
    const stmt = env.METADATA.prepare(
      `INSERT INTO undo_history (database_id, operation_type, target_table, target_column, description, snapshot_data, user_email)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      dbId,
      operationType,
      targetTable,
      targetColumn,
      description,
      snapshotData,
      userEmail,
    );

    await stmt.run();

    // Clean up old history (keep last 10 per database)
    const cleanupStmt = env.METADATA.prepare(
      `DELETE FROM undo_history 
       WHERE database_id = ? 
       AND id NOT IN (
         SELECT id FROM undo_history 
         WHERE database_id = ? 
         ORDER BY executed_at DESC 
         LIMIT 10
       )`,
    ).bind(dbId, dbId);

    await cleanupStmt.run();
  } catch (err) {
    // Log error but don't fail the main operation
    logWarning(
      `Failed to save undo snapshot (table may not exist yet): ${err instanceof Error ? err.message : String(err)}`,
      {
        module: "undo",
        operation: "save_snapshot",
        databaseId: dbId,
        metadata: {
          targetTable,
          operationType,
          error: err instanceof Error ? err.message : String(err),
        },
      },
    );
  }
}

/**
 * Restore from undo snapshot
 */
export async function restoreFromSnapshot(
  dbId: string,
  snapshot: UndoSnapshot,
  env: Env,
): Promise<void> {
  switch (snapshot.operation_type) {
    case "DROP_TABLE":
      await restoreDroppedTable(dbId, snapshot, env);
      break;
    case "DROP_COLUMN":
      restoreDroppedColumn(dbId, snapshot, env);
      break;
    case "DELETE_ROW":
      restoreDeletedRows(dbId, snapshot, env);
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

  // 1. Recreate table
  await executeQueryViaAPI(dbId, createStatement, env);

  // 2. Recreate indexes
  for (const indexSql of indexes) {
    try {
      await executeQueryViaAPI(dbId, indexSql, env);
    } catch (err) {
      logWarning(
        `Failed to recreate index: ${err instanceof Error ? err.message : String(err)}`,
        {
          module: "undo",
          operation: "restore_table",
          databaseId: dbId,
          metadata: {
            indexSql,
            error: err instanceof Error ? err.message : String(err),
          },
        },
      );
      // Continue even if index creation fails
    }
  }

  // 3. Re-insert data
  const firstDataRow = data[0];
  if (data.length > 0 && firstDataRow) {
    // Extract table name from CREATE statement
    const tableNameMatch =
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?/i.exec(
        createStatement,
      );
    if (!tableNameMatch?.[1]) {
      throw new Error("Could not extract table name from CREATE statement");
    }
    const tableName = tableNameMatch[1];
    const sanitizedTable = sanitizeIdentifier(tableName);

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
              if (typeof val === "bigint") return val.toString();
              // For objects/arrays, JSON stringify; for other types, serialize as JSON
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
function restoreDroppedColumn(
  _dbId: string,
  snapshot: UndoSnapshot,
  _env: Env,
): void {
  if (!snapshot.columnData) {
    throw new Error("Invalid snapshot: missing columnData");
  }

  // Extract table name - we need to get it from the snapshot or pass it separately
  // For now, we'll assume it's available in the undo_history entry
  // This is a limitation - we may need to adjust the approach

  throw new Error(
    "Column restoration requires table name - feature needs enhancement",
  );

  // TODO: Implementation would be:
  // 1. ALTER TABLE ADD COLUMN
  // 2. UPDATE rows with saved column values
  // Note: This is complex because we need the table name which isn't in the snapshot
}

/**
 * Restore deleted rows from snapshot
 */
function restoreDeletedRows(
  _dbId: string,
  snapshot: UndoSnapshot,
  _env: Env,
): void {
  if (!snapshot.rowData) {
    throw new Error("Invalid snapshot: missing rowData");
  }

  const { rows } = snapshot.rowData;

  if (rows.length === 0) {
    return; // Nothing to restore
  }

  // Extract table name from the undo_history entry (passed separately)
  // For now, throw error - we need to enhance the restore API
  throw new Error(
    "Row restoration requires table name - feature needs enhancement",
  );

  // TODO: Implementation would be:
  // 1. Get table name from undo_history entry
  // 2. Get columns from first row
  // 3. INSERT rows back into table
}
