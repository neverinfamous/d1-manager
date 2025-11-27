import type { Env } from '../types';
import { CF_API } from '../types';
import {
  getCurrentBookmark,
  getBookmarkHistory,
  captureBookmark,
  deleteBookmarkEntry,
  generateRestoreCommand,
  type BookmarkHistoryEntry
} from '../utils/time-travel';

/**
 * Time Travel routes for D1 databases
 * 
 * GET /api/time-travel/:dbId/bookmark - Get current database bookmark
 * GET /api/time-travel/:dbId/history - Get stored bookmark history
 * POST /api/time-travel/:dbId/capture - Manually capture a bookmark
 * DELETE /api/time-travel/:dbId/history/:id - Delete a bookmark entry
 */
export async function handleTimeTravelRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string = 'unknown'
): Promise<Response | null> {
  console.log('[TimeTravel] Handling request:', request.method, url.pathname);

  const cfHeaders = {
    'Authorization': `Bearer ${env.API_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    // GET /api/time-travel/:dbId/bookmark - Get current bookmark
    const bookmarkMatch = url.pathname.match(/^\/api\/time-travel\/([^/]+)\/bookmark$/);
    if (request.method === 'GET' && bookmarkMatch && bookmarkMatch[1]) {
      const dbId = bookmarkMatch[1];
      console.log('[TimeTravel] Getting current bookmark for:', dbId);

      // Mock response for local development without API credentials
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: {
            bookmark: '00000000-00000000-00000000-mock1234567890abcdef1234567890ab',
            capturedAt: new Date().toISOString(),
            databaseId: dbId,
            databaseName: 'dev-database'
          },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // Get database name from API
      let databaseName = '';
      try {
        const dbInfoResponse = await fetch(
          `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}`,
          { headers: cfHeaders }
        );
        if (dbInfoResponse.ok) {
          const dbInfo = await dbInfoResponse.json() as { result: { name: string } };
          databaseName = dbInfo.result.name;
        }
      } catch (err) {
        console.warn('[TimeTravel] Could not fetch database name:', err);
      }

      const bookmark = await getCurrentBookmark(dbId, env);

      if (!bookmark) {
        return new Response(JSON.stringify({
          error: 'Failed to get bookmark',
          message: 'Could not retrieve the current database bookmark. This may be due to an API error or the database may be in an unsupported state.',
          success: false
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      return new Response(JSON.stringify({
        result: {
          bookmark,
          capturedAt: new Date().toISOString(),
          databaseId: dbId,
          databaseName,
          restoreCommand: databaseName ? generateRestoreCommand(databaseName, bookmark) : null
        },
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // GET /api/time-travel/:dbId/history - Get bookmark history
    const historyMatch = url.pathname.match(/^\/api\/time-travel\/([^/]+)\/history$/);
    if (request.method === 'GET' && historyMatch && historyMatch[1]) {
      const dbId = historyMatch[1];
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      console.log('[TimeTravel] Getting bookmark history for:', dbId);

      // Mock response for local development
      if (isLocalDev) {
        const mockHistory: BookmarkHistoryEntry[] = [
          {
            id: 1,
            database_id: dbId,
            database_name: 'dev-database',
            bookmark: '00000000-00000000-00000000-mock1234567890abcdef1234567890ab',
            operation_type: 'pre_drop_table',
            description: 'Before dropping table: users',
            captured_at: new Date(Date.now() - 3600000).toISOString(),
            user_email: 'dev@localhost'
          },
          {
            id: 2,
            database_id: dbId,
            database_name: 'dev-database',
            bookmark: '00000000-00000000-00000000-mock0987654321fedcba0987654321fe',
            operation_type: 'pre_delete_rows',
            description: 'Before bulk delete in: orders',
            captured_at: new Date(Date.now() - 86400000).toISOString(),
            user_email: 'dev@localhost'
          }
        ];

        return new Response(JSON.stringify({
          result: mockHistory,
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      const history = await getBookmarkHistory(dbId, env, limit);

      // Get database name for restore commands
      let databaseName = '';
      try {
        const dbInfoResponse = await fetch(
          `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}`,
          { headers: cfHeaders }
        );
        if (dbInfoResponse.ok) {
          const dbInfo = await dbInfoResponse.json() as { result: { name: string } };
          databaseName = dbInfo.result.name;
        }
      } catch (err) {
        console.warn('[TimeTravel] Could not fetch database name:', err);
      }

      // Add restore commands to history entries
      const historyWithCommands = history.map(entry => ({
        ...entry,
        restoreCommand: databaseName ? generateRestoreCommand(databaseName, entry.bookmark) : null
      }));

      return new Response(JSON.stringify({
        result: historyWithCommands,
        databaseName,
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // POST /api/time-travel/:dbId/capture - Manually capture a bookmark
    const captureMatch = url.pathname.match(/^\/api\/time-travel\/([^/]+)\/capture$/);
    if (request.method === 'POST' && captureMatch && captureMatch[1]) {
      const dbId = captureMatch[1];
      console.log('[TimeTravel] Manually capturing bookmark for:', dbId);

      const body = await request.json() as { description?: string };

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: {
            bookmark: '00000000-00000000-00000000-mocknew1234567890abcdef12345678',
            capturedAt: new Date().toISOString(),
            operationType: 'manual',
            description: body.description || 'Manual checkpoint'
          },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // Get database name
      let databaseName = '';
      try {
        const dbInfoResponse = await fetch(
          `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}`,
          { headers: cfHeaders }
        );
        if (dbInfoResponse.ok) {
          const dbInfo = await dbInfoResponse.json() as { result: { name: string } };
          databaseName = dbInfo.result.name;
        }
      } catch (err) {
        console.warn('[TimeTravel] Could not fetch database name:', err);
      }

      const bookmark = await captureBookmark(
        dbId,
        databaseName,
        env,
        'manual',
        body.description || 'Manual checkpoint',
        userEmail
      );

      if (!bookmark) {
        return new Response(JSON.stringify({
          error: 'Failed to capture bookmark',
          message: 'Could not capture the current database state.',
          success: false
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      return new Response(JSON.stringify({
        result: {
          bookmark,
          capturedAt: new Date().toISOString(),
          operationType: 'manual',
          description: body.description || 'Manual checkpoint',
          restoreCommand: databaseName ? generateRestoreCommand(databaseName, bookmark) : null
        },
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // DELETE /api/time-travel/:dbId/history/:id - Delete a bookmark entry
    const deleteMatch = url.pathname.match(/^\/api\/time-travel\/([^/]+)\/history\/(\d+)$/);
    if (request.method === 'DELETE' && deleteMatch && deleteMatch[1] && deleteMatch[2]) {
      const bookmarkId = parseInt(deleteMatch[2], 10);
      console.log('[TimeTravel] Deleting bookmark entry:', bookmarkId);

      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: { deleted: true },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      const deleted = await deleteBookmarkEntry(bookmarkId, env);

      return new Response(JSON.stringify({
        result: { deleted },
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Route not matched
    return null;

  } catch (err) {
    console.error('[TimeTravel] Error:', err);
    return new Response(JSON.stringify({
      error: 'Time Travel operation failed',
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

