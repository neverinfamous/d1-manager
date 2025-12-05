import type { Env, D1DatabaseInfo } from '../types';
import { CF_API } from '../types';
import { isProtectedDatabase, createProtectedDatabaseResponse } from '../utils/database-protection';
import { createJob, completeJob, generateJobId } from './jobs';
import { OperationType, startJobTracking, finishJobTracking } from '../utils/job-tracking';
import { logError, logInfo, logWarning } from '../utils/error-logger';

// Helper to create response headers with CORS
function jsonHeaders(corsHeaders: HeadersInit): Headers {
  const headers = new Headers(corsHeaders);
  headers.set('Content-Type', 'application/json');
  return headers;
}

// API Response types
interface D1QueryResult {
  results: Record<string, unknown>[];
  meta?: Record<string, unknown>;
}

interface D1APIResponse {
  success: boolean;
  result?: D1QueryResult[] | D1DatabaseInfo | D1DatabaseInfo[] | Record<string, unknown>;
  errors?: { message: string }[];
}

interface ExportAPIResponse {
  success: boolean;
  result?: {
    status?: string;
    at_bookmark?: string;
    signed_url?: string;
    result?: {
      signed_url?: string;
    };
    error?: string;
  };
}

interface ImportAPIResponse {
  success: boolean;
  result?: {
    upload_url?: string;
    filename?: string;
    at_bookmark?: string;
    num_queries?: number;
    success?: boolean;
    error?: string;
  };
}

/**
 * Check if a database contains FTS5 virtual tables
 * FTS5 tables cannot be exported via D1's export API
 */
