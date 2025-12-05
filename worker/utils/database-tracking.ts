import type { Env } from '../types';
import { logInfo, logWarning } from './error-logger';

/**
 * Track database access by updating the databases table
 * This creates a record on first access and updates last_accessed on subsequent accesses
 */
export async function trackDatabaseAccess(
  databaseId: string,
  env: Env
): Promise<void> {
  try {
    // First, get the database name from the Cloudflare API
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/d1/database/${databaseId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${env.API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      logWarning(`Failed to fetch database info: ${String(response.status)}`, {
        module: 'database_tracking',
        operation: 'track_access',
        databaseId,
        metadata: { status: response.status }
      });
      return;
    }

    const data: { success: boolean; result?: { name: string } } = await response.json();

    if (!data.success || !data.result?.name) {
      logWarning('Invalid API response', {
        module: 'database_tracking',
        operation: 'track_access',
        databaseId
      });
      return;
    }

    const databaseName = data.result.name;

    // Check if database is already tracked
    const checkStmt = env.METADATA.prepare(
      'SELECT database_id FROM databases WHERE database_id = ?'
    ).bind(databaseId);

    const existing = await checkStmt.first();

    if (existing) {
      // Update last_accessed timestamp
      const updateStmt = env.METADATA.prepare(
        'UPDATE databases SET last_accessed = CURRENT_TIMESTAMP WHERE database_id = ?'
      ).bind(databaseId);

      await updateStmt.run();
      logInfo(`Updated last_accessed for: ${databaseName}`, {
        module: 'database_tracking',
        operation: 'update_access',
        databaseId,
        databaseName
      });
    } else {
      // Insert new database record
      const insertStmt = env.METADATA.prepare(
        'INSERT INTO databases (database_id, database_name) VALUES (?, ?)'
      ).bind(databaseId, databaseName);

      await insertStmt.run();
      logInfo(`Tracked new database: ${databaseName}`, {
        module: 'database_tracking',
        operation: 'track_new',
        databaseId,
        databaseName
      });
    }
  } catch (err) {
    // Don't fail the request if tracking fails
    logWarning(`Error tracking database access: ${err instanceof Error ? err.message : String(err)}`, {
      module: 'database_tracking',
      operation: 'track_access',
      databaseId,
      metadata: { error: err instanceof Error ? err.message : String(err) }
    });
  }
}

/**
 * Get all tracked databases with their access times
 */
export async function getTrackedDatabases(env: Env): Promise<{
  database_id: string;
  database_name: string;
  first_accessed: string;
  last_accessed: string;
}[]> {
  try {
    const stmt = env.METADATA.prepare(
      'SELECT * FROM databases ORDER BY last_accessed DESC'
    );

    const result = await stmt.all();
    return result.results as {
      database_id: string;
      database_name: string;
      first_accessed: string;
      last_accessed: string;
    }[];
  } catch (err) {
    logWarning(`Error getting tracked databases: ${err instanceof Error ? err.message : String(err)}`, {
      module: 'database_tracking',
      operation: 'get_tracked',
      metadata: { error: err instanceof Error ? err.message : String(err) }
    });
    return [];
  }
}

