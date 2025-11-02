import type { Env, QueryHistoryEntry } from '../types';
import { validateQuery, parseD1Error } from '../utils/helpers';

export async function handleQueryRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string | null
): Promise<Response> {
  console.log('[Queries] Handling query operation');
  
  // Extract database ID from URL (format: /api/query/:dbId/...)
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
    // Execute query
    if (request.method === 'POST' && url.pathname === `/api/query/${dbId}/execute`) {
      const body = await request.json() as { 
        query: string; 
        params?: unknown[];
        skipValidation?: boolean;
      };
      console.log('[Queries] Executing query:', body.query.substring(0, 100));
      
      // Validate query unless explicitly skipped
      if (!body.skipValidation) {
        const validation = validateQuery(body.query);
        if (!validation.valid) {
          return new Response(JSON.stringify({ 
            error: 'Query validation failed',
            warning: validation.warning
          }), { 
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
      }
      
      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: {
            results: [
              { id: 1, name: 'Mock Result 1' },
              { id: 2, name: 'Mock Result 2' }
            ],
            meta: {
              duration: 0.5,
              rows_read: 2,
              rows_written: 0
            },
            success: true
          }
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const startTime = Date.now();
      
      try {
        // Execute query via REST API
        const result = await executeQueryViaAPI(dbId, body.query, body.params, env);
        const duration = Date.now() - startTime;
        
        // Store in query history
        if (!isLocalDev && userEmail) {
          await storeQueryHistory(
            dbId,
            body.query,
            duration,
            result.meta?.rows_written as number || 0,
            null,
            userEmail,
            env
          );
        }
        
        return new Response(JSON.stringify({
          result,
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      } catch (err) {
        const duration = Date.now() - startTime;
        const errorMsg = parseD1Error(err);
        
        // Store error in query history
        if (!isLocalDev && userEmail) {
          await storeQueryHistory(
            dbId,
            body.query,
            duration,
            0,
            errorMsg,
            userEmail,
            env
          );
        }
        
        throw err;
      }
    }

    // Execute batch queries
    if (request.method === 'POST' && url.pathname === `/api/query/${dbId}/batch`) {
      const body = await request.json() as { 
        queries: Array<{ query: string; params?: unknown[] }>;
      };
      console.log('[Queries] Executing batch:', body.queries.length, 'queries');
      
      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: body.queries.map(() => ({
            results: [],
            meta: { duration: 0.5, rows_read: 0, rows_written: 1 },
            success: true
          })),
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Execute queries sequentially (REST API doesn't support true batch)
      const results: Array<{ results: unknown[]; meta: Record<string, unknown>; success: boolean }> = [];
      for (const q of body.queries) {
        const result = await executeQueryViaAPI(dbId, q.query, q.params, env);
        results.push(result);
      }
      
      return new Response(JSON.stringify({
        result: results,
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Get query history
    if (request.method === 'GET' && url.pathname === `/api/query/${dbId}/history`) {
      const limit = parseInt(url.searchParams.get('limit') || '10');
      console.log('[Queries] Getting query history, limit:', limit);
      
      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: [
            {
              id: 1,
              database_id: dbId,
              query: 'SELECT * FROM users LIMIT 10',
              executed_at: new Date().toISOString(),
              duration_ms: 1.5,
              rows_affected: 10
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
      
      // Query history from metadata database
      const stmt = env.METADATA.prepare(
        'SELECT * FROM query_history WHERE database_id = ? ORDER BY executed_at DESC LIMIT ?'
      ).bind(dbId, limit);
      
      const result = await stmt.all<QueryHistoryEntry>();
      
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
    console.error('[Queries] Error:', err);
    
    // Extract useful error message
    let errorMessage = 'Unable to execute query. Please check your SQL syntax and try again.';
    if (err instanceof Error) {
      // Parse D1 error message if available
      errorMessage = err.message;
      // Try to extract the actual D1 error from the response text
      const match = errorMessage.match(/"message":"([^"]+)"/);
      if (match) {
        errorMessage = match[1];
      }
    }
    
    // Return error to client with helpful message
    return new Response(JSON.stringify({ 
      error: 'Query operation failed',
      message: errorMessage
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
  params: unknown[] | undefined,
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
      body: JSON.stringify({ 
        sql: query,
        params: params || []
      })
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Queries] Query error:', errorText);
    throw new Error(`Query failed: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json() as { 
    result: Array<{ results: unknown[]; meta: Record<string, unknown>; success: boolean }>;
    success: boolean;
  };
  
  console.log('[Queries] D1 API response:', JSON.stringify({
    success: data.success,
    resultLength: data.result?.length,
    firstResult: data.result?.[0] ? {
      resultsLength: Array.isArray(data.result[0].results) ? data.result[0].results.length : 'not array',
      meta: data.result[0].meta,
      success: data.result[0].success
    } : 'no result'
  }));
  
  // REST API returns array of results, take the first one
  return data.result[0];
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
  env: Env
): Promise<void> {
  try {
    const stmt = env.METADATA.prepare(
      `INSERT INTO query_history 
       (database_id, query, duration_ms, rows_affected, error, user_email) 
       VALUES (?, ?, ?, ?, ?, ?)`
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
       )`
    ).bind(databaseId, databaseId);
    
    await cleanupStmt.run();
  } catch (err) {
    console.error('[Queries] Failed to store query history:', err);
    // Don't fail the request if history storage fails
  }
}

