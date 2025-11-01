import type { Env, TableInfo } from '../types';
import { sanitizeIdentifier } from '../utils/helpers';
import { trackDatabaseAccess } from '../utils/database-tracking';

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
  isLocalDev: boolean
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
      const tableName = decodeURIComponent(pathParts[5]);
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
      const tableName = decodeURIComponent(pathParts[5]);
      const limit = parseInt(url.searchParams.get('limit') || '100');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      console.log('[Tables] Getting data for table:', tableName, 'limit:', limit, 'offset:', offset);
      
      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: [
            { id: 1, email: 'user1@example.com', name: 'User One', created_at: new Date().toISOString() },
            { id: 2, email: 'user2@example.com', name: 'User Two', created_at: new Date().toISOString() }
          ],
          meta: {
            rows_read: 2,
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
      const query = `SELECT * FROM "${sanitizedTable}" LIMIT ${limit} OFFSET ${offset}`;
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
      const tableName = decodeURIComponent(pathParts[5]);
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

    // Delete table
    if (request.method === 'DELETE' && url.pathname.match(/^\/api\/tables\/[^/]+\/[^/]+$/)) {
      const tableName = decodeURIComponent(pathParts[4]);
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
      const tableName = decodeURIComponent(pathParts[4]);
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
      const tableName = decodeURIComponent(pathParts[4]);
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
      const tableName = decodeURIComponent(pathParts[4]);
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
        
        if (rows.length === 0) {
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
        const columns = Object.keys(rows[0]);
        
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

    // Route not found
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
  return data.result[0];
}

