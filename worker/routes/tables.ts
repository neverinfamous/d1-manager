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
      
      // Parse filter parameters from URL
      const filters: Record<string, { type: string; value?: string }> = {};
      for (const [key, value] of url.searchParams.entries()) {
        if (key.startsWith('filter_')) {
          const columnName = key.substring(7); // Remove 'filter_' prefix
          const filterValue = url.searchParams.get(`filterValue_${columnName}`);
          filters[columnName] = {
            type: value,
            value: filterValue || undefined
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
          filterConditions[columnName] = {
            type: filter.type as import('../utils/helpers').FilterCondition['type'],
            value: filter.value
          };
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

    // Add column to table
    if (request.method === 'POST' && url.pathname.match(/^\/api\/tables\/[^/]+\/[^/]+\/columns\/add$/)) {
      const tableName = decodeURIComponent(pathParts[4]);
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
      const tableName = decodeURIComponent(pathParts[4]);
      const columnName = decodeURIComponent(pathParts[6]);
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
      const tableName = decodeURIComponent(pathParts[4]);
      const columnName = decodeURIComponent(pathParts[6]);
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
      const tableName = decodeURIComponent(pathParts[4]);
      const columnName = decodeURIComponent(pathParts[6]);
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