async function hasFTS5Tables(
  databaseId: string,
  cfHeaders: Record<string, string>,
  env: Env,
  isLocalDev: boolean
): Promise<{ hasFTS5: boolean; fts5Tables: string[] }> {
  try {
    logInfo(`Checking for FTS5 tables in database: ${databaseId}`, {
      module: 'databases',
      operation: 'fts5_check',
      databaseId
    });
    
    const response = await fetch(
      `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${databaseId}/query`,
      {
        method: 'POST',
        headers: cfHeaders,
        body: JSON.stringify({
          sql: "SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%USING fts5%' ORDER BY name"
        })
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      void logError(env, `Failed to query for FTS5 tables: ${errorText}`, {
        module: 'databases',
        operation: 'fts5_check',
        databaseId,
        metadata: { status: response.status }
      }, isLocalDev);
      // If we can't check, assume no FTS5 tables to avoid blocking unnecessarily
      return { hasFTS5: false, fts5Tables: [] };
    }
    
    const data: D1APIResponse = await response.json();
    
    const queryResults = data.result as D1QueryResult[] | undefined;
    if (!data.success || !queryResults?.[0]?.results) {
      logWarning('Invalid response structure for FTS5 check', {
        module: 'databases',
        operation: 'fts5_check',
        databaseId
      });
      return { hasFTS5: false, fts5Tables: [] };
    }
    
    const fts5Tables = queryResults[0].results.map((r) => r['name'] as string);
    const hasFTS5 = fts5Tables.length > 0;
    
    if (hasFTS5) {
      logInfo(`Found FTS5 tables: ${fts5Tables.join(', ')}`, {
        module: 'databases',
        operation: 'fts5_check',
        databaseId,
        metadata: { fts5Tables }
      });
    } else {
      logInfo('No FTS5 tables found', {
        module: 'databases',
        operation: 'fts5_check',
        databaseId
      });
    }
    
    return { hasFTS5, fts5Tables };
  } catch (err) {
    void logError(env, err instanceof Error ? err : String(err), {
      module: 'databases',
      operation: 'fts5_check',
      databaseId
    }, isLocalDev);
    // If error occurs, assume no FTS5 tables to avoid blocking unnecessarily
    return { hasFTS5: false, fts5Tables: [] };
  }
}

/**
 * Verify database integrity by comparing source and target databases
 * Checks table count, row counts, and schema structure
 */
async function verifyDatabaseIntegrity(
  sourceDbId: string,
  targetDbId: string,
  cfHeaders: Record<string, string>,
  _env: Env
): Promise<{ success: boolean; issues: string[] }> {
  const issues: string[] = [];
  
  try {
    logInfo('Starting database integrity verification', {
      module: 'databases',
      operation: 'verify',
      metadata: { sourceDbId, targetDbId }
    });
    
    // Get list of tables from source
    const sourceTablesResponse = await fetch(
      `${CF_API}/accounts/${_env.ACCOUNT_ID}/d1/database/${sourceDbId}/query`,
      {
        method: 'POST',
        headers: cfHeaders,
        body: JSON.stringify({
          sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"
        })
      }
    );
    
    if (!sourceTablesResponse.ok) {
      const errorText = await sourceTablesResponse.text();
      logWarning(`Failed to query source database tables: ${errorText}`, {
        module: 'databases',
        operation: 'verify',
        databaseId: sourceDbId,
        metadata: { status: sourceTablesResponse.status }
      });
      issues.push(`Failed to query source database tables: ${errorText}`);
      return { success: false, issues };
    }
    
    const sourceTablesData: D1APIResponse = await sourceTablesResponse.json();
    
    const sourceQueryResults = sourceTablesData.result as D1QueryResult[] | undefined;
    const sourceResult = sourceQueryResults?.[0];
    if (!sourceTablesData.success || !sourceResult) {
      logWarning('Invalid source tables response', {
        module: 'databases',
        operation: 'verify',
        databaseId: sourceDbId
      });
      issues.push('Invalid response when querying source database tables');
      return { success: false, issues };
    }
    
    const sourceTables = sourceResult.results.map((r) => r['name'] as string);
    logInfo(`Source tables: ${sourceTables.join(', ')}`, {
      module: 'databases',
      operation: 'verify',
      databaseId: sourceDbId,
      metadata: { tableCount: sourceTables.length }
    });
    
    // Get list of tables from target
    const targetTablesResponse = await fetch(
      `${CF_API}/accounts/${_env.ACCOUNT_ID}/d1/database/${targetDbId}/query`,
      {
        method: 'POST',
        headers: cfHeaders,
        body: JSON.stringify({
          sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"
        })
      }
    );
    
    if (!targetTablesResponse.ok) {
      const errorText = await targetTablesResponse.text();
      logWarning(`Failed to query target database tables: ${errorText}`, {
        module: 'databases',
        operation: 'verify',
        databaseId: targetDbId,
        metadata: { status: targetTablesResponse.status }
      });
      issues.push(`Failed to query target database tables: ${errorText}`);
      return { success: false, issues };
    }
    
    const targetTablesData: D1APIResponse = await targetTablesResponse.json();
    
    const targetQueryResults = targetTablesData.result as D1QueryResult[] | undefined;
    const targetResult = targetQueryResults?.[0];
    if (!targetTablesData.success || !targetResult) {
      logWarning('Invalid target tables response', {
        module: 'databases',
        operation: 'verify',
        databaseId: targetDbId
      });
      issues.push('Invalid response when querying target database tables');
      return { success: false, issues };
    }
    
    const targetTables = targetResult.results.map((r) => r['name'] as string);
    logInfo(`Target tables: ${targetTables.join(', ')}`, {
      module: 'databases',
      operation: 'verify',
      databaseId: targetDbId,
      metadata: { tableCount: targetTables.length }
    });
    
    // Verify table count matches
    if (sourceTables.length !== targetTables.length) {
      logWarning('Table count mismatch', {
        module: 'databases',
        operation: 'verify',
        metadata: { sourceCount: sourceTables.length, targetCount: targetTables.length }
      });
      issues.push(`Table count mismatch: source has ${String(sourceTables.length)}, target has ${String(targetTables.length)}`);
    }
    
    // Verify all source tables exist in target
    const missingTables = sourceTables.filter(t => !targetTables.includes(t));
    if (missingTables.length > 0) {
      logWarning(`Missing tables in target: ${missingTables.join(', ')}`, {
        module: 'databases',
        operation: 'verify',
        metadata: { missingTables }
      });
      issues.push(`Missing tables in target: ${missingTables.join(', ')}`);
    }
    
    // If no tables exist, that's OK (empty database)
    if (sourceTables.length === 0 && targetTables.length === 0) {
      logInfo('Both databases are empty - verification passed', {
        module: 'databases',
        operation: 'verify'
      });
      return { success: true, issues: [] };
    }
    
    // Verify row counts for each table
    logInfo(`Verifying row counts for ${String(sourceTables.length)} tables`, {
      module: 'databases',
      operation: 'verify',
      metadata: { tableCount: sourceTables.length }
    });
    for (const tableName of sourceTables) {
      if (!targetTables.includes(tableName)) continue;
      
      try {
        // Get source row count
        const sourceCountResponse = await fetch(
          `${CF_API}/accounts/${_env.ACCOUNT_ID}/d1/database/${sourceDbId}/query`,
          {
            method: 'POST',
            headers: cfHeaders,
            body: JSON.stringify({
              sql: `SELECT COUNT(*) as count FROM "${tableName}"`
            })
          }
        );
        
        // Get target row count
        const targetCountResponse = await fetch(
          `${CF_API}/accounts/${_env.ACCOUNT_ID}/d1/database/${targetDbId}/query`,
          {
            method: 'POST',
            headers: cfHeaders,
            body: JSON.stringify({
              sql: `SELECT COUNT(*) as count FROM "${tableName}"`
            })
          }
        );
        
        if (sourceCountResponse.ok && targetCountResponse.ok) {
          const sourceCountData: D1APIResponse = await sourceCountResponse.json();
          const targetCountData: D1APIResponse = await targetCountResponse.json();
          
          const sourceCountResults = sourceCountData.result as D1QueryResult[] | undefined;
          const srcResult = sourceCountResults?.[0];
          const srcRow = srcResult?.results[0];
          if (!sourceCountData.success || !srcRow) {
            logWarning(`Invalid source count response for table "${tableName}"`, {
              module: 'databases',
              operation: 'verify',
              databaseId: sourceDbId,
              metadata: { tableName }
            });
            issues.push(`Failed to get row count for source table "${tableName}"`);
            continue;
          }
          
          const targetCountResults = targetCountData.result as D1QueryResult[] | undefined;
          const tgtResult = targetCountResults?.[0];
          const tgtRow = tgtResult?.results[0];
          if (!targetCountData.success || !tgtRow) {
            logWarning(`Invalid target count response for table "${tableName}"`, {
              module: 'databases',
              operation: 'verify',
              databaseId: targetDbId,
              metadata: { tableName }
            });
            issues.push(`Failed to get row count for target table "${tableName}"`);
            continue;
          }
          
          const sourceCount = srcRow['count'] as number;
          const targetCount = tgtRow['count'] as number;
          
          logInfo(`Table "${tableName}": source=${String(sourceCount)}, target=${String(targetCount)}`, {
            module: 'databases',
            operation: 'verify',
            metadata: { tableName, sourceCount, targetCount }
          });
          
          if (sourceCount !== targetCount) {
            logWarning(`Row count mismatch in table "${tableName}"`, {
              module: 'databases',
              operation: 'verify',
              metadata: { tableName, sourceCount, targetCount }
            });
            issues.push(`Row count mismatch in table "${tableName}": source has ${String(sourceCount)}, target has ${String(targetCount)}`);
          }
        } else {
          logWarning(`Failed to query row counts for table "${tableName}"`, {
            module: 'databases',
            operation: 'verify',
            metadata: { tableName }
          });
          issues.push(`Failed to verify row count for table "${tableName}"`);
        }
      } catch (err) {
        logWarning(`Error checking row count for table "${tableName}": ${err instanceof Error ? err.message : 'Unknown error'}`, {
          module: 'databases',
          operation: 'verify',
          metadata: { tableName }
        });
        issues.push(`Error verifying table "${tableName}": ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
    
    // Verify schema structure for each table
    logInfo('Verifying schema structure', {
      module: 'databases',
      operation: 'verify'
    });
    for (const tableName of sourceTables) {
      if (!targetTables.includes(tableName)) continue;
      
      try {
        // Get source schema
        const sourceSchemaResponse = await fetch(
          `${CF_API}/accounts/${_env.ACCOUNT_ID}/d1/database/${sourceDbId}/query`,
          {
            method: 'POST',
            headers: cfHeaders,
            body: JSON.stringify({
              sql: `PRAGMA table_info("${tableName}")`
            })
          }
        );
        
        // Get target schema
        const targetSchemaResponse = await fetch(
          `${CF_API}/accounts/${_env.ACCOUNT_ID}/d1/database/${targetDbId}/query`,
          {
            method: 'POST',
            headers: cfHeaders,
            body: JSON.stringify({
              sql: `PRAGMA table_info("${tableName}")`
            })
          }
        );
        
        if (sourceSchemaResponse.ok && targetSchemaResponse.ok) {
          const sourceSchemaData: D1APIResponse = await sourceSchemaResponse.json();
          const targetSchemaData: D1APIResponse = await targetSchemaResponse.json();
          
          const sourceSchemaResults = sourceSchemaData.result as D1QueryResult[] | undefined;
          const srcSchemaResult = sourceSchemaResults?.[0];
          if (!sourceSchemaData.success || !srcSchemaResult?.results) {
            logWarning(`Invalid source schema response for table "${tableName}"`, {
              module: 'databases',
              operation: 'verify',
              databaseId: sourceDbId,
              metadata: { tableName }
            });
            issues.push(`Failed to get schema for source table "${tableName}"`);
            continue;
          }
          
          const targetSchemaResults = targetSchemaData.result as D1QueryResult[] | undefined;
          const tgtSchemaResult = targetSchemaResults?.[0];
          if (!targetSchemaData.success || !tgtSchemaResult?.results) {
            logWarning(`Invalid target schema response for table "${tableName}"`, {
              module: 'databases',
              operation: 'verify',
              databaseId: targetDbId,
              metadata: { tableName }
            });
            issues.push(`Failed to get schema for target table "${tableName}"`);
            continue;
          }
          
          const sourceColumns = srcSchemaResult.results;
          const targetColumns = tgtSchemaResult.results;
          
          logInfo(`Table "${tableName}": source has ${String(sourceColumns.length)} columns, target has ${String(targetColumns.length)} columns`, {
            module: 'databases',
            operation: 'verify',
            metadata: { tableName, sourceColumnCount: sourceColumns.length, targetColumnCount: targetColumns.length }
          });
          
          if (sourceColumns.length !== targetColumns.length) {
            logWarning(`Column count mismatch in table "${tableName}"`, {
              module: 'databases',
              operation: 'verify',
              metadata: { tableName, sourceColumnCount: sourceColumns.length, targetColumnCount: targetColumns.length }
            });
            issues.push(`Column count mismatch in table "${tableName}": source has ${String(sourceColumns.length)}, target has ${String(targetColumns.length)}`);
          }
        } else {
          logWarning(`Failed to query schema for table "${tableName}"`, {
            module: 'databases',
            operation: 'verify',
            metadata: { tableName }
          });
          issues.push(`Failed to verify schema for table "${tableName}"`);
        }
      } catch (err) {
        logWarning(`Error checking schema for table "${tableName}": ${err instanceof Error ? err.message : 'Unknown error'}`, {
          module: 'databases',
          operation: 'verify',
          metadata: { tableName }
        });
        issues.push(`Error verifying schema for table "${tableName}": ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
    
    logInfo(`Verification complete. Issues found: ${String(issues.length)}`, {
      module: 'databases',
      operation: 'verify',
      metadata: { issueCount: issues.length }
    });
    if (issues.length > 0) {
      logWarning(`Verification issues: ${issues.join('; ')}`, {
        module: 'databases',
        operation: 'verify',
        metadata: { issues }
      });
    }
    
    return { success: issues.length === 0, issues };
    
  } catch (err) {
    logWarning(`Fatal verification error: ${err instanceof Error ? err.message : 'Unknown error'}`, {
      module: 'databases',
      operation: 'verify'
    });
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    issues.push(`Verification error: ${errorMessage}`);
    return { success: false, issues };
  }
}

export async function handleDatabaseRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail = 'unknown'
): Promise<Response> {
  logInfo('Handling database operation', {
    module: 'databases',
    operation: 'request',
    userId: userEmail,
    metadata: { method: request.method, path: url.pathname }
  });
  
  const cfHeaders = {
    'Authorization': `Bearer ${env.API_KEY}`,
    'Content-Type': 'application/json'
  };
  
  // Verify auth configuration (sensitive values redacted)
  logInfo('Auth configured', {
    module: 'databases',
    operation: 'auth_check',
    metadata: { hasApiKey: !!env.API_KEY, hasAccountId: !!env.ACCOUNT_ID }
  });

  try {
    // List databases
    if (request.method === 'GET' && url.pathname === '/api/databases') {
      logInfo('Listing databases', { module: 'databases', operation: 'list' });
      
      // Mock response for local development
      if (isLocalDev) {
        logInfo('Using mock data for local development', { module: 'databases', operation: 'list' });
        return new Response(JSON.stringify({
          result: [
            {
              uuid: 'mock-db-1',
              name: 'dev-database',
              version: 'production',
              created_at: new Date().toISOString(),
              file_size: 1024 * 1024, // 1MB
              num_tables: 5,
              read_replication: { mode: 'auto' }
            },
            {
              uuid: 'mock-db-2',
              name: 'test-database',
              version: 'production',
              created_at: new Date(Date.now() - 86400000).toISOString(),
              file_size: 512 * 1024, // 512KB
              num_tables: 3,
              read_replication: { mode: 'disabled' }
            }
          ],
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }
      
      logInfo(`Making API request to: ${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database`, {
        module: 'databases',
        operation: 'list'
      });
      
      const response = await fetch(
        `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database`,
        { headers: cfHeaders }
      );
      
      logInfo(`Response status: ${String(response.status)}`, {
        module: 'databases',
        operation: 'list',
        metadata: { status: response.status }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        void logError(env, `List error: ${errorText}`, {
          module: 'databases',
          operation: 'list',
          metadata: { status: response.status }
        }, isLocalDev);
        throw new Error(`Failed to list databases: ${String(response.status)}`);
      }
      
      const data: D1APIResponse = await response.json();
      const databases = (data.result ?? []) as D1DatabaseInfo[];
      
      // Filter out protected system databases
      const filteredDatabases = databases.filter((db: D1DatabaseInfo) => !isProtectedDatabase(db.name));
      
      // Enhance database info with table count AND FTS5 count in a single query per database
      // This avoids N+1 API calls on the frontend by including FTS5 counts in the list response
      const enhancedDatabases = await Promise.all(
        filteredDatabases.map(async (db: D1DatabaseInfo) => {
          try {
            // Combined query for table count and FTS5 count - no extra API calls needed
            const statsResponse = await fetch(
              `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${db.uuid}/query`,
              {
                method: 'POST',
                headers: cfHeaders,
                body: JSON.stringify({ 
                  sql: `SELECT 
                    (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%') as table_count,
                    (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND sql LIKE '%USING fts5%') as fts5_count`
                })
              }
            );
            
            if (statsResponse.ok) {
              const statsData: D1APIResponse = await statsResponse.json();
              const statsResults = statsData.result as D1QueryResult[] | undefined;
              const firstResult = statsResults?.[0];
              const firstRow = firstResult?.results[0];
              
              if (statsData.success && firstRow) {
                return { 
                  ...db, 
                  num_tables: firstRow['table_count'] as number,
                  fts5_count: firstRow['fts5_count'] as number
                };
              }
            }
          } catch (err) {
            void logError(env, err instanceof Error ? err : String(err), {
              module: 'databases',
              operation: 'get_stats',
              databaseId: db.uuid,
              databaseName: db.name
            }, isLocalDev);
          }
          
          // Return database without stats if query failed
          return db;
        })
      );
      
      return new Response(JSON.stringify({
        result: enhancedDatabases,
        success: data.success
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    // Get database info
    if (request.method === 'GET' && /^\/api\/databases\/[^/]+\/info$/.exec(url.pathname)) {
      const dbId = url.pathname.split('/')[3] ?? '';
      logInfo(`Getting database info: ${dbId}`, {
        module: 'databases',
        operation: 'get_info',
        databaseId: dbId
      });
      
      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: {
            uuid: dbId,
            name: 'dev-database',
            version: 'production',
            created_at: new Date().toISOString(),
            file_size: 1024 * 1024,
            num_tables: 5,
            read_replication: { mode: 'disabled' }
          },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }
      
      const response = await fetch(
        `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}`,
        { headers: cfHeaders }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        void logError(env, `Info error: ${errorText}`, {
          module: 'databases',
          operation: 'get_info',
          databaseId: dbId,
          metadata: { status: response.status }
        }, isLocalDev);
        throw new Error(`Failed to get database info: ${String(response.status)}`);
      }
      
      const data: D1APIResponse = await response.json();
      const dbInfo = data.result as D1DatabaseInfo;
      
      // Protect system databases from info access
      if (isProtectedDatabase(dbInfo.name)) {
        logWarning(`Attempted to access protected database info: ${dbInfo.name}`, {
          module: 'databases',
          operation: 'get_info',
          databaseId: dbId,
          databaseName: dbInfo.name
        });
        return new Response(JSON.stringify({
          error: 'Database not found',
          message: 'The requested database does not exist or is not accessible.'
        }), {
          status: 404,
          headers: jsonHeaders(corsHeaders)
        });
      }
      
      return new Response(JSON.stringify(data), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    // Set read replication mode
    if (request.method === 'PUT' && /^\/api\/databases\/[^/]+\/replication$/.exec(url.pathname)) {
      const dbId = url.pathname.split('/')[3] ?? '';
      const body: { mode?: string } = await request.json();
      logInfo(`Setting read replication for: ${dbId}, mode: ${body.mode ?? 'undefined'}`, {
        module: 'databases',
        operation: 'set_replication',
        databaseId: dbId,
        metadata: { mode: body.mode }
      });
      
      if (!body.mode || !['auto', 'disabled'].includes(body.mode)) {
        return new Response(JSON.stringify({
          error: 'Invalid mode',
          message: 'Mode must be either "auto" or "disabled"',
          success: false
        }), {
          status: 400,
          headers: jsonHeaders(corsHeaders)
        });
      }
      
      // Mock response for local development
      if (isLocalDev) {
        logInfo('Simulating read replication change for local development', {
          module: 'databases',
          operation: 'set_replication',
          databaseId: dbId
        });
        return new Response(JSON.stringify({
          result: {
            uuid: dbId,
            read_replication: { mode: body.mode }
          },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }
      
      // First get the database to verify it exists and is not protected
      const dbInfoResponse = await fetch(
        `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}`,
        { headers: cfHeaders }
      );
      
      if (!dbInfoResponse.ok) {
        const errorText = await dbInfoResponse.text();
        void logError(env, `Database not found: ${errorText}`, {
          module: 'databases',
          operation: 'set_replication',
          databaseId: dbId,
          metadata: { status: dbInfoResponse.status }
        }, isLocalDev);
        return new Response(JSON.stringify({
          error: 'Database not found',
          message: 'The specified database does not exist.',
          success: false
        }), {
          status: 404,
          headers: jsonHeaders(corsHeaders)
        });
      }
      
      const dbInfoData: D1APIResponse = await dbInfoResponse.json();
      const dbInfo = dbInfoData.result as D1DatabaseInfo;
      
      if (isProtectedDatabase(dbInfo.name)) {
        logWarning(`Attempted to modify protected database: ${dbInfo.name}`, {
          module: 'databases',
          operation: 'set_replication',
          databaseId: dbId,
          databaseName: dbInfo.name
        });
        return createProtectedDatabaseResponse(corsHeaders);
      }
      
      // Update read replication mode via Cloudflare API
      const response = await fetch(
        `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}`,
        {
          method: 'PUT',
          headers: cfHeaders,
          body: JSON.stringify({
            read_replication: { mode: body.mode }
          })
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        void logError(env, `Read replication update error: ${errorText}`, {
          module: 'databases',
          operation: 'set_replication',
          databaseId: dbId,
          metadata: { status: response.status }
        }, isLocalDev);
        return new Response(JSON.stringify({
          error: 'Failed to update read replication',
          message: `API error: ${String(response.status)}`,
          success: false
        }), {
          status: response.status,
          headers: jsonHeaders(corsHeaders)
        });
      }
      
      const data: D1APIResponse = await response.json();
      logInfo('Read replication updated successfully', {
        module: 'databases',
        operation: 'set_replication',
        databaseId: dbId,
        metadata: { mode: body.mode }
      });
      
      return new Response(JSON.stringify({
        result: data.result,
        success: true
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    // Create database
    if (request.method === 'POST' && url.pathname === '/api/databases') {
      const body: { name?: string; location?: string } = await request.json();
      logInfo(`Creating database: ${body.name ?? 'unnamed'}`, {
        module: 'databases',
        operation: 'create',
        ...(body.name !== undefined && { databaseName: body.name }),
        metadata: { location: body.location }
      });
      
      // Start job tracking
      const jobId = await startJobTracking(
        env,
        OperationType.DATABASE_CREATE,
        'new',
        userEmail,
        isLocalDev,
        { databaseName: body.name, location: body.location }
      );
      
      // Mock response for local development
      if (isLocalDev) {
        logInfo('Simulating database creation for local development', {
          module: 'databases',
          operation: 'create',
          ...(body.name !== undefined && { databaseName: body.name })
        });
        return new Response(JSON.stringify({
          result: {
            uuid: `mock-${String(Date.now())}`,
            name: body.name,
            version: 'production',
            created_at: new Date().toISOString()
          },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }
      
      const createBody: { name: string; primary_location_hint?: string } = {
        name: body.name ?? ''
      };
      
      if (body.location) {
        createBody.primary_location_hint = body.location;
      }
      
      try {
        const response = await fetch(
          `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database`,
          {
            method: 'POST',
            headers: cfHeaders,
            body: JSON.stringify(createBody)
          }
        );
        
        if (!response.ok) {
          const errorText = await response.text();
          void logError(env, `Create error: ${errorText}`, {
            module: 'databases',
            operation: 'create',
            ...(body.name !== undefined && { databaseName: body.name }),
            metadata: { status: response.status }
          }, isLocalDev);
          throw new Error(`Failed to create database: ${String(response.status)}`);
        }
        
        const data = await response.json();
        
        // Complete job tracking
        await finishJobTracking(env, jobId, 'completed', userEmail, isLocalDev, {
          operationType: OperationType.DATABASE_CREATE,
          databaseId: 'new',
          processedItems: 1,
          errorCount: 0,
        });
        
        return new Response(JSON.stringify(data), {
          headers: jsonHeaders(corsHeaders)
        });
      } catch (err) {
        // Mark job as failed
        await finishJobTracking(env, jobId, 'failed', userEmail, isLocalDev, {
          operationType: OperationType.DATABASE_CREATE,
          databaseId: 'new',
          processedItems: 0,
          errorCount: 1,
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        });
        throw err;
      }
    }

    // Delete database
    if (request.method === 'DELETE' && /^\/api\/databases\/[^/]+$/.exec(url.pathname)) {
      const dbId = url.pathname.split('/')[3] ?? '';
      logInfo(`Deleting database: ${dbId}`, {
        module: 'databases',
        operation: 'delete',
        databaseId: dbId
      });
      
      // Mock response for local development
      if (isLocalDev) {
        logInfo('Simulating database deletion for local development', {
          module: 'databases',
          operation: 'delete',
          databaseId: dbId
        });
        return new Response(JSON.stringify({
          result: {},
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }
      
      // Protect system databases from deletion
      // First, get the database info to check its name
      const dbInfoResponse = await fetch(
        `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}`,
        { headers: cfHeaders }
      );
      
      let databaseName = dbId;
      if (dbInfoResponse.ok) {
        const dbInfoData: D1APIResponse = await dbInfoResponse.json();
        const dbInfo = dbInfoData.result as D1DatabaseInfo;
        databaseName = dbInfo.name;
        if (isProtectedDatabase(dbInfo.name)) {
          logWarning(`Attempted to delete protected database: ${dbInfo.name}`, {
            module: 'databases',
            operation: 'delete',
            databaseId: dbId,
            databaseName: dbInfo.name
          });
          return createProtectedDatabaseResponse(corsHeaders);
        }
      }
      
      // Start job tracking
      const jobId = await startJobTracking(
        env,
        OperationType.DATABASE_DELETE,
        dbId,
        userEmail,
        isLocalDev,
        { databaseName }
      );
      
      try {
        const response = await fetch(
          `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}`,
          {
            method: 'DELETE',
            headers: cfHeaders
          }
        );
        
        if (!response.ok) {
          const errorText = await response.text();
          void logError(env, `Delete error: ${errorText}`, {
            module: 'databases',
            operation: 'delete',
            databaseId: dbId,
            metadata: { status: response.status }
          }, isLocalDev);
          throw new Error(`Failed to delete database: ${String(response.status)}`);
        }
        
        const data = await response.json();
        
        // Complete job tracking
        await finishJobTracking(env, jobId, 'completed', userEmail, isLocalDev, {
          operationType: OperationType.DATABASE_DELETE,
          databaseId: dbId,
          processedItems: 1,
          errorCount: 0,
        });
        
        return new Response(JSON.stringify(data), {
          headers: jsonHeaders(corsHeaders)
        });
      } catch (err) {
        // Mark job as failed
        await finishJobTracking(env, jobId, 'failed', userEmail, isLocalDev, {
          operationType: OperationType.DATABASE_DELETE,
          databaseId: dbId,
          processedItems: 0,
          errorCount: 1,
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        });
        throw err;
      }
    }

    // Export databases (bulk download)
    if (request.method === 'POST' && url.pathname === '/api/databases/export') {
      const body: { databaseIds: string[] } = await request.json();
      logInfo(`Exporting databases: ${body.databaseIds.join(', ')}`, {
        module: 'databases',
        operation: 'export',
        metadata: { databaseIds: body.databaseIds, count: body.databaseIds.length }
      });
      
      // Create job for tracking (if metadata DB is available)
      const jobId = generateJobId('database_export');
      const db = env.METADATA;
      
      if (!isLocalDev) {
        try {
          await createJob(db, {
            jobId,
            databaseId: body.databaseIds[0] ?? 'multiple',
            operationType: 'database_export',
            totalItems: body.databaseIds.length,
            userEmail,
            metadata: { databaseIds: body.databaseIds }
          });
        } catch (err) {
          void logError(env, err instanceof Error ? err : String(err), {
            module: 'databases',
            operation: 'export',
            metadata: { jobId }
          }, isLocalDev);
        }
      }
      
      // Mock response for local development
      if (isLocalDev) {
        logInfo('Simulating database export for local development', {
          module: 'databases',
          operation: 'export'
        });
        // Create mock SQL content for each database
        const mockExports: Record<string, string> = {};
        for (const exportDbId of body.databaseIds) {
          mockExports[exportDbId] = `-- Mock export for database ${exportDbId}\nCREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO users (id, name) VALUES (1, 'Test User');`;
        }
        
        return new Response(JSON.stringify({
          result: mockExports,
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }
      
      // Export each database using D1's export API
      const exports: Record<string, string> = {};
      const skipped: { databaseId: string; name: string; reason: string; details?: string[] }[] = [];
      let errorCount = 0;
      
      for (const exportDbId of body.databaseIds) {
        try {
          logInfo(`Starting export for database: ${exportDbId}`, {
            module: 'databases',
            operation: 'export',
            databaseId: exportDbId
          });
          
          // Check if this is a protected system database
          const dbInfoResponse = await fetch(
            `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${exportDbId}`,
            { headers: cfHeaders }
          );
          
          let dbName = exportDbId;
          if (dbInfoResponse.ok) {
            const dbInfoData: D1APIResponse = await dbInfoResponse.json();
            const dbInfo = dbInfoData.result as D1DatabaseInfo;
            dbName = dbInfo.name;
            if (isProtectedDatabase(dbInfo.name)) {
              logWarning(`Skipping export of protected database: ${exportDbId} (${dbInfo.name})`, {
                module: 'databases',
                operation: 'export',
                databaseId: exportDbId,
                databaseName: dbInfo.name
              });
              skipped.push({ databaseId: exportDbId, name: dbName, reason: 'protected', details: ['System database'] });
              continue; // Skip this database
            }
          } else {
            const errorText = await dbInfoResponse.text();
            void logError(env, `Failed to get database info for ${exportDbId}: ${errorText}`, {
              module: 'databases',
              operation: 'export',
              databaseId: exportDbId,
              metadata: { status: dbInfoResponse.status }
            }, isLocalDev);
          }
          
          // Check for FTS5 tables - D1 export doesn't support virtual tables
          const fts5Check = await hasFTS5Tables(exportDbId, cfHeaders, env, isLocalDev);
          if (fts5Check.hasFTS5) {
            void logError(env, `Cannot export database ${dbName} (${exportDbId}): contains FTS5 tables: ${fts5Check.fts5Tables.join(', ')}`, {
              module: 'databases',
              operation: 'export',
              databaseId: exportDbId,
              metadata: { fts5Tables: fts5Check.fts5Tables }
            }, isLocalDev);
            skipped.push({ 
              databaseId: exportDbId, 
              name: dbName, 
              reason: 'fts5', 
              details: fts5Check.fts5Tables 
            });
            errorCount++;
            continue;
          }

          // Start export with polling
          logInfo(`Initiating D1 export API for ${dbName}`, {
            module: 'databases',
            operation: 'export',
            databaseId: exportDbId,
            databaseName: dbName
          });
          const startResponse = await fetch(
            `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${exportDbId}/export`,
            {
              method: 'POST',
              headers: cfHeaders,
              body: JSON.stringify({ output_format: 'polling' })
            }
          );
          
          if (!startResponse.ok) {
            const errorText = await startResponse.text();
            void logError(env, `Export start failed for ${dbName} (${exportDbId}): ${String(startResponse.status)} - ${errorText}`, {
              module: 'databases',
              operation: 'export',
              databaseId: exportDbId,
              databaseName: dbName,
              metadata: { status: startResponse.status }
            }, isLocalDev);
            errorCount++;
            continue;
          }
          
          const startData: ExportAPIResponse = await startResponse.json();
          logInfo(`Export API response for ${dbName}`, {
            module: 'databases',
            operation: 'export',
            databaseId: exportDbId,
            metadata: { response: startData }
          });
          
          let signedUrl: string | null = null;
          
          // Check if export is already complete (small databases complete immediately)
          const startResult = startData.result;
          if (startResult?.status === 'complete' && startResult.result?.signed_url) {
            logInfo(`Export already complete for ${dbName}`, {
              module: 'databases',
              operation: 'export',
              databaseId: exportDbId
            });
            signedUrl = startResult.result.signed_url;
          } else if (startResult?.at_bookmark) {
            // Need to poll for completion
            const bookmark = startResult.at_bookmark;
            logInfo(`Got bookmark for ${dbName}: ${bookmark}, polling for completion...`, {
              module: 'databases',
              operation: 'export',
              databaseId: exportDbId,
              metadata: { bookmark }
            });
            
            let attempts = 0;
            const maxAttempts = 60; // 2 minutes max
            
            while (!signedUrl && attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
              
              const pollResponse = await fetch(
                `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${exportDbId}/export`,
                {
                  method: 'POST',
                  headers: cfHeaders,
                  body: JSON.stringify({ 
                    output_format: 'polling',
                    current_bookmark: bookmark 
                  })
                }
              );
              
              if (pollResponse.ok) {
                const pollData: ExportAPIResponse = await pollResponse.json();
                
                // Check both possible locations for signed_url
                const pollUrl = pollData.result?.signed_url ?? pollData.result?.result?.signed_url;
                if (pollUrl) {
                  logInfo(`Export ready for ${dbName} after ${String(attempts + 1)} polls`, {
                    module: 'databases',
                    operation: 'export',
                    databaseId: exportDbId,
                    metadata: { attempts: attempts + 1 }
                  });
                  signedUrl = pollUrl;
                } else if (pollData.result?.error) {
                  void logError(env, `Export poll error for ${dbName}: ${pollData.result.error}`, {
                    module: 'databases',
                    operation: 'export',
                    databaseId: exportDbId
                  }, isLocalDev);
                  break;
                } else if (attempts % 10 === 0) {
                  logInfo(`Still waiting for ${dbName}... (attempt ${String(attempts + 1)}/${String(maxAttempts)})`, {
                    module: 'databases',
                    operation: 'export',
                    databaseId: exportDbId,
                    metadata: { attempts: attempts + 1, maxAttempts }
                  });
                }
              } else {
                const errorText = await pollResponse.text();
                void logError(env, `Poll request failed for ${dbName}: ${String(pollResponse.status)} - ${errorText}`, {
                  module: 'databases',
                  operation: 'export',
                  databaseId: exportDbId,
                  metadata: { status: pollResponse.status }
                }, isLocalDev);
              }
              
              attempts++;
            }
            
            if (!signedUrl) {
              void logError(env, `Export timeout for ${dbName} (${exportDbId}) after ${String(attempts)} attempts`, {
                module: 'databases',
                operation: 'export',
                databaseId: exportDbId,
                metadata: { attempts }
              }, isLocalDev);
            }
          } else {
            void logError(env, `Export API did not return expected response for ${dbName}`, {
              module: 'databases',
              operation: 'export',
              databaseId: exportDbId,
              metadata: { response: startData }
            }, isLocalDev);
          }
          
          if (!signedUrl) {
            errorCount++;
            continue;
          }
          
          // Download the SQL file
          logInfo(`Downloading export for ${dbName}...`, {
            module: 'databases',
            operation: 'export',
            databaseId: exportDbId,
            databaseName: dbName
          });
          const downloadResponse = await fetch(signedUrl);
          if (downloadResponse.ok) {
            const sqlContent = await downloadResponse.text();
            logInfo(`Successfully exported ${dbName}: ${String(sqlContent.length)} bytes`, {
              module: 'databases',
              operation: 'export',
              databaseId: exportDbId,
              databaseName: dbName,
              metadata: { bytes: sqlContent.length }
            });
            exports[exportDbId] = sqlContent;
          } else {
            void logError(env, `Failed to download export for ${dbName}: ${String(downloadResponse.status)}`, {
              module: 'databases',
              operation: 'export',
              databaseId: exportDbId,
              databaseName: dbName,
              metadata: { status: downloadResponse.status }
            }, isLocalDev);
            errorCount++;
          }
        } catch (err) {
          void logError(env, err instanceof Error ? err : String(err), {
            module: 'databases',
            operation: 'export',
            databaseId: exportDbId
          }, isLocalDev);
          errorCount++;
        }
      }
      
      // Build error message from skipped databases
      let errorMessage: string | undefined;
      if (skipped.length > 0) {
        const fts5Skipped = skipped.filter(s => s.reason === 'fts5');
        const protectedSkipped = skipped.filter(s => s.reason === 'protected');
        const messages: string[] = [];
        
        if (fts5Skipped.length > 0) {
          messages.push(`FTS5 tables not supported: ${fts5Skipped.map(s => s.name).join(', ')}`);
        }
        if (protectedSkipped.length > 0) {
          messages.push(`Protected databases skipped: ${protectedSkipped.map(s => s.name).join(', ')}`);
        }
        if (messages.length > 0) {
          errorMessage = messages.join('; ');
        }
      }
      
      // Complete the job
      try {
        const jobParams: {
          jobId: string;
          status: 'completed' | 'failed';
          processedItems: number;
          errorCount: number;
          userEmail: string;
          errorMessage?: string;
        } = {
          jobId,
          status: errorCount > 0 && Object.keys(exports).length === 0 ? 'failed' : 'completed',
          processedItems: Object.keys(exports).length,
          errorCount,
          userEmail
        };
        if (errorMessage) {
          jobParams.errorMessage = errorMessage;
        }
        await completeJob(db, jobParams);
      } catch (err) {
        void logError(env, err instanceof Error ? err : String(err), {
          module: 'databases',
          operation: 'export',
          metadata: { jobId }
        }, isLocalDev);
      }
      
      return new Response(JSON.stringify({
        result: exports,
        skipped: skipped.length > 0 ? skipped : undefined,
        success: true
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    // Import database
    if (request.method === 'POST' && url.pathname === '/api/databases/import') {
      const body: { 
        createNew?: boolean; 
        databaseName?: string; 
        targetDatabaseId?: string;
        sqlContent?: string;
      } = await request.json();
      
      logInfo('Importing database', {
        module: 'databases',
        operation: 'import',
        ...(body.targetDatabaseId !== undefined && { databaseId: body.targetDatabaseId }),
        ...(body.databaseName !== undefined && { databaseName: body.databaseName }),
        metadata: { createNew: body.createNew }
      });
      
      // Validate sqlContent is present
      if (!body.sqlContent) {
        return new Response(JSON.stringify({
          error: 'SQL content is required',
          message: 'Please provide SQL content for import',
          success: false
        }), {
          status: 400,
          headers: jsonHeaders(corsHeaders)
        });
      }
      
      // Clean up SQL content - remove statements that cause import failures
      // 1. Transaction statements: "cannot start a transaction within a transaction" error
      // 2. ANALYZE statements: Creates sqlite_stat1 which may cause ordering issues
      // 3. sqlite_stat1 inserts: Statistics table that may not exist yet
      // 4. sqlite_sequence references: Autoincrement tracking table that may not exist
      const sqlContent = body.sqlContent
        // Remove transaction control statements
        .replace(/BEGIN TRANSACTION;?\s*/gi, '')
        .replace(/BEGIN;?\s*/gi, '')
        .replace(/COMMIT;?\s*/gi, '')
        .replace(/ROLLBACK;?\s*/gi, '')
        // Remove ANALYZE statements that create sqlite_stat tables
        .replace(/ANALYZE\s+[^;]*;?\s*/gi, '')
        // Remove sqlite_stat1 operations (statistics table)
        .replace(/INSERT\s+INTO\s+["']?sqlite_stat1["']?\s+VALUES\s*\([^)]*\);?\s*/gi, '')
        .replace(/DELETE\s+FROM\s+["']?sqlite_stat1["']?[^;]*;?\s*/gi, '')
        // Remove sqlite_sequence operations (autoincrement tracking)
        .replace(/INSERT\s+INTO\s+["']?sqlite_sequence["']?\s+VALUES\s*\([^)]*\);?\s*/gi, '')
        .replace(/DELETE\s+FROM\s+["']?sqlite_sequence["']?[^;]*;?\s*/gi, '')
        .replace(/UPDATE\s+["']?sqlite_sequence["']?\s+[^;]*;?\s*/gi, '');
      
      // Create job for tracking
      const jobId = generateJobId('database_import');
      const db = env.METADATA;
      
      if (!isLocalDev) {
        try {
          await createJob(db, {
            jobId,
            databaseId: body.targetDatabaseId ?? 'new',
            operationType: 'database_import',
            totalItems: 1,
            userEmail,
            metadata: { 
              createNew: body.createNew, 
              databaseName: body.databaseName 
            }
          });
        } catch (err) {
          void logError(env, err instanceof Error ? err : String(err), {
            module: 'databases',
            operation: 'import',
            metadata: { jobId }
          }, isLocalDev);
        }
      }
      
      // Mock response for local development
      if (isLocalDev) {
        logInfo('Simulating database import for local development', {
          module: 'databases',
          operation: 'import'
        });
        if (body.createNew) {
          return new Response(JSON.stringify({
            result: {
              uuid: `mock-${String(Date.now())}`,
              name: body.databaseName,
              version: 'production',
              created_at: new Date().toISOString()
            },
            success: true
          }), {
            headers: jsonHeaders(corsHeaders)
          });
        } else {
          return new Response(JSON.stringify({
            result: { imported: true },
            success: true
          }), {
            headers: jsonHeaders(corsHeaders)
          });
        }
      }
      
      let targetDbId = body.targetDatabaseId;
      
      try {
        // Create new database if requested
        if (body.createNew && body.databaseName) {
          const createResponse = await fetch(
            `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database`,
            {
              method: 'POST',
              headers: cfHeaders,
              body: JSON.stringify({ name: body.databaseName })
            }
          );
          
          if (!createResponse.ok) {
            const errorText = await createResponse.text();
            void logError(env, `Create error during import: ${errorText}`, {
              module: 'databases',
              operation: 'import',
              databaseName: body.databaseName,
              metadata: { status: createResponse.status }
            }, isLocalDev);
            throw new Error(`Failed to create database: ${String(createResponse.status)}`);
          }
          
          const createData: D1APIResponse = await createResponse.json();
          const newDb = createData.result as D1DatabaseInfo;
          targetDbId = newDb.uuid;
        }
        
        if (!targetDbId) {
          throw new Error('No target database specified');
        }
        
        // Import SQL content using D1's import API (4-step process)
        // Step 1: Generate MD5 hash of SQL content
        const encoder = new TextEncoder();
        const sqlData = encoder.encode(sqlContent);
        const hashBuffer = await crypto.subtle.digest('MD5', sqlData);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const etag = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        logInfo(`Import Step 1: Init upload with etag: ${etag}`, {
          module: 'databases',
          operation: 'import',
          databaseId: targetDbId,
          metadata: { etag }
        });
        
        // Step 2: Initialize upload - get R2 upload URL
        const initResponse = await fetch(
          `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${targetDbId}/import`,
          {
            method: 'POST',
            headers: cfHeaders,
            body: JSON.stringify({
              action: 'init',
              etag: etag
            })
          }
        );
        
        if (!initResponse.ok) {
          const errorText = await initResponse.text();
          void logError(env, `Import init error: ${errorText}`, {
            module: 'databases',
            operation: 'import',
            databaseId: targetDbId,
            metadata: { status: initResponse.status }
          }, isLocalDev);
          throw new Error(`Failed to initialize import: ${String(initResponse.status)}`);
        }
        
        const initData: ImportAPIResponse = await initResponse.json();
        
        if (!initData.success || !initData.result?.upload_url) {
          void logError(env, 'Import init failed', {
            module: 'databases',
            operation: 'import',
            databaseId: targetDbId,
            metadata: { response: initData }
          }, isLocalDev);
          throw new Error('Failed to get upload URL from init response');
        }
        
        logInfo(`Import Step 2: Uploading SQL to R2, filename: ${initData.result.filename ?? 'unknown'}`, {
          module: 'databases',
          operation: 'import',
          databaseId: targetDbId,
          metadata: { filename: initData.result.filename }
        });
        
        // Step 3: Upload SQL content to R2
        const uploadResponse = await fetch(initData.result.upload_url, {
          method: 'PUT',
          body: sqlContent
        });
        
        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          void logError(env, `Import upload error: ${errorText}`, {
            module: 'databases',
            operation: 'import',
            databaseId: targetDbId,
            metadata: { status: uploadResponse.status }
          }, isLocalDev);
          throw new Error(`Failed to upload SQL content: ${String(uploadResponse.status)}`);
        }
        
        // Verify ETag from R2 response
        const r2Etag = uploadResponse.headers.get('ETag')?.replace(/"/g, '') ?? '';
        logInfo(`Import R2 ETag: ${r2Etag}, Expected: ${etag}`, {
          module: 'databases',
          operation: 'import',
          databaseId: targetDbId,
          metadata: { r2Etag, etag }
        });
        
        if (r2Etag && r2Etag !== etag) {
          logWarning('ETag mismatch, but continuing with import', {
            module: 'databases',
            operation: 'import',
            databaseId: targetDbId,
            metadata: { r2Etag, etag }
          });
        }
        
        logInfo('Import Step 3: Starting ingestion', {
          module: 'databases',
          operation: 'import',
          databaseId: targetDbId
        });
        
        // Step 4: Start ingestion
        const ingestResponse = await fetch(
          `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${targetDbId}/import`,
          {
            method: 'POST',
            headers: cfHeaders,
            body: JSON.stringify({
              action: 'ingest',
              etag: etag,
              filename: initData.result.filename
            })
          }
        );
        
        if (!ingestResponse.ok) {
          const errorText = await ingestResponse.text();
          void logError(env, `Import ingest error: ${errorText}`, {
            module: 'databases',
            operation: 'import',
            databaseId: targetDbId,
            metadata: { status: ingestResponse.status }
          }, isLocalDev);
          throw new Error(`Failed to start ingestion: ${String(ingestResponse.status)}`);
        }
        
        const ingestData: ImportAPIResponse = await ingestResponse.json();
        
        logInfo(`Import Step 4: Polling for completion, bookmark: ${ingestData.result?.at_bookmark ?? 'none'}`, {
          module: 'databases',
          operation: 'import',
          databaseId: targetDbId,
          metadata: { bookmark: ingestData.result?.at_bookmark }
        });
        
        // Step 5: Poll for completion
        if (ingestData.result?.at_bookmark) {
          let pollAttempts = 0;
          const maxPollAttempts = 60; // Max 60 seconds of polling
          
          while (pollAttempts < maxPollAttempts) {
            const pollResponse = await fetch(
              `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${targetDbId}/import`,
              {
                method: 'POST',
                headers: cfHeaders,
                body: JSON.stringify({
                  action: 'poll',
                  current_bookmark: ingestData.result.at_bookmark
                })
              }
            );
            
            if (!pollResponse.ok) {
              logWarning('Poll request failed, continuing...', {
                module: 'databases',
                operation: 'import',
                databaseId: targetDbId,
                metadata: { status: pollResponse.status }
              });
              pollAttempts++;
              await new Promise(resolve => setTimeout(resolve, 1000));
              continue;
            }
            
            const pollData: ImportAPIResponse = await pollResponse.json();
            
            logInfo('Poll response received', {
              module: 'databases',
              operation: 'import',
              databaseId: targetDbId,
              metadata: { result: pollData.result }
            });
            
            if (pollData.result?.success) {
              logInfo('Import completed successfully', {
                module: 'databases',
                operation: 'import',
                databaseId: targetDbId
              });
              break;
            }
            
            if (pollData.result?.error && pollData.result.error !== 'Not currently importing anything.') {
              throw new Error(`Import failed: ${pollData.result.error}`);
            }
            
            // Check for "Not currently importing anything" which means import is done
            if (pollData.result?.error === 'Not currently importing anything.') {
              logInfo('Import completed (no active import)', {
                module: 'databases',
                operation: 'import',
                databaseId: targetDbId
              });
              break;
            }
            
            pollAttempts++;
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          if (pollAttempts >= maxPollAttempts) {
            logWarning('Import poll timeout, but upload may have succeeded', {
              module: 'databases',
              operation: 'import',
              databaseId: targetDbId,
              metadata: { pollAttempts, maxPollAttempts }
            });
          }
        }
        
        // Complete the job successfully
        try {
          await completeJob(db, {
            jobId,
            status: 'completed',
            processedItems: 1,
            errorCount: 0,
            userEmail
          });
        } catch (err) {
          void logError(env, err instanceof Error ? err : String(err), {
            module: 'databases',
            operation: 'import',
            databaseId: targetDbId,
            metadata: { jobId }
          }, isLocalDev);
        }
        
        return new Response(JSON.stringify({
          result: { 
            imported: true,
            databaseId: targetDbId,
            numQueries: ingestData.result?.num_queries
          },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      } catch (err) {
        // Complete the job as failed
        try {
          await completeJob(db, {
            jobId,
            status: 'failed',
            processedItems: 0,
            errorCount: 1,
            userEmail,
            errorMessage: err instanceof Error ? err.message : 'Unknown error'
          });
        } catch (jobErr) {
          void logError(env, jobErr instanceof Error ? jobErr : String(jobErr), {
            module: 'databases',
            operation: 'import',
            metadata: { jobId }
          }, isLocalDev);
        }
        throw err;
      }
    }

    // Rename database (migration-based approach)
    if (request.method === 'POST' && /^\/api\/databases\/[^/]+\/rename$/.exec(url.pathname)) {
      const dbId = url.pathname.split('/')[3] ?? '';
      const body: { newName?: string } = await request.json();
      
      logInfo(`Renaming database: ${dbId} to ${body.newName ?? 'unknown'}`, {
        module: 'databases',
        operation: 'rename',
        databaseId: dbId,
        metadata: { newName: body.newName }
      });
      
      // Mock response for local development
      if (isLocalDev) {
        logInfo('Simulating database rename for local development', {
          module: 'databases',
          operation: 'rename',
          databaseId: dbId
        });
        // Simulate multi-step process with delays
        await new Promise(resolve => setTimeout(resolve, 1000));
        return new Response(JSON.stringify({
          result: {
            uuid: `mock-${String(Date.now())}`,
            name: body.newName,
            version: 'production',
            created_at: new Date().toISOString(),
            oldId: dbId
          },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }
      
      // Protect system databases from being renamed
      const dbInfoResponse = await fetch(
        `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}`,
        { headers: cfHeaders }
      );
      
      if (dbInfoResponse.ok) {
        const dbInfoData: D1APIResponse = await dbInfoResponse.json();
        const dbInfo = dbInfoData.result as D1DatabaseInfo;
        if (isProtectedDatabase(dbInfo.name)) {
          logWarning(`Attempted to rename protected database: ${dbInfo.name}`, {
            module: 'databases',
            operation: 'rename',
            databaseId: dbId,
            databaseName: dbInfo.name
          });
          return createProtectedDatabaseResponse(corsHeaders);
        }
      }
      
      // Check for FTS5 tables - D1 export API cannot export databases with FTS5 tables
      const fts5Check = await hasFTS5Tables(dbId, cfHeaders, env, isLocalDev);
      if (fts5Check.hasFTS5) {
        logWarning(`Cannot rename database with FTS5 tables: ${fts5Check.fts5Tables.join(', ')}`, {
          module: 'databases',
          operation: 'rename',
          databaseId: dbId,
          metadata: { fts5Tables: fts5Check.fts5Tables }
        });
        return new Response(JSON.stringify({
          error: 'Cannot rename database with FTS5 tables',
          details: `This database contains FTS5 (Full-Text Search) virtual tables (${fts5Check.fts5Tables.join(', ')}), which cannot be exported using D1's export API. Database rename requires export/import functionality.`,
          fts5Tables: fts5Check.fts5Tables,
          success: false
        }), {
          status: 400,
          headers: jsonHeaders(corsHeaders)
        });
      }
      
      // Start job tracking for rename operation
      const renameJobId = await startJobTracking(
        env,
        OperationType.DATABASE_RENAME,
        dbId,
        userEmail,
        isLocalDev,
        { oldName: dbId, newName: body.newName }
      );
      
      let newDbId: string | null = null;
      
      try {
        // Step 1: Validate new name - check if it already exists
        logInfo('Step 1: Validating new name', { module: 'databases', operation: 'rename', databaseId: dbId });
        const listResponse = await fetch(
          `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database`,
          { headers: cfHeaders }
        );
        
        if (!listResponse.ok) {
          throw new Error('Failed to validate database name');
        }
        
        const listData: D1APIResponse = await listResponse.json();
        const databases = listData.result as D1DatabaseInfo[];
        const existingDb = databases.find((d: D1DatabaseInfo) => d.name === body.newName);
        
        if (existingDb) {
          throw new Error(`Database with name "${body.newName ?? ''}" already exists`);
        }
        
        // Step 2: Create new database with desired name
        logInfo('Step 2: Creating new database', { module: 'databases', operation: 'rename', databaseId: dbId, metadata: { newName: body.newName } });
        const createResponse = await fetch(
          `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database`,
          {
            method: 'POST',
            headers: cfHeaders,
            body: JSON.stringify({ name: body.newName })
          }
        );
        
        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          void logError(env, `Create error during rename: ${errorText}`, {
            module: 'databases',
            operation: 'rename',
            databaseId: dbId,
            metadata: { status: createResponse.status }
          }, isLocalDev);
          throw new Error(`Failed to create new database: ${String(createResponse.status)}`);
        }
        
        const createData: D1APIResponse = await createResponse.json();
        const newDb = createData.result as D1DatabaseInfo;
        newDbId = newDb.uuid;
        logInfo(`Created new database: ${newDbId}`, { module: 'databases', operation: 'rename', databaseId: newDbId });
        
        // Step 3: Export source database
        logInfo('Step 3: Exporting source database', { module: 'databases', operation: 'rename', databaseId: dbId });
        const startExportResponse = await fetch(
          `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}/export`,
          {
            method: 'POST',
            headers: cfHeaders,
            body: JSON.stringify({ output_format: 'polling' })
          }
        );
        
        if (!startExportResponse.ok) {
          const errorText = await startExportResponse.text();
          void logError(env, `Export start failed: ${errorText}`, {
            module: 'databases',
            operation: 'rename',
            databaseId: dbId,
            metadata: { status: startExportResponse.status }
          }, isLocalDev);
          throw new Error('Failed to start database export');
        }
        
        const exportStartData: ExportAPIResponse = await startExportResponse.json();
        logInfo('Export API response received', { module: 'databases', operation: 'rename', databaseId: dbId, metadata: { response: exportStartData } });
        
        let signedUrl: string | null = null;
        
        // Check if export is already complete (small databases complete immediately)
        const exportResult = exportStartData.result;
        if (exportResult?.status === 'complete' && exportResult.result?.signed_url) {
          logInfo('Export already complete (immediate)', { module: 'databases', operation: 'rename', databaseId: dbId });
          signedUrl = exportResult.result.signed_url;
        } else if (exportResult?.signed_url) {
          logInfo('Export already complete (direct signed_url)', { module: 'databases', operation: 'rename', databaseId: dbId });
          signedUrl = exportResult.signed_url;
        } else if (exportResult?.at_bookmark) {
          // Need to poll for completion
          const bookmark = exportResult.at_bookmark;
          logInfo(`Got bookmark, polling for completion: ${bookmark}`, { module: 'databases', operation: 'rename', databaseId: dbId, metadata: { bookmark } });
          
          let attempts = 0;
          const maxAttempts = 60; // 2 minutes max
          
          while (!signedUrl && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const pollResponse = await fetch(
              `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}/export`,
              {
                method: 'POST',
                headers: cfHeaders,
                body: JSON.stringify({ 
                  output_format: 'polling',
                  current_bookmark: bookmark 
                })
              }
            );
            
            if (pollResponse.ok) {
              const pollData: ExportAPIResponse = await pollResponse.json();
              
              // Check both possible locations for signed_url
              const pollUrl = pollData.result?.signed_url ?? pollData.result?.result?.signed_url;
              if (pollUrl) {
                logInfo(`Export ready after ${String(attempts + 1)} polls`, { module: 'databases', operation: 'rename', databaseId: dbId, metadata: { attempts: attempts + 1 } });
                signedUrl = pollUrl;
              } else if (attempts % 10 === 0) {
                logInfo(`Still waiting for export... (attempt ${String(attempts + 1)}/${String(maxAttempts)})`, { module: 'databases', operation: 'rename', databaseId: dbId, metadata: { attempts: attempts + 1, maxAttempts } });
              }
            } else {
              const errorText = await pollResponse.text();
              void logError(env, `Poll request failed: ${String(pollResponse.status)} ${errorText}`, {
                module: 'databases',
                operation: 'rename',
                databaseId: dbId,
                metadata: { status: pollResponse.status }
              }, isLocalDev);
            }
            
            attempts++;
          }
        } else {
          void logError(env, 'Export API did not return expected response', {
            module: 'databases',
            operation: 'rename',
            databaseId: dbId,
            metadata: { response: exportStartData }
          }, isLocalDev);
          throw new Error('Failed to start database export - unexpected API response');
        }
        
        if (!signedUrl) {
          throw new Error('Export timeout - database may be too large');
        }
        
        // Download the SQL content
        logInfo('Downloading exported SQL', { module: 'databases', operation: 'rename', databaseId: dbId });
        const downloadResponse = await fetch(signedUrl);
        if (!downloadResponse.ok) {
          throw new Error('Failed to download database export');
        }
        
        let sqlContent = await downloadResponse.text();
        // DEBUG: Log SQL content details
        const sqlPreview = sqlContent.substring(0, 500);
        const createTableCount = (sqlContent.match(/CREATE TABLE/g) ?? []).length;
        const hasTransaction = sqlContent.includes('BEGIN TRANSACTION') || sqlContent.includes('BEGIN;') || sqlContent.includes('COMMIT;');
        const hasStrict = sqlContent.includes('STRICT');
        
        logInfo(`Downloaded SQL content: ${String(sqlContent.length)} bytes, CREATE TABLE count: ${String(createTableCount)}, hasTransaction: ${String(hasTransaction)}, hasSTRICT: ${String(hasStrict)}`, { 
          module: 'databases', 
          operation: 'rename', 
          databaseId: dbId
        });
        // Log the first 500 chars of SQL for debugging
        logInfo(`SQL preview: ${sqlPreview.replace(/\n/g, ' ').substring(0, 200)}...`, {
          module: 'databases',
          operation: 'rename',
          databaseId: dbId
        });
        
        // Clean up SQL content - remove statements that cause import failures
        // 1. Transaction statements: "cannot start a transaction within a transaction" error
        // 2. ANALYZE statements: Creates sqlite_stat1 which may cause ordering issues
        // 3. sqlite_stat1 inserts: Statistics table that may not exist yet
        // 4. sqlite_sequence references: Autoincrement tracking table that may not exist
        const originalLength = sqlContent.length;
        sqlContent = sqlContent
          // Remove transaction control statements
          .replace(/BEGIN TRANSACTION;?\s*/gi, '')
          .replace(/BEGIN;?\s*/gi, '')
          .replace(/COMMIT;?\s*/gi, '')
          .replace(/ROLLBACK;?\s*/gi, '')
          // Remove ANALYZE statements that create sqlite_stat tables
          .replace(/ANALYZE\s+[^;]*;?\s*/gi, '')
          // Remove sqlite_stat1 operations (statistics table)
          .replace(/INSERT\s+INTO\s+["']?sqlite_stat1["']?\s+VALUES\s*\([^)]*\);?\s*/gi, '')
          .replace(/DELETE\s+FROM\s+["']?sqlite_stat1["']?[^;]*;?\s*/gi, '')
          // Remove sqlite_sequence operations (autoincrement tracking)
          .replace(/INSERT\s+INTO\s+["']?sqlite_sequence["']?\s+VALUES\s*\([^)]*\);?\s*/gi, '')
          .replace(/DELETE\s+FROM\s+["']?sqlite_sequence["']?[^;]*;?\s*/gi, '')
          .replace(/UPDATE\s+["']?sqlite_sequence["']?\s+[^;]*;?\s*/gi, '');
        
        if (sqlContent.length !== originalLength) {
          logInfo(`SQL cleaned: removed problematic statements (${String(originalLength)} -> ${String(sqlContent.length)} bytes)`, {
            module: 'databases',
            operation: 'rename',
            databaseId: dbId
          });
        }
        
        // Step 4: Import into new database using multi-step process
        logInfo('Step 4: Importing into new database', { module: 'databases', operation: 'rename', databaseId: newDbId });
        
        // 4a: Calculate MD5 hash for etag
        const encoder = new TextEncoder();
        const sqlData = encoder.encode(sqlContent);
        const hashBuffer = await crypto.subtle.digest('MD5', sqlData);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const etag = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        logInfo(`Calculated etag (MD5): ${etag}`, { module: 'databases', operation: 'rename', databaseId: newDbId, metadata: { etag } });
        
        // 4b: Init upload to get presigned URL
        logInfo('Step 4b: Initializing import upload', { module: 'databases', operation: 'rename', databaseId: newDbId });
        const initResponse = await fetch(
          `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${newDbId}/import`,
          {
            method: 'POST',
            headers: cfHeaders,
            body: JSON.stringify({
              action: 'init',
              etag: etag
            })
          }
        );
        
        if (!initResponse.ok) {
          const errorText = await initResponse.text();
          void logError(env, `Import init error: ${errorText}`, {
            module: 'databases',
            operation: 'rename',
            databaseId: newDbId,
            metadata: { status: initResponse.status }
          }, isLocalDev);
          throw new Error('Failed to initialize import');
        }
        
        const initData: ImportAPIResponse = await initResponse.json();
        logInfo(`Got upload URL and filename: ${initData.result?.filename ?? 'unknown'}`, { module: 'databases', operation: 'rename', databaseId: newDbId, metadata: { filename: initData.result?.filename } });
        
        const uploadUrl = initData.result?.upload_url ?? '';
        const filename = initData.result?.filename ?? '';
        
        // 4c: Upload SQL content to R2
        logInfo('Step 4c: Uploading SQL to R2', { module: 'databases', operation: 'rename', databaseId: newDbId });
        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          body: sqlContent
        });
        
        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          void logError(env, `R2 upload error: ${errorText}`, {
            module: 'databases',
            operation: 'rename',
            databaseId: newDbId,
            metadata: { status: uploadResponse.status }
          }, isLocalDev);
          throw new Error('Failed to upload SQL content');
        }
        
        // Verify etag from R2 response
        const r2Etag = uploadResponse.headers.get('ETag')?.replace(/"/g, '');
        logInfo(`R2 upload complete, ETag: ${r2Etag ?? 'none'}`, { module: 'databases', operation: 'rename', databaseId: newDbId, metadata: { r2Etag } });
        
        if (r2Etag && r2Etag !== etag) {
          logWarning(`ETag mismatch - expected: ${etag}, got: ${r2Etag}`, {
            module: 'databases',
            operation: 'rename',
            databaseId: newDbId,
            metadata: { etag, r2Etag }
          });
          // Continue anyway, some environments may have different etag handling
        }
        
        // 4d: Start ingestion
        const ingestBody = {
          action: 'ingest',
          etag: etag,
          filename: filename
        };
        logInfo(`Step 4d: Starting ingestion with etag=${etag}, filename=${filename}, sqlSize=${String(sqlContent.length)}`, { 
          module: 'databases', 
          operation: 'rename', 
          databaseId: newDbId
        });
        const ingestResponse = await fetch(
          `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${newDbId}/import`,
          {
            method: 'POST',
            headers: cfHeaders,
            body: JSON.stringify(ingestBody)
          }
        );
        
        if (!ingestResponse.ok) {
          const errorText = await ingestResponse.text();
          void logError(env, `Ingest error: ${errorText}`, {
            module: 'databases',
            operation: 'rename',
            databaseId: newDbId,
            metadata: { status: ingestResponse.status }
          }, isLocalDev);
          throw new Error('Failed to start import ingestion');
        }
        
        const ingestData: ImportAPIResponse = await ingestResponse.json();
        // DEBUG: Log full ingest response explicitly
        const ingestResponseStr = JSON.stringify(ingestData);
        logInfo(`Ingestion response: ${ingestResponseStr.substring(0, 500)}`, { 
          module: 'databases', 
          operation: 'rename', 
          databaseId: newDbId
        });
        
        // 4e: Poll for import completion
        if (ingestData.result?.at_bookmark) {
          logInfo('Step 4e: Polling for import completion', { module: 'databases', operation: 'rename', databaseId: newDbId });
          const importBookmark = ingestData.result.at_bookmark;
          let importAttempts = 0;
          const maxImportAttempts = 60; // 2 minutes max
          let importComplete = false;
          
          while (!importComplete && importAttempts < maxImportAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const pollResponse = await fetch(
              `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${newDbId}/import`,
              {
                method: 'POST',
                headers: cfHeaders,
                body: JSON.stringify({
                  action: 'poll',
                  current_bookmark: importBookmark
                })
              }
            );
            
            if (pollResponse.ok) {
              const pollData: ImportAPIResponse = await pollResponse.json();
              // DEBUG: Log full poll response
              logInfo('Import poll response', { 
                module: 'databases', 
                operation: 'rename', 
                databaseId: newDbId, 
                metadata: { 
                  attempt: importAttempts + 1,
                  fullResponse: JSON.stringify(pollData),
                  resultKeys: pollData.result ? Object.keys(pollData.result) : []
                } 
              });
              
              if (pollData.result?.success) {
                logInfo(`Import completed successfully after ${String(importAttempts + 1)} polls`, { module: 'databases', operation: 'rename', databaseId: newDbId, metadata: { attempts: importAttempts + 1 } });
                importComplete = true;
              } else if (pollData.result?.error === 'Not currently importing anything.') {
                // DEBUG: This might be a problem - let's also query the database to see if tables exist
                logWarning('Got "Not currently importing anything" - this may indicate the import was rejected. Checking table count...', { 
                  module: 'databases', 
                  operation: 'rename', 
                  databaseId: newDbId 
                });
                // Quick check if any tables exist
                try {
                  const checkResponse = await fetch(
                    `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${newDbId}/query`,
                    {
                      method: 'POST',
                      headers: cfHeaders,
                      body: JSON.stringify({
                        sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf%'",
                        params: []
                      })
                    }
                  );
                  if (checkResponse.ok) {
                    const checkData = await checkResponse.json() as { result: { results: { name: string }[] }[] };
                    const tableCount = checkData.result?.[0]?.results?.length ?? 0;
                    logInfo(`Quick table count check: ${String(tableCount)} tables found`, { 
                      module: 'databases', 
                      operation: 'rename', 
                      databaseId: newDbId,
                      metadata: { tableCount, tables: checkData.result?.[0]?.results?.map(r => r.name) }
                    });
                  }
                } catch {
                  logWarning('Failed to do quick table count check', { module: 'databases', operation: 'rename', databaseId: newDbId });
                }
                importComplete = true;
              } else if (pollData.result?.error) {
                void logError(env, `Import poll error: ${pollData.result.error}`, {
                  module: 'databases',
                  operation: 'rename',
                  databaseId: newDbId
                }, isLocalDev);
                throw new Error(`Import failed: ${pollData.result.error}`);
              } else if (importAttempts % 10 === 0) {
                logInfo(`Still importing... (attempt ${String(importAttempts + 1)}/${String(maxImportAttempts)})`, { module: 'databases', operation: 'rename', databaseId: newDbId, metadata: { attempts: importAttempts + 1, maxAttempts: maxImportAttempts } });
              }
            } else {
              const errorText = await pollResponse.text();
              void logError(env, `Import poll request failed: ${String(pollResponse.status)} ${errorText}`, {
                module: 'databases',
                operation: 'rename',
                databaseId: newDbId,
                metadata: { status: pollResponse.status }
              }, isLocalDev);
            }
            
            importAttempts++;
          }
          
          if (!importComplete) {
            throw new Error('Import timeout - database may be too large');
          }
        } else {
          // DEBUG: No at_bookmark means import either completed instantly or was rejected
          logWarning('No at_bookmark in ingest response - import may have failed silently', { 
            module: 'databases', 
            operation: 'rename', 
            databaseId: newDbId,
            metadata: { 
              fullResponse: JSON.stringify(ingestData) 
            }
          });
        }
        
        // Step 5: Verify import (with retry for D1 eventual consistency)
        logInfo('Step 5: Verifying import integrity', { module: 'databases', operation: 'rename', databaseId: newDbId });
        
        // D1 has eventual consistency - wait a bit before verification
        logInfo('Waiting 3 seconds for D1 eventual consistency...', { module: 'databases', operation: 'rename', databaseId: newDbId });
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Retry verification up to 3 times with delays
        let verification: { success: boolean; issues: string[] } = { success: false, issues: [] };
        const maxVerifyAttempts = 3;
        
        for (let verifyAttempt = 0; verifyAttempt < maxVerifyAttempts; verifyAttempt++) {
          verification = await verifyDatabaseIntegrity(
            dbId,
            newDbId,
            cfHeaders,
            env
          );
          
          if (verification.success) {
            if (verifyAttempt > 0) {
              logInfo(`Verification passed on attempt ${String(verifyAttempt + 1)}`, { module: 'databases', operation: 'rename', databaseId: newDbId });
            }
            break;
          }
          
          // If failed and not last attempt, wait and retry
          if (verifyAttempt < maxVerifyAttempts - 1) {
            logWarning(`Verification attempt ${String(verifyAttempt + 1)} failed, retrying in 3 seconds... Issues: ${verification.issues.join('; ')}`, {
              module: 'databases',
              operation: 'rename',
              databaseId: newDbId,
              metadata: { attempt: verifyAttempt + 1, issues: verification.issues }
            });
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }

        if (!verification.success) {
          void logError(env, `Verification failed after ${String(maxVerifyAttempts)} attempts: ${verification.issues.join('; ')}`, {
            module: 'databases',
            operation: 'rename',
            databaseId: newDbId,
            metadata: { issues: verification.issues }
          }, isLocalDev);
          throw new Error(
            `Import verification failed:\n${verification.issues.join('\n')}\n\n` +
            `The new database has been created but may have incomplete data. ` +
            `Please manually inspect database "${body.newName ?? ''}" (${newDbId}) ` +
            `before deleting the original.`
          );
        }

        logInfo('Verification passed - all data migrated successfully', { module: 'databases', operation: 'rename', databaseId: newDbId });
        
        // Step 6: Delete original database
        logInfo('Step 6: Deleting original database', { module: 'databases', operation: 'rename', databaseId: dbId });
        const deleteResponse = await fetch(
          `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}`,
          {
            method: 'DELETE',
            headers: cfHeaders
          }
        );
        
        if (!deleteResponse.ok) {
          logWarning('Failed to delete original database - manual cleanup may be required', {
            module: 'databases',
            operation: 'rename',
            databaseId: dbId
          });
          // Don't throw here - the rename essentially succeeded, user just needs to manually delete old db
        }
        
        logInfo('Rename completed successfully', { module: 'databases', operation: 'rename', databaseId: dbId, metadata: { newDbId, newName: body.newName } });
        
        // Complete job tracking
        await finishJobTracking(env, renameJobId, 'completed', userEmail, isLocalDev, {
          operationType: OperationType.DATABASE_RENAME,
          databaseId: dbId,
          processedItems: 1,
          errorCount: 0,
        });
        
        return new Response(JSON.stringify({
          result: {
            uuid: newDbId,
            name: body.newName,
            oldId: dbId
          },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
        
      } catch (err) {
        void logError(env, err instanceof Error ? err : String(err), {
          module: 'databases',
          operation: 'rename',
          databaseId: dbId
        }, isLocalDev);
        
        // Mark job as failed
        await finishJobTracking(env, renameJobId, 'failed', userEmail, isLocalDev, {
          operationType: OperationType.DATABASE_RENAME,
          databaseId: dbId,
          processedItems: 0,
          errorCount: 1,
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        });
        
        // Rollback: Delete the new database if it was created
        if (newDbId) {
          logInfo(`Rolling back - deleting new database: ${newDbId}`, { module: 'databases', operation: 'rename', databaseId: newDbId });
          try {
            await fetch(
              `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${newDbId}`,
              {
                method: 'DELETE',
                headers: cfHeaders
              }
            );
          } catch (rollbackErr) {
            void logError(env, rollbackErr instanceof Error ? rollbackErr : String(rollbackErr), {
              module: 'databases',
              operation: 'rename_rollback',
              databaseId: newDbId
            }, isLocalDev);
          }
        }
        
        throw err;
      }
    }

    // Optimize databases (PRAGMA optimize)
    if (request.method === 'POST' && url.pathname === '/api/databases/optimize') {
      const body: { databaseIds: string[] } = await request.json();
      logInfo(`Optimizing databases: ${body.databaseIds.join(', ')}`, {
        module: 'databases',
        operation: 'optimize',
        metadata: { databaseIds: body.databaseIds, count: body.databaseIds.length }
      });
      
      // Mock response for local development
      if (isLocalDev) {
        logInfo('Simulating database optimization for local development', { module: 'databases', operation: 'optimize' });
        return new Response(JSON.stringify({
          result: {
            succeeded: body.databaseIds.map(id => ({ id, name: `mock-db-${id}` })),
            failed: []
          },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      }
      
      // Start job tracking
      const jobId = await startJobTracking(
        env,
        OperationType.DATABASE_OPTIMIZE,
        body.databaseIds[0] ?? 'multiple',
        userEmail,
        isLocalDev,
        { databaseIds: body.databaseIds, count: body.databaseIds.length }
      );
      
      const succeeded: { id: string; name: string }[] = [];
      const failed: { id: string; name: string; error: string }[] = [];
      
      try {
        for (const optimizeDbId of body.databaseIds) {
          try {
            // Get database info for reporting
            const dbInfoResponse = await fetch(
              `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${optimizeDbId}`,
              { headers: cfHeaders }
            );
            
            let dbName = optimizeDbId;
            if (dbInfoResponse.ok) {
              const dbInfoData: D1APIResponse = await dbInfoResponse.json();
              const dbInfo = dbInfoData.result as D1DatabaseInfo;
              dbName = dbInfo.name;
            }
            
            // Run PRAGMA optimize
            logInfo(`Running PRAGMA optimize on ${dbName} (${optimizeDbId})`, {
              module: 'databases',
              operation: 'optimize',
              databaseId: optimizeDbId,
              databaseName: dbName
            });
            const queryResponse = await fetch(
              `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${optimizeDbId}/query`,
              {
                method: 'POST',
                headers: cfHeaders,
                body: JSON.stringify({ sql: 'PRAGMA optimize' })
              }
            );
            
            if (!queryResponse.ok) {
              const errorText = await queryResponse.text();
              void logError(env, `Optimize failed for ${optimizeDbId}: ${errorText}`, {
                module: 'databases',
                operation: 'optimize',
                databaseId: optimizeDbId,
                databaseName: dbName,
                metadata: { status: queryResponse.status }
              }, isLocalDev);
              failed.push({ id: optimizeDbId, name: dbName, error: `Failed: ${String(queryResponse.status)}` });
            } else {
              const result: D1APIResponse = await queryResponse.json();
              logInfo(`Optimize succeeded for ${dbName}`, {
                module: 'databases',
                operation: 'optimize',
                databaseId: optimizeDbId,
                databaseName: dbName,
                metadata: { result }
              });
              succeeded.push({ id: optimizeDbId, name: dbName });
            }
          } catch (err) {
            void logError(env, err instanceof Error ? err : String(err), {
              module: 'databases',
              operation: 'optimize',
              databaseId: optimizeDbId
            }, isLocalDev);
            failed.push({
              id: optimizeDbId,
              name: optimizeDbId,
              error: err instanceof Error ? err.message : 'Unknown error'
            });
          }
        }
        
        // Complete job tracking
        logInfo(`Optimize complete - Succeeded: ${String(succeeded.length)}, Failed: ${String(failed.length)}`, {
          module: 'databases',
          operation: 'optimize',
          metadata: { succeeded: succeeded.length, failed: failed.length }
        });
        const finalStatus = failed.length === body.databaseIds.length ? 'failed' : 'completed';
        await finishJobTracking(env, jobId, finalStatus, userEmail, isLocalDev, {
          operationType: OperationType.DATABASE_OPTIMIZE,
          databaseId: body.databaseIds[0] ?? 'multiple',
          processedItems: succeeded.length,
          errorCount: failed.length,
          totalItems: body.databaseIds.length,
          successCount: succeeded.length,
          failedCount: failed.length,
          triggerWebhook: true,
        });
        
        return new Response(JSON.stringify({
          result: { succeeded, failed },
          success: true
        }), {
          headers: jsonHeaders(corsHeaders)
        });
      } catch (err) {
        // Mark job as failed
        await finishJobTracking(env, jobId, 'failed', userEmail, isLocalDev, {
          operationType: OperationType.DATABASE_OPTIMIZE,
          databaseId: body.databaseIds[0] ?? 'multiple',
          processedItems: succeeded.length,
          errorCount: failed.length + (body.databaseIds.length - succeeded.length - failed.length),
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        });
        throw err;
      }
    }

    // Route not found
    return new Response(JSON.stringify({ 
      error: 'Route not found' 
    }), { 
      status: 404,
      headers: jsonHeaders(corsHeaders)
    });

  } catch (err) {
    // Log full error details on server only
    void logError(env, err instanceof Error ? err : String(err), {
      module: 'databases',
      operation: 'request',
      userId: userEmail
    }, isLocalDev);
    // Return generic error to client (security: don't expose stack traces)
    return new Response(JSON.stringify({ 
      error: 'Database operation failed',
      message: 'Unable to complete database operation. Please try again.'
    }), { 
      status: 500,
      headers: jsonHeaders(corsHeaders)
    });
  }
}
