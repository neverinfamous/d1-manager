import type { Env } from '../types';
import { logWarning } from './error-logger';

// Pattern-based protection for system databases
const PROTECTED_PATTERNS = [
  /^.*-metadata$/,  // Matches: d1-manager-metadata, kv-manager-metadata, etc.
  /^.*-metadata-dev$/,  // Development databases
];

// Specific protected names (legacy support)
const PROTECTED_NAMES = [
  'd1-manager-metadata',
  'kv-manager-metadata',
];

/**
 * Check if a database name matches protected patterns
 */
export function isProtectedDatabase(dbName: string): boolean {
  // Check exact names
  if (PROTECTED_NAMES.includes(dbName)) return true;
  
  // Check patterns
  return PROTECTED_PATTERNS.some(pattern => pattern.test(dbName));
}

/**
 * Create a standardized 403 response for protected database access
 */
export function createProtectedDatabaseResponse(corsHeaders: HeadersInit): Response {
  const headers = new Headers(corsHeaders);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify({
    error: 'Protected system database',
    message: 'This database is used by system applications and cannot be accessed.'
  }), {
    status: 403,
    headers
  });
}

/**
 * Get database info by ID from Cloudflare API
 * Returns database name or null if not found
 */
export async function getDatabaseInfo(dbId: string, env: Env): Promise<{ name: string } | null> {
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}`,
      {
        headers: {
          'Authorization': `Bearer ${env.API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!response.ok) return null;
    
    const data: { result: { name: string } } = await response.json();
    return data.result;
  } catch (err) {
    logWarning(`Failed to get database info: ${err instanceof Error ? err.message : String(err)}`, {
      module: 'protection',
      operation: 'get_database_info',
      databaseId: dbId,
      metadata: { error: err instanceof Error ? err.message : String(err) }
    });
    return null;
  }
}

