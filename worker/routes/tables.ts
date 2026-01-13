import type { Env, TableInfo } from '../types';
import type { FilterCondition } from '../utils/helpers';
import { sanitizeIdentifier } from '../utils/helpers';
import { trackDatabaseAccess } from '../utils/database-tracking';
import { captureTableSnapshot, captureColumnSnapshot, captureRowSnapshot, saveUndoSnapshot } from '../utils/undo';
import { isProtectedDatabase, createProtectedDatabaseResponse, getDatabaseInfo } from '../utils/database-protection';
import { OperationType, startJobTracking, finishJobTracking } from '../utils/job-tracking';
import { logError, logInfo, logWarning } from '../utils/error-logger';
import { triggerWebhooks, createTableCreatePayload, createTableDeletePayload, createTableUpdatePayload, createBulkDeleteCompletePayload } from '../utils/webhooks';

// Helper to create response headers with CORS
function jsonHeaders(corsHeaders: HeadersInit): Headers {
  const headers = new Headers(corsHeaders);
  headers.set('Content-Type', 'application/json');
  return headers;
}

// Type for D1 API query result
interface D1QueryResult {
  results: unknown[];
  success: boolean;
  meta: Record<string, unknown>;
}

// Type for D1 API response
interface D1APIResponse {
  result: D1QueryResult[];
  success: boolean;
  errors?: { message: string }[];
}

// Helper to safely parse JSON body - returns null if body is null/undefined
async function parseJsonBody<T>(request: Request): Promise<T | null> {
  const raw: unknown = await request.json();
  if (raw === null || raw === undefined) {
    return null;
  }
  return raw as T;
}
// NOTE: captureBookmark disabled - Export API was causing database locks

/**
 * Note: This route handler requires dynamic D1 database access
 * Currently limited by the need to bind D1 databases at deploy time
 * 
 * For Phase 1, we'll use the REST API to execute queries against
 * specific databases using the execute endpoint
 */

