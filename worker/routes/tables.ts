import type { Env, TableInfo } from '../types';
import { sanitizeIdentifier } from '../utils/helpers';
import { trackDatabaseAccess } from '../utils/database-tracking';
import { captureTableSnapshot, captureColumnSnapshot, captureRowSnapshot, saveUndoSnapshot } from '../utils/undo';
import { isProtectedDatabase, createProtectedDatabaseResponse, getDatabaseInfo } from '../utils/database-protection';

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
  console.log('[Tables] Handling table operation');
  
  // Extract database ID from URL (format: /api/tables/:dbId/...)
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

  // Check if accessing a protected database
  if (!isLocalDev) {
    const dbInfo = await getDatabaseInfo(dbId, env);
    if (dbInfo && isProtectedDatabase(dbInfo.name)) {
      console.warn('[Tables] Attempted to access protected database:', dbInfo.name);
      return createProtectedDatabaseResponse(corsHeaders);
    }
  }

  // Track database access (non-blocking)
  if (!isLocalDev) {
    trackDatabaseAccess(dbId, env).catch(err => 
      console.error('[Tables] Database tracking failed:', err)
    );
  }

  try {
    // List tables in database
    if (request.method === 'GET' && url.pathname === `/api/tables/${dbId}/list`) {
      console.log('[Tables] Listing tables for database:', dbId);
      
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
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Execute PRAGMA table_list using REST API
      const query = "PRAGMA table_list";
      const result = await executeQueryViaAPI(dbId, query, env);
      
      // Filter out system tables
      const tables = (result.results as TableInfo[]).filter((table: TableInfo) => 
        !table.name.startsWith('sqlite_') && !table.name.startsWith('_cf_')
      );
      
      return new Response(JSON.stringify({
        result: tables,
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Get table schema
    if (request.method === 'GET' && url.pathname.match(/^\/api\/tables\/[^/]+\/schema\/[^/]+$/)) {
      const tableName = decodeURIComponent(pathParts[5] ?? '');
      console.log('[Tables] Getting schema for table:', tableName);
      
      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: [
            { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 },
            { cid: 1, name: 'email', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
            { cid: 2, name: 'name', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
            { cid: 3, name: 'created_at', type: 'DATETIME', notnull: 0, dflt_value: 'CURRENT_TIMESTAMP', pk: 0 }
          ],
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const sanitizedTable = sanitizeIdentifier(tableName);
      const query = `PRAGMA table_info("${sanitizedTable}")`;
      const result = await executeQueryViaAPI(dbId, query, env);
      
      return new Response(JSON.stringify({
        result: result.results,
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Get table data (paginated)
    if (request.method === 'GET' && url.pathname.match(/^\/api\/tables\/[^/]+\/data\/[^/]+$/)) {
      const tableName = decodeURIComponent(pathParts[5] ?? '');
      const limit = parseInt(url.searchParams.get('limit') || '100');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      
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
      
      console.log('[Tables] Getting data for table:', tableName, 'limit:', limit, 'offset:', offset, 'filters:', filters);
      
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
              if (!cellValue) continue;
              
              const value = String(cellValue).toLowerCase();
              const filterVal = (filter.value || '').toLowerCase();
              
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
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const sanitizedTable = sanitizeIdentifier(tableName);
      
      // Build WHERE clause from filters if any
      let whereClause = '';
      if (Object.keys(filters).length > 0) {
        // Get table schema for validation
        const schemaResult = await executeQueryViaAPI(dbId, `PRAGMA table_info("${sanitizedTable}")`, env);
        const schema = schemaResult.results as Array<{
          cid: number;
          name: string;
          type: string;
          notnull: number;
          dflt_value: string | null;
          pk: number;
        }>;
        
        // Import buildWhereClause
        const { buildWhereClause } = await import('../utils/helpers');
        
        // Convert filters to FilterCondition format
        const filterConditions: Record<string, import('../utils/helpers').FilterCondition> = {};
        for (const [columnName, filter] of Object.entries(filters)) {
          const condition: import('../utils/helpers').FilterCondition = {
            type: filter.type as import('../utils/helpers').FilterCondition['type'],
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
      
      const query = `SELECT * FROM "${sanitizedTable}"${whereClause} LIMIT ${limit} OFFSET ${offset}`;
      const result = await executeQueryViaAPI(dbId, query, env);
      
      return new Response(JSON.stringify({
        result: result.results,
        meta: result.meta,
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Get table indexes
    if (request.method === 'GET' && url.pathname.match(/^\/api\/tables\/[^/]+\/indexes\/[^/]+$/)) {
      const tableName = decodeURIComponent(pathParts[5] ?? '');
      console.log('[Tables] Getting indexes for table:', tableName);
      
      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: [
            { seq: 0, name: 'idx_users_email', unique: 1, origin: 'c', partial: 0 }
          ],
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const sanitizedTable = sanitizeIdentifier(tableName);
      const query = `PRAGMA index_list("${sanitizedTable}")`;
      const result = await executeQueryViaAPI(dbId, query, env);
      
      return new Response(JSON.stringify({
        result: result.results,
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Get foreign keys for a specific table
    if (request.method === 'GET' && url.pathname.match(/^\/api\/tables\/[^/]+\/foreign-keys\/[^/]+$/)) {
      const tableName = decodeURIComponent(pathParts[5] ?? '');
      console.log('[Tables] Getting foreign keys for table:', tableName);
      
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
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const sanitizedTable = sanitizeIdentifier(tableName);
      const fkQuery = `PRAGMA foreign_key_list("${sanitizedTable}")`;
      const result = await executeQueryViaAPI(dbId, fkQuery, env);
      
      // Transform the PRAGMA result to our desired format
      const fks = result.results as Array<{
        id: number;
        seq: number;
        table: string;
        from: string;
        to: string;
        on_update: string;
        on_delete: string;
        match: string;
      }>;
      
      // Group by FK constraint (id) and column
      const foreignKeys: Array<{
        column: string;
        refTable: string;
        refColumn: string;
        onDelete: string | null;
        onUpdate: string | null;
      }> = [];
      
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
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Delete table
    if (request.method === 'DELETE' && url.pathname.match(/^\/api\/tables\/[^/]+\/[^/]+$/)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      console.log('[Tables] Deleting table:', tableName);
      
      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Capture snapshot before drop
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
        console.error('[Tables] Failed to capture snapshot:', snapshotErr);
        // Continue with drop even if snapshot fails
      }
      
      const sanitizedTable = sanitizeIdentifier(tableName);
      const query = `DROP TABLE "${sanitizedTable}"`;
      await executeQueryViaAPI(dbId, query, env);
      
      return new Response(JSON.stringify({
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Rename table
    if (request.method === 'PATCH' && url.pathname.match(/^\/api\/tables\/[^/]+\/[^/]+\/rename$/)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      console.log('[Tables] Renaming table:', tableName);
      
      const body = await request.json() as { newName: string };
      const newName = body.newName;
      
      if (!newName || !newName.trim()) {
        return new Response(JSON.stringify({ 
          error: 'New table name is required' 
        }), { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: { name: newName, type: 'table', ncol: 5, wr: 0, strict: 0 },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const sanitizedOldTable = sanitizeIdentifier(tableName);
      const sanitizedNewTable = sanitizeIdentifier(newName);
      const query = `ALTER TABLE "${sanitizedOldTable}" RENAME TO "${sanitizedNewTable}"`;
      await executeQueryViaAPI(dbId, query, env);
      
      // Get the new table info
      const tableListResult = await executeQueryViaAPI(dbId, "PRAGMA table_list", env);
      const newTableInfo = (tableListResult.results as TableInfo[]).find(
        (table: TableInfo) => table.name === newName
      );
      
      return new Response(JSON.stringify({
        result: newTableInfo || { name: newName, type: 'table', ncol: 0, wr: 0, strict: 0 },
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Clone table
    if (request.method === 'POST' && url.pathname.match(/^\/api\/tables\/[^/]+\/[^/]+\/clone$/)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      console.log('[Tables] Cloning table:', tableName);
      
      const body = await request.json() as { newName: string };
      const newName = body.newName;
      
      if (!newName || !newName.trim()) {
        return new Response(JSON.stringify({ 
          error: 'New table name is required' 
        }), { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: { name: newName, type: 'table', ncol: 5, wr: 0, strict: 0 },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const sanitizedOldTable = sanitizeIdentifier(tableName);
      const sanitizedNewTable = sanitizeIdentifier(newName);
      
      // Get schema
      const schemaResult = await executeQueryViaAPI(dbId, `PRAGMA table_info("${sanitizedOldTable}")`, env);
      const columns = schemaResult.results as Array<{
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }>;
      
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
      const indexes = indexesResult.results as Array<{
        seq: number;
        name: string;
        unique: number;
        origin: string;
        partial: number;
      }>;
      
      for (const index of indexes) {
        if (index.origin === 'c') { // Only copy user-created indexes
          const indexInfoResult = await executeQueryViaAPI(dbId, `PRAGMA index_info("${index.name}")`, env);
          const indexColumns = indexInfoResult.results as Array<{ seqno: number; cid: number; name: string }>;
          
          const columnNames = indexColumns.map(ic => `"${ic.name}"`).join(', ');
          const newIndexName = index.name.replace(tableName, newName);
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
      
      return new Response(JSON.stringify({
        result: newTableInfo || { name: newName, type: 'table', ncol: columns.length, wr: 0, strict: 0 },
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Export table
    if (request.method === 'GET' && url.pathname.match(/^\/api\/tables\/[^/]+\/[^/]+\/export$/)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      const format = url.searchParams.get('format') || 'sql';
      console.log('[Tables] Exporting table:', tableName, 'format:', format);
      
      // Mock response for local development
      if (isLocalDev) {
        const mockContent = format === 'csv' 
          ? 'id,email,name,created_at\n1,user1@example.com,User One,2024-01-01\n2,user2@example.com,User Two,2024-01-02'
          : `CREATE TABLE "${tableName}" (id INTEGER PRIMARY KEY, email TEXT, name TEXT, created_at DATETIME);\nINSERT INTO "${tableName}" VALUES (1, 'user1@example.com', 'User One', '2024-01-01');\nINSERT INTO "${tableName}" VALUES (2, 'user2@example.com', 'User Two', '2024-01-02');`;
        
        return new Response(JSON.stringify({
          result: {
            content: mockContent,
            filename: `${tableName}.${format}`
          },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const sanitizedTable = sanitizeIdentifier(tableName);
      
      if (format === 'csv') {
        // Export as CSV
        const dataResult = await executeQueryViaAPI(dbId, `SELECT * FROM "${sanitizedTable}"`, env);
        const rows = dataResult.results as Record<string, unknown>[];
        
        const firstRow = rows[0];
        if (rows.length === 0 || !firstRow) {
          return new Response(JSON.stringify({
            result: {
              content: '',
              filename: `${tableName}.csv`
            },
            success: true
          }), {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
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
            const str = String(cell);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          });
          csvRows.push(values.join(','));
        }
        
        return new Response(JSON.stringify({
          result: {
            content: csvRows.join('\n'),
            filename: `${tableName}.csv`
          },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      } else {
        // Export as SQL
        // Get schema
        const schemaResult = await executeQueryViaAPI(dbId, `PRAGMA table_info("${sanitizedTable}")`, env);
        const columns = schemaResult.results as Array<{
          cid: number;
          name: string;
          type: string;
          notnull: number;
          dflt_value: string | null;
          pk: number;
        }>;
        
        // Generate CREATE TABLE statement
        const columnDefs = columns.map(col => {
          let def = `"${col.name}" ${col.type || 'TEXT'}`;
          if (col.pk > 0) def += ' PRIMARY KEY';
          if (col.notnull && col.pk === 0) def += ' NOT NULL';
          if (col.dflt_value !== null) def += ` DEFAULT ${col.dflt_value}`;
          return def;
        }).join(', ');
        
        const sqlStatements: string[] = [];
        sqlStatements.push(`CREATE TABLE "${tableName}" (${columnDefs});`);
        
        // Get data
        const dataResult = await executeQueryViaAPI(dbId, `SELECT * FROM "${sanitizedTable}"`, env);
        const rows = dataResult.results as Record<string, unknown>[];
        
        // Generate INSERT statements
        for (const row of rows) {
          const columnNames = Object.keys(row);
          const values = columnNames.map(col => {
            const val = row[col];
            if (val === null) return 'NULL';
            if (typeof val === 'number') return String(val);
            return `'${String(val).replace(/'/g, "''")}'`;
          });
          
          sqlStatements.push(
            `INSERT INTO "${tableName}" (${columnNames.map(n => `"${n}"`).join(', ')}) VALUES (${values.join(', ')});`
          );
        }
        
        // Get indexes
        const indexesResult = await executeQueryViaAPI(dbId, `PRAGMA index_list("${sanitizedTable}")`, env);
        const indexes = indexesResult.results as Array<{
          seq: number;
          name: string;
          unique: number;
          origin: string;
          partial: number;
        }>;
        
        for (const index of indexes) {
          if (index.origin === 'c') {
            const indexInfoResult = await executeQueryViaAPI(dbId, `PRAGMA index_info("${index.name}")`, env);
            const indexColumns = indexInfoResult.results as Array<{ seqno: number; cid: number; name: string }>;
            
            const columnNames = indexColumns.map(ic => `"${ic.name}"`).join(', ');
            const uniqueStr = index.unique ? 'UNIQUE ' : '';
            
            sqlStatements.push(
              `CREATE ${uniqueStr}INDEX "${index.name}" ON "${tableName}" (${columnNames});`
            );
          }
        }
        
        return new Response(JSON.stringify({
          result: {
            content: sqlStatements.join('\n'),
            filename: `${tableName}.sql`
          },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // Add column to table
    if (request.method === 'POST' && url.pathname.match(/^\/api\/tables\/[^/]+\/[^/]+\/columns\/add$/)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      console.log('[Tables] Adding column to table:', tableName);
      
      const body = await request.json() as {
        name: string;
        type: string;
        notnull?: boolean;
        defaultValue?: string;
      };
      
      if (!body.name || !body.type) {
        return new Response(JSON.stringify({ 
          error: 'Column name and type are required' 
        }), { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: [
            { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 },
            { cid: 1, name: body.name, type: body.type, notnull: body.notnull ? 1 : 0, dflt_value: body.defaultValue || null, pk: 0 }
          ],
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const sanitizedTable = sanitizeIdentifier(tableName);
      const sanitizedColumn = sanitizeIdentifier(body.name);
      
      // Build ALTER TABLE ADD COLUMN query
      let query = `ALTER TABLE "${sanitizedTable}" ADD COLUMN "${sanitizedColumn}" ${body.type}`;
      
      if (body.notnull) {
        query += ' NOT NULL';
      }
      
      if (body.defaultValue) {
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
      
      // Get updated schema
      const schemaResult = await executeQueryViaAPI(dbId, `PRAGMA table_info("${sanitizedTable}")`, env);
      
      return new Response(JSON.stringify({
        result: schemaResult.results,
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Rename column
    if (request.method === 'PATCH' && url.pathname.match(/^\/api\/tables\/[^/]+\/[^/]+\/columns\/[^/]+\/rename$/)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      const columnName = decodeURIComponent(pathParts[6] ?? '');
      console.log('[Tables] Renaming column:', columnName, 'in table:', tableName);
      
      const body = await request.json() as { newName: string };
      
      if (!body.newName || !body.newName.trim()) {
        return new Response(JSON.stringify({ 
          error: 'New column name is required' 
        }), { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const sanitizedTable = sanitizeIdentifier(tableName);
      const sanitizedOldColumn = sanitizeIdentifier(columnName);
      const sanitizedNewColumn = sanitizeIdentifier(body.newName);
      
      const query = `ALTER TABLE "${sanitizedTable}" RENAME COLUMN "${sanitizedOldColumn}" TO "${sanitizedNewColumn}"`;
      
      await executeQueryViaAPI(dbId, query, env);
      
      return new Response(JSON.stringify({
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Modify column (requires table recreation)
    if (request.method === 'PATCH' && url.pathname.match(/^\/api\/tables\/[^/]+\/[^/]+\/columns\/[^/]+\/modify$/)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      const columnName = decodeURIComponent(pathParts[6] ?? '');
      console.log('[Tables] Modifying column:', columnName, 'in table:', tableName);
      
      const body = await request.json() as {
        type?: string;
        notnull?: boolean;
        defaultValue?: string;
      };
      
      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: [
            { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 },
            { cid: 1, name: columnName, type: body.type || 'TEXT', notnull: body.notnull ? 1 : 0, dflt_value: body.defaultValue || null, pk: 0 }
          ],
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Table recreation required for modifying columns
      await recreateTableWithModifiedColumn(dbId, tableName, {
        action: 'modify',
        columnName,
        newColumnDef: body
      }, env);
      
      // Get updated schema
      const sanitizedTable = sanitizeIdentifier(tableName);
      const schemaResult = await executeQueryViaAPI(dbId, `PRAGMA table_info("${sanitizedTable}")`, env);
      
      return new Response(JSON.stringify({
        result: schemaResult.results,
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Delete column (requires table recreation)
    if (request.method === 'DELETE' && url.pathname.match(/^\/api\/tables\/[^/]+\/[^/]+\/columns\/[^/]+$/)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      const columnName = decodeURIComponent(pathParts[6] ?? '');
      console.log('[Tables] Deleting column:', columnName, 'from table:', tableName);
      
      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
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
        console.error('[Tables] Failed to capture column snapshot:', snapshotErr);
        // Continue with drop even if snapshot fails
      }
      
      const sanitizedTable = sanitizeIdentifier(tableName);
      const sanitizedColumn = sanitizeIdentifier(columnName);
      
      // Use ALTER TABLE DROP COLUMN (supported in SQLite 3.35.0+)
      const query = `ALTER TABLE "${sanitizedTable}" DROP COLUMN "${sanitizedColumn}"`;
      
      await executeQueryViaAPI(dbId, query, env);
      
      return new Response(JSON.stringify({
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Delete rows with undo snapshot
    if (request.method === 'POST' && url.pathname.match(/^\/api\/tables\/[^/]+\/[^/]+\/rows\/delete$/)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      console.log('[Tables] Deleting rows from table:', tableName);
      
      const body = await request.json() as { 
        whereClause: string;
        description?: string;
      };
      
      if (!body.whereClause) {
        return new Response(JSON.stringify({ 
          error: 'WHERE clause required' 
        }), { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          success: true,
          rowsDeleted: 1
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Capture snapshot before delete
      try {
        const snapshot = await captureRowSnapshot(dbId, tableName, body.whereClause, env);
        const rowCount = snapshot.rowData?.rows.length || 0;
        
        await saveUndoSnapshot(
          dbId,
          'DELETE_ROW',
          tableName,
          null,
          body.description || `Deleted ${rowCount} row(s) from table "${tableName}"`,
          snapshot,
          userEmail,
          env
        );
      } catch (snapshotErr) {
        console.error('[Tables] Failed to capture row snapshot:', snapshotErr);
        // Continue with delete even if snapshot fails
      }
      
      // Execute delete
      const sanitizedTable = sanitizeIdentifier(tableName);
      const deleteQuery = `DELETE FROM "${sanitizedTable}"${body.whereClause}`;
      const result = await executeQueryViaAPI(dbId, deleteQuery, env);
      
      return new Response(JSON.stringify({
        success: true,
        rowsDeleted: result.meta?.changes || 0
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Get table dependencies (foreign keys)
    if (request.method === 'GET' && url.pathname === `/api/tables/${dbId}/dependencies`) {
      const tablesParam = url.searchParams.get('tables');
      if (!tablesParam) {
        return new Response(JSON.stringify({ 
          error: 'Tables parameter required' 
        }), { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const tableNames = tablesParam.split(',').map(t => t.trim());
      console.log('[Tables] Getting dependencies for tables:', tableNames);
      
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
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Get dependencies for each table
      const dependencies: Record<string, TableDependencies> = {};
      
      for (const tableName of tableNames) {
        const sanitizedTable = sanitizeIdentifier(tableName);
        
        // Get outbound foreign keys (this table references others)
        const outboundQuery = `PRAGMA foreign_key_list("${sanitizedTable}")`;
        const outboundResult = await executeQueryViaAPI(dbId, outboundQuery, env);
        const outboundFKs = outboundResult.results as Array<{
          id: number;
          seq: number;
          table: string;
          from: string;
          to: string;
          on_update: string;
          on_delete: string;
          match: string;
        }>;
        
        // Process outbound FKs and get row counts
        const outbound: ForeignKeyDependency[] = [];
        const processedOutbound = new Map<string, ForeignKeyDependency>();
        
        for (const fk of outboundFKs) {
          const key = `${fk.table}_${fk.from}`;
          if (!processedOutbound.has(key)) {
            // Get row count for this table
            const countQuery = `SELECT COUNT(*) as count FROM "${sanitizedTable}"`;
            const countResult = await executeQueryViaAPI(dbId, countQuery, env);
            const rowCount = (countResult.results[0] as { count: number })?.count || 0;
            
            processedOutbound.set(key, {
              table: fk.table,
              column: fk.from,
              onDelete: fk.on_delete || null,
              onUpdate: fk.on_update || null,
              rowCount
            });
          }
        }
        
        outbound.push(...processedOutbound.values());
        
        // Get inbound foreign keys (other tables reference this table)
        // We need to check all tables in the database
        const tableListQuery = "PRAGMA table_list";
        const tableListResult = await executeQueryViaAPI(dbId, tableListQuery, env);
        const allTables = (tableListResult.results as Array<{ name: string; type: string }>)
          .filter(t => !t.name.startsWith('sqlite_') && !t.name.startsWith('_cf_') && t.type === 'table');
        
        const inbound: ForeignKeyDependency[] = [];
        
        for (const otherTable of allTables) {
          if (otherTable.name === tableName) continue;
          
          const sanitizedOtherTable = sanitizeIdentifier(otherTable.name);
          const fkQuery = `PRAGMA foreign_key_list("${sanitizedOtherTable}")`;
          const fkResult = await executeQueryViaAPI(dbId, fkQuery, env);
          const fks = fkResult.results as Array<{
            id: number;
            seq: number;
            table: string;
            from: string;
            to: string;
            on_update: string;
            on_delete: string;
            match: string;
          }>;
          
          for (const fk of fks) {
            if (fk.table === tableName) {
              // This table is referenced by otherTable
              // Get row count for the other table
              const countQuery = `SELECT COUNT(*) as count FROM "${sanitizedOtherTable}"`;
              const countResult = await executeQueryViaAPI(dbId, countQuery, env);
              const rowCount = (countResult.results[0] as { count: number })?.count || 0;
              
              inbound.push({
                table: otherTable.name,
                column: fk.from,
                onDelete: fk.on_delete || null,
                onUpdate: fk.on_update || null,
                rowCount
              });
            }
          }
        }
        
        dependencies[tableName] = {
          outbound,
          inbound
        };
      }
      
      return new Response(JSON.stringify({
        result: dependencies,
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Simulate cascade impact for deletion
    if (request.method === 'POST' && url.pathname === `/api/tables/${dbId}/simulate-cascade`) {
      console.log('[Tables] Simulating cascade impact');
      
      const body = await request.json() as {
        targetTable: string;
        whereClause?: string;
      };
      
      if (!body.targetTable) {
        return new Response(JSON.stringify({ 
          error: 'Target table is required' 
        }), { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
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
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Perform cascade simulation
      const simulation = await simulateCascadeImpact(dbId, body.targetTable, body.whereClause, env);
      
      return new Response(JSON.stringify({
        result: simulation,
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Get all foreign keys for database
    if (request.method === 'GET' && url.pathname === `/api/tables/${dbId}/foreign-keys`) {
      console.log('[Tables] Getting all foreign keys for database:', dbId);
      
      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: {
            nodes: [
              { id: 'users', label: 'users', columns: [{ name: 'id', type: 'INTEGER', isPK: true }], rowCount: 50 },
              { id: 'posts', label: 'posts', columns: [{ name: 'id', type: 'INTEGER', isPK: true }, { name: 'user_id', type: 'INTEGER', isPK: false }], rowCount: 120 },
              { id: 'comments', label: 'comments', columns: [{ name: 'id', type: 'INTEGER', isPK: true }, { name: 'post_id', type: 'INTEGER', isPK: false }], rowCount: 340 }
            ],
            edges: [
              { id: 'fk_posts_user', source: 'posts', target: 'users', sourceColumn: 'user_id', targetColumn: 'id', onDelete: 'SET NULL', onUpdate: 'CASCADE' },
              { id: 'fk_comments_post', source: 'comments', target: 'posts', sourceColumn: 'post_id', targetColumn: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' }
            ]
          },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Get all foreign keys for the entire database
      const fkGraphResult = await getAllForeignKeysForDatabase(dbId, env);
      
      return new Response(JSON.stringify({
        result: fkGraphResult,
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Get circular dependencies in database
    if (request.method === 'GET' && url.pathname === `/api/tables/${dbId}/circular-dependencies`) {
      console.log('[Tables] Detecting circular dependencies for database:', dbId);
      
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
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Get FK graph and detect cycles
      const { detectCircularDependencies } = await import('../utils/circular-dependency-detector');
      const fkGraphResult = await getAllForeignKeysForDatabase(dbId, env);
      const cycles = detectCircularDependencies(fkGraphResult);
      
      return new Response(JSON.stringify({
        result: cycles,
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Simulate adding a foreign key (check for cycles)
    if (request.method === 'POST' && url.pathname === `/api/tables/${dbId}/foreign-keys/simulate`) {
      console.log('[Tables] Simulating foreign key addition');
      
      const body = await request.json() as {
        sourceTable: string;
        targetTable: string;
      };
      
      if (!body.sourceTable || !body.targetTable) {
        return new Response(JSON.stringify({ 
          error: 'sourceTable and targetTable are required' 
        }), { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
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
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Get FK graph and simulate addition
      const { wouldCreateCycle } = await import('../utils/circular-dependency-detector');
      const fkGraphResult = await getAllForeignKeysForDatabase(dbId, env);
      const simulation = wouldCreateCycle(fkGraphResult, body.sourceTable, body.targetTable);
      
      return new Response(JSON.stringify({
        result: simulation,
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Add foreign key constraint
    if (request.method === 'POST' && url.pathname === `/api/tables/${dbId}/foreign-keys/add`) {
      console.log('[Tables] Adding foreign key constraint');
      
      const body = await request.json() as {
        sourceTable: string;
        sourceColumn: string;
        targetTable: string;
        targetColumn: string;
        onDelete: string;
        onUpdate: string;
        constraintName?: string;
      };
      
      if (!body.sourceTable || !body.sourceColumn || !body.targetTable || !body.targetColumn) {
        return new Response(JSON.stringify({ 
          error: 'sourceTable, sourceColumn, targetTable, and targetColumn are required' 
        }), { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: { success: true, message: 'Foreign key added successfully (mock)' },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Add the foreign key constraint
      await addForeignKeyConstraint(dbId, body, env);
      
      return new Response(JSON.stringify({
        result: { success: true, message: 'Foreign key constraint added successfully' },
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Modify foreign key constraint
    if (request.method === 'PATCH' && url.pathname.match(/^\/api\/tables\/[^/]+\/foreign-keys\/[^/]+$/)) {
      const constraintName = decodeURIComponent(pathParts[5] ?? '');
      console.log('[Tables] Modifying foreign key constraint:', constraintName);
      
      const body = await request.json() as {
        onDelete?: string;
        onUpdate?: string;
      };
      
      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: { success: true, message: 'Foreign key modified successfully (mock)' },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Modify the foreign key constraint
      await modifyForeignKeyConstraint(dbId, constraintName, body, env);
      
      return new Response(JSON.stringify({
        result: { success: true, message: 'Foreign key constraint modified successfully' },
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Delete foreign key constraint
    if (request.method === 'DELETE' && url.pathname.match(/^\/api\/tables\/[^/]+\/foreign-keys\/[^/]+$/)) {
      const constraintName = decodeURIComponent(pathParts[5] ?? '');
      console.log('[Tables] Deleting foreign key constraint:', constraintName);
      
      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: { success: true, message: 'Foreign key deleted successfully (mock)' },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Delete the foreign key constraint
      await deleteForeignKeyConstraint(dbId, constraintName, env);
      
      return new Response(JSON.stringify({
        result: { success: true, message: 'Foreign key constraint deleted successfully' },
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    return new Response(JSON.stringify({ 
      error: 'Route not found' 
    }), { 
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (err) {
    // Log full error details on server only
    console.error('[Tables] Error:', err);
    // Return generic error to client (security: don't expose stack traces)
    return new Response(JSON.stringify({ 
      error: 'Table operation failed',
      message: 'Unable to complete table operation. Please try again.'
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
  const tempTableName = `${tableName}_temp_${Date.now()}`;
  const sanitizedTempTable = sanitizeIdentifier(tempTableName);

  try {
    // 1. Get current schema
    const schemaResult = await executeQueryViaAPI(dbId, `PRAGMA table_info("${sanitizedTable}")`, env);
    const columns = schemaResult.results as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>;

    // 2. Build new column definitions
    let newColumns = columns;
    if (modification.action === 'drop') {
      // Remove the column
      newColumns = columns.filter(col => col.name !== modification.columnName);
    } else if (modification.action === 'modify' && modification.newColumnDef) {
      // Modify the column
      newColumns = columns.map(col => {
        if (col.name === modification.columnName) {
          return {
            ...col,
            type: modification.newColumnDef!.type || col.type,
            notnull: modification.newColumnDef!.notnull !== undefined 
              ? (modification.newColumnDef!.notnull ? 1 : 0) 
              : col.notnull,
            dflt_value: modification.newColumnDef!.defaultValue !== undefined
              ? modification.newColumnDef!.defaultValue
              : col.dflt_value
          };
        }
        return col;
      });
    }

    // 3. Create temporary table with new schema
    const columnDefs = newColumns.map(col => {
      let def = `"${col.name}" ${col.type || 'TEXT'}`;
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
      console.error('[Tables] Failed to clean up temp table:', cleanupErr);
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
  cascadePaths: Array<{
    id: string;
    sourceTable: string;
    targetTable: string;
    action: string;
    depth: number;
    affectedRows: number;
    column: string;
  }>;
  affectedTables: Array<{
    tableName: string;
    action: string;
    rowsBefore: number;
    rowsAfter: number;
    depth: number;
  }>;
  warnings: Array<{
    type: string;
    message: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  constraints: Array<{
    table: string;
    message: string;
  }>;
  circularDependencies: Array<{
    tables: string[];
    message: string;
  }>;
}> {
  const sanitizedTable = sanitizeIdentifier(targetTable);
  const maxDepth = 10; // Prevent infinite loops
  
  // Count rows that will be deleted from target table
  const whereCondition = whereClause ? ` WHERE ${whereClause}` : '';
  const countQuery = `SELECT COUNT(*) as count FROM "${sanitizedTable}"${whereCondition}`;
  const countResult = await executeQueryViaAPI(dbId, countQuery, env);
  const targetRowCount = (countResult.results[0] as { count: number })?.count || 0;
  
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
  
  // Get all tables in database
  const tableListResult = await executeQueryViaAPI(dbId, "PRAGMA table_list", env);
  const allTables = (tableListResult.results as Array<{ name: string; type: string }>)
    .filter(t => !t.name.startsWith('sqlite_') && !t.name.startsWith('_cf_') && t.type === 'table');
  
  // Build dependency graph
  const cascadePaths: Array<{
    id: string;
    sourceTable: string;
    targetTable: string;
    action: string;
    depth: number;
    affectedRows: number;
    column: string;
  }> = [];
  
  const affectedTablesMap = new Map<string, {
    tableName: string;
    action: string;
    rowsBefore: number;
    rowsAfter: number;
    depth: number;
  }>();
  
  const warnings: Array<{
    type: string;
    message: string;
    severity: 'low' | 'medium' | 'high';
  }> = [];
  
  const constraints: Array<{
    table: string;
    message: string;
  }> = [];
  
  const circularDeps: Set<string> = new Set();
  
  // Add target table to affected tables
  affectedTablesMap.set(targetTable, {
    tableName: targetTable,
    action: 'DELETE',
    rowsBefore: targetRowCount,
    rowsAfter: 0,
    depth: 0
  });
  
  // Recursively analyze cascade impact using BFS
  const queue: Array<{ table: string; depth: number; parentRows: number }> = [
    { table: targetTable, depth: 0, parentRows: targetRowCount }
  ];
  const visited = new Set<string>();
  const pathMap = new Map<string, Set<string>>(); // Track paths for circular detection
  
  let totalAffected = targetRowCount;
  let currentMaxDepth = 0;
  
  while (queue.length > 0) {
    const { table: currentTable, depth, parentRows } = queue.shift()!;
    
    if (depth >= maxDepth) {
      warnings.push({
        type: 'max_depth',
        message: `Cascade analysis stopped at depth ${maxDepth} to prevent infinite loops`,
        severity: 'high'
      });
      break;
    }
    
    currentMaxDepth = Math.max(currentMaxDepth, depth);
    
    // Find all tables that reference the current table
    for (const otherTable of allTables) {
      if (otherTable.name === currentTable) continue;
      
      const sanitizedOtherTable = sanitizeIdentifier(otherTable.name);
      const fkQuery = `PRAGMA foreign_key_list("${sanitizedOtherTable}")`;
      const fkResult = await executeQueryViaAPI(dbId, fkQuery, env);
      const fks = fkResult.results as Array<{
        id: number;
        seq: number;
        table: string;
        from: string;
        to: string;
        on_update: string;
        on_delete: string;
        match: string;
      }>;
      
      for (const fk of fks) {
        if (fk.table !== currentTable) continue;
        
        const action = fk.on_delete || 'NO ACTION';
        
        // Check for circular dependencies
        if (!pathMap.has(currentTable)) {
          pathMap.set(currentTable, new Set());
        }
        pathMap.get(currentTable)!.add(otherTable.name);
        
        // Detect cycles
        if (visited.has(otherTable.name) && pathMap.has(otherTable.name)) {
          const cycle = [currentTable, otherTable.name];
          circularDeps.add(cycle.join(' -> '));
        }
        
        // Count affected rows in the referencing table
        const refCountQuery = `SELECT COUNT(*) as count FROM "${sanitizedOtherTable}"`;
        const refCountResult = await executeQueryViaAPI(dbId, refCountQuery, env);
        const refRowCount = (refCountResult.results[0] as { count: number })?.count || 0;
        
        // Calculate actual affected rows (simplified - assumes all rows reference parent)
        const affectedRows = Math.min(refRowCount, parentRows);
        
        if (affectedRows > 0) {
          // Add to cascade paths
          cascadePaths.push({
            id: `path-${cascadePaths.length + 1}`,
            sourceTable: currentTable,
            targetTable: otherTable.name,
            action: action.toUpperCase(),
            depth: depth + 1,
            affectedRows,
            column: fk.from
          });
          
          // Handle different cascade actions
          if (action.toUpperCase() === 'CASCADE') {
            totalAffected += affectedRows;
            
            // Add to affected tables
            if (!affectedTablesMap.has(otherTable.name)) {
              affectedTablesMap.set(otherTable.name, {
                tableName: otherTable.name,
                action: 'CASCADE',
                rowsBefore: refRowCount,
                rowsAfter: refRowCount - affectedRows,
                depth: depth + 1
              });
            }
            
            // Continue traversal for CASCADE
            if (!visited.has(otherTable.name)) {
              queue.push({ 
                table: otherTable.name, 
                depth: depth + 1, 
                parentRows: affectedRows 
              });
            }
          } else if (action.toUpperCase() === 'SET NULL' || action.toUpperCase() === 'SET DEFAULT') {
            // Rows are updated, not deleted
            if (!affectedTablesMap.has(otherTable.name)) {
              affectedTablesMap.set(otherTable.name, {
                tableName: otherTable.name,
                action: action.toUpperCase(),
                rowsBefore: refRowCount,
                rowsAfter: refRowCount, // Rows remain but are updated
                depth: depth + 1
              });
            }
          } else if (action.toUpperCase() === 'RESTRICT' || action.toUpperCase() === 'NO ACTION') {
            // These will prevent deletion
            constraints.push({
              table: otherTable.name,
              message: `Table "${otherTable.name}" has ${affectedRows} row(s) with RESTRICT constraint that will prevent deletion`
            });
          }
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
      message: `Deletion will cascade to ${additionalRows} additional row(s) across ${affectedTablesMap.size - 1} table(s)`,
      severity: additionalRows > 100 ? 'high' : additionalRows > 10 ? 'medium' : 'low'
    });
  }
  
  if (currentMaxDepth > 2) {
    warnings.push({
      type: 'deep_cascade',
      message: `Cascade chain reaches depth of ${currentMaxDepth} levels`,
      severity: currentMaxDepth > 5 ? 'high' : 'medium'
    });
  }
  
  if (circularDeps.size > 0) {
    warnings.push({
      type: 'circular_dependency',
      message: `Detected ${circularDeps.size} circular dependency path(s)`,
      severity: 'medium'
    });
  }
  
  const result: {
    targetTable: string;
    whereClause?: string;
    totalAffectedRows: number;
    maxDepth: number;
    cascadePaths: typeof cascadePaths;
    affectedTables: Array<{ tableName: string; action: string; rowsBefore: number; rowsAfter: number; depth: number }>;
    warnings: typeof warnings;
    constraints: typeof constraints;
    circularDependencies: Array<{ tables: string[]; message: string }>;
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
 */
async function getAllForeignKeysForDatabase(
  dbId: string,
  env: Env
): Promise<{
  nodes: Array<{
    id: string;
    label: string;
    columns: Array<{name: string; type: string; isPK: boolean}>;
    rowCount: number;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceColumn: string;
    targetColumn: string;
    onDelete: string;
    onUpdate: string;
  }>;
}> {
  // Get all tables
  const tableListQuery = "PRAGMA table_list";
  const tableListResult = await executeQueryViaAPI(dbId, tableListQuery, env);
  const allTables = (tableListResult.results as Array<{ name: string; type: string }>)
    .filter(t => !t.name.startsWith('sqlite_') && !t.name.startsWith('_cf_') && t.type === 'table');
  
  const nodes: Array<{
    id: string;
    label: string;
    columns: Array<{name: string; type: string; isPK: boolean}>;
    rowCount: number;
  }> = [];
  const edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceColumn: string;
    targetColumn: string;
    onDelete: string;
    onUpdate: string;
  }> = [];
  const processedConstraints = new Set<string>();
  
  // Build nodes
  for (const table of allTables) {
    const sanitizedTable = sanitizeIdentifier(table.name);
    
    // Get schema
    const schemaQuery = `PRAGMA table_info("${sanitizedTable}")`;
    const schemaResult = await executeQueryViaAPI(dbId, schemaQuery, env);
    const columns = schemaResult.results as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>;
    
    // Get row count
    const countQuery = `SELECT COUNT(*) as count FROM "${sanitizedTable}"`;
    const countResult = await executeQueryViaAPI(dbId, countQuery, env);
    const rowCount = (countResult.results[0] as { count: number })?.count || 0;
    
    nodes.push({
      id: table.name,
      label: table.name,
      columns: columns.map(col => ({
        name: col.name,
        type: col.type || 'ANY',
        isPK: col.pk > 0
      })),
      rowCount
    });
    
    // Get foreign keys
    const fkQuery = `PRAGMA foreign_key_list("${sanitizedTable}")`;
    const fkResult = await executeQueryViaAPI(dbId, fkQuery, env);
    const fks = fkResult.results as Array<{
      id: number;
      seq: number;
      table: string;
      from: string;
      to: string;
      on_update: string;
      on_delete: string;
      match: string;
    }>;
    
    // Process foreign keys
    for (const fk of fks) {
      // Generate unique constraint ID
      const constraintId = `fk_${table.name}_${fk.from}_${fk.table}_${fk.to}`;
      
      if (!processedConstraints.has(constraintId)) {
        edges.push({
          id: constraintId,
          source: table.name,
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
    const indexes = indexResult.results as Array<{ name: string; unique: number }>;
    
    let hasUniqueIndex = false;
    for (const index of indexes.filter(i => i.unique === 1)) {
      const indexInfoQuery = `PRAGMA index_info("${sanitizeIdentifier(index.name)}")`;
      const indexInfoResult = await executeQueryViaAPI(dbId, indexInfoQuery, env);
      const indexCols = indexInfoResult.results as Array<{ name: string }>;
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
  const orphanCount = (orphanResult.results[0] as { count: number })?.count || 0;
  
  if (orphanCount > 0) {
    throw new Error(`Cannot add foreign key: ${orphanCount} rows in ${sourceTable} reference non-existent rows in ${targetTable}`);
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
  // Parse constraint name to get table and column info
  const parts = constraintName.split('_');
  const sourceTable = parts[1];
  const sourceColumn = parts[2];
  const targetTable = parts[3];
  const targetColumn = parts[4];
  if (parts.length < 5 || parts[0] !== 'fk' || !sourceTable || !sourceColumn || !targetTable || !targetColumn) {
    throw new Error('Invalid constraint name format. Expected: fk_sourceTable_sourceColumn_targetTable_targetColumn');
  }
  
  // Get current constraint to preserve values not being changed
  const fkQuery = `PRAGMA foreign_key_list("${sanitizeIdentifier(sourceTable)}")`;
  const fkResult = await executeQueryViaAPI(dbId, fkQuery, env);
  const fks = fkResult.results as Array<{
    id: number;
    seq: number;
    table: string;
    from: string;
    to: string;
    on_update: string;
    on_delete: string;
  }>;
  
  const currentFk = fks.find(fk => fk.table === targetTable && fk.from === sourceColumn && fk.to === targetColumn);
  if (!currentFk) {
    throw new Error(`Foreign key constraint not found`);
  }
  
  const onDelete = params.onDelete?.toUpperCase() || currentFk.on_delete || 'NO ACTION';
  const onUpdate = params.onUpdate?.toUpperCase() || currentFk.on_update || 'NO ACTION';
  
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
  // Parse constraint name
  const parts = constraintName.split('_');
  const sourceTable = parts[1];
  const sourceColumn = parts[2];
  const targetTable = parts[3];
  const targetColumn = parts[4];
  if (parts.length < 5 || parts[0] !== 'fk' || !sourceTable || !sourceColumn || !targetTable || !targetColumn) {
    throw new Error('Invalid constraint name format');
  }
  
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
  const tempTableName = `${tableName}_temp_${Date.now()}`;
  const sanitizedTempTable = sanitizeIdentifier(tempTableName);
  
  try {
    // 1. Get current CREATE TABLE statement
    const createQuery = `SELECT sql FROM sqlite_master WHERE type='table' AND name='${sanitizedTable}'`;
    const createResult = await executeQueryViaAPI(dbId, createQuery, env);
    const createSql = (createResult.results[0] as { sql: string })?.sql;
    
    if (!createSql) {
      throw new Error(`Table ${tableName} not found`);
    }
    
    // 2. Parse and modify the CREATE TABLE statement
    let newCreateSql = createSql.replace(new RegExp(`CREATE TABLE ${sanitizedTable}`, 'i'), `CREATE TABLE ${sanitizedTempTable}`);
    
    // Remove old constraint if modifying or removing
    if (modification.action === 'modify' || modification.action === 'remove') {
      const oldConst = modification.oldConstraint || modification.constraint;
      const fkPattern = new RegExp(
        `\\s*,?\\s*FOREIGN KEY\\s*\\([^)]*${oldConst.columns[0]}[^)]*\\)\\s*REFERENCES\\s*${oldConst.refTable}\\s*\\([^)]+\\)[^,)]*`,
        'gi'
      );
      newCreateSql = newCreateSql.replace(fkPattern, '');
    }
    
    // Add new constraint if adding or modifying
    if (modification.action === 'add' || modification.action === 'modify') {
      const { columns, refTable, refColumns, onDelete, onUpdate, name } = modification.constraint;
      const constraintName = name || `fk_${tableName}_${columns.join('_')}`;
      const fkClause = `CONSTRAINT ${constraintName} FOREIGN KEY (${columns.map(c => `"${c}"`).join(', ')}) REFERENCES "${refTable}" (${refColumns.map(c => `"${c}"`).join(', ')})${onDelete ? ` ON DELETE ${onDelete}` : ''}${onUpdate ? ` ON UPDATE ${onUpdate}` : ''}`;
      
      // Insert before closing parenthesis
      newCreateSql = newCreateSql.replace(/\)(\s*;?\s*)$/i, `, ${fkClause})$1`);
    }
    
    // 3. Create temporary table
    await executeQueryViaAPI(dbId, newCreateSql, env);
    
    // 4. Copy data
    const copyQuery = `INSERT INTO ${sanitizedTempTable} SELECT * FROM ${sanitizedTable}`;
    await executeQueryViaAPI(dbId, copyQuery, env);
    
    // 5. Get indexes
    const indexQuery = `SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='${sanitizedTable}' AND sql IS NOT NULL`;
    const indexResult = await executeQueryViaAPI(dbId, indexQuery, env);
    const indexes = (indexResult.results as Array<{ sql: string }>).map(r => r.sql);
    
    // 6. Drop original table
    await executeQueryViaAPI(dbId, `DROP TABLE ${sanitizedTable}`, env);
    
    // 7. Rename temporary table
    await executeQueryViaAPI(dbId, `ALTER TABLE ${sanitizedTempTable} RENAME TO ${sanitizedTable}`, env);
    
    // 8. Recreate indexes
    for (const indexSql of indexes) {
      await executeQueryViaAPI(dbId, indexSql, env);
    }
    
  } catch (err) {
    // Attempt cleanup if temporary table exists
    try {
      await executeQueryViaAPI(dbId, `DROP TABLE IF EXISTS ${sanitizedTempTable}`, env);
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
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: {
      'Authorization': `Bearer ${env.API_KEY}`,
      'Content-Type': 'application/json'
    },
      body: JSON.stringify({ sql: query })
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Tables] Query error:', errorText);
    throw new Error(`Query failed: ${response.status}`);
  }
  
  const data = await response.json() as { 
    result: Array<{ results: unknown[]; meta: Record<string, unknown>; success: boolean }>;
    success: boolean;
  };
  
  // REST API returns array of results, take the first one
  const firstResult = data.result[0];
  if (!firstResult) {
    throw new Error('Empty result from D1 API');
  }
  return firstResult;
}

