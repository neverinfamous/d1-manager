import type { Env } from '../types';
import { logInfo, logWarning } from '../utils/error-logger';

// Helper to create response headers with CORS
function jsonHeaders(corsHeaders: HeadersInit): Headers {
  const headers = new Headers(corsHeaders);
  headers.set('Content-Type', 'application/json');
  return headers;
}

// Body type for color updates
interface ColorBody {
  color: string | null;
}

/**
 * Valid color options (shared between database and table colors)
 */
export type ColorValue = 
  | 'red' | 'red-light' | 'red-dark'
  | 'orange' | 'orange-light' | 'amber'
  | 'yellow' | 'yellow-light' | 'lime'
  | 'green' | 'green-light' | 'emerald'
  | 'teal' | 'cyan' | 'sky'
  | 'blue' | 'blue-light' | 'indigo'
  | 'purple' | 'violet' | 'fuchsia'
  | 'pink' | 'rose' | 'pink-light'
  | 'gray' | 'slate' | 'zinc'
  | null;

const VALID_COLORS = [
  // Reds & Pinks
  'red', 'red-light', 'red-dark', 'rose', 'pink-light', 'pink',
  // Oranges & Yellows
  'orange', 'orange-light', 'amber', 'yellow', 'yellow-light', 'lime',
  // Greens & Teals
  'green', 'green-light', 'emerald', 'teal', 'cyan', 'sky',
  // Blues & Purples
  'blue', 'blue-light', 'indigo', 'violet', 'purple', 'fuchsia',
  // Neutrals
  'slate', 'gray', 'zinc'
];

/**
 * Database color record from the database
 */
