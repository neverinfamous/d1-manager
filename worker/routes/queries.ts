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
        
        // Log full error details on server only
        console.error('[Queries] Query execution error:', errorMsg);
        console.error('[Queries] Full error object:', err);
        
        // Store error in query history (with full details for server-side tracking)
        if (!isLocalDev && userEmail) {
          await storeQueryHistory(
            dbId,
            body.query,
            duration,
            0,
            errorMsg,
            userEmail,
            env
          ).catch(histErr => console.error('[Queries] Failed to store error in history:', histErr));
        }
        
        // Sanitize error message for client (remove stack traces and sensitive details)
        const sanitizedMessage = sanitizeErrorMessage(errorMsg);
        
        // Return generic error response with sanitized message
        // Do not expose stack traces or internal details to clients
        return new Response(JSON.stringify({ 
          error: 'Query execution failed',
          message: sanitizedMessage
        }), { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
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
    // Log full error details on server only - do not expose to client
    console.error('[Queries] Error:', err);
    
    // Parse and sanitize error message - never expose raw error objects to clients
    const rawErrorMsg = parseD1Error(err);
    const sanitizedMessage = sanitizeErrorMessage(rawErrorMsg);
    
    // Return generic error with sanitized message only
    // This prevents stack trace exposure to end users
    return new Response(JSON.stringify({ 
      error: 'Query operation failed',
      message: sanitizedMessage
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

/**
 * Sanitize error messages to prevent stack trace exposure
 * Removes all sensitive information including stack traces, file paths, and internal details
 * Only returns safe, user-friendly error messages
 */
function sanitizeErrorMessage(errorMsg: string): string {
  // Log original error for debugging (server-side only)
  console.log('[Sanitize] Original error:', errorMsg);
  
  // Extract just the D1 error message if present (from JSON error response)
  const d1ErrorMatch = errorMsg.match(/"message":"([^"]+)"/);
  if (d1ErrorMatch) {
    const extractedMsg = d1ErrorMatch[1];
    // Further sanitize the extracted message
    return sanitizeSimpleMessage(extractedMsg);
  }
  
  // Remove stack traces (lines starting with "at " or containing file paths)
  const lines = errorMsg.split('\n');
  const sanitizedLines = lines.filter(line => {
    const trimmed = line.trim();
    // Filter out stack trace lines, file paths, and internal references
    return !trimmed.startsWith('at ') && 
           !trimmed.includes('file://') && 
           !trimmed.includes('.ts:') &&
           !trimmed.includes('.js:') &&
           !trimmed.includes('node_modules') &&
           !trimmed.includes('Error:') && // Remove "Error:" prefixes
           !trimmed.match(/^\s*at\s+/) && // Remove indented "at" lines
           !trimmed.match(/\(.+:\d+:\d+\)/); // Remove (file:line:col) patterns
  });
  
  // Get the first non-empty line (main error message)
  const mainMessage = sanitizedLines.find(line => line.trim().length > 0) || '';
  
  return sanitizeSimpleMessage(mainMessage);
}

/**
 * Sanitize a simple error message string
 * Removes common error prefixes and ensures message is user-friendly
 */
function sanitizeSimpleMessage(message: string): string {
  // Remove common error prefixes
  let cleaned = message
    .replace(/^Query failed: \d+ - /, '')
    .replace(/^Error: /, '')
    .replace(/^TypeError: /, '')
    .replace(/^ReferenceError: /, '')
    .replace(/^SyntaxError: /, '')
    .trim();
  
  // Remove any remaining file paths or line numbers
  cleaned = cleaned.replace(/\s+at\s+.+$/, '').trim();
  cleaned = cleaned.replace(/\(.+:\d+:\d+\)/, '').trim();
  
  // If the message is too generic, empty, or potentially unsafe, provide a safe default
  if (!cleaned || 
      cleaned.length < 10 || 
      cleaned === 'Unknown error' ||
      cleaned.includes('undefined') ||
      cleaned.includes('null')) {
    return 'Query execution failed. Please check your SQL syntax and try again.';
  }
  
  // Limit message length to prevent overly verbose errors
  if (cleaned.length > 200) {
    cleaned = cleaned.substring(0, 197) + '...';
  }
  
  return cleaned;
}