export async function handleTableRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string | null
): Promise<Response> {
  logInfo('Handling table operation', {
    module: 'tables',
    operation: 'request',
    ...(userEmail !== null && { userId: userEmail }),
    metadata: { method: request.method, path: url.pathname }
  });

  // Extract database ID from URL (format: /api/tables/:dbId/...)
  const pathParts = url.pathname.split('/');
  const dbId = pathParts[3];

  if (!dbId) {
    return new Response(JSON.stringify({
      error: 'Database ID required'
    }), {
      status: 400,
      headers: jsonHeaders(corsHeaders)
    });
  }

  // Check if accessing a protected database
  if (!isLocalDev) {
    const dbInfo = await getDatabaseInfo(dbId, env);
    if (dbInfo && isProtectedDatabase(dbInfo.name)) {
      logWarning(`Attempted to access protected database: ${dbInfo.name}`, {
        module: 'tables',
        operation: 'access_check',
        databaseId: dbId,
        databaseName: dbInfo.name
      });
      return createProtectedDatabaseResponse(corsHeaders);
    }
  }

  // Track database access (non-blocking)
  if (!isLocalDev) {
    trackDatabaseAccess(dbId, env).catch((err: unknown) => {
      void logError(env, err instanceof Error ? err : String(err), {
        module: 'tables',
        operation: 'tracking',
        databaseId: dbId
      }, isLocalDev);
    });
  }

  try {
    // List tables in database
    if (request.method === 'GET' && url.pathname === `/api/tables/${dbId}/list`) {
      logInfo(`Listing tables for database: ${dbId}`, { module: 'tables', operation: 'list', databaseId: dbId });

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: [
            { name: 'users', type: 'table', ncol: 5, wr: 0, strict: 0 },
            { name: 'posts', type: 'table', ncol: 7, wr: 0, strict: 0 },
            { name: 'comments', type: 'table', ncol: 4, wr: 0, strict: 0 }
          ],
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Execute PRAGMA table_list using REST API
      const query = "PRAGMA table_list";
      const result = await executeQueryViaAPI(dbId, query, env);

      // Filter out system tables
      const tables = (result.results as TableInfo[]).filter((table: TableInfo) =>
        !table.name.startsWith('sqlite_') && !table.name.startsWith('_cf_')
      );

      // Fetch row counts for regular tables (limit to 100 to avoid performance issues)
      const tablesToCount = tables.filter(t => t.type === 'table').slice(0, 100);

      if (tablesToCount.length > 0) {
        // Fetch row counts in parallel with concurrency limit
        const countPromises = tablesToCount.map(async (table) => {
          try {
            const sanitizedName = sanitizeIdentifier(table.name);
            const countResult = await executeQueryViaAPI(dbId, `SELECT COUNT(*) as count FROM "${sanitizedName}"`, env);
            const countRow = countResult.results[0] as { count: number } | undefined;
            return { name: table.name, count: countRow?.count ?? 0 };
          } catch {
            // If count fails (e.g., for virtual tables), return undefined
            return { name: table.name, count: undefined };
          }
        });

        const counts = await Promise.all(countPromises);
        const countMap = new Map(counts.map(c => [c.name, c.count]));

        // Add row counts to table info
        for (const table of tables) {
          const count = countMap.get(table.name);
          if (count !== undefined) {
            (table as TableInfo & { row_count?: number }).row_count = count;
          }
        }
      }

      return new Response(JSON.stringify({
        result: tables,
        success: true
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    // Get table schema
    if (request.method === 'GET' && /^\/api\/tables\/[^/]+\/schema\/[^/]+$/.exec(url.pathname)) {
      const tableName = decodeURIComponent(pathParts[5] ?? '');
      logInfo(`Getting schema for table: ${tableName}`, { module: 'tables', operation: 'schema', databaseId: dbId, metadata: { tableName } });

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: [
            { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1, hidden: 0 },
            { cid: 1, name: 'email', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0, hidden: 0, unique: true },
            { cid: 2, name: 'name', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0, hidden: 0 },
            { cid: 3, name: 'created_at', type: 'DATETIME', notnull: 0, dflt_value: 'CURRENT_TIMESTAMP', pk: 0, hidden: 0 },
            { cid: 4, name: 'total', type: 'REAL', notnull: 0, dflt_value: null, pk: 0, hidden: 2, generatedExpression: 'price * quantity' }
          ],
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      const sanitizedTable = sanitizeIdentifier(tableName);

      // Use table_xinfo to get hidden column info (for generated columns)
      // hidden values: 0=normal, 1=hidden (internal rowid), 2=generated virtual, 3=generated stored
      const xinfoQuery = `PRAGMA table_xinfo("${sanitizedTable}")`;
      const xinfoResult = await executeQueryViaAPI(dbId, xinfoQuery, env);

      // Get index list to find UNIQUE constraints
      const indexQuery = `PRAGMA index_list("${sanitizedTable}")`;
      const uniqueColumns = new Set<string>();
      try {
        const indexResult = await executeQueryViaAPI(dbId, indexQuery, env);
        const indexes = indexResult.results as { name: string; unique: number; origin: string; partial: number }[];

        // For each unique index, get the columns
        for (const idx of indexes) {
          if (idx.unique === 1) {
            const idxInfoQuery = `PRAGMA index_info("${idx.name}")`;
            const idxInfoResult = await executeQueryViaAPI(dbId, idxInfoQuery, env);
            const idxColumns = idxInfoResult.results as { name: string }[];
            // If it's a single-column unique index, mark that column as unique
            if (idxColumns.length === 1 && idxColumns[0]?.name) {
              uniqueColumns.add(idxColumns[0].name);
            }
          }
        }
      } catch {
        // Ignore errors fetching index info
      }

      // Enhance results with unique info
      interface XInfoColumn { cid: number; name: string; type: string; notnull: number; dflt_value: string | null; pk: number; hidden: number }
      const enhancedResults = (xinfoResult.results as XInfoColumn[]).map(col => ({
        ...col,
        unique: uniqueColumns.has(col.name) || undefined,
        // Map hidden values: 2=virtual generated, 3=stored generated
        generatedExpression: (col.hidden === 2 || col.hidden === 3) ? '(computed)' : undefined
      }));

      return new Response(JSON.stringify({
        result: enhancedResults,
        success: true
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    // Get table data (paginated)
    if (request.method === 'GET' && /^\/api\/tables\/[^/]+\/data\/[^/]+$/.exec(url.pathname)) {
      const tableName = decodeURIComponent(pathParts[5] ?? '');
      const limit = parseInt(url.searchParams.get('limit') ?? '100');
      const offset = parseInt(url.searchParams.get('offset') ?? '0');

      // Parse filter parameters from URL
      const filters: Record<string, { type: string; value?: string; value2?: string; values?: (string | number)[]; logicOperator?: 'AND' | 'OR' }> = {};
      for (const [key, value] of url.searchParams.entries()) {
        if (key.startsWith('filter_')) {
          const columnName = key.substring(7); // Remove 'filter_' prefix
          const filterValue = url.searchParams.get(`filterValue_${columnName}`);
          const filterValue2 = url.searchParams.get(`filterValue2_${columnName}`);
          const filterValues = url.searchParams.get(`filterValues_${columnName}`);
          const filterLogic = url.searchParams.get(`filterLogic_${columnName}`);

          const filterObj: { type: string; value?: string; value2?: string; values?: (string | number)[]; logicOperator?: 'AND' | 'OR' } = {
            type: value,
          };
          if (filterValue) filterObj.value = filterValue;
          if (filterValue2) filterObj.value2 = filterValue2;
          if (filterValues) {
            filterObj.values = filterValues.split(',').map(v => {
              const num = Number(v);
              return isNaN(num) ? v : num;
            }).slice(0, 100); // Limit to 100 values
          }
          if (filterLogic === 'AND' || filterLogic === 'OR') {
            filterObj.logicOperator = filterLogic;
          }
          filters[columnName] = filterObj;
        }
      }

      // Parse FK filter (format: column:value)
      const fkFilter = url.searchParams.get('fkFilter');
      if (fkFilter) {
        const [column, value] = fkFilter.split(':');
        if (column && value !== undefined) {
          // Add FK filter as an equals filter
          filters[column] = {
            type: 'equals',
            value: value,
            logicOperator: 'AND'
          };
        }
      }

      logInfo(`Getting data for table: ${tableName}`, { module: 'tables', operation: 'data', databaseId: dbId, metadata: { tableName, limit, offset, filterCount: Object.keys(filters).length } });

      // Mock response for local development
      if (isLocalDev) {
        let mockData = [
          { id: 1, email: 'user1@example.com', name: 'User One', created_at: new Date().toISOString() },
          { id: 2, email: 'user2@example.com', name: 'User Two', created_at: new Date().toISOString() }
        ];

        // Apply mock filtering
        if (Object.keys(filters).length > 0) {
          mockData = mockData.filter(row => {
            for (const [columnName, filter] of Object.entries(filters)) {
              const cellValue = row[columnName as keyof typeof row];
              if (cellValue === null || cellValue === undefined) continue;

              const value = String(cellValue).toLowerCase();
              const filterVal = (filter.value ?? '').toLowerCase();

              switch (filter.type) {
                case 'contains':
                  if (!value.includes(filterVal)) return false;
                  break;
                case 'equals':
                  if (value !== filterVal) return false;
                  break;
                case 'startsWith':
                  if (!value.startsWith(filterVal)) return false;
                  break;
                case 'endsWith':
                  if (!value.endsWith(filterVal)) return false;
                  break;
              }
            }
            return true;
          });
        }

        return new Response(JSON.stringify({
          result: mockData,
          meta: {
            rows_read: mockData.length,
            rows_written: 0
          },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      const sanitizedTable = sanitizeIdentifier(tableName);

      // Build WHERE clause from filters if any
      let whereClause = '';
      if (Object.keys(filters).length > 0) {
        // Get table schema for validation
        const schemaResult = await executeQueryViaAPI(dbId, `PRAGMA table_info("${sanitizedTable}")`, env);
        const schema = schemaResult.results as {
          cid: number;
          name: string;
          type: string;
          notnull: number;
          dflt_value: string | null;
          pk: number;
        }[];

        // Import buildWhereClause
        const { buildWhereClause } = await import('../utils/helpers.js');

        // Convert filters to FilterCondition format
        const filterConditions: Record<string, FilterCondition> = {};
        for (const [columnName, filter] of Object.entries(filters)) {
          const condition: FilterCondition = {
            type: filter.type as FilterCondition['type'],
          };
          if (filter.value !== undefined) condition.value = filter.value;
          if (filter.value2 !== undefined) condition.value2 = filter.value2;
          if (filter.values !== undefined) condition.values = filter.values;
          if (filter.logicOperator !== undefined) condition.logicOperator = filter.logicOperator;
          filterConditions[columnName] = condition;
        }

        const { whereClause: clause } = buildWhereClause(filterConditions, schema);
        whereClause = clause;
      }

      const query = `SELECT * FROM "${sanitizedTable}"${whereClause} LIMIT ${String(limit)} OFFSET ${String(offset)}`;
      const result = await executeQueryViaAPI(dbId, query, env);

      return new Response(JSON.stringify({
        result: result.results,
        meta: result.meta,
        success: true
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    // Get table indexes
    if (request.method === 'GET' && /^\/api\/tables\/[^/]+\/indexes\/[^/]+$/.exec(url.pathname)) {
      const tableName = decodeURIComponent(pathParts[5] ?? '');
      logInfo(`Getting indexes for table: ${tableName}`, { module: 'tables', operation: 'indexes', databaseId: dbId, metadata: { tableName } });

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: [
            { seq: 0, name: 'idx_users_email', unique: 1, origin: 'c', partial: 0 }
          ],
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      const sanitizedTable = sanitizeIdentifier(tableName);
      const query = `PRAGMA index_list("${sanitizedTable}")`;
      const result = await executeQueryViaAPI(dbId, query, env);

      return new Response(JSON.stringify({
        result: result.results,
        success: true
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    // Get foreign keys for a specific table
    if (request.method === 'GET' && /^\/api\/tables\/[^/]+\/foreign-keys\/[^/]+$/.exec(url.pathname)) {
      const tableName = decodeURIComponent(pathParts[5] ?? '');
      logInfo(`Getting foreign keys for table: ${tableName}`, { module: 'tables', operation: 'foreign_keys', databaseId: dbId, metadata: { tableName } });

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: {
            foreignKeys: [
              { column: 'user_id', refTable: 'users', refColumn: 'id', onDelete: 'CASCADE', onUpdate: 'NO ACTION' },
              { column: 'category_id', refTable: 'categories', refColumn: 'id', onDelete: 'SET NULL', onUpdate: 'CASCADE' }
            ]
          },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      const sanitizedTable = sanitizeIdentifier(tableName);
      const fkQuery = `PRAGMA foreign_key_list("${sanitizedTable}")`;
      const result = await executeQueryViaAPI(dbId, fkQuery, env);

      // Transform the PRAGMA result to our desired format
      const fks = result.results as {
        id: number;
        seq: number;
        table: string;
        from: string;
        to: string;
        on_update: string;
        on_delete: string;
        match: string;
      }[];

      // Group by FK constraint (id) and column
      const foreignKeys: {
        column: string;
        refTable: string;
        refColumn: string;
        onDelete: string | null;
        onUpdate: string | null;
      }[] = [];

      const processed = new Map<string, typeof foreignKeys[0]>();

      for (const fk of fks) {
        const key = `${fk.from}_${fk.table}_${fk.to}`;
        if (!processed.has(key)) {
          processed.set(key, {
            column: fk.from,
            refTable: fk.table,
            refColumn: fk.to,
            onDelete: fk.on_delete || null,
            onUpdate: fk.on_update || null
          });
        }
      }

      foreignKeys.push(...processed.values());

      return new Response(JSON.stringify({
        result: {
          foreignKeys
        },
        success: true
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    // Delete table
    if (request.method === 'DELETE' && /^\/api\/tables\/[^/]+\/[^/]+$/.exec(url.pathname)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      logInfo(`Deleting table: ${tableName}`, { module: 'tables', operation: 'delete', databaseId: dbId, metadata: { tableName } });

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Start job tracking
      const jobId = await startJobTracking(
        env,
        OperationType.TABLE_DELETE,
        dbId,
        userEmail ?? 'unknown',
        isLocalDev,
        { tableName }
      );

      try {
        // NOTE: Bookmark capture via Export API is disabled - it was causing database locks
        // TODO: Re-enable when D1 export API behavior is fixed
        // The Export API with output_format:'polling' appears to trigger real exports

        // Capture snapshot before drop (best effort)
        try {
          const snapshot = await captureTableSnapshot(dbId, tableName, env);
          await saveUndoSnapshot(
            dbId,
            'DROP_TABLE',
            tableName,
            null,
            `Dropped table "${tableName}"`,
            snapshot,
            userEmail,
            env
          );
        } catch (snapshotErr) {
          const errMsg = snapshotErr instanceof Error ? snapshotErr.message : String(snapshotErr);
          void logError(env, snapshotErr instanceof Error ? snapshotErr : String(snapshotErr), {
            module: 'tables',
            operation: 'snapshot_capture',
            databaseId: dbId,
            metadata: { tableName }
          }, isLocalDev);

          // Check if database is locked by export - if so, skip the drop entirely
          if (errMsg.includes('Currently processing a long-running export')) {
            logInfo('Database locked by export - cannot delete table', { module: 'tables', operation: 'delete', databaseId: dbId, metadata: { tableName } });
            await finishJobTracking(env, jobId, 'failed', userEmail ?? 'unknown', isLocalDev, { processedItems: 0, errorCount: 1, errorMessage: 'Database is temporarily locked' });
            return new Response(JSON.stringify({
              error: 'Database is temporarily locked',
              message: 'The database is currently processing an export. Please wait a few minutes and try again.'
            }), {
              status: 503,
              headers: jsonHeaders(corsHeaders)
            });
          }
          // For other errors, continue with drop
        }

        const sanitizedTable = sanitizeIdentifier(tableName);
        const query = `DROP TABLE "${sanitizedTable}"`;
        await executeQueryViaAPI(dbId, query, env);

        // Complete job tracking
        await finishJobTracking(env, jobId, 'completed', userEmail ?? 'unknown', isLocalDev, { processedItems: 1, errorCount: 0 });

        // Trigger table_delete webhook
        const dbInfo = await getDatabaseInfo(dbId, env);
        void triggerWebhooks(
          env,
          'table_delete',
          createTableDeletePayload(dbId, dbInfo?.name ?? 'unknown', tableName, userEmail),
          isLocalDev
        );

        return new Response(JSON.stringify({
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      } catch (err) {
        // Mark job as failed
        await finishJobTracking(env, jobId, 'failed', userEmail ?? 'unknown', isLocalDev, {
          processedItems: 0,
          errorCount: 1,
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        });
        throw err;
      }
    }

    // Rename table
    if (request.method === 'PATCH' && /^\/api\/tables\/[^/]+\/[^/]+\/rename$/.exec(url.pathname)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      logInfo(`Renaming table: ${tableName}`, { module: 'tables', operation: 'rename', databaseId: dbId, metadata: { tableName } });

      const body = await parseJsonBody<{ newName?: string }>(request);
      const newName = body?.newName;

      if (!newName?.trim()) {
        return new Response(JSON.stringify({
          error: 'New table name is required'
        }), {
          status: 400,
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: { name: newName, type: 'table', ncol: 5, wr: 0, strict: 0 },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Start job tracking
      const jobId = await startJobTracking(
        env,
        OperationType.TABLE_RENAME,
        dbId,
        userEmail ?? 'unknown',
        isLocalDev,
        { oldName: tableName, newName }
      );

      try {
        const sanitizedOldTable = sanitizeIdentifier(tableName);
        const sanitizedNewTable = sanitizeIdentifier(newName);
        const query = `ALTER TABLE "${sanitizedOldTable}" RENAME TO "${sanitizedNewTable}"`;
        await executeQueryViaAPI(dbId, query, env);

        // Get the new table info
        const tableListResult = await executeQueryViaAPI(dbId, "PRAGMA table_list", env);
        const newTableInfo = (tableListResult.results as TableInfo[]).find(
          (table: TableInfo) => table.name === newName
        );

        // Complete job tracking
        await finishJobTracking(env, jobId, 'completed', userEmail ?? 'unknown', isLocalDev, { processedItems: 1, errorCount: 0 });

        // Trigger table_update webhook for rename
        const dbInfo = await getDatabaseInfo(dbId, env);
        void triggerWebhooks(
          env,
          'table_update',
          createTableUpdatePayload(dbId, dbInfo?.name ?? 'unknown', newName, `renamed from ${tableName}`, userEmail),
          isLocalDev
        );

        return new Response(JSON.stringify({
          result: newTableInfo ?? { name: newName, type: 'table', ncol: 0, wr: 0, strict: 0 },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      } catch (err) {
        // Mark job as failed
        await finishJobTracking(env, jobId, 'failed', userEmail ?? 'unknown', isLocalDev, {
          processedItems: 0,
          errorCount: 1,
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        });
        throw err;
      }
    }

    // Clone table
    if (request.method === 'POST' && /^\/api\/tables\/[^/]+\/[^/]+\/clone$/.exec(url.pathname)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      logInfo(`Cloning table: ${tableName}`, { module: 'tables', operation: 'clone', databaseId: dbId, metadata: { tableName } });

      const body = await parseJsonBody<{ newName?: string }>(request);
      const newName = body?.newName;

      if (!newName?.trim()) {
        return new Response(JSON.stringify({
          error: 'New table name is required'
        }), {
          status: 400,
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: { name: newName, type: 'table', ncol: 5, wr: 0, strict: 0 },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Start job tracking
      const jobId = await startJobTracking(
        env,
        OperationType.TABLE_CLONE,
        dbId,
        userEmail ?? 'unknown',
        isLocalDev,
        { sourceTable: tableName, targetTable: newName }
      );

      try {
        const sanitizedOldTable = sanitizeIdentifier(tableName);
        const sanitizedNewTable = sanitizeIdentifier(newName);

        // Get schema
        const schemaResult = await executeQueryViaAPI(dbId, `PRAGMA table_info("${sanitizedOldTable}")`, env);
        const columns = schemaResult.results as {
          cid: number;
          name: string;
          type: string;
          notnull: number;
          dflt_value: string | null;
          pk: number;
        }[];

        // Generate CREATE TABLE statement
        const columnDefs = columns.map(col => {
          let def = `"${col.name}" ${col.type || 'TEXT'}`;
          if (col.pk > 0) def += ' PRIMARY KEY';
          if (col.notnull && col.pk === 0) def += ' NOT NULL';
          if (col.dflt_value !== null) def += ` DEFAULT ${col.dflt_value}`;
          return def;
        }).join(', ');

        const createTableQuery = `CREATE TABLE "${sanitizedNewTable}" (${columnDefs})`;
        await executeQueryViaAPI(dbId, createTableQuery, env);

        // Copy data
        const copyDataQuery = `INSERT INTO "${sanitizedNewTable}" SELECT * FROM "${sanitizedOldTable}"`;
        await executeQueryViaAPI(dbId, copyDataQuery, env);

        // Get indexes and recreate them
        const indexesResult = await executeQueryViaAPI(dbId, `PRAGMA index_list("${sanitizedOldTable}")`, env);
        const indexes = indexesResult.results as {
          seq: number;
          name: string;
          unique: number;
          origin: string;
          partial: number;
        }[];

        for (const index of indexes) {
          if (index.origin === 'c') { // Only copy user-created indexes
            const indexInfoResult = await executeQueryViaAPI(dbId, `PRAGMA index_info("${index.name}")`, env);
            const indexColumns = indexInfoResult.results as { seqno: number; cid: number; name: string }[];

            const columnNames = indexColumns.map(ic => `"${ic.name}"`).join(', ');
            // Generate new index name: try replacing table name first, otherwise append _copy
            let newIndexName = index.name.replace(tableName, newName);
            if (newIndexName === index.name) {
              // Table name wasn't in index name, so create a unique name
              newIndexName = `${index.name}_${newName}`;
            }
            const uniqueStr = index.unique ? 'UNIQUE ' : '';

            const createIndexQuery = `CREATE ${uniqueStr}INDEX "${newIndexName}" ON "${sanitizedNewTable}" (${columnNames})`;
            await executeQueryViaAPI(dbId, createIndexQuery, env);
          }
        }

        // Get the new table info
        const tableListResult = await executeQueryViaAPI(dbId, "PRAGMA table_list", env);
        const newTableInfo = (tableListResult.results as TableInfo[]).find(
          (table: TableInfo) => table.name === newName
        );

        // Complete job tracking
        await finishJobTracking(env, jobId, 'completed', userEmail ?? 'unknown', isLocalDev, { processedItems: 1, errorCount: 0 });

        // Trigger table_create webhook
        const dbInfo = await getDatabaseInfo(dbId, env);
        void triggerWebhooks(
          env,
          'table_create',
          createTableCreatePayload(dbId, dbInfo?.name ?? 'unknown', newName, userEmail),
          isLocalDev
        );

        return new Response(JSON.stringify({
          result: newTableInfo ?? { name: newName, type: 'table', ncol: columns.length, wr: 0, strict: 0 },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      } catch (err) {
        // Mark job as failed
        await finishJobTracking(env, jobId, 'failed', userEmail ?? 'unknown', isLocalDev, {
          processedItems: 0,
          errorCount: 1,
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        });
        throw err;
      }
    }

    // Check STRICT mode compatibility (validation endpoint)
    if (request.method === 'GET' && /^\/api\/tables\/[^/]+\/[^/]+\/strict-check$/.exec(url.pathname)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      logInfo(`Checking STRICT mode compatibility: ${tableName}`, { module: 'tables', operation: 'strict_check', databaseId: dbId, metadata: { tableName } });

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: {
            compatible: true,
            isAlreadyStrict: false,
            isVirtualTable: false,
            hasGeneratedColumns: false,
            hasForeignKeys: false,
            generatedColumns: [],
            foreignKeys: [],
            warnings: [],
            blockers: []
          },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      try {
        const sanitizedTable = sanitizeIdentifier(tableName);

        // Check if table exists and get its info
        const tableListResult = await executeQueryViaAPI(dbId, "PRAGMA table_list", env);
        const currentTableInfo = (tableListResult.results as TableInfo[]).find(
          (t: TableInfo) => t.name === tableName
        );

        if (!currentTableInfo) {
          return new Response(JSON.stringify({
            error: `Table "${tableName}" not found`,
          }), {
            status: 404,
            headers: jsonHeaders(corsHeaders)
          });
        }

        const isAlreadyStrict = currentTableInfo.strict === 1;

        // Check if table is a virtual table (FTS5, etc.)
        const createSqlResult = await executeQueryViaAPI(dbId,
          `SELECT sql FROM sqlite_master WHERE type='table' AND name='${sanitizedTable}'`, env);
        const createSql = (createSqlResult.results[0] as { sql: string } | undefined)?.sql ?? '';
        const isVirtualTable = createSql.toLowerCase().includes('virtual table') ||
          createSql.toLowerCase().includes('using fts5') ||
          createSql.toLowerCase().includes('using fts4') ||
          createSql.toLowerCase().includes('using rtree');

        // Use table_xinfo to get extended column info including generated columns
        const xinfoResult = await executeQueryViaAPI(dbId, `PRAGMA table_xinfo("${sanitizedTable}")`, env);
        const columns = xinfoResult.results as {
          cid: number;
          name: string;
          type: string;
          notnull: number;
          dflt_value: string | null;
          pk: number;
          hidden: number;
        }[];

        // Check for generated columns (hidden = 2 for virtual, 3 for stored)
        const generatedColumns = columns
          .filter(col => col.hidden === 2 || col.hidden === 3)
          .map(col => ({
            name: col.name,
            type: col.type,
            generatedType: col.hidden === 2 ? 'VIRTUAL' : 'STORED'
          }));

        // Get foreign key constraints
        const fkResult = await executeQueryViaAPI(dbId, `PRAGMA foreign_key_list("${sanitizedTable}")`, env);
        const foreignKeys = fkResult.results as {
          id: number;
          seq: number;
          table: string;
          from: string;
          to: string;
          on_update: string;
          on_delete: string;
        }[];

        // Group FKs by id for composite keys
        const fkGroups = new Map<number, typeof foreignKeys>();
        for (const fk of foreignKeys) {
          if (!fkGroups.has(fk.id)) {
            fkGroups.set(fk.id, []);
          }
          const group = fkGroups.get(fk.id);
          if (group) group.push(fk);
        }

        const fkSummary = Array.from(fkGroups.values()).map(group => {
          group.sort((a, b) => a.seq - b.seq);
          return {
            fromColumns: group.map(fk => fk.from),
            toTable: group[0]?.table ?? '',
            toColumns: group.map(fk => fk.to),
            onUpdate: group[0]?.on_update ?? 'NO ACTION',
            onDelete: group[0]?.on_delete ?? 'NO ACTION'
          };
        });

        // Build warnings and blockers
        const warnings: string[] = [];
        const blockers: string[] = [];

        if (isAlreadyStrict) {
          warnings.push('Table is already in STRICT mode');
        }

        if (isVirtualTable) {
          blockers.push('Virtual tables (FTS5, FTS4, rtree) cannot be converted to STRICT mode');
        }

        if (generatedColumns.length > 0) {
          const colNames = generatedColumns.map(c => c.name).join(', ');
          blockers.push(`Table has generated columns (${colNames}) which cannot be automatically converted`);
        }

        if (fkSummary.length > 0) {
          warnings.push(`Table has ${fkSummary.length} foreign key constraint(s) which will be preserved during conversion`);
        }

        const compatible = blockers.length === 0 && !isAlreadyStrict;

        return new Response(JSON.stringify({
          result: {
            compatible,
            isAlreadyStrict,
            isVirtualTable,
            hasGeneratedColumns: generatedColumns.length > 0,
            hasForeignKeys: fkSummary.length > 0,
            generatedColumns,
            foreignKeys: fkSummary,
            warnings,
            blockers
          },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      } catch (err) {
        void logError(env, err instanceof Error ? err : String(err), {
          module: 'tables',
          operation: 'strict_check',
          databaseId: dbId,
          metadata: { tableName }
        }, isLocalDev);
        throw err;
      }
    }

    // Convert table to STRICT mode
    if (request.method === 'POST' && /^\/api\/tables\/[^/]+\/[^/]+\/strict$/.exec(url.pathname)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      logInfo(`Converting table to STRICT: ${tableName}`, { module: 'tables', operation: 'strict', databaseId: dbId, metadata: { tableName } });

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: { name: tableName, type: 'table', ncol: 5, wr: 0, strict: 1 },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Start job tracking
      const jobId = await startJobTracking(
        env,
        OperationType.TABLE_STRICT,
        dbId,
        userEmail ?? 'unknown',
        isLocalDev,
        { tableName, operation: 'convert_to_strict' }
      );

      try {
        const sanitizedTable = sanitizeIdentifier(tableName);
        const tempTableName = `_temp_strict_${tableName}_${Date.now()}`;
        const sanitizedTempTable = sanitizeIdentifier(tempTableName);

        // Check if table is already STRICT or is a virtual table
        const tableListResult = await executeQueryViaAPI(dbId, "PRAGMA table_list", env);
        const currentTableInfo = (tableListResult.results as TableInfo[]).find(
          (t: TableInfo) => t.name === tableName
        );

        if (currentTableInfo?.strict === 1) {
          await finishJobTracking(env, jobId, 'completed', userEmail ?? 'unknown', isLocalDev, { processedItems: 0, errorCount: 0 });
          return new Response(JSON.stringify({
            result: currentTableInfo,
            success: true,
            message: 'Table is already in STRICT mode'
          }), {
            headers: jsonHeaders(corsHeaders)
          });
        }

        // Check if table is a virtual table (FTS5, etc.) - these cannot be converted to STRICT
        const createSqlResult = await executeQueryViaAPI(dbId,
          `SELECT sql FROM sqlite_master WHERE type='table' AND name='${sanitizedTable}'`, env);
        const createSql = (createSqlResult.results[0] as { sql: string } | undefined)?.sql ?? '';
        const isVirtualTable = createSql.toLowerCase().includes('virtual table') ||
          createSql.toLowerCase().includes('using fts5') ||
          createSql.toLowerCase().includes('using fts4') ||
          createSql.toLowerCase().includes('using rtree');

        if (isVirtualTable) {
          await finishJobTracking(env, jobId, 'failed', userEmail ?? 'unknown', isLocalDev, {
            processedItems: 0,
            errorCount: 1,
            errorMessage: 'Virtual tables (FTS5, FTS4, rtree) cannot be converted to STRICT mode',
          });
          return new Response(JSON.stringify({
            error: 'Cannot convert to STRICT mode: Virtual tables (like FTS5 full-text search tables) cannot use STRICT mode.',
            details: 'STRICT mode is only available for regular tables. Virtual tables have their own type system.'
          }), {
            status: 400,
            headers: jsonHeaders(corsHeaders)
          });
        }

        // Use table_xinfo to get extended column info including generated columns
        // hidden values: 0=normal, 1=hidden rowid, 2=virtual generated, 3=stored generated
        const xinfoResult = await executeQueryViaAPI(dbId, `PRAGMA table_xinfo("${sanitizedTable}")`, env);
        const columns = xinfoResult.results as {
          cid: number;
          name: string;
          type: string;
          notnull: number;
          dflt_value: string | null;
          pk: number;
          hidden: number;
        }[];

        // Check for generated columns - these cannot be easily converted to STRICT
        // because we would need to preserve the GENERATED ALWAYS AS expression
        const generatedColumns = columns.filter(col => col.hidden === 2 || col.hidden === 3);
        if (generatedColumns.length > 0) {
          const genColNames = generatedColumns.map(c => c.name).join(', ');
          await finishJobTracking(env, jobId, 'failed', userEmail ?? 'unknown', isLocalDev, {
            processedItems: 0,
            errorCount: 1,
            errorMessage: `Table has generated columns: ${genColNames}`,
          });
          return new Response(JSON.stringify({
            error: `Cannot convert to STRICT mode: Table has generated columns (${genColNames}).`,
            details: 'Tables with generated (computed) columns cannot be automatically converted to STRICT mode. You would need to manually recreate the table with the generated column expressions and the STRICT keyword.'
          }), {
            status: 400,
            headers: jsonHeaders(corsHeaders)
          });
        }

        // Filter to only normal columns (not hidden rowid)
        const normalColumns = columns.filter(col => col.hidden === 0);

        // Get foreign key constraints to preserve them
        const fkResult = await executeQueryViaAPI(dbId, `PRAGMA foreign_key_list("${sanitizedTable}")`, env);
        const foreignKeys = fkResult.results as {
          id: number;
          seq: number;
          table: string;
          from: string;
          to: string;
          on_update: string;
          on_delete: string;
          match: string;
        }[];

        // Capture undo snapshot before conversion (best effort)
        // This saves the original non-STRICT table so it can be restored if needed
        try {
          const snapshot = await captureTableSnapshot(dbId, tableName, env);
          await saveUndoSnapshot(
            dbId,
            'DROP_TABLE',
            tableName,
            null,
            `Converted table "${tableName}" to STRICT mode`,
            snapshot,
            userEmail,
            env
          );
        } catch (snapshotErr) {
          // Log warning but continue - undo is best effort
          logWarning(`Failed to capture undo snapshot before STRICT conversion: ${snapshotErr instanceof Error ? snapshotErr.message : String(snapshotErr)}`, {
            module: 'tables',
            operation: 'snapshot_capture',
            databaseId: dbId,
            metadata: { tableName }
          });
        }

        // Get sample data to analyze actual types in use
        const sampleDataResult = await executeQueryViaAPI(dbId, `SELECT * FROM "${sanitizedTable}" LIMIT 100`, env);
        const sampleRows = sampleDataResult.results as Record<string, unknown>[];

        // Analyze each column to determine best STRICT type
        // STRICT tables only allow: INT, INTEGER, REAL, TEXT, BLOB, ANY
        const analyzeColumnType = (colName: string, declaredType: string): string => {
          const upperType = (declaredType || '').toUpperCase().trim();

          // Check actual data types in the column
          const actualTypes = new Set<string>();
          for (const row of sampleRows) {
            const val = row[colName];
            if (val === null || val === undefined) continue;

            const jsType = typeof val;
            if (jsType === 'number') {
              // Check if integer or float
              if (Number.isInteger(val)) {
                actualTypes.add('INTEGER');
              } else {
                actualTypes.add('REAL');
              }
            } else if (jsType === 'string') {
              actualTypes.add('TEXT');
            } else if (jsType === 'boolean') {
              actualTypes.add('INTEGER'); // SQLite stores booleans as 0/1
            } else if (val instanceof ArrayBuffer || (jsType === 'object' && val !== null)) {
              actualTypes.add('BLOB');
            } else {
              actualTypes.add('ANY');
            }
          }

          // If column has mixed types, use ANY
          if (actualTypes.size > 1) {
            // Special case: INTEGER + REAL = REAL (compatible)
            if (actualTypes.size === 2 && actualTypes.has('INTEGER') && actualTypes.has('REAL')) {
              return 'REAL';
            }
            return 'ANY';
          }

          // If we have data, use the detected type
          if (actualTypes.size === 1) {
            const typesArray = Array.from(actualTypes);
            const detectedType = typesArray[0];
            if (!detectedType) return 'ANY'; // Safety fallback

            // Verify detected type is compatible with declared type
            if (upperType.includes('INT') && detectedType === 'TEXT') {
              return 'ANY'; // Declared INT but has TEXT - use ANY
            }
            if (upperType.includes('BLOB') && detectedType !== 'BLOB') {
              return 'ANY'; // Declared BLOB but has non-BLOB data - use ANY
            }
            return detectedType;
          }

          // No data, use mapped declared type
          if (upperType.includes('INT')) return 'INTEGER';
          if (upperType.includes('REAL') || upperType.includes('FLOAT') || upperType.includes('DOUBLE') || upperType.includes('NUMERIC') || upperType.includes('DECIMAL')) return 'REAL';
          if (upperType.includes('BLOB')) return 'BLOB';
          if (upperType === '' || upperType === 'ANY') return 'ANY';
          return 'TEXT';
        };

        // Helper to format default values for CREATE TABLE
        // Non-literal defaults (like CURRENT_TIMESTAMP) need parentheses
        const formatDefaultValue = (dfltValue: string): string => {
          const trimmed = dfltValue.trim();
          // Already wrapped in parentheses
          if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
            return trimmed;
          }
          // Literal string (single or double quoted)
          if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
            (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
            return trimmed;
          }
          // Numeric literal
          if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
            return trimmed;
          }
          // NULL
          if (trimmed.toUpperCase() === 'NULL') {
            return trimmed;
          }
          // TRUE/FALSE
          if (trimmed.toUpperCase() === 'TRUE' || trimmed.toUpperCase() === 'FALSE') {
            return trimmed;
          }
          // Everything else (CURRENT_TIMESTAMP, CURRENT_DATE, expressions) needs parentheses
          return `(${trimmed})`;
        };

        // Generate column definitions with STRICT-compatible types
        const columnDefs = normalColumns.map(col => {
          const strictType = analyzeColumnType(col.name, col.type);
          // Ensure we always have a valid STRICT type
          const finalType = strictType || 'ANY';
          let def = `"${col.name}" ${finalType}`;
          if (col.pk > 0) def += ' PRIMARY KEY';
          if (col.notnull && col.pk === 0) def += ' NOT NULL';
          // Handle default values - ensure they're properly formatted
          if (col.dflt_value !== null && col.dflt_value !== undefined) {
            def += ` DEFAULT ${formatDefaultValue(col.dflt_value)}`;
          }
          return def;
        });

        // Validate we have column definitions
        if (columnDefs.length === 0) {
          await finishJobTracking(env, jobId, 'failed', userEmail ?? 'unknown', isLocalDev, {
            processedItems: 0,
            errorCount: 1,
            errorMessage: 'No columns found in table',
          });
          return new Response(JSON.stringify({
            error: 'Cannot convert to STRICT mode: No columns found in table',
          }), {
            status: 400,
            headers: jsonHeaders(corsHeaders)
          });
        }

        // Group foreign keys by id (composite FKs have multiple rows with same id)
        const fkGroups = new Map<number, typeof foreignKeys>();
        for (const fk of foreignKeys) {
          if (!fkGroups.has(fk.id)) {
            fkGroups.set(fk.id, []);
          }
          const group = fkGroups.get(fk.id);
          if (group) group.push(fk);
        }

        // Generate foreign key constraints
        const fkDefs: string[] = [];
        for (const [, fkGroup] of fkGroups) {
          // Sort by seq to get columns in correct order
          fkGroup.sort((a, b) => a.seq - b.seq);
          const fromCols = fkGroup.map(fk => `"${fk.from}"`).join(', ');
          const toCols = fkGroup.map(fk => `"${fk.to}"`).join(', ');
          const targetTable = fkGroup[0]?.table;
          const onUpdate = fkGroup[0]?.on_update ?? 'NO ACTION';
          const onDelete = fkGroup[0]?.on_delete ?? 'NO ACTION';

          if (targetTable) {
            let fkDef = `FOREIGN KEY (${fromCols}) REFERENCES "${targetTable}" (${toCols})`;
            if (onUpdate !== 'NO ACTION') fkDef += ` ON UPDATE ${onUpdate}`;
            if (onDelete !== 'NO ACTION') fkDef += ` ON DELETE ${onDelete}`;
            fkDefs.push(fkDef);
          }
        }

        // Combine column definitions and foreign key constraints
        const allDefs = [...columnDefs, ...fkDefs].join(', ');

        // Create temp table with STRICT
        const createTableQuery = `CREATE TABLE "${sanitizedTempTable}" (${allDefs}) STRICT`;
        logInfo(`Creating STRICT table with query: ${createTableQuery}`, { module: 'tables', operation: 'strict', databaseId: dbId });
        await executeQueryViaAPI(dbId, createTableQuery, env);

        // Try to copy data - should succeed now with proper type analysis
        try {
          // Build explicit column list to ensure order matches
          const columnList = normalColumns.map(c => `"${c.name}"`).join(', ');
          const copyDataQuery = `INSERT INTO "${sanitizedTempTable}" (${columnList}) SELECT ${columnList} FROM "${sanitizedTable}"`;
          await executeQueryViaAPI(dbId, copyDataQuery, env);
        } catch (copyErr) {
          // Data copy failed - drop temp table and report error
          await executeQueryViaAPI(dbId, `DROP TABLE IF EXISTS "${sanitizedTempTable}"`, env);
          const errorMsg = copyErr instanceof Error ? copyErr.message : 'Unknown error';
          await finishJobTracking(env, jobId, 'failed', userEmail ?? 'unknown', isLocalDev, {
            processedItems: 0,
            errorCount: 1,
            errorMessage: `Data incompatible with STRICT mode: ${errorMsg}`,
          });
          return new Response(JSON.stringify({
            error: `Cannot convert to STRICT mode. Existing data is incompatible with declared column types. Error: ${errorMsg}`,
            details: 'STRICT mode enforces that all values match their declared types. This table has data that cannot be converted. Consider using the Query Console to fix problematic data first.'
          }), {
            status: 400,
            headers: jsonHeaders(corsHeaders)
          });
        }

        // Get indexes and store their column information BEFORE dropping the original table
        const indexesResult = await executeQueryViaAPI(dbId, `PRAGMA index_list("${sanitizedTable}")`, env);
        const indexes = indexesResult.results as {
          seq: number;
          name: string;
          unique: number;
          origin: string;
          partial: number;
        }[];

        // Store index definitions before we drop the original table
        const indexDefinitions: { name: string; unique: boolean; columns: string }[] = [];

        for (const index of indexes) {
          if (index.origin === 'c') {
            const indexInfoResult = await executeQueryViaAPI(dbId, `PRAGMA index_info("${index.name}")`, env);
            const indexColumns = indexInfoResult.results as { seqno: number; cid: number; name: string }[];

            const columnNames = indexColumns.map(ic => `"${ic.name}"`).join(', ');

            // Store the index definition for later recreation
            indexDefinitions.push({
              name: index.name,
              unique: index.unique === 1,
              columns: columnNames
            });

            // Create temp index on temp table
            const tempIndexName = `_temp_idx_${index.name}_${Date.now()}`;
            const uniqueStr = index.unique ? 'UNIQUE ' : '';

            const createIndexQuery = `CREATE ${uniqueStr}INDEX "${tempIndexName}" ON "${sanitizedTempTable}" (${columnNames})`;
            await executeQueryViaAPI(dbId, createIndexQuery, env);
          }
        }

        // Drop original table and rename temp table (with FK checks disabled for safety)
        await executeQueryViaAPI(dbId, `PRAGMA foreign_keys = OFF`, env);
        await executeQueryViaAPI(dbId, `DROP TABLE "${sanitizedTable}"`, env);
        await executeQueryViaAPI(dbId, `ALTER TABLE "${sanitizedTempTable}" RENAME TO "${sanitizedTable}"`, env);
        await executeQueryViaAPI(dbId, `PRAGMA foreign_keys = ON`, env);

        // Recreate indexes with original names using the stored definitions
        for (const indexDef of indexDefinitions) {
          const uniqueStr = indexDef.unique ? 'UNIQUE ' : '';
          const createIndexQuery = `CREATE ${uniqueStr}INDEX IF NOT EXISTS "${indexDef.name}" ON "${sanitizedTable}" (${indexDef.columns})`;
          await executeQueryViaAPI(dbId, createIndexQuery, env);
        }

        // Get the updated table info
        const updatedTableListResult = await executeQueryViaAPI(dbId, "PRAGMA table_list", env);
        const updatedTableInfo = (updatedTableListResult.results as TableInfo[]).find(
          (t: TableInfo) => t.name === tableName
        );

        // Complete job tracking
        await finishJobTracking(env, jobId, 'completed', userEmail ?? 'unknown', isLocalDev, { processedItems: 1, errorCount: 0 });

        return new Response(JSON.stringify({
          result: updatedTableInfo ?? { name: tableName, type: 'table', ncol: normalColumns.length, wr: 0, strict: 1 },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      } catch (err) {
        // Mark job as failed
        await finishJobTracking(env, jobId, 'failed', userEmail ?? 'unknown', isLocalDev, {
          processedItems: 0,
          errorCount: 1,
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        });
        throw err;
      }
    }

    // Export table
    if (request.method === 'GET' && /^\/api\/tables\/[^/]+\/[^/]+\/export$/.exec(url.pathname)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      const format = url.searchParams.get('format') ?? 'sql';
      logInfo(`Exporting table: ${tableName}`, { module: 'tables', operation: 'export', databaseId: dbId, metadata: { tableName, format } });

      // Mock response for local development
      if (isLocalDev) {
        let mockContent: string;
        if (format === 'csv') {
          mockContent = 'id,email,name,created_at\n1,user1@example.com,User One,2024-01-01\n2,user2@example.com,User Two,2024-01-02';
        } else if (format === 'json') {
          mockContent = JSON.stringify([
            { id: 1, email: 'user1@example.com', name: 'User One', created_at: '2024-01-01' },
            { id: 2, email: 'user2@example.com', name: 'User Two', created_at: '2024-01-02' }
          ], null, 2);
        } else {
          mockContent = `CREATE TABLE "${tableName}" (id INTEGER PRIMARY KEY, email TEXT, name TEXT, created_at DATETIME);\nINSERT INTO "${tableName}" VALUES (1, 'user1@example.com', 'User One', '2024-01-01');\nINSERT INTO "${tableName}" VALUES (2, 'user2@example.com', 'User Two', '2024-01-02');`;
        }

        const fileExt = format === 'json' ? 'json' : format === 'csv' ? 'csv' : 'sql';
        return new Response(JSON.stringify({
          result: {
            content: mockContent,
            filename: `${tableName}.${fileExt}`
          },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Start job tracking
      const jobId = await startJobTracking(
        env,
        OperationType.TABLE_EXPORT,
        dbId,
        userEmail ?? 'unknown',
        isLocalDev,
        { tableName, format }
      );

      try {
        const sanitizedTable = sanitizeIdentifier(tableName);

        // Check if table is FTS5 virtual table - these need special handling
        const createSqlResult = await executeQueryViaAPI(dbId,
          `SELECT sql FROM sqlite_master WHERE type='table' AND name='${sanitizedTable}'`, env);
        const createSql = (createSqlResult.results[0] as { sql: string } | undefined)?.sql ?? '';
        const isFTS5 = createSql.toLowerCase().includes('using fts5');

        // For FTS5 tables, we need to explicitly list columns (SELECT * doesn't work properly)
        let selectQuery: string;
        if (isFTS5) {
          // Extract column names from FTS5 CREATE statement
          // FTS5 format: CREATE VIRTUAL TABLE name USING fts5(col1, col2, ..., options)
          const match = /using\s+fts5\s*\(([^)]+)\)/i.exec(createSql);
          if (match?.[1]) {
            const parts = match[1].split(',').map(p => p.trim());
            // Filter out FTS5 options (contain '=') and get just column names
            const fts5Columns = parts
              .filter(p => !p.includes('=') && p.length > 0)
              .map(p => `"${p.replace(/"/g, '')}"`);

            if (fts5Columns.length === 0) {
              throw new Error('Could not extract columns from FTS5 table');
            }
            selectQuery = `SELECT ${fts5Columns.join(', ')} FROM "${sanitizedTable}"`;
          } else {
            throw new Error('Could not parse FTS5 table structure');
          }
        } else {
          selectQuery = `SELECT * FROM "${sanitizedTable}"`;
        }

        if (format === 'csv') {
          // Export as CSV
          const dataResult = await executeQueryViaAPI(dbId, selectQuery, env);
          const rows = dataResult.results as Record<string, unknown>[];

          const firstRow = rows[0];
          if (rows.length === 0 || !firstRow) {
            // Complete job tracking (empty table)
            await finishJobTracking(env, jobId, 'completed', userEmail ?? 'unknown', isLocalDev, { processedItems: 1, errorCount: 0 });

            return new Response(JSON.stringify({
              result: {
                content: '',
                filename: `${tableName}.csv`
              },
              success: true
            }), {
              headers: jsonHeaders(corsHeaders)
            });
          }

          // Get column names from first row
          const columns = Object.keys(firstRow);

          // Create CSV content
          const csvRows: string[] = [];
          csvRows.push(columns.map(col => `"${col}"`).join(','));

          for (const row of rows) {
            const values = columns.map(col => {
              const cell = row[col];
              if (cell === null) return 'NULL';
              if (cell === undefined) return '';
              // Handle objects and primitives safely for CSV export
              let str: string;
              if (typeof cell === 'object') {
                str = JSON.stringify(cell);
              } else if (typeof cell === 'string') {
                str = cell;
              } else {
                str = String(cell as string | number | boolean);
              }
              if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
              }
              return str;
            });
            csvRows.push(values.join(','));
          }

          // Complete job tracking
          await finishJobTracking(env, jobId, 'completed', userEmail ?? 'unknown', isLocalDev, { processedItems: 1, errorCount: 0 });

          return new Response(JSON.stringify({
            result: {
              content: csvRows.join('\n'),
              filename: `${tableName}.csv`
            },
            success: true
          }), {
            headers: jsonHeaders(corsHeaders)
          });
        } else if (format === 'json') {
          // Export as JSON
          const dataResult = await executeQueryViaAPI(dbId, selectQuery, env);
          const rows = dataResult.results as Record<string, unknown>[];

          // Complete job tracking
          await finishJobTracking(env, jobId, 'completed', userEmail ?? 'unknown', isLocalDev, { processedItems: 1, errorCount: 0 });

          return new Response(JSON.stringify({
            result: {
              content: JSON.stringify(rows, null, 2),
              filename: `${tableName}.json`
            },
            success: true
          }), {
            headers: jsonHeaders(corsHeaders)
          });
        } else {
          // Export as SQL
          const sqlStatements: string[] = [];

          if (isFTS5) {
            // For FTS5 tables, include the original CREATE VIRTUAL TABLE statement
            sqlStatements.push(`${createSql};`);
          } else {
            // Get schema for regular tables
            const schemaResult = await executeQueryViaAPI(dbId, `PRAGMA table_info("${sanitizedTable}")`, env);
            const columns = schemaResult.results as {
              cid: number;
              name: string;
              type: string;
              notnull: number;
              dflt_value: string | null;
              pk: number;
            }[];

            // Generate CREATE TABLE statement
            const columnDefs = columns.map(col => {
              let def = `"${col.name}" ${col.type || 'TEXT'}`;
              if (col.pk > 0) def += ' PRIMARY KEY';
              if (col.notnull && col.pk === 0) def += ' NOT NULL';
              if (col.dflt_value !== null) def += ` DEFAULT ${col.dflt_value}`;
              return def;
            }).join(', ');

            sqlStatements.push(`CREATE TABLE "${tableName}" (${columnDefs});`);
          }

          // Get data using the appropriate query (handles FTS5 properly)
          const dataResult = await executeQueryViaAPI(dbId, selectQuery, env);
          const rows = dataResult.results as Record<string, unknown>[];

          // Generate INSERT statements
          for (const row of rows) {
            const columnNames = Object.keys(row);
            const values = columnNames.map(col => {
              const val = row[col];
              if (val === null) return 'NULL';
              if (typeof val === 'number') return String(val);
              // Handle objects and other types safely
              let strVal: string;
              if (typeof val === 'object') {
                strVal = JSON.stringify(val);
              } else if (typeof val === 'string') {
                strVal = val;
              } else {
                strVal = String(val as boolean);
              }
              return `'${strVal.replace(/'/g, "''")}'`;
            });

            sqlStatements.push(
              `INSERT INTO "${tableName}" (${columnNames.map(n => `"${n}"`).join(', ')}) VALUES (${values.join(', ')});`
            );
          }

          // Get indexes
          const indexesResult = await executeQueryViaAPI(dbId, `PRAGMA index_list("${sanitizedTable}")`, env);
          const indexes = indexesResult.results as {
            seq: number;
            name: string;
            unique: number;
            origin: string;
            partial: number;
          }[];

          for (const index of indexes) {
            if (index.origin === 'c') {
              const indexInfoResult = await executeQueryViaAPI(dbId, `PRAGMA index_info("${index.name}")`, env);
              const indexColumns = indexInfoResult.results as { seqno: number; cid: number; name: string }[];

              const columnNames = indexColumns.map(ic => `"${ic.name}"`).join(', ');
              const uniqueStr = index.unique ? 'UNIQUE ' : '';

              sqlStatements.push(
                `CREATE ${uniqueStr}INDEX "${index.name}" ON "${tableName}" (${columnNames});`
              );
            }
          }

          // Complete job tracking
          await finishJobTracking(env, jobId, 'completed', userEmail ?? 'unknown', isLocalDev, { processedItems: 1, errorCount: 0 });

          return new Response(JSON.stringify({
            result: {
              content: sqlStatements.join('\n'),
              filename: `${tableName}.sql`
            },
            success: true
          }), {
            headers: jsonHeaders(corsHeaders)
          });
        }
      } catch (err) {
        // Mark job as failed
        await finishJobTracking(env, jobId, 'failed', userEmail ?? 'unknown', isLocalDev, {
          processedItems: 0,
          errorCount: 1,
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        });
        throw err;
      }
    }

    // Add column to table
    if (request.method === 'POST' && /^\/api\/tables\/[^/]+\/[^/]+\/columns\/add$/.exec(url.pathname)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      logInfo(`Adding column to table: ${tableName}`, { module: 'tables', operation: 'add_column', databaseId: dbId, metadata: { tableName } });

      const body = await parseJsonBody<{
        name?: string;
        type?: string;
        notnull?: boolean;
        unique?: boolean;
        defaultValue?: string;
        isGenerated?: boolean;
        generatedExpression?: string;
        generatedType?: 'STORED' | 'VIRTUAL';
      }>(request);

      if (!body?.name || !body.type) {
        return new Response(JSON.stringify({
          error: 'Column name and type are required'
        }), {
          status: 400,
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Validate generated column has expression
      if (body.isGenerated && !body.generatedExpression?.trim()) {
        return new Response(JSON.stringify({
          error: 'Generated column requires an expression'
        }), {
          status: 400,
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: [
            { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 },
            { cid: 1, name: body.name, type: body.type, notnull: body.notnull ? 1 : 0, dflt_value: body.defaultValue ?? null, pk: 0 }
          ],
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Start job tracking
      const jobId = await startJobTracking(
        env,
        OperationType.COLUMN_ADD,
        dbId,
        userEmail ?? 'unknown',
        isLocalDev,
        { tableName, columnName: body.name, columnType: body.type, isGenerated: body.isGenerated }
      );

      try {
        const sanitizedTable = sanitizeIdentifier(tableName);
        const sanitizedColumn = sanitizeIdentifier(body.name);

        // Build ALTER TABLE ADD COLUMN query
        // Note: SQLite doesn't support UNIQUE or GENERATED in ALTER TABLE ADD COLUMN
        // UNIQUE is handled by creating a separate unique index after adding the column
        let query = `ALTER TABLE "${sanitizedTable}" ADD COLUMN "${sanitizedColumn}" ${body.type}`;

        if (body.notnull) {
          query += ' NOT NULL';
        }

        // Note: UNIQUE cannot be added directly in ALTER TABLE ADD COLUMN
        // We'll create a unique index after adding the column

        // Handle generated column (also not supported in ALTER TABLE, but we try anyway for error message)
        if (body.isGenerated && body.generatedExpression) {
          const genType = body.generatedType ?? 'STORED';
          query += ` GENERATED ALWAYS AS (${body.generatedExpression}) ${genType}`;
        } else if (body.defaultValue) {
          // Check if default value needs quotes
          const defaultVal = body.defaultValue.trim();
          if (!isNaN(Number(defaultVal)) && defaultVal !== '') {
            query += ` DEFAULT ${defaultVal}`;
          } else if (defaultVal.toUpperCase() === 'CURRENT_TIMESTAMP' || defaultVal.toUpperCase() === 'NULL') {
            query += ` DEFAULT ${defaultVal}`;
          } else {
            query += ` DEFAULT '${defaultVal.replace(/'/g, "''")}'`;
          }
        }

        await executeQueryViaAPI(dbId, query, env);

        // If UNIQUE was requested, create a unique index on the column
        // (SQLite doesn't support UNIQUE in ALTER TABLE ADD COLUMN)
        if (body.unique) {
          const indexName = `idx_${sanitizedTable}_${sanitizedColumn}_unique`;
          const indexQuery = `CREATE UNIQUE INDEX "${indexName}" ON "${sanitizedTable}" ("${sanitizedColumn}")`;
          await executeQueryViaAPI(dbId, indexQuery, env);
        }

        // Get updated schema
        const schemaResult = await executeQueryViaAPI(dbId, `PRAGMA table_info("${sanitizedTable}")`, env);

        // Complete job tracking
        await finishJobTracking(env, jobId, 'completed', userEmail ?? 'unknown', isLocalDev, { processedItems: 1, errorCount: 0 });

        return new Response(JSON.stringify({
          result: schemaResult.results,
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      } catch (err) {
        // Mark job as failed
        await finishJobTracking(env, jobId, 'failed', userEmail ?? 'unknown', isLocalDev, {
          processedItems: 0,
          errorCount: 1,
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        });
        throw err;
      }
    }

    // Rename column
    if (request.method === 'PATCH' && /^\/api\/tables\/[^/]+\/[^/]+\/columns\/[^/]+\/rename$/.exec(url.pathname)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      const columnName = decodeURIComponent(pathParts[6] ?? '');
      logInfo(`Renaming column: ${columnName} in table: ${tableName}`, { module: 'tables', operation: 'rename_column', databaseId: dbId, metadata: { tableName, columnName } });

      const body = await parseJsonBody<{ newName?: string }>(request);

      if (!body?.newName?.trim()) {
        return new Response(JSON.stringify({
          error: 'New column name is required'
        }), {
          status: 400,
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Start job tracking
      const jobId = await startJobTracking(
        env,
        OperationType.COLUMN_RENAME,
        dbId,
        userEmail ?? 'unknown',
        isLocalDev,
        { tableName, oldName: columnName, newName: body.newName }
      );

      try {
        const sanitizedTable = sanitizeIdentifier(tableName);
        const sanitizedOldColumn = sanitizeIdentifier(columnName);
        const sanitizedNewColumn = sanitizeIdentifier(body.newName);

        const query = `ALTER TABLE "${sanitizedTable}" RENAME COLUMN "${sanitizedOldColumn}" TO "${sanitizedNewColumn}"`;

        await executeQueryViaAPI(dbId, query, env);

        // Complete job tracking
        await finishJobTracking(env, jobId, 'completed', userEmail ?? 'unknown', isLocalDev, { processedItems: 1, errorCount: 0 });

        return new Response(JSON.stringify({
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      } catch (err) {
        // Mark job as failed
        await finishJobTracking(env, jobId, 'failed', userEmail ?? 'unknown', isLocalDev, {
          processedItems: 0,
          errorCount: 1,
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        });
        throw err;
      }
    }

    // Modify column (requires table recreation)
    if (request.method === 'PATCH' && /^\/api\/tables\/[^/]+\/[^/]+\/columns\/[^/]+\/modify$/.exec(url.pathname)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      const columnName = decodeURIComponent(pathParts[6] ?? '');
      logInfo(`Modifying column: ${columnName} in table: ${tableName}`, { module: 'tables', operation: 'modify_column', databaseId: dbId, metadata: { tableName, columnName } });

      const body = await parseJsonBody<{ type?: string; notnull?: boolean; defaultValue?: string }>(request);

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: [
            { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 },
            { cid: 1, name: columnName, type: body?.type ?? 'TEXT', notnull: body?.notnull ? 1 : 0, dflt_value: body?.defaultValue ?? null, pk: 0 }
          ],
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Start job tracking
      const jobId = await startJobTracking(
        env,
        OperationType.COLUMN_MODIFY,
        dbId,
        userEmail ?? 'unknown',
        isLocalDev,
        { tableName, columnName, updates: body }
      );

      try {
        // Table recreation required for modifying columns
        const modificationParams: { action: 'modify'; columnName: string; newColumnDef?: { type?: string; notnull?: boolean; defaultValue?: string } } = {
          action: 'modify',
          columnName,
        };
        if (body) {
          modificationParams.newColumnDef = body;
        }
        await recreateTableWithModifiedColumn(dbId, tableName, modificationParams, env);

        // Get updated schema
        const sanitizedTable = sanitizeIdentifier(tableName);
        const schemaResult = await executeQueryViaAPI(dbId, `PRAGMA table_info("${sanitizedTable}")`, env);

        // Complete job tracking
        await finishJobTracking(env, jobId, 'completed', userEmail ?? 'unknown', isLocalDev, { processedItems: 1, errorCount: 0 });

        return new Response(JSON.stringify({
          result: schemaResult.results,
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      } catch (err) {
        // Mark job as failed
        await finishJobTracking(env, jobId, 'failed', userEmail ?? 'unknown', isLocalDev, {
          processedItems: 0,
          errorCount: 1,
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        });
        throw err;
      }
    }

    // Delete column (requires table recreation)
    if (request.method === 'DELETE' && /^\/api\/tables\/[^/]+\/[^/]+\/columns\/[^/]+$/.exec(url.pathname)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      const columnName = decodeURIComponent(pathParts[6] ?? '');
      logInfo(`Deleting column: ${columnName} from table: ${tableName}`, { module: 'tables', operation: 'delete_column', databaseId: dbId, metadata: { tableName, columnName } });

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Start job tracking
      const jobId = await startJobTracking(
        env,
        OperationType.COLUMN_DELETE,
        dbId,
        userEmail ?? 'unknown',
        isLocalDev,
        { tableName, columnName }
      );

      try {
        // NOTE: Bookmark capture disabled - Export API was causing database locks
        // TODO: Re-enable when D1 export API behavior is fixed

        // Capture snapshot before drop
        try {
          const snapshot = await captureColumnSnapshot(dbId, tableName, columnName, env);
          await saveUndoSnapshot(
            dbId,
            'DROP_COLUMN',
            tableName,
            columnName,
            `Dropped column "${columnName}" from table "${tableName}"`,
            snapshot,
            userEmail,
            env
          );
        } catch (snapshotErr) {
          void logError(env, snapshotErr instanceof Error ? snapshotErr : String(snapshotErr), { module: 'tables', operation: 'column_snapshot', databaseId: dbId, metadata: { tableName, columnName } }, isLocalDev);
          // Continue with drop even if snapshot fails
        }

        const sanitizedTable = sanitizeIdentifier(tableName);
        const sanitizedColumn = sanitizeIdentifier(columnName);

        // Use ALTER TABLE DROP COLUMN (supported in SQLite 3.35.0+)
        const query = `ALTER TABLE "${sanitizedTable}" DROP COLUMN "${sanitizedColumn}"`;

        await executeQueryViaAPI(dbId, query, env);

        // Complete job tracking
        await finishJobTracking(env, jobId, 'completed', userEmail ?? 'unknown', isLocalDev, { processedItems: 1, errorCount: 0 });

        return new Response(JSON.stringify({
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      } catch (err) {
        // Mark job as failed
        await finishJobTracking(env, jobId, 'failed', userEmail ?? 'unknown', isLocalDev, {
          processedItems: 0,
          errorCount: 1,
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        });
        throw err;
      }
    }

    // Delete rows with undo snapshot
    if (request.method === 'POST' && /^\/api\/tables\/[^/]+\/[^/]+\/rows\/delete$/.exec(url.pathname)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      logInfo(`Deleting rows from table: ${tableName}`, { module: 'tables', operation: 'delete_rows', databaseId: dbId, metadata: { tableName } });

      const body = await parseJsonBody<{ whereClause?: string; description?: string }>(request);

      if (!body?.whereClause) {
        return new Response(JSON.stringify({
          error: 'WHERE clause required'
        }), {
          status: 400,
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          success: true,
          rowsDeleted: 1
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Start job tracking
      const jobId = await startJobTracking(
        env,
        OperationType.ROW_DELETE,
        dbId,
        userEmail ?? 'unknown',
        isLocalDev,
        { tableName, whereClause: body.whereClause }
      );

      try {
        // NOTE: Bookmark capture disabled - Export API was causing database locks
        // TODO: Re-enable when D1 export API behavior is fixed

        // Capture snapshot before delete
        try {
          const snapshot = await captureRowSnapshot(dbId, tableName, body.whereClause, env);
          const rowCount = snapshot.rowData?.rows.length ?? 0;

          await saveUndoSnapshot(
            dbId,
            'DELETE_ROW',
            tableName,
            null,
            body.description ?? `Deleted ${String(rowCount)} row(s) from table "${tableName}"`,
            snapshot,
            userEmail,
            env
          );
        } catch (snapshotErr) {
          void logError(env, snapshotErr instanceof Error ? snapshotErr : String(snapshotErr), { module: 'tables', operation: 'row_snapshot', databaseId: dbId, metadata: { tableName } }, isLocalDev);
          // Continue with delete even if snapshot fails
        }

        // Execute delete
        const sanitizedTable = sanitizeIdentifier(tableName);
        const deleteQuery = `DELETE FROM "${sanitizedTable}"${body.whereClause}`;
        const result = await executeQueryViaAPI(dbId, deleteQuery, env);

        const rowsDeleted = (result.meta['changes'] as number | undefined) ?? 0;

        // Complete job tracking
        await finishJobTracking(env, jobId, 'completed', userEmail ?? 'unknown', isLocalDev, { processedItems: 1, errorCount: 0 });

        // Trigger bulk_delete_complete webhook if rows were deleted
        if (rowsDeleted > 0) {
          const dbInfo = await getDatabaseInfo(dbId, env);
          void triggerWebhooks(
            env,
            'bulk_delete_complete',
            createBulkDeleteCompletePayload(dbId, dbInfo?.name ?? 'unknown', tableName, rowsDeleted, userEmail),
            isLocalDev
          );
        }

        return new Response(JSON.stringify({
          success: true,
          rowsDeleted
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      } catch (err) {
        // Mark job as failed
        await finishJobTracking(env, jobId, 'failed', userEmail ?? 'unknown', isLocalDev, {
          processedItems: 0,
          errorCount: 1,
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        });
        throw err;
      }
    }

    // Get table dependencies (foreign keys)
    // OPTIMIZED: Builds complete FK index in single pass to minimize API calls
    // Previously made O(M * N) API calls, now makes O(N) calls where N = total tables
    if (request.method === 'GET' && url.pathname === `/api/tables/${dbId}/dependencies`) {
      const tablesParam = url.searchParams.get('tables');
      if (!tablesParam) {
        return new Response(JSON.stringify({
          error: 'Tables parameter required'
        }), {
          status: 400,
          headers: jsonHeaders(corsHeaders)
        });
      }

      const tableNames = tablesParam.split(',').map(t => t.trim());
      logInfo(`Getting dependencies for tables: ${tableNames.join(', ')}`, { module: 'tables', operation: 'dependencies', databaseId: dbId, metadata: { tableCount: tableNames.length } });

      // Define types for dependencies
      interface ForeignKeyDependency {
        table: string;
        column: string;
        onDelete: string | null;
        onUpdate: string | null;
        rowCount: number;
      }

      interface TableDependencies {
        outbound: ForeignKeyDependency[];
        inbound: ForeignKeyDependency[];
      }

      // Mock response for local development
      if (isLocalDev) {
        const mockDependencies: Record<string, TableDependencies> = {};
        tableNames.forEach(tableName => {
          if (tableName === 'comments') {
            mockDependencies[tableName] = {
              outbound: [
                { table: 'posts', column: 'post_id', onDelete: 'CASCADE', onUpdate: null, rowCount: 152 }
              ],
              inbound: []
            };
          } else if (tableName === 'posts') {
            mockDependencies[tableName] = {
              outbound: [
                { table: 'users', column: 'user_id', onDelete: 'SET NULL', onUpdate: null, rowCount: 45 }
              ],
              inbound: [
                { table: 'comments', column: 'post_id', onDelete: 'CASCADE', onUpdate: null, rowCount: 152 }
              ]
            };
          } else {
            mockDependencies[tableName] = {
              outbound: [],
              inbound: []
            };
          }
        });

        return new Response(JSON.stringify({
          result: mockDependencies,
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      // OPTIMIZATION: Build complete FK index in single pass
      // Step 1: Get all tables ONCE (instead of per table being deleted)
      const tableListQuery = "PRAGMA table_list";
      const tableListResult = await executeQueryViaAPI(dbId, tableListQuery, env);
      const allTables = (tableListResult.results as { name: string; type: string }[])
        .filter(t => !t.name.startsWith('sqlite_') && !t.name.startsWith('_cf_') && t.type === 'table');

      // Step 2: Build FK index for ALL tables in database
      // This is O(N) calls instead of O(M * N) where M = tables to delete
      interface FKIndexEntry {
        sourceTable: string;
        sourceColumn: string;
        targetTable: string;
        targetColumn: string;
        onDelete: string;
        onUpdate: string;
      }

      const fkIndex: FKIndexEntry[] = [];

      // Collect FK info from all tables
      for (const tableInfo of allTables) {
        const sanitizedTable = sanitizeIdentifier(tableInfo.name);
        const fkQuery = `PRAGMA foreign_key_list("${sanitizedTable}")`;
        try {
          const fkResult = await executeQueryViaAPI(dbId, fkQuery, env);
          const fks = fkResult.results as {
            id: number;
            seq: number;
            table: string;
            from: string;
            to: string;
            on_update: string;
            on_delete: string;
            match: string;
          }[];

          for (const fk of fks) {
            fkIndex.push({
              sourceTable: tableInfo.name,
              sourceColumn: fk.from,
              targetTable: fk.table,
              targetColumn: fk.to,
              onDelete: fk.on_delete,
              onUpdate: fk.on_update
            });
          }
        } catch (err) {
          // Skip tables that can't be queried (e.g., FTS5 virtual tables)
          logWarning(`Could not get FK info for table ${tableInfo.name}: ${err instanceof Error ? err.message : String(err)}`, {
            module: 'tables',
            operation: 'dependencies',
            databaseId: dbId
          });
        }
      }

      // Step 3: Collect all tables that need row counts
      const tablesNeedingRowCount = new Set<string>();

      for (const tableName of tableNames) {
        // Tables being deleted need row counts for outbound FKs
        tablesNeedingRowCount.add(tableName);

        // Tables referencing the deleted tables (inbound) need row counts
        for (const fk of fkIndex) {
          if (fk.targetTable === tableName) {
            tablesNeedingRowCount.add(fk.sourceTable);
          }
        }
      }

      // Step 4: Get row counts in batched fashion
      // Use a single compound query for efficiency
      const rowCounts = new Map<string, number>();
      const tablesToCount = Array.from(tablesNeedingRowCount);

      // Batch row count queries (max 10 at a time to avoid overly complex queries)
      const BATCH_SIZE = 10;
      for (let i = 0; i < tablesToCount.length; i += BATCH_SIZE) {
        const batch = tablesToCount.slice(i, i + BATCH_SIZE);

        // Execute count queries for this batch
        for (const tableName of batch) {
          const sanitizedTable = sanitizeIdentifier(tableName);
          try {
            const countQuery = `SELECT COUNT(*) as count FROM "${sanitizedTable}"`;
            const countResult = await executeQueryViaAPI(dbId, countQuery, env);
            const firstResult = countResult.results[0] as { count: number } | undefined;
            rowCounts.set(tableName, firstResult?.count ?? 0);
          } catch {
            // If count fails (e.g., for virtual tables), default to 0
            rowCounts.set(tableName, 0);
          }
        }
      }

      // Step 5: Build dependency response from the index
      const dependencies: Record<string, TableDependencies> = {};

      for (const tableName of tableNames) {
        // Outbound FKs: this table references other tables
        const outbound: ForeignKeyDependency[] = [];
        const processedOutbound = new Set<string>();

        for (const fk of fkIndex) {
          if (fk.sourceTable === tableName) {
            const key = `${fk.targetTable}_${fk.sourceColumn}`;
            if (!processedOutbound.has(key)) {
              processedOutbound.add(key);
              outbound.push({
                table: fk.targetTable,
                column: fk.sourceColumn,
                onDelete: fk.onDelete || null,
                onUpdate: fk.onUpdate || null,
                rowCount: rowCounts.get(tableName) ?? 0
              });
            }
          }
        }

        // Inbound FKs: other tables reference this table
        const inbound: ForeignKeyDependency[] = [];
        const processedInbound = new Set<string>();

        for (const fk of fkIndex) {
          if (fk.targetTable === tableName) {
            const key = `${fk.sourceTable}_${fk.sourceColumn}`;
            if (!processedInbound.has(key)) {
              processedInbound.add(key);
              inbound.push({
                table: fk.sourceTable,
                column: fk.sourceColumn,
                onDelete: fk.onDelete || null,
                onUpdate: fk.onUpdate || null,
                rowCount: rowCounts.get(fk.sourceTable) ?? 0
              });
            }
          }
        }

        dependencies[tableName] = {
          outbound,
          inbound
        };
      }

      logInfo(`Dependencies computed for ${String(tableNames.length)} tables using optimized FK index`, {
        module: 'tables',
        operation: 'dependencies',
        databaseId: dbId,
        metadata: {
          tableCount: tableNames.length,
          totalTablesScanned: allTables.length,
          fkIndexSize: fkIndex.length,
          rowCountQueries: tablesToCount.length
        }
      });

      return new Response(JSON.stringify({
        result: dependencies,
        success: true
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    // Simulate cascade impact for deletion
    if (request.method === 'POST' && url.pathname === `/api/tables/${dbId}/simulate-cascade`) {
      logInfo('Simulating cascade impact', { module: 'tables', operation: 'cascade_impact', databaseId: dbId });

      const body = await parseJsonBody<{ targetTable?: string; whereClause?: string }>(request);

      if (!body?.targetTable) {
        return new Response(JSON.stringify({
          error: 'Target table is required'
        }), {
          status: 400,
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Mock response for local development
      if (isLocalDev) {
        // Provide comprehensive mock data with circular dependencies
        const mockSimulation = {
          targetTable: body.targetTable,
          whereClause: body.whereClause,
          totalAffectedRows: 287,
          maxDepth: 3,
          cascadePaths: [
            {
              id: 'path-1',
              sourceTable: body.targetTable,
              targetTable: 'comments',
              action: 'CASCADE',
              depth: 1,
              affectedRows: 152,
              column: 'post_id'
            },
            {
              id: 'path-2',
              sourceTable: body.targetTable,
              targetTable: 'likes',
              action: 'CASCADE',
              depth: 1,
              affectedRows: 89,
              column: 'post_id'
            },
            {
              id: 'path-3',
              sourceTable: 'comments',
              targetTable: 'comment_likes',
              action: 'CASCADE',
              depth: 2,
              affectedRows: 45,
              column: 'comment_id'
            },
            {
              id: 'path-4',
              sourceTable: body.targetTable,
              targetTable: 'users',
              action: 'SET NULL',
              depth: 1,
              affectedRows: 1,
              column: 'last_post_id'
            }
          ],
          affectedTables: [
            {
              tableName: body.targetTable,
              action: 'DELETE',
              rowsBefore: 1,
              rowsAfter: 0,
              depth: 0
            },
            {
              tableName: 'comments',
              action: 'CASCADE',
              rowsBefore: 152,
              rowsAfter: 0,
              depth: 1
            },
            {
              tableName: 'likes',
              action: 'CASCADE',
              rowsBefore: 89,
              rowsAfter: 0,
              depth: 1
            },
            {
              tableName: 'comment_likes',
              action: 'CASCADE',
              rowsBefore: 45,
              rowsAfter: 0,
              depth: 2
            },
            {
              tableName: 'users',
              action: 'SET NULL',
              rowsBefore: 1,
              rowsAfter: 1,
              depth: 1
            }
          ],
          warnings: [
            {
              type: 'high_impact',
              message: 'Deletion will cascade to 286 additional rows across 4 tables',
              severity: 'high'
            },
            {
              type: 'deep_cascade',
              message: 'Cascade chain reaches depth of 3 levels',
              severity: 'medium'
            }
          ],
          constraints: [],
          circularDependencies: []
        };

        return new Response(JSON.stringify({
          result: mockSimulation,
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Perform cascade simulation
      const simulation = await simulateCascadeImpact(dbId, body.targetTable, body.whereClause, env);

      return new Response(JSON.stringify({
        result: simulation,
        success: true
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    // Get all foreign keys for database (with optional cycle detection and full schemas)
    // Use ?includeCycles=true to get both FK graph and cycles in single request
    // Use ?includeSchemas=true to get full column schemas for ER diagram (avoids N+1 queries)
    if (request.method === 'GET' && url.pathname === `/api/tables/${dbId}/foreign-keys`) {
      const includeCycles = url.searchParams.get('includeCycles') === 'true';
      const includeSchemas = url.searchParams.get('includeSchemas') === 'true';
      logInfo(`Getting all foreign keys for database: ${dbId}${includeCycles ? ' (with cycles)' : ''}${includeSchemas ? ' (with schemas)' : ''}`, { module: 'tables', operation: 'all_foreign_keys', databaseId: dbId, metadata: { includeCycles, includeSchemas } });

      // Mock response for local development
      if (isLocalDev) {
        const mockResult: {
          nodes: { id: string; label: string; columns: { name: string; type: string; isPK: boolean }[]; rowCount: number }[];
          edges: { id: string; source: string; target: string; sourceColumn: string; targetColumn: string; onDelete: string; onUpdate: string }[];
          cycles?: { tables: string[]; path: string; severity: string; cascadeRisk: boolean; restrictPresent: boolean; constraintNames: string[]; message: string }[];
          schemas?: Record<string, { cid: number; name: string; type: string; notnull: number; dflt_value: string | null; pk: number }[]>;
        } = {
          nodes: [
            { id: 'users', label: 'users', columns: [{ name: 'id', type: 'INTEGER', isPK: true }], rowCount: 50 },
            { id: 'posts', label: 'posts', columns: [{ name: 'id', type: 'INTEGER', isPK: true }, { name: 'user_id', type: 'INTEGER', isPK: false }], rowCount: 120 },
            { id: 'comments', label: 'comments', columns: [{ name: 'id', type: 'INTEGER', isPK: true }, { name: 'post_id', type: 'INTEGER', isPK: false }], rowCount: 340 }
          ],
          edges: [
            { id: 'fk_posts_user', source: 'posts', target: 'users', sourceColumn: 'user_id', targetColumn: 'id', onDelete: 'SET NULL', onUpdate: 'CASCADE' },
            { id: 'fk_comments_post', source: 'comments', target: 'posts', sourceColumn: 'post_id', targetColumn: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' }
          ]
        };

        if (includeCycles) {
          mockResult.cycles = [
            {
              tables: ['users', 'profiles', 'users'],
              path: 'users → profiles → users',
              severity: 'medium',
              cascadeRisk: false,
              restrictPresent: true,
              constraintNames: ['fk_profiles_user', 'fk_users_profile'],
              message: 'Circular dependency detected: users → profiles → users (contains RESTRICT constraints)'
            }
          ];
        }

        if (includeSchemas) {
          mockResult.schemas = {
            'users': [{ cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 }],
            'posts': [{ cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 }, { cid: 1, name: 'user_id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 }],
            'comments': [{ cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 }, { cid: 1, name: 'post_id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 }]
          };
        }

        return new Response(JSON.stringify({
          result: mockResult,
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Get all foreign keys for the entire database (optionally with full schemas)
      const fkGraphResult = await getAllForeignKeysForDatabase(dbId, env, includeSchemas);

      // Optionally include cycle detection in same response to save API calls
      if (includeCycles) {
        const { detectCircularDependencies } = await import('../utils/circular-dependency-detector');
        const cycles = detectCircularDependencies(fkGraphResult);

        return new Response(JSON.stringify({
          result: { ...fkGraphResult, cycles },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      return new Response(JSON.stringify({
        result: fkGraphResult,
        success: true
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    // Get circular dependencies in database (standalone endpoint for backwards compatibility)
    if (request.method === 'GET' && url.pathname === `/api/tables/${dbId}/circular-dependencies`) {
      logInfo(`Detecting circular dependencies for database: ${dbId}`, { module: 'tables', operation: 'circular_deps', databaseId: dbId });

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: [
            {
              tables: ['users', 'profiles', 'users'],
              path: 'users → profiles → users',
              severity: 'medium',
              cascadeRisk: false,
              restrictPresent: true,
              constraintNames: ['fk_profiles_user', 'fk_users_profile'],
              message: 'Circular dependency detected: users → profiles → users (contains RESTRICT constraints)'
            }
          ],
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Get FK graph and detect cycles (using lightweight version - skips schema/row count queries)
      const { detectCircularDependencies } = await import('../utils/circular-dependency-detector');
      const fkGraphResult = await getForeignKeyGraphForCycleDetection(dbId, env);
      const cycles = detectCircularDependencies(fkGraphResult);

      return new Response(JSON.stringify({
        result: cycles,
        success: true
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    // Simulate adding a foreign key (check for cycles)
    if (request.method === 'POST' && url.pathname === `/api/tables/${dbId}/foreign-keys/simulate`) {
      logInfo('Simulating foreign key addition', { module: 'tables', operation: 'fk_simulate', databaseId: dbId });

      const body = await parseJsonBody<{ sourceTable?: string; targetTable?: string }>(request);

      if (!body?.sourceTable || !body.targetTable) {
        return new Response(JSON.stringify({
          error: 'sourceTable and targetTable are required'
        }), {
          status: 400,
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: {
            wouldCreateCycle: false
          },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Get FK graph and simulate addition (using lightweight version - skips schema/row count queries)
      const { wouldCreateCycle } = await import('../utils/circular-dependency-detector');
      const fkGraphResult = await getForeignKeyGraphForCycleDetection(dbId, env);
      const simulation = wouldCreateCycle(fkGraphResult, body.sourceTable, body.targetTable);

      return new Response(JSON.stringify({
        result: simulation,
        success: true
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    // Add foreign key constraint
    if (request.method === 'POST' && url.pathname === `/api/tables/${dbId}/foreign-keys/add`) {
      logInfo('Adding foreign key constraint', { module: 'tables', operation: 'fk_add', databaseId: dbId });

      const body = await parseJsonBody<{ sourceTable?: string; sourceColumn?: string; targetTable?: string; targetColumn?: string; onDelete?: string; onUpdate?: string; constraintName?: string }>(request);

      if (!body?.sourceTable || !body.sourceColumn || !body.targetTable || !body.targetColumn) {
        return new Response(JSON.stringify({
          error: 'sourceTable, sourceColumn, targetTable, and targetColumn are required'
        }), {
          status: 400,
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: { success: true, message: 'Foreign key added successfully (mock)' },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Start job tracking
      const jobId = await startJobTracking(
        env,
        OperationType.FOREIGN_KEY_ADD,
        dbId,
        userEmail ?? 'unknown',
        isLocalDev,
        {
          sourceTable: body.sourceTable,
          sourceColumn: body.sourceColumn,
          targetTable: body.targetTable,
          targetColumn: body.targetColumn
        }
      );

      try {
        // Add the foreign key constraint - we've validated that sourceTable etc. exist
        const fkParams: { sourceTable: string; sourceColumn: string; targetTable: string; targetColumn: string; onDelete: string; onUpdate: string; constraintName?: string } = {
          sourceTable: body.sourceTable,
          sourceColumn: body.sourceColumn,
          targetTable: body.targetTable,
          targetColumn: body.targetColumn,
          onDelete: body.onDelete ?? 'NO ACTION',
          onUpdate: body.onUpdate ?? 'NO ACTION',
        };
        if (body.constraintName) {
          fkParams.constraintName = body.constraintName;
        }
        await addForeignKeyConstraint(dbId, fkParams, env);

        // Complete job tracking
        await finishJobTracking(env, jobId, 'completed', userEmail ?? 'unknown', isLocalDev, { processedItems: 1, errorCount: 0 });

        return new Response(JSON.stringify({
          result: { success: true, message: 'Foreign key constraint added successfully' },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      } catch (err) {
        // Mark job as failed
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        await finishJobTracking(env, jobId, 'failed', userEmail ?? 'unknown', isLocalDev, {
          processedItems: 0,
          errorCount: 1,
          errorMessage,
        });

        // Return specific error message to user
        void logError(env, `Foreign key add error: ${errorMessage}`, { module: 'tables', operation: 'fk_add', databaseId: dbId }, isLocalDev);
        return new Response(JSON.stringify({
          error: 'Failed to add foreign key constraint',
          message: errorMessage,
          success: false
        }), {
          status: 400,
          headers: jsonHeaders(corsHeaders)
        });
      }
    }

    // Modify foreign key constraint
    if (request.method === 'PATCH' && /^\/api\/tables\/[^/]+\/foreign-keys\/[^/]+$/.exec(url.pathname)) {
      const constraintName = decodeURIComponent(pathParts[5] ?? '');
      logInfo(`Modifying foreign key constraint: ${constraintName}`, { module: 'tables', operation: 'fk_modify', databaseId: dbId, metadata: { constraintName } });

      const body = await parseJsonBody<{ onDelete?: string; onUpdate?: string }>(request);

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: { success: true, message: 'Foreign key modified successfully (mock)' },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Start job tracking
      const jobId = await startJobTracking(
        env,
        OperationType.FOREIGN_KEY_MODIFY,
        dbId,
        userEmail ?? 'unknown',
        isLocalDev,
        { constraintName, updates: body }
      );

      try {
        // Modify the foreign key constraint
        await modifyForeignKeyConstraint(dbId, constraintName, body ?? {}, env);

        // Complete job tracking
        await finishJobTracking(env, jobId, 'completed', userEmail ?? 'unknown', isLocalDev, { processedItems: 1, errorCount: 0 });

        return new Response(JSON.stringify({
          result: { success: true, message: 'Foreign key constraint modified successfully' },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      } catch (err) {
        // Mark job as failed
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        await finishJobTracking(env, jobId, 'failed', userEmail ?? 'unknown', isLocalDev, {
          processedItems: 0,
          errorCount: 1,
          errorMessage,
        });

        // Return specific error message to user
        void logError(env, `Foreign key modify error: ${errorMessage}`, { module: 'tables', operation: 'fk_modify', databaseId: dbId, metadata: { constraintName } }, isLocalDev);
        return new Response(JSON.stringify({
          error: 'Failed to modify foreign key constraint',
          message: errorMessage,
          success: false
        }), {
          status: 400,
          headers: jsonHeaders(corsHeaders)
        });
      }
    }

    // Delete foreign key constraint
    if (request.method === 'DELETE' && /^\/api\/tables\/[^/]+\/foreign-keys\/[^/]+$/.exec(url.pathname)) {
      const constraintName = decodeURIComponent(pathParts[5] ?? '');
      logInfo(`Deleting foreign key constraint: ${constraintName}`, { module: 'tables', operation: 'fk_delete', databaseId: dbId, metadata: { constraintName } });

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: { success: true, message: 'Foreign key deleted successfully (mock)' },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Start job tracking
      const jobId = await startJobTracking(
        env,
        OperationType.FOREIGN_KEY_DELETE,
        dbId,
        userEmail ?? 'unknown',
        isLocalDev,
        { constraintName }
      );

      try {
        // Delete the foreign key constraint
        await deleteForeignKeyConstraint(dbId, constraintName, env);

        // Complete job tracking
        await finishJobTracking(env, jobId, 'completed', userEmail ?? 'unknown', isLocalDev, { processedItems: 1, errorCount: 0 });

        return new Response(JSON.stringify({
          result: { success: true, message: 'Foreign key constraint deleted successfully' },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      } catch (err) {
        // Mark job as failed
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        await finishJobTracking(env, jobId, 'failed', userEmail ?? 'unknown', isLocalDev, {
          processedItems: 0,
          errorCount: 1,
          errorMessage,
        });

        // Return specific error message to user
        void logError(env, `Foreign key delete error: ${errorMessage}`, { module: 'tables', operation: 'fk_delete', databaseId: dbId, metadata: { constraintName } }, isLocalDev);
        return new Response(JSON.stringify({
          error: 'Failed to delete foreign key constraint',
          message: errorMessage,
          success: false
        }), {
          status: 400,
          headers: jsonHeaders(corsHeaders)
        });
      }
    }

    // Get full database schema for comparison (includes tables, columns, indexes, triggers, FKs)
    if (request.method === 'GET' && url.pathname === `/api/tables/${dbId}/schema-full`) {
      logInfo(`Getting full schema for database: ${dbId}`, { module: 'tables', operation: 'schema_full', databaseId: dbId });

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: {
            tables: [
              {
                name: 'users',
                type: 'table',
                strict: 0,
                columns: [
                  { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 },
                  { cid: 1, name: 'email', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
                  { cid: 2, name: 'name', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 }
                ]
              },
              {
                name: 'posts',
                type: 'table',
                strict: 0,
                columns: [
                  { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 },
                  { cid: 1, name: 'user_id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0 },
                  { cid: 2, name: 'title', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 }
                ]
              }
            ],
            indexes: [
              { table: 'users', name: 'idx_users_email', unique: 1, columns: ['email'] },
              { table: 'posts', name: 'idx_posts_user_id', unique: 0, columns: ['user_id'] }
            ],
            triggers: [],
            foreignKeys: [
              { table: 'posts', column: 'user_id', refTable: 'users', refColumn: 'id', onDelete: 'CASCADE', onUpdate: 'NO ACTION' }
            ]
          },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }

      try {
        // Get all tables
        const tableListResult = await executeQueryViaAPI(dbId, "PRAGMA table_list", env);
        const allTables = (tableListResult.results as { name: string; type: string; strict: number }[])
          .filter(t => !t.name.startsWith('sqlite_') && !t.name.startsWith('_cf_'));

        interface ColumnInfo {
          cid: number;
          name: string;
          type: string;
          notnull: number;
          dflt_value: string | null;
          pk: number;
        }

        interface TableWithColumns {
          name: string;
          type: string;
          strict: number;
          columns: ColumnInfo[];
        }

        interface IndexInfo {
          table: string;
          name: string;
          unique: number;
          columns: string[];
          partial: number;
        }

        interface TriggerInfo {
          name: string;
          table: string;
          sql: string;
        }

        interface ForeignKeyInfo {
          table: string;
          column: string;
          refTable: string;
          refColumn: string;
          onDelete: string;
          onUpdate: string;
        }

        const tables: TableWithColumns[] = [];
        const indexes: IndexInfo[] = [];
        const triggers: TriggerInfo[] = [];
        const foreignKeys: ForeignKeyInfo[] = [];

        // Process in batches to avoid rate limits
        const BATCH_SIZE = 5;

        for (let i = 0; i < allTables.length; i += BATCH_SIZE) {
          const batch = allTables.slice(i, i + BATCH_SIZE);

          const batchResults = await Promise.all(
            batch.map(async (table) => {
              const sanitizedTable = sanitizeIdentifier(table.name);

              try {
                // Execute schema, index, and FK queries in parallel
                const [schemaResult, indexListResult, fkResult] = await Promise.all([
                  executeQueryViaAPI(dbId, `PRAGMA table_info("${sanitizedTable}")`, env),
                  executeQueryViaAPI(dbId, `PRAGMA index_list("${sanitizedTable}")`, env),
                  executeQueryViaAPI(dbId, `PRAGMA foreign_key_list("${sanitizedTable}")`, env)
                ]);

                const columns = schemaResult.results as ColumnInfo[];
                const tableIndexes = indexListResult.results as { seq: number; name: string; unique: number; origin: string; partial: number }[];
                const fks = fkResult.results as { id: number; seq: number; table: string; from: string; to: string; on_update: string; on_delete: string }[];

                // Get index column details
                const indexDetails: IndexInfo[] = [];
                for (const idx of tableIndexes) {
                  if (idx.origin !== 'pk') { // Skip auto-created PK indexes
                    try {
                      const idxInfoResult = await executeQueryViaAPI(dbId, `PRAGMA index_info("${idx.name}")`, env);
                      const idxCols = (idxInfoResult.results as { name: string }[]).map(c => c.name);
                      indexDetails.push({
                        table: table.name,
                        name: idx.name,
                        unique: idx.unique,
                        columns: idxCols,
                        partial: idx.partial
                      });
                    } catch {
                      // Skip indexes we can't query
                    }
                  }
                }

                return {
                  table: {
                    name: table.name,
                    type: table.type,
                    strict: table.strict ?? 0,
                    columns
                  },
                  indexes: indexDetails,
                  foreignKeys: fks.map(fk => ({
                    table: table.name,
                    column: fk.from,
                    refTable: fk.table,
                    refColumn: fk.to,
                    onDelete: fk.on_delete || 'NO ACTION',
                    onUpdate: fk.on_update || 'NO ACTION'
                  }))
                };
              } catch (err) {
                logWarning(`Skipping table "${table.name}" in schema-full: ${err instanceof Error ? err.message : 'Unknown error'}`, {
                  module: 'tables',
                  operation: 'schema_full_table',
                  databaseId: dbId,
                  metadata: { tableName: table.name }
                });
                return null;
              }
            })
          );

          // Aggregate results
          for (const result of batchResults) {
            if (result) {
              tables.push(result.table);
              indexes.push(...result.indexes);
              foreignKeys.push(...result.foreignKeys);
            }
          }
        }

        // Get triggers from sqlite_master
        try {
          const triggerResult = await executeQueryViaAPI(
            dbId,
            "SELECT name, tbl_name as table_name, sql FROM sqlite_master WHERE type='trigger'",
            env
          );
          const triggerRows = triggerResult.results as { name: string; table_name: string; sql: string }[];
          for (const t of triggerRows) {
            if (t.sql) {
              triggers.push({
                name: t.name,
                table: t.table_name,
                sql: t.sql
              });
            }
          }
        } catch {
          // Triggers query may fail on some databases, continue without them
        }

        return new Response(JSON.stringify({
          result: {
            tables,
            indexes,
            triggers,
            foreignKeys
          },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      } catch (err) {
        void logError(env, err instanceof Error ? err : String(err), { module: 'tables', operation: 'schema_full', databaseId: dbId }, isLocalDev);
        return new Response(JSON.stringify({
          error: 'Failed to get full schema',
          message: err instanceof Error ? err.message : 'Unknown error'
        }), {
          status: 500,
          headers: jsonHeaders(corsHeaders)
        });
      }
    }

    return new Response(JSON.stringify({
      error: 'Route not found'
    }), {

      status: 404,
      headers: jsonHeaders(corsHeaders)
    });

  } catch (err) {
    // Log full error details on server only
    void logError(env, err instanceof Error ? err : String(err), { module: 'tables', operation: 'request', databaseId: dbId }, isLocalDev);

    // Extract meaningful error message
    let errorMessage = 'Unable to complete table operation. Please try again.';
    const errorStr = err instanceof Error ? err.message : String(err);

    // Check for D1-specific errors
    if (errorStr.includes('Currently processing a long-running export')) {
      errorMessage = 'Database is currently processing an export. Please wait a few minutes and try again.';
    } else if (errorStr.includes('SQLITE_BUSY')) {
      errorMessage = 'Database is busy. Please wait a moment and try again.';
    }

    return new Response(JSON.stringify({
      error: 'Table operation failed',
      message: errorMessage
    }), {
      status: 500,
      headers: jsonHeaders(corsHeaders)
    });
  }
}

/**
 * Recreate a table with modified column definitions
 * This is required for operations SQLite doesn't support directly like DROP COLUMN or MODIFY COLUMN
 */
async function recreateTableWithModifiedColumn(
  dbId: string,
  tableName: string,
  modification: {
    action: 'drop' | 'modify';
    columnName: string;
    newColumnDef?: {
      type?: string;
      notnull?: boolean;
      defaultValue?: string;
    };
  },
  env: Env
): Promise<void> {
  const sanitizedTable = sanitizeIdentifier(tableName);
  const tempTableName = `${tableName}_temp_${String(Date.now())}`;
  const sanitizedTempTable = sanitizeIdentifier(tempTableName);

  try {
    // 1. Get current schema
    const schemaResult = await executeQueryViaAPI(dbId, `PRAGMA table_info("${sanitizedTable}")`, env);
    const columns = schemaResult.results as {
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }[];

    // 2. Build new column definitions
    let newColumns = columns;
    if (modification.action === 'drop') {
      // Remove the column
      newColumns = columns.filter(col => col.name !== modification.columnName);
    } else if (modification.newColumnDef) {
      // action is 'modify' at this point, extract to local variable for TypeScript narrowing
      const newColDef = modification.newColumnDef;
      // Modify the column
      newColumns = columns.map(col => {
        if (col.name === modification.columnName) {
          return {
            ...col,
            type: newColDef.type ?? col.type,
            notnull: newColDef.notnull !== undefined
              ? (newColDef.notnull ? 1 : 0)
              : col.notnull,
            dflt_value: newColDef.defaultValue ?? col.dflt_value
          };
        }
        return col;
      });
    }

    // 3. Create temporary table with new schema
    const columnDefs = newColumns.map(col => {
      let def = `"${col.name}" ${col.type ?? 'TEXT'}`;
      if (col.pk > 0) def += ' PRIMARY KEY';
      if (col.notnull && col.pk === 0) def += ' NOT NULL';
      if (col.dflt_value !== null && col.dflt_value !== '') {
        const defaultVal = col.dflt_value.trim();
        if (!isNaN(Number(defaultVal)) && defaultVal !== '') {
          def += ` DEFAULT ${defaultVal}`;
        } else if (defaultVal.toUpperCase() === 'CURRENT_TIMESTAMP' || defaultVal.toUpperCase() === 'NULL') {
          def += ` DEFAULT ${defaultVal}`;
        } else {
          def += ` DEFAULT '${defaultVal.replace(/'/g, "''")}'`;
        }
      }
      return def;
    }).join(', ');

    const createTableQuery = `CREATE TABLE "${sanitizedTempTable}" (${columnDefs})`;
    await executeQueryViaAPI(dbId, createTableQuery, env);

    // 4. Copy data from original table to temp table
    const columnNames = newColumns.map(col => `"${col.name}"`).join(', ');
    const copyDataQuery = `INSERT INTO "${sanitizedTempTable}" (${columnNames}) SELECT ${columnNames} FROM "${sanitizedTable}"`;
    await executeQueryViaAPI(dbId, copyDataQuery, env);

    // 5. Drop original table
    const dropTableQuery = `DROP TABLE "${sanitizedTable}"`;
    await executeQueryViaAPI(dbId, dropTableQuery, env);

    // 6. Rename temp table to original name
    const renameTableQuery = `ALTER TABLE "${sanitizedTempTable}" RENAME TO "${sanitizedTable}"`;
    await executeQueryViaAPI(dbId, renameTableQuery, env);

    // 7. Recreate indexes (if any)
    // Note: For simplicity, we're not handling indexes in this implementation
    // In production, you'd want to get and recreate indexes as well

  } catch (err) {
    // If anything fails, try to clean up temp table
    try {
      await executeQueryViaAPI(dbId, `DROP TABLE IF EXISTS "${sanitizedTempTable}"`, env);
    } catch (cleanupErr) {
      logWarning(`Failed to clean up temp table: ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`, { module: 'tables', operation: 'cleanup_temp_table', databaseId: dbId });
    }
    throw err;
  }
}

/**
 * Simulate cascade impact of deleting rows from a table
 */
async function simulateCascadeImpact(
  dbId: string,
  targetTable: string,
  whereClause: string | undefined,
  env: Env
): Promise<{
  targetTable: string;
  whereClause?: string;
  totalAffectedRows: number;
  maxDepth: number;
  cascadePaths: {
    id: string;
    sourceTable: string;
    targetTable: string;
    action: string;
    depth: number;
    affectedRows: number;
    column: string;
  }[];
  affectedTables: {
    tableName: string;
    action: string;
    rowsBefore: number;
    rowsAfter: number;
    depth: number;
  }[];
  warnings: {
    type: string;
    message: string;
    severity: 'low' | 'medium' | 'high';
  }[];
  constraints: {
    table: string;
    message: string;
  }[];
  circularDependencies: {
    tables: string[];
    message: string;
  }[];
}> {
  const sanitizedTable = sanitizeIdentifier(targetTable);
  const maxDepth = 10; // Prevent infinite loops

  // Count rows that will be deleted from target table
  const whereCondition = whereClause ? ` WHERE ${whereClause}` : '';
  const countQuery = `SELECT COUNT(*) as count FROM "${sanitizedTable}"${whereCondition}`;
  const countResult = await executeQueryViaAPI(dbId, countQuery, env);
  const targetCountRow = countResult.results[0] as { count: number } | undefined;
  const targetRowCount = targetCountRow?.count ?? 0;

  if (targetRowCount === 0) {
    // No rows to delete, return empty simulation
    const emptyResult: {
      targetTable: string;
      whereClause?: string;
      totalAffectedRows: number;
      maxDepth: number;
      cascadePaths: never[];
      affectedTables: never[];
      warnings: never[];
      constraints: never[];
      circularDependencies: never[];
    } = {
      targetTable,
      totalAffectedRows: 0,
      maxDepth: 0,
      cascadePaths: [],
      affectedTables: [],
      warnings: [],
      constraints: [],
      circularDependencies: []
    };
    if (whereClause) emptyResult.whereClause = whereClause;
    return emptyResult;
  }

  // OPTIMIZATION: Build complete FK index upfront instead of querying inside BFS loop
  // Step 1: Get all tables in database ONCE
  const tableListResult = await executeQueryViaAPI(dbId, "PRAGMA table_list", env);
  const allTables = (tableListResult.results as { name: string; type: string }[])
    .filter(t => !t.name.startsWith('sqlite_') && !t.name.startsWith('_cf_') && t.type === 'table');

  // Step 2: Build FK index for ALL tables in a single pass - O(N) instead of O(M*N)
  interface FKEdge {
    sourceTable: string;
    sourceColumn: string;
    targetTable: string;
    onDelete: string;
    onUpdate: string;
  }

  // Build reverse index: which tables reference which (target -> sources)
  const reverseIndex = new Map<string, FKEdge[]>();

  for (const tableInfo of allTables) {
    const sanitizedTableName = sanitizeIdentifier(tableInfo.name);
    try {
      const fkQuery = `PRAGMA foreign_key_list("${sanitizedTableName}")`;
      const fkResult = await executeQueryViaAPI(dbId, fkQuery, env);
      const fks = fkResult.results as {
        id: number;
        seq: number;
        table: string;
        from: string;
        to: string;
        on_update: string;
        on_delete: string;
        match: string;
      }[];

      for (const fk of fks) {
        const edge: FKEdge = {
          sourceTable: tableInfo.name,
          sourceColumn: fk.from,
          targetTable: fk.table,
          onDelete: fk.on_delete || 'NO ACTION',
          onUpdate: fk.on_update || 'NO ACTION'
        };

        // Add to reverse index (which tables reference targetTable)
        if (!reverseIndex.has(fk.table)) {
          reverseIndex.set(fk.table, []);
        }
        reverseIndex.get(fk.table)?.push(edge);
      }
    } catch {
      // Skip tables that can't be queried (e.g., FTS5 virtual tables)
    }
  }

  // Step 3: Build row count cache - fetch lazily as needed during BFS
  const rowCountCache = new Map<string, number>();

  // Helper to get row count with caching
  const getRowCount = async (tableName: string): Promise<number> => {
    if (rowCountCache.has(tableName)) {
      return rowCountCache.get(tableName) ?? 0;
    }
    try {
      const sanitizedName = sanitizeIdentifier(tableName);
      const countQ = `SELECT COUNT(*) as count FROM "${sanitizedName}"`;
      const countR = await executeQueryViaAPI(dbId, countQ, env);
      const row = countR.results[0] as { count: number } | undefined;
      const count = row?.count ?? 0;
      rowCountCache.set(tableName, count);
      return count;
    } catch {
      rowCountCache.set(tableName, 0);
      return 0;
    }
  };

  // Build dependency graph using the pre-built index
  const cascadePaths: {
    id: string;
    sourceTable: string;
    targetTable: string;
    action: string;
    depth: number;
    affectedRows: number;
    column: string;
  }[] = [];

  const affectedTablesMap = new Map<string, {
    tableName: string;
    action: string;
    rowsBefore: number;
    rowsAfter: number;
    depth: number;
  }>();

  const warnings: {
    type: string;
    message: string;
    severity: 'low' | 'medium' | 'high';
  }[] = [];

  const constraints: {
    table: string;
    message: string;
  }[] = [];

  const circularDeps = new Set<string>();

  // Add target table to affected tables
  affectedTablesMap.set(targetTable, {
    tableName: targetTable,
    action: 'DELETE',
    rowsBefore: targetRowCount,
    rowsAfter: 0,
    depth: 0
  });

  // Recursively analyze cascade impact using BFS with pre-built index
  const queue: { table: string; depth: number; parentRows: number }[] = [
    { table: targetTable, depth: 0, parentRows: targetRowCount }
  ];
  const visited = new Set<string>();
  const pathMap = new Map<string, Set<string>>(); // Track paths for circular detection

  let totalAffected = targetRowCount;
  let currentMaxDepth = 0;

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const { table: currentTable, depth, parentRows } = item;

    if (depth >= maxDepth) {
      warnings.push({
        type: 'max_depth',
        message: `Cascade analysis stopped at depth ${String(maxDepth)} to prevent infinite loops`,
        severity: 'high'
      });
      break;
    }

    currentMaxDepth = Math.max(currentMaxDepth, depth);

    // OPTIMIZED: Use reverse index to find tables referencing currentTable
    // Instead of iterating all tables and querying FKs for each
    const referencingEdges = reverseIndex.get(currentTable) ?? [];

    for (const edge of referencingEdges) {
      const action = edge.onDelete;

      // Check for circular dependencies
      if (!pathMap.has(currentTable)) {
        pathMap.set(currentTable, new Set());
      }
      const pathSet = pathMap.get(currentTable);
      if (pathSet) {
        pathSet.add(edge.sourceTable);
      }

      // Detect cycles
      if (visited.has(edge.sourceTable) && pathMap.has(edge.sourceTable)) {
        const cycle = [currentTable, edge.sourceTable];
        circularDeps.add(cycle.join(' -> '));
      }

      // Get row count from cache or fetch once
      const refRowCount = await getRowCount(edge.sourceTable);

      // Calculate actual affected rows (simplified - assumes all rows reference parent)
      const affectedRows = Math.min(refRowCount, parentRows);

      if (affectedRows > 0) {
        // Add to cascade paths
        cascadePaths.push({
          id: `path-${String(cascadePaths.length + 1)}`,
          sourceTable: currentTable,
          targetTable: edge.sourceTable,
          action: action.toUpperCase(),
          depth: depth + 1,
          affectedRows,
          column: edge.sourceColumn
        });

        // Handle different cascade actions
        if (action.toUpperCase() === 'CASCADE') {
          totalAffected += affectedRows;

          // Add to affected tables
          if (!affectedTablesMap.has(edge.sourceTable)) {
            affectedTablesMap.set(edge.sourceTable, {
              tableName: edge.sourceTable,
              action: 'CASCADE',
              rowsBefore: refRowCount,
              rowsAfter: refRowCount - affectedRows,
              depth: depth + 1
            });
          }

          // Continue traversal for CASCADE
          if (!visited.has(edge.sourceTable)) {
            queue.push({
              table: edge.sourceTable,
              depth: depth + 1,
              parentRows: affectedRows
            });
          }
        } else if (action.toUpperCase() === 'SET NULL' || action.toUpperCase() === 'SET DEFAULT') {
          // Rows are updated, not deleted
          if (!affectedTablesMap.has(edge.sourceTable)) {
            affectedTablesMap.set(edge.sourceTable, {
              tableName: edge.sourceTable,
              action: action.toUpperCase(),
              rowsBefore: refRowCount,
              rowsAfter: refRowCount, // Rows remain but are updated
              depth: depth + 1
            });
          }
        } else if (action.toUpperCase() === 'RESTRICT' || action.toUpperCase() === 'NO ACTION') {
          // These will prevent deletion
          constraints.push({
            table: edge.sourceTable,
            message: `Table "${edge.sourceTable}" has ${String(affectedRows)} row(s) with RESTRICT constraint that will prevent deletion`
          });
        }
      }
    }

    visited.add(currentTable);
  }

  // Generate warnings based on analysis
  if (totalAffected > targetRowCount) {
    const additionalRows = totalAffected - targetRowCount;
    warnings.push({
      type: 'high_impact',
      message: `Deletion will cascade to ${String(additionalRows)} additional row(s) across ${String(affectedTablesMap.size - 1)} table(s)`,
      severity: additionalRows > 100 ? 'high' : additionalRows > 10 ? 'medium' : 'low'
    });
  }

  if (currentMaxDepth > 2) {
    warnings.push({
      type: 'deep_cascade',
      message: `Cascade chain reaches depth of ${String(currentMaxDepth)} levels`,
      severity: currentMaxDepth > 5 ? 'high' : 'medium'
    });
  }

  if (circularDeps.size > 0) {
    warnings.push({
      type: 'circular_dependency',
      message: `Detected ${String(circularDeps.size)} circular dependency path(s)`,
      severity: 'medium'
    });
  }

  const result: {
    targetTable: string;
    whereClause?: string;
    totalAffectedRows: number;
    maxDepth: number;
    cascadePaths: typeof cascadePaths;
    affectedTables: { tableName: string; action: string; rowsBefore: number; rowsAfter: number; depth: number }[];
    warnings: typeof warnings;
    constraints: typeof constraints;
    circularDependencies: { tables: string[]; message: string }[];
  } = {
    targetTable,
    totalAffectedRows: totalAffected,
    maxDepth: currentMaxDepth,
    cascadePaths,
    affectedTables: Array.from(affectedTablesMap.values()),
    warnings,
    constraints,
    circularDependencies: Array.from(circularDeps).map(path => ({
      tables: path.split(' -> '),
      message: `Circular reference detected: ${path}`
    }))
  };
  if (whereClause) result.whereClause = whereClause;
  return result;
}

/**
 * Get all foreign keys for a database and build graph structure
 * OPTIMIZED: Processes tables in parallel batches to reduce total API call time
 * while avoiding rate limits. Uses Promise.all with controlled concurrency.
 * 
 * @param includeSchemas - When true, includes full column schemas for each table
 *                         (used by ER diagram to avoid N+1 queries)
 */
async function getAllForeignKeysForDatabase(
  dbId: string,
  env: Env,
  includeSchemas = false
): Promise<{
  nodes: {
    id: string;
    label: string;
    columns: { name: string; type: string; isPK: boolean }[];
    rowCount: number;
  }[];
  edges: {
    id: string;
    source: string;
    target: string;
    sourceColumn: string;
    targetColumn: string;
    onDelete: string;
    onUpdate: string;
  }[];
  schemas?: Record<string, {
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }[]>;
}> {
  // Get all tables (1 API call)
  const tableListQuery = "PRAGMA table_list";
  const tableListResult = await executeQueryViaAPI(dbId, tableListQuery, env);
  const allTables = (tableListResult.results as { name: string; type: string }[])
    .filter(t => !t.name.startsWith('sqlite_') && !t.name.startsWith('_cf_') && t.type === 'table');

  const nodes: {
    id: string;
    label: string;
    columns: { name: string; type: string; isPK: boolean }[];
    rowCount: number;
  }[] = [];
  const edges: {
    id: string;
    source: string;
    target: string;
    sourceColumn: string;
    targetColumn: string;
    onDelete: string;
    onUpdate: string;
  }[] = [];
  const schemas: Record<string, {
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }[]> = {};
  const processedConstraints = new Set<string>();

  // Process tables in batches to reduce total time while avoiding rate limits
  // Batch size of 5 provides good balance between speed and API pressure
  const BATCH_SIZE = 5;

  for (let i = 0; i < allTables.length; i += BATCH_SIZE) {
    const batch = allTables.slice(i, i + BATCH_SIZE);

    // Process batch in parallel
    const batchResults = await Promise.all(
      batch.map(async (table) => {
        const sanitizedTable = sanitizeIdentifier(table.name);

        try {
          // Execute schema, count, and FK queries in parallel for this table
          const [schemaResult, countResult, fkResult] = await Promise.all([
            executeQueryViaAPI(dbId, `PRAGMA table_info("${sanitizedTable}")`, env),
            executeQueryViaAPI(dbId, `SELECT COUNT(*) as count FROM "${sanitizedTable}"`, env),
            executeQueryViaAPI(dbId, `PRAGMA foreign_key_list("${sanitizedTable}")`, env)
          ]);

          const columns = schemaResult.results as {
            cid: number;
            name: string;
            type: string;
            notnull: number;
            dflt_value: string | null;
            pk: number;
          }[];

          const countRow = countResult.results[0] as { count: number } | undefined;
          const rowCount = countRow?.count ?? 0;

          const fks = fkResult.results as {
            id: number;
            seq: number;
            table: string;
            from: string;
            to: string;
            on_update: string;
            on_delete: string;
            match: string;
          }[];

          return {
            tableName: table.name,
            columns,
            rowCount,
            fks
          };
        } catch (err) {
          // Skip tables that can't be queried (e.g., FTS5 virtual tables)
          // Log for debugging but don't fail the entire operation
          logWarning(`Skipping table "${table.name}" in FK graph: ${err instanceof Error ? err.message : 'Unknown error'}`, {
            module: 'tables',
            operation: 'fk_graph_table_query',
            databaseId: dbId,
            metadata: { tableName: table.name }
          });
          return null;
        }
      })
    );

    // Process batch results
    for (const result of batchResults) {
      if (!result) continue;

      nodes.push({
        id: result.tableName,
        label: result.tableName,
        columns: result.columns.map(col => ({
          name: col.name,
          type: col.type ?? 'ANY',
          isPK: col.pk > 0
        })),
        rowCount: result.rowCount
      });

      // Store full schema if requested (for ER diagram)
      if (includeSchemas) {
        schemas[result.tableName] = result.columns.map(col => ({
          cid: col.cid,
          name: col.name,
          type: col.type ?? 'ANY',
          notnull: col.notnull,
          dflt_value: col.dflt_value,
          pk: col.pk
        }));
      }

      // Process foreign keys
      for (const fk of result.fks) {
        // Generate unique constraint ID
        // Use double underscore as separator to handle column names with single underscores
        const constraintId = `fk__${result.tableName}__${fk.from}__${fk.table}__${fk.to}`;

        if (!processedConstraints.has(constraintId)) {
          edges.push({
            id: constraintId,
            source: result.tableName,
            target: fk.table,
            sourceColumn: fk.from,
            targetColumn: fk.to,
            onDelete: fk.on_delete || 'NO ACTION',
            onUpdate: fk.on_update || 'NO ACTION'
          });
          processedConstraints.add(constraintId);
        }
      }
    }
  }

  // Return with schemas only when requested
  if (includeSchemas) {
    return { nodes, edges, schemas };
  }
  return { nodes, edges };
}

/**
 * Get foreign key graph for cycle detection (lightweight version)
 * OPTIMIZED: Skips schema and row count queries since they're not needed for cycle detection
 * Uses parallel batch processing with controlled concurrency to reduce total time
 * Reduces from N sequential API calls to parallel batches
 */
async function getForeignKeyGraphForCycleDetection(
  dbId: string,
  env: Env
): Promise<{
  nodes: { id: string; label: string; columns: never[]; rowCount: number }[];
  edges: {
    id: string;
    source: string;
    target: string;
    sourceColumn: string;
    targetColumn: string;
    onDelete: string;
    onUpdate: string;
  }[];
}> {
  // Get all tables (1 API call)
  const tableListQuery = "PRAGMA table_list";
  const tableListResult = await executeQueryViaAPI(dbId, tableListQuery, env);
  const allTables = (tableListResult.results as { name: string; type: string }[])
    .filter(t => !t.name.startsWith('sqlite_') && !t.name.startsWith('_cf_') && t.type === 'table');

  // Build minimal nodes (no schema/row count queries needed for cycle detection)
  const nodes = allTables.map(table => ({
    id: table.name,
    label: table.name,
    columns: [] as never[],
    rowCount: 0
  }));

  const edges: {
    id: string;
    source: string;
    target: string;
    sourceColumn: string;
    targetColumn: string;
    onDelete: string;
    onUpdate: string;
  }[] = [];
  const processedConstraints = new Set<string>();

  // Process FK queries in parallel batches to reduce total time
  // Batch size of 10 is safe since these are lightweight PRAGMA calls
  const BATCH_SIZE = 10;

  for (let i = 0; i < allTables.length; i += BATCH_SIZE) {
    const batch = allTables.slice(i, i + BATCH_SIZE);

    // Process batch in parallel
    const batchResults = await Promise.all(
      batch.map(async (table) => {
        const sanitizedTable = sanitizeIdentifier(table.name);

        try {
          const fkQuery = `PRAGMA foreign_key_list("${sanitizedTable}")`;
          const fkResult = await executeQueryViaAPI(dbId, fkQuery, env);
          const fks = fkResult.results as {
            id: number;
            seq: number;
            table: string;
            from: string;
            to: string;
            on_update: string;
            on_delete: string;
            match: string;
          }[];

          return { tableName: table.name, fks };
        } catch (err) {
          // Skip tables that can't be queried (e.g., FTS5 virtual tables)
          // Log at debug level since this is expected for certain table types
          logWarning(`Skipping table "${table.name}" in cycle detection: ${err instanceof Error ? err.message : 'Unknown error'}`, {
            module: 'tables',
            operation: 'cycle_detection_table_query',
            databaseId: dbId,
            metadata: { tableName: table.name }
          });
          return null;
        }
      })
    );

    // Process batch results
    for (const result of batchResults) {
      if (!result) continue;

      for (const fk of result.fks) {
        const constraintId = `fk__${result.tableName}__${fk.from}__${fk.table}__${fk.to}`;

        if (!processedConstraints.has(constraintId)) {
          edges.push({
            id: constraintId,
            source: result.tableName,
            target: fk.table,
            sourceColumn: fk.from,
            targetColumn: fk.to,
            onDelete: fk.on_delete || 'NO ACTION',
            onUpdate: fk.on_update || 'NO ACTION'
          });
          processedConstraints.add(constraintId);
        }
      }
    }
  }

  logInfo(`Built lightweight FK graph for cycle detection: ${String(nodes.length)} tables, ${String(edges.length)} edges`, {
    module: 'tables',
    operation: 'fk_graph_lightweight',
    databaseId: dbId
  });

  return { nodes, edges };
}

/**
 * Add a foreign key constraint to a table
 */
async function addForeignKeyConstraint(
  dbId: string,
  params: {
    sourceTable: string;
    sourceColumn: string;
    targetTable: string;
    targetColumn: string;
    onDelete: string;
    onUpdate: string;
    constraintName?: string;
  },
  env: Env
): Promise<void> {
  const { sourceTable, sourceColumn, targetTable, targetColumn, onDelete, onUpdate, constraintName } = params;

  // Validate constraint actions
  const validActions = ['CASCADE', 'RESTRICT', 'SET NULL', 'SET DEFAULT', 'NO ACTION'];
  if (!validActions.includes(onDelete.toUpperCase())) {
    throw new Error(`Invalid ON DELETE action: ${onDelete}`);
  }
  if (!validActions.includes(onUpdate.toUpperCase())) {
    throw new Error(`Invalid ON UPDATE action: ${onUpdate}`);
  }

  // Validate column types match
  const sourceSchema = await executeQueryViaAPI(dbId, `PRAGMA table_info("${sanitizeIdentifier(sourceTable)}")`, env);
  const targetSchema = await executeQueryViaAPI(dbId, `PRAGMA table_info("${sanitizeIdentifier(targetTable)}")`, env);

  interface ColumnInfoResult {
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }

  const sourceCol = (sourceSchema.results as ColumnInfoResult[]).find((c) => c.name === sourceColumn);
  const targetCol = (targetSchema.results as ColumnInfoResult[]).find((c) => c.name === targetColumn);

  if (!sourceCol) {
    throw new Error(`Column ${sourceColumn} not found in table ${sourceTable}`);
  }
  if (!targetCol) {
    throw new Error(`Column ${targetColumn} not found in table ${targetTable}`);
  }

  // Check if target column is a primary key or has unique constraint
  if (targetCol.pk === 0) {
    // Check for unique index
    const indexQuery = `PRAGMA index_list("${sanitizeIdentifier(targetTable)}")`;
    const indexResult = await executeQueryViaAPI(dbId, indexQuery, env);
    const indexes = indexResult.results as { name: string; unique: number }[];

    let hasUniqueIndex = false;
    for (const index of indexes.filter(i => i.unique === 1)) {
      const indexInfoQuery = `PRAGMA index_info("${sanitizeIdentifier(index.name)}")`;
      const indexInfoResult = await executeQueryViaAPI(dbId, indexInfoQuery, env);
      const indexCols = indexInfoResult.results as { name: string }[];
      if (indexCols.some(ic => ic.name === targetColumn)) {
        hasUniqueIndex = true;
        break;
      }
    }

    if (!hasUniqueIndex) {
      throw new Error(`Target column ${targetColumn} must have a UNIQUE constraint or be a PRIMARY KEY`);
    }
  }

  // Check for orphaned rows
  const orphanQuery = `
    SELECT COUNT(*) as count 
    FROM "${sanitizeIdentifier(sourceTable)}" 
    WHERE "${sanitizeIdentifier(sourceColumn)}" IS NOT NULL 
      AND "${sanitizeIdentifier(sourceColumn)}" NOT IN (
        SELECT "${sanitizeIdentifier(targetColumn)}" FROM "${sanitizeIdentifier(targetTable)}"
      )
  `;
  const orphanResult = await executeQueryViaAPI(dbId, orphanQuery, env);
  const orphanRow = orphanResult.results[0] as { count: number } | undefined;
  const orphanCount = orphanRow?.count ?? 0;

  if (orphanCount > 0) {
    throw new Error(`Cannot add foreign key: ${String(orphanCount)} rows in ${sourceTable} reference non-existent rows in ${targetTable}`);
  }

  // Recreate table with foreign key constraint
  const constraint: {
    columns: string[];
    refTable: string;
    refColumns: string[];
    onDelete: string;
    onUpdate: string;
    name?: string;
  } = {
    columns: [sourceColumn],
    refTable: targetTable,
    refColumns: [targetColumn],
    onDelete,
    onUpdate,
  };
  if (constraintName) constraint.name = constraintName;

  await recreateTableWithForeignKey(dbId, sourceTable, {
    action: 'add',
    constraint
  }, env);
}

/**
 * Modify a foreign key constraint
 */
async function modifyForeignKeyConstraint(
  dbId: string,
  constraintName: string,
  params: {
    onDelete?: string;
    onUpdate?: string;
  },
  env: Env
): Promise<void> {
  // Parse constraint name to get table and column info (uses __ as separator)
  const parts = constraintName.split('__');
  const sourceTable = parts[1];
  const sourceColumn = parts[2];
  const targetTable = parts[3];
  const targetColumn = parts[4];
  if (parts.length < 5 || parts[0] !== 'fk' || !sourceTable || !sourceColumn || !targetTable || !targetColumn) {
    throw new Error('Invalid constraint name format. Expected: fk__sourceTable__sourceColumn__targetTable__targetColumn');
  }

  // Get current constraint to preserve values not being changed
  const fkQuery = `PRAGMA foreign_key_list("${sanitizeIdentifier(sourceTable)}")`;
  const fkResult = await executeQueryViaAPI(dbId, fkQuery, env);
  const fks = fkResult.results as {
    id: number;
    seq: number;
    table: string;
    from: string;
    to: string;
    on_update: string;
    on_delete: string;
  }[];

  const currentFk = fks.find(fk => fk.table === targetTable && fk.from === sourceColumn && fk.to === targetColumn);
  if (!currentFk) {
    throw new Error(`Foreign key constraint not found`);
  }

  const onDelete = params.onDelete?.toUpperCase() ?? currentFk.on_delete ?? 'NO ACTION';
  const onUpdate = params.onUpdate?.toUpperCase() ?? currentFk.on_update ?? 'NO ACTION';

  // Recreate table with modified constraint
  await recreateTableWithForeignKey(dbId, sourceTable, {
    action: 'modify',
    oldConstraint: {
      columns: [sourceColumn],
      refTable: targetTable,
      refColumns: [targetColumn]
    },
    constraint: {
      columns: [sourceColumn],
      refTable: targetTable,
      refColumns: [targetColumn],
      onDelete,
      onUpdate
    }
  }, env);
}

/**
 * Delete a foreign key constraint
 */
async function deleteForeignKeyConstraint(
  dbId: string,
  constraintName: string,
  env: Env
): Promise<void> {
  // Parse constraint name (uses __ as separator)
  // Format: fk__sourceTable__sourceColumn__targetTable__targetColumn
  const parts = constraintName.split('__');
  const sourceTable = parts[1];
  const sourceColumn = parts[2];
  const targetTable = parts[3];
  const targetColumn = parts[4];

  if (parts.length < 5 || parts[0] !== 'fk' || !sourceTable || !sourceColumn || !targetTable || !targetColumn) {
    throw new Error(`Invalid constraint name format: ${constraintName}. Expected format: fk__table__column__refTable__refColumn`);
  }

  logInfo(`Deleting FK constraint: ${sourceTable}.${sourceColumn} -> ${targetTable}.${targetColumn}`, {
    module: 'tables',
    operation: 'fk_delete_parse',
    databaseId: dbId,
    metadata: { constraintName, sourceTable, sourceColumn, targetTable, targetColumn }
  });

  // Recreate table without the constraint
  await recreateTableWithForeignKey(dbId, sourceTable, {
    action: 'remove',
    constraint: {
      columns: [sourceColumn],
      refTable: targetTable,
      refColumns: [targetColumn]
    }
  }, env);
}

/**
 * Recreate a table with modified foreign key constraints
 */
async function recreateTableWithForeignKey(
  dbId: string,
  tableName: string,
  modification: {
    action: 'add' | 'modify' | 'remove';
    constraint: {
      columns: string[];
      refTable: string;
      refColumns: string[];
      onDelete?: string;
      onUpdate?: string;
      name?: string;
    };
    oldConstraint?: {
      columns: string[];
      refTable: string;
      refColumns: string[];
    };
  },
  env: Env
): Promise<void> {
  const sanitizedTable = sanitizeIdentifier(tableName);
  const tempTableName = `${tableName}_temp_${String(Date.now())}`;
  const sanitizedTempTable = sanitizeIdentifier(tempTableName);

  try {
    // 1. Get current CREATE TABLE statement
    // Note: sqlite_master.name stores the table name without quotes
    const createQuery = `SELECT sql FROM sqlite_master WHERE type='table' AND name='${sanitizedTable}'`;
    const createResult = await executeQueryViaAPI(dbId, createQuery, env);
    const createRow = createResult.results[0] as { sql: string } | undefined;
    const createSql = createRow?.sql;

    if (!createSql) {
      throw new Error(`Table "${tableName}" not found in database`);
    }

    logInfo(`Original CREATE TABLE SQL for FK modification`, {
      module: 'tables',
      operation: 'fk_recreate',
      databaseId: dbId,
      metadata: { tableName, action: modification.action, sqlLength: createSql.length }
    });

    // 2. Parse and modify the CREATE TABLE statement
    // Handle both quoted and unquoted table names: CREATE TABLE "tablename" or CREATE TABLE tablename
    let newCreateSql = createSql.replace(
      new RegExp(`CREATE TABLE\\s+["']?${sanitizedTable}["']?`, 'i'),
      `CREATE TABLE "${sanitizedTempTable}"`
    );

    // Remove old constraint if modifying or removing
    if (modification.action === 'modify' || modification.action === 'remove') {
      const oldConst = modification.oldConstraint ?? modification.constraint;
      const colName = oldConst.columns[0] ?? '';
      const refTbl = oldConst.refTable;
      const refCol = oldConst.refColumns[0] ?? '';

      const originalSql = newCreateSql;

      // Pattern 1: CONSTRAINT name FOREIGN KEY ("col") REFERENCES "table" ("col") ON DELETE/UPDATE...
      // Handles: CONSTRAINT "name", CONSTRAINT name, with optional quotes
      const fkPatternConstraint = new RegExp(
        `\\s*,?\\s*CONSTRAINT\\s+["']?\\w+["']?\\s+FOREIGN KEY\\s*\\(\\s*["'\`]?${colName}["'\`]?\\s*\\)\\s*REFERENCES\\s*["'\`]?${refTbl}["'\`]?\\s*\\(\\s*["'\`]?${refCol}["'\`]?\\s*\\)(?:\\s+ON\\s+(?:DELETE|UPDATE)\\s+(?:NO ACTION|CASCADE|RESTRICT|SET NULL|SET DEFAULT))*`,
        'gi'
      );
      newCreateSql = newCreateSql.replace(fkPatternConstraint, '');

      // Pattern 2: FOREIGN KEY ("col") REFERENCES "table" ("col") without CONSTRAINT keyword
      const fkPatternNoConstraint = new RegExp(
        `\\s*,?\\s*FOREIGN KEY\\s*\\(\\s*["'\`]?${colName}["'\`]?\\s*\\)\\s*REFERENCES\\s*["'\`]?${refTbl}["'\`]?\\s*\\(\\s*["'\`]?${refCol}["'\`]?\\s*\\)(?:\\s+ON\\s+(?:DELETE|UPDATE)\\s+(?:NO ACTION|CASCADE|RESTRICT|SET NULL|SET DEFAULT))*`,
        'gi'
      );
      newCreateSql = newCreateSql.replace(fkPatternNoConstraint, '');

      // Pattern 3: Inline FK reference in column definition
      // e.g., user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
      const inlineFkPattern = new RegExp(
        `(["'\`]?${colName}["'\`]?\\s+\\w+(?:\\s+\\w+)*)\\s+REFERENCES\\s*["'\`]?${refTbl}["'\`]?\\s*\\(\\s*["'\`]?${refCol}["'\`]?\\s*\\)(?:\\s+ON\\s+(?:DELETE|UPDATE)\\s+(?:NO ACTION|CASCADE|RESTRICT|SET NULL|SET DEFAULT))*`,
        'gi'
      );
      newCreateSql = newCreateSql.replace(inlineFkPattern, '$1');

      // Check if any FK was actually removed
      if (newCreateSql === originalSql) {
        logWarning(`No FK constraint matched in CREATE TABLE SQL`, {
          module: 'tables',
          operation: 'fk_remove',
          databaseId: dbId,
          metadata: {
            tableName,
            colName,
            refTbl,
            refCol,
            createSqlPreview: createSql.substring(0, 500)
          }
        });
        throw new Error(`Could not find foreign key constraint ${colName} -> ${refTbl}(${refCol}) in table "${tableName}". The constraint may have been defined inline or with different quoting.`);
      }

      // Clean up any trailing commas before closing paren
      newCreateSql = newCreateSql.replace(/,(\s*\))/g, '$1');
      // Clean up any leading commas after opening paren or column definition
      newCreateSql = newCreateSql.replace(/\(\s*,/g, '(');
      // Clean up double commas
      newCreateSql = newCreateSql.replace(/,\s*,/g, ',');
    }

    // Add new constraint if adding or modifying
    if (modification.action === 'add' || modification.action === 'modify') {
      const { columns, refTable, refColumns, onDelete, onUpdate, name } = modification.constraint;
      // Sanitize constraint name to avoid spaces and special characters - SQLite constraint names shouldn't have spaces
      const sanitizedTableForConstraint = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
      const sanitizedColumnsForConstraint = columns.map(c => c.replace(/[^a-zA-Z0-9_]/g, '_')).join('_');
      const constraintName = name ?? `fk_${sanitizedTableForConstraint}_${sanitizedColumnsForConstraint}`;
      const sanitizedRefTable = sanitizeIdentifier(refTable);
      const fkClause = `CONSTRAINT "${constraintName}" FOREIGN KEY (${columns.map(c => `"${c}"`).join(', ')}) REFERENCES "${sanitizedRefTable}" (${refColumns.map(c => `"${c}"`).join(', ')})${onDelete ? ` ON DELETE ${onDelete}` : ''}${onUpdate ? ` ON UPDATE ${onUpdate}` : ''}`;

      // Insert before closing parenthesis
      newCreateSql = newCreateSql.replace(/\)(\s*;?\s*)$/i, `, ${fkClause})$1`);
    }

    // 3-4. Create temp table and copy data in a single batch with FK checks disabled
    // D1 requires multi-statement batches to maintain PRAGMA state
    const batchSql = `PRAGMA foreign_keys = OFF; ${newCreateSql}; INSERT INTO "${sanitizedTempTable}" SELECT * FROM "${sanitizedTable}"; PRAGMA foreign_keys = ON;`;
    await executeQueryViaAPI(dbId, batchSql, env);

    // 5. Get indexes
    const indexQuery = `SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='${sanitizedTable}' AND sql IS NOT NULL`;
    const indexResult = await executeQueryViaAPI(dbId, indexQuery, env);
    const indexes = (indexResult.results as { sql: string }[]).map(r => r.sql);

    // 6. Drop original table
    await executeQueryViaAPI(dbId, `DROP TABLE "${sanitizedTable}"`, env);

    // 7. Rename temporary table
    await executeQueryViaAPI(dbId, `ALTER TABLE "${sanitizedTempTable}" RENAME TO "${sanitizedTable}"`, env);

    // 8. Recreate indexes
    for (const indexSql of indexes) {
      await executeQueryViaAPI(dbId, indexSql, env);
    }

  } catch (err) {
    // Attempt cleanup if temporary table exists
    try {
      await executeQueryViaAPI(dbId, `DROP TABLE IF EXISTS "${sanitizedTempTable}"`, env);
    } catch {
      // Ignore cleanup errors
    }
    throw err;
  }
}

/**
 * Execute a query against a specific D1 database using the REST API
 */
async function executeQueryViaAPI(
  databaseId: string,
  query: string,
  env: Env
): Promise<{ results: unknown[]; meta: Record<string, unknown>; success: boolean }> {
  const requestBody = JSON.stringify({ sql: query, params: [] });

  // Debug log: show query length and body for troubleshooting
  logInfo(`D1 API request - query length: ${query.length}, body length: ${requestBody.length}`, {
    module: 'tables',
    operation: 'api_debug',
    databaseId,
    metadata: { queryLength: query.length, bodyLength: requestBody.length }
  });

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: requestBody
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    logWarning(`Query error: ${errorText}`, { module: 'tables', operation: 'query', databaseId: databaseId, metadata: { status: response.status } });
    throw new Error(`Query failed: ${String(response.status)}`);
  }

  const rawData: unknown = await response.json();
  const data = rawData as D1APIResponse;

  // REST API returns array of results, take the first one
  const firstResult = data.result[0];
  if (!firstResult) {
    throw new Error('Empty result from D1 API');
  }
  return firstResult;
}

