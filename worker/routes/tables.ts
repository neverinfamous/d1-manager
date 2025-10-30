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