interface DatabaseColorRecord {
  database_id: string;
  color: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * Table color record from the database
 */
interface TableColorRecord {
  database_id: string;
  table_name: string;
  color: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * Handle color-related API routes
 */
export async function handleColorRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail = 'unknown'
): Promise<Response | null> {
  const db = env.METADATA;

  // GET /api/databases/colors - Get all database colors
  if (request.method === 'GET' && url.pathname === '/api/databases/colors') {
    logInfo('Getting all database colors', { module: 'colors', operation: 'list' });

    if (isLocalDev) {
      // Mock response for local development
      return new Response(JSON.stringify({
        result: {
          'mock-db-1': 'blue',
          'mock-db-2': 'green'
        },
        success: true
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    try {
      const result = await db.prepare(
        'SELECT database_id, color FROM database_colors'
      ).all<DatabaseColorRecord>();

      // Convert to object map
      const colorMap: Record<string, string> = {};
      for (const row of result.results) {
        colorMap[row.database_id] = row.color;
      }

      return new Response(JSON.stringify({
        result: colorMap,
        success: true
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    } catch (err) {
      logWarning(`Failed to get colors: ${err instanceof Error ? err.message : String(err)}`, { module: 'colors', operation: 'list' });
      return new Response(JSON.stringify({
        result: {},
        success: true
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    }
  }

  // PUT /api/databases/:dbId/color - Update database color
  if (request.method === 'PUT' && /^\/api\/databases\/[^/]+\/color$/.exec(url.pathname)) {
    const dbId = url.pathname.split('/')[3];
    logInfo(`Updating color for database: ${dbId ?? 'unknown'}`, { module: 'colors', operation: 'update', ...(dbId !== undefined && { databaseId: dbId }) });

    const body: ColorBody = await request.json();
    const color = body.color;

    // Validate color
    if (color !== null && !VALID_COLORS.includes(color)) {
      return new Response(JSON.stringify({
        error: 'Invalid color',
        message: `Color must be one of: ${VALID_COLORS.join(', ')}, or null`,
        success: false
      }), {
        status: 400,
        headers: jsonHeaders(corsHeaders)
      });
    }

    if (isLocalDev) {
      // Mock response for local development
      return new Response(JSON.stringify({
        result: { database_id: dbId, color },
        success: true
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    try {
      if (color === null) {
        // Remove color
        await db.prepare(
          'DELETE FROM database_colors WHERE database_id = ?'
        ).bind(dbId).run();
      } else {
        // Upsert color
        await db.prepare(
          `INSERT INTO database_colors (database_id, color, updated_at, updated_by)
           VALUES (?, ?, datetime('now'), ?)
           ON CONFLICT(database_id) DO UPDATE SET
             color = excluded.color,
             updated_at = excluded.updated_at,
             updated_by = excluded.updated_by`
        ).bind(dbId, color, userEmail).run();
      }

      return new Response(JSON.stringify({
        result: { database_id: dbId, color },
        success: true
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    } catch (err) {
      logWarning(`Failed to update color: ${err instanceof Error ? err.message : String(err)}`, { module: 'colors', operation: 'update', ...(dbId !== undefined && { databaseId: dbId }) });
      
      // Check if error is due to missing table (user needs to run migration)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      if (errorMessage.includes('no such table: database_colors')) {
        return new Response(JSON.stringify({
          error: 'Database upgrade required',
          message: 'The database colors feature requires a schema update. Please run: npx wrangler d1 execute d1-manager-metadata --remote --file=worker/migrations/002_add_database_colors.sql',
          requiresUpgrade: true,
          success: false
        }), {
          status: 503,
          headers: jsonHeaders(corsHeaders)
        });
      }
      
      return new Response(JSON.stringify({
        error: 'Failed to update color',
        message: errorMessage,
        success: false
      }), {
        status: 500,
        headers: jsonHeaders(corsHeaders)
      });
    }
  }

  // GET /api/tables/:dbId/colors - Get all table colors for a database
  if (request.method === 'GET' && /^\/api\/tables\/[^/]+\/colors$/.exec(url.pathname)) {
    const dbId = url.pathname.split('/')[3];
    logInfo(`Getting table colors for database: ${dbId ?? 'unknown'}`, { module: 'colors', operation: 'table_list', ...(dbId !== undefined && { databaseId: dbId }) });

    if (isLocalDev) {
      // Mock response for local development
      return new Response(JSON.stringify({
        result: {},
        success: true
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    try {
      const result = await db.prepare(
        'SELECT table_name, color FROM table_colors WHERE database_id = ?'
      ).bind(dbId).all<TableColorRecord>();

      // Convert to object map
      const colorMap: Record<string, string> = {};
      for (const row of result.results) {
        colorMap[row.table_name] = row.color;
      }

      return new Response(JSON.stringify({
        result: colorMap,
        success: true
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    } catch (err) {
      logWarning(`Failed to get table colors: ${err instanceof Error ? err.message : String(err)}`, { module: 'colors', operation: 'table_list', ...(dbId !== undefined && { databaseId: dbId }) });
      return new Response(JSON.stringify({
        result: {},
        success: true
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    }
  }

  // PUT /api/tables/:dbId/:tableName/color - Update table color
  if (request.method === 'PUT' && /^\/api\/tables\/[^/]+\/[^/]+\/color$/.exec(url.pathname)) {
    const pathParts = url.pathname.split('/');
    const dbId = pathParts[3];
    const tableName = decodeURIComponent(pathParts[4] ?? '');
    logInfo(`Updating color for table: ${tableName} in database: ${dbId ?? 'unknown'}`, { module: 'colors', operation: 'table_update', ...(dbId !== undefined && { databaseId: dbId }), metadata: { tableName } });

    const body: ColorBody = await request.json();
    const color = body.color;

    // Validate color
    if (color !== null && !VALID_COLORS.includes(color)) {
      return new Response(JSON.stringify({
        error: 'Invalid color',
        message: `Color must be one of: ${VALID_COLORS.join(', ')}, or null`,
        success: false
      }), {
        status: 400,
        headers: jsonHeaders(corsHeaders)
      });
    }

    if (isLocalDev) {
      // Mock response for local development
      return new Response(JSON.stringify({
        result: { database_id: dbId, table_name: tableName, color },
        success: true
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    try {
      if (color === null) {
        // Remove color
        await db.prepare(
          'DELETE FROM table_colors WHERE database_id = ? AND table_name = ?'
        ).bind(dbId, tableName).run();
      } else {
        // Upsert color
        await db.prepare(
          `INSERT INTO table_colors (database_id, table_name, color, updated_at, updated_by)
           VALUES (?, ?, ?, datetime('now'), ?)
           ON CONFLICT(database_id, table_name) DO UPDATE SET
             color = excluded.color,
             updated_at = excluded.updated_at,
             updated_by = excluded.updated_by`
        ).bind(dbId, tableName, color, userEmail).run();
      }

      return new Response(JSON.stringify({
        result: { database_id: dbId, table_name: tableName, color },
        success: true
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    } catch (err) {
      logWarning(`Failed to update table color: ${err instanceof Error ? err.message : String(err)}`, { module: 'colors', operation: 'table_update', ...(dbId !== undefined && { databaseId: dbId }), metadata: { tableName } });
      
      // Check if error is due to missing table (user needs to run migration)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      if (errorMessage.includes('no such table: table_colors')) {
        return new Response(JSON.stringify({
          error: 'Database upgrade required',
          message: 'The table colors feature requires a schema update. Please run: npx wrangler d1 execute d1-manager-metadata --remote --file=worker/migrations/003_add_table_colors.sql',
          requiresUpgrade: true,
          success: false
        }), {
          status: 503,
          headers: jsonHeaders(corsHeaders)
        });
      }
      
      return new Response(JSON.stringify({
        error: 'Failed to update table color',
        message: errorMessage,
        success: false
      }), {
        status: 500,
        headers: jsonHeaders(corsHeaders)
      });
    }
  }

  // Route not handled
  return null;
}
