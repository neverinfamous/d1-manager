import type { Env } from '../types';

export async function handleSavedQueriesRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string | null
): Promise<Response> {
  console.log('[SavedQueries] Handling saved queries operation');

  if (!userEmail && !isLocalDev) {
    return new Response(JSON.stringify({ 
      error: 'User email required' 
    }), { 
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }

  try {
    // Get all saved queries for the current user
    if (request.method === 'GET' && url.pathname === '/api/saved-queries') {
      const databaseId = url.searchParams.get('database_id');
      
      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: [
            {
              id: 1,
              name: 'Mock Query 1',
              description: 'Sample saved query',
              database_id: databaseId || 'mock-db',
              query: 'SELECT * FROM users LIMIT 10',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              user_email: 'dev@localhost'
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

      // Query saved queries from metadata database
      let stmt;
      if (databaseId) {
        stmt = env.METADATA.prepare(
          'SELECT * FROM saved_queries WHERE user_email = ? AND database_id = ? ORDER BY updated_at DESC'
        ).bind(userEmail, databaseId);
      } else {
        stmt = env.METADATA.prepare(
          'SELECT * FROM saved_queries WHERE user_email = ? ORDER BY updated_at DESC'
        ).bind(userEmail);
      }
      
      const result = await stmt.all();
      
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

    // Create a new saved query
    if (request.method === 'POST' && url.pathname === '/api/saved-queries') {
      const body = await request.json() as {
        name: string;
        description?: string;
        database_id?: string;
        query: string;
      };

      if (!body.name || !body.query) {
        return new Response(JSON.stringify({ 
          error: 'Name and query are required' 
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
            id: Date.now(),
            ...body,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            user_email: 'dev@localhost'
          },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // Insert into saved_queries table
      const stmt = env.METADATA.prepare(
        `INSERT INTO saved_queries 
         (name, description, database_id, query, user_email) 
         VALUES (?, ?, ?, ?, ?)`
      ).bind(
        body.name,
        body.description || null,
        body.database_id || null,
        body.query,
        userEmail
      );
      
      const result = await stmt.run();
      
      // Get the inserted row
      const getStmt = env.METADATA.prepare(
        'SELECT * FROM saved_queries WHERE id = ?'
      ).bind(result.meta.last_row_id);
      
      const savedQuery = await getStmt.first();
      
      return new Response(JSON.stringify({
        result: savedQuery,
        success: true
      }), {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Update a saved query
    if (request.method === 'PATCH' && url.pathname.startsWith('/api/saved-queries/')) {
      const queryId = url.pathname.split('/').pop();
      
      if (!queryId) {
        return new Response(JSON.stringify({ 
          error: 'Query ID required' 
        }), { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      const body = await request.json() as {
        name?: string;
        description?: string;
        query?: string;
      };

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: { id: queryId, ...body, updated_at: new Date().toISOString() },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // Build update query dynamically
      const updates: string[] = [];
      const params: (string | number)[] = [];
      
      if (body.name !== undefined) {
        updates.push('name = ?');
        params.push(body.name);
      }
      if (body.description !== undefined) {
        updates.push('description = ?');
        params.push(body.description);
      }
      if (body.query !== undefined) {
        updates.push('query = ?');
        params.push(body.query);
      }
      
      updates.push('updated_at = CURRENT_TIMESTAMP');
      
      if (updates.length === 1) { // Only updated_at
        return new Response(JSON.stringify({ 
          error: 'No fields to update' 
        }), { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      params.push(parseInt(queryId), userEmail!);
      
      const stmt = env.METADATA.prepare(
        `UPDATE saved_queries SET ${updates.join(', ')} 
         WHERE id = ? AND user_email = ?`
      ).bind(...params);
      
      await stmt.run();
      
      // Get the updated row
      const getStmt = env.METADATA.prepare(
        'SELECT * FROM saved_queries WHERE id = ? AND user_email = ?'
      ).bind(parseInt(queryId), userEmail);
      
      const updatedQuery = await getStmt.first();
      
      if (!updatedQuery) {
        return new Response(JSON.stringify({ 
          error: 'Query not found or access denied' 
        }), { 
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      return new Response(JSON.stringify({
        result: updatedQuery,
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Delete a saved query
    if (request.method === 'DELETE' && url.pathname.startsWith('/api/saved-queries/')) {
      const queryId = url.pathname.split('/').pop();
      
      if (!queryId) {
        return new Response(JSON.stringify({ 
          error: 'Query ID required' 
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

      // Delete the saved query (only if it belongs to the user)
      const stmt = env.METADATA.prepare(
        'DELETE FROM saved_queries WHERE id = ? AND user_email = ?'
      ).bind(parseInt(queryId), userEmail);
      
      const result = await stmt.run();
      
      if (result.meta.changes === 0) {
        return new Response(JSON.stringify({ 
          error: 'Query not found or access denied' 
        }), { 
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      return new Response(JSON.stringify({
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
    console.error('[SavedQueries] Error:', err);
    return new Response(JSON.stringify({ 
      error: 'Saved queries operation failed',
      message: err instanceof Error ? err.message : 'Unknown error'
    }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}

