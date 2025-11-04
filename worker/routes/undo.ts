import type { Env, UndoHistoryEntry, UndoSnapshot } from '../types';
import { sanitizeIdentifier } from '../utils/helpers';

const CF_API = 'https://api.cloudflare.com/client/v4';

/**
 * Execute a query on a D1 database via REST API
 */
async function executeQueryViaAPI(
  dbId: string,
  query: string,
  env: Env,
  params?: unknown[]
): Promise<{ results: unknown[]; meta?: Record<string, unknown>; success: boolean }> {
  const cfHeaders = {
    'Authorization': `Bearer ${env.API_KEY}`,
    'Content-Type': 'application/json'
  };

  const response = await fetch(
    `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}/query`,
    {
      method: 'POST',
      headers: cfHeaders,
      body: JSON.stringify({
        sql: query,
        params: params || []
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Query failed: ${errorText}`);
  }

  const data = await response.json() as { result: Array<{ results: unknown[]; meta?: Record<string, unknown>; success: boolean }> };
  return data.result[0];
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
  _userEmail: string | null // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<Response> {
  console.log('[Undo] Handling undo operation');

  // Extract database ID from URL (format: /api/undo/:dbId/...)
  const pathParts = url.pathname.split('/');
  const dbId = pathParts[3];

  if (!dbId) {
    return new Response(JSON.stringify({
      error: 'Database ID required'
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }

  try {
    // GET /api/undo/:dbId/history - List undo history for database
    if (request.method === 'GET' && url.pathname === `/api/undo/${dbId}/history`) {
      console.log('[Undo] Getting history for database:', dbId);

      // Mock response for local development
      if (isLocalDev) {
        const mockHistory: Omit<UndoHistoryEntry, 'snapshot_data'>[] = [
          {
            id: 1,
            database_id: dbId,
            operation_type: 'DROP_TABLE',
            target_table: 'users',
            description: 'Dropped table "users"',
            executed_at: new Date(Date.now() - 3600000).toISOString(),
            user_email: 'dev@localhost'
          },
          {
            id: 2,
            database_id: dbId,
            operation_type: 'DELETE_ROW',
            target_table: 'posts',
            description: 'Deleted 5 row(s) from table "posts"',
            executed_at: new Date(Date.now() - 1800000).toISOString(),
            user_email: 'dev@localhost'
          }
        ];

        return new Response(JSON.stringify({
          history: mockHistory,
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // Query undo history from metadata database
      const stmt = env.METADATA.prepare(
        `SELECT id, database_id, operation_type, target_table, target_column, description, executed_at, user_email
         FROM undo_history
         WHERE database_id = ?
         ORDER BY executed_at DESC
         LIMIT 10`
      ).bind(dbId);

      const result = await stmt.all();
      const history = result.results as Omit<UndoHistoryEntry, 'snapshot_data'>[];

      return new Response(JSON.stringify({
        history,
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // POST /api/undo/:dbId/restore/:undoId - Restore from undo snapshot
    if (request.method === 'POST' && url.pathname.match(/^\/api\/undo\/[^/]+\/restore\/\d+$/)) {
      const undoId = parseInt(pathParts[5], 10);
      console.log('[Undo] Restoring from undo ID:', undoId);

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          success: true,
          message: 'Mock restore completed'
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // Get the undo entry
      const stmt = env.METADATA.prepare(
        `SELECT * FROM undo_history WHERE id = ? AND database_id = ?`
      ).bind(undoId, dbId);

      const result = await stmt.first() as UndoHistoryEntry | null;

      if (!result) {
        return new Response(JSON.stringify({
          error: 'Undo entry not found'
        }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // Parse snapshot
      const snapshot: UndoSnapshot = JSON.parse(result.snapshot_data);

      // Restore based on operation type
      try {
        await restoreFromSnapshot(dbId, result.target_table, snapshot, env);

        // Delete the undo entry after successful restore
        const deleteStmt = env.METADATA.prepare(
          `DELETE FROM undo_history WHERE id = ?`
        ).bind(undoId);
        await deleteStmt.run();

        return new Response(JSON.stringify({
          success: true,
          message: `Successfully restored ${result.description}`
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      } catch (restoreErr) {
        console.error('[Undo] Restore failed:', restoreErr);
        return new Response(JSON.stringify({
          error: 'Restore failed',
          details: restoreErr instanceof Error ? restoreErr.message : String(restoreErr)
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // DELETE /api/undo/:dbId/clear - Clear undo history for database
    if (request.method === 'DELETE' && url.pathname === `/api/undo/${dbId}/clear`) {
      console.log('[Undo] Clearing history for database:', dbId);

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          success: true,
          cleared: 5
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // Delete all undo history for this database
      const stmt = env.METADATA.prepare(
        `DELETE FROM undo_history WHERE database_id = ?`
      ).bind(dbId);

      const result = await stmt.run();

      return new Response(JSON.stringify({
        success: true,
        cleared: result.meta.changes
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Unknown endpoint
    return new Response(JSON.stringify({
      error: 'Unknown undo endpoint'
    }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (err) {
    console.error('[Undo] Error:', err);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: err instanceof Error ? err.message : String(err)
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}

/**
 * Restore from undo snapshot
 */
async function restoreFromSnapshot(
  dbId: string,
  tableName: string,
  snapshot: UndoSnapshot,
  env: Env
): Promise<void> {
  switch (snapshot.operation_type) {
    case 'DROP_TABLE':
      await restoreDroppedTable(dbId, snapshot, env);
      break;
    case 'DROP_COLUMN':
      await restoreDroppedColumn(dbId, tableName, snapshot, env);
      break;
    case 'DELETE_ROW':
      await restoreDeletedRows(dbId, tableName, snapshot, env);
      break;
    default:
      throw new Error(`Unknown operation type: ${snapshot.operation_type}`);
  }
}

/**
 * Restore a dropped table from snapshot
 */
async function restoreDroppedTable(
  dbId: string,
  snapshot: UndoSnapshot,
  env: Env
): Promise<void> {
  if (!snapshot.tableSchema) {
    throw new Error('Invalid snapshot: missing tableSchema');
  }

  const { createStatement, indexes, data } = snapshot.tableSchema;

  // 1. Recreate table
  await executeQueryViaAPI(dbId, createStatement, env);

  // 2. Recreate indexes
  for (const indexSql of indexes) {
    try {
      await executeQueryViaAPI(dbId, indexSql, env);
    } catch (err) {
      console.error('[Undo] Failed to recreate index:', err);
      // Continue even if index creation fails
    }
  }

  // 3. Re-insert data
  if (data && data.length > 0) {
    // Extract table name from CREATE statement
    const tableNameMatch = createStatement.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?/i);
    if (!tableNameMatch) {
      throw new Error('Could not extract table name from CREATE statement');
    }
    const tableName = tableNameMatch[1];
    const sanitizedTable = sanitizeIdentifier(tableName);

    // Get columns from first row
    const columns = Object.keys(data[0]);
    const columnsList = columns.map(col => `"${sanitizeIdentifier(col)}"`).join(', ');

    // Insert data in batches of 50 rows
    const batchSize = 50;
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);

      const values = batch.map(row => {
        const rowValues = columns.map(col => {
          const val = row[col];
          if (val === null) return 'NULL';
          if (typeof val === 'number') return val.toString();
          if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
          return `'${String(val).replace(/'/g, "''")}'`;
        }).join(', ');
        return `(${rowValues})`;
      }).join(', ');

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
  env: Env
): Promise<void> {
  if (!snapshot.columnData) {
    throw new Error('Invalid snapshot: missing columnData');
  }

  const { columnName, columnType, notNull, defaultValue, rowData } = snapshot.columnData;
  const sanitizedTable = sanitizeIdentifier(tableName);
  const sanitizedColumn = sanitizeIdentifier(columnName);

  // 1. Add the column back
  let alterQuery = `ALTER TABLE "${sanitizedTable}" ADD COLUMN "${sanitizedColumn}" ${columnType}`;
  if (notNull) {
    alterQuery += ' NOT NULL';
  }
  if (defaultValue !== null) {
    alterQuery += ` DEFAULT ${defaultValue}`;
  }

  await executeQueryViaAPI(dbId, alterQuery, env);

  // 2. Update rows with saved column values
  if (rowData && rowData.length > 0) {
    // Get primary key column(s) to identify rows
    const schemaResult = await executeQueryViaAPI(dbId, `PRAGMA table_info("${sanitizedTable}")`, env);
    const columns = schemaResult.results as Array<{ name: string; pk: number }>;
    const pkColumns = columns.filter(col => col.pk > 0).map(col => col.name);

    if (pkColumns.length === 0) {
      console.warn('[Undo] No primary key found, cannot restore column values');
      return;
    }

    // Update each row
    for (const row of rowData) {
      const columnValue = row[columnName];
      if (columnValue === undefined) continue;

      // Build WHERE clause using primary key(s)
      const whereConditions = pkColumns.map(pk => {
        const pkValue = row[pk];
        if (pkValue === null) return `"${sanitizeIdentifier(pk)}" IS NULL`;
        if (typeof pkValue === 'number') return `"${sanitizeIdentifier(pk)}" = ${pkValue}`;
        return `"${sanitizeIdentifier(pk)}" = '${String(pkValue).replace(/'/g, "''")}'`;
      }).join(' AND ');

      // Build SET clause
      const setValue = columnValue === null
        ? 'NULL'
        : typeof columnValue === 'number'
        ? columnValue.toString()
        : `'${String(columnValue).replace(/'/g, "''")}'`;

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
  env: Env
): Promise<void> {
  if (!snapshot.rowData) {
    throw new Error('Invalid snapshot: missing rowData');
  }

  const { rows } = snapshot.rowData;

  if (rows.length === 0) {
    return; // Nothing to restore
  }

  const sanitizedTable = sanitizeIdentifier(tableName);

  // Get columns from first row
  const columns = Object.keys(rows[0]);
  const columnsList = columns.map(col => `"${sanitizeIdentifier(col)}"`).join(', ');

  // Insert rows back into table in batches
  const batchSize = 50;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    const values = batch.map(row => {
      const rowValues = columns.map(col => {
        const val = row[col];
        if (val === null) return 'NULL';
        if (typeof val === 'number') return val.toString();
        if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
        return `'${String(val).replace(/'/g, "''")}'`;
      }).join(', ');
      return `(${rowValues})`;
    }).join(', ');

    const insertQuery = `INSERT INTO "${sanitizedTable}" (${columnsList}) VALUES ${values}`;
    await executeQueryViaAPI(dbId, insertQuery, env);
  }
}

