import type { Env } from '../types';
import { sanitizeIdentifier } from '../utils/helpers';
import { isProtectedDatabase, createProtectedDatabaseResponse, getDatabaseInfo } from '../utils/database-protection';

const CF_API = 'https://api.cloudflare.com/client/v4';

/**
 * Constraint validation types
 */
export interface ConstraintViolation {
  id: string;
  type: 'foreign_key' | 'not_null' | 'unique';
  severity: 'critical' | 'warning' | 'info';
  table: string;
  column?: string;
  affectedRows: number;
  details: string;
  fixable: boolean;
  fixStrategies?: Array<'delete' | 'set_null' | 'manual'>;
  metadata?: {
    parentTable?: string;
    parentColumn?: string;
    fkId?: number;
    duplicateValue?: string;
  };
}

export interface ValidationReport {
  database: string;
  timestamp: string;
  totalViolations: number;
  violationsByType: {
    foreign_key: number;
    not_null: number;
    unique: number;
  };
  violations: ConstraintViolation[];
  isHealthy: boolean;
}

export interface FixResult {
  violationId: string;
  success: boolean;
  rowsAffected: number;
  error?: string;
}

/**
 * Handle constraint validation routes
 */
export async function handleConstraintRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  userEmail: string | null
): Promise<Response> {
  console.log('[Constraints] Handling constraint operation');
  
  // Extract database ID from URL
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

  // Check if accessing a protected database
  if (!isLocalDev) {
    const dbInfo = await getDatabaseInfo(dbId, env);
    if (dbInfo && isProtectedDatabase(dbInfo.name)) {
      console.warn('[Constraints] Attempted to access protected database:', dbInfo.name);
      return createProtectedDatabaseResponse(corsHeaders);
    }
  }

  try {
    // POST /api/constraints/:dbId/validate - Full database validation
    if (request.method === 'POST' && url.pathname === `/api/constraints/${dbId}/validate`) {
      console.log('[Constraints] Running full database validation');
      
      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: {
            database: dbId,
            timestamp: new Date().toISOString(),
            totalViolations: 3,
            violationsByType: {
              foreign_key: 2,
              not_null: 1,
              unique: 0
            },
            violations: [
              {
                id: 'fk-1',
                type: 'foreign_key',
                severity: 'critical',
                table: 'posts',
                column: 'user_id',
                affectedRows: 5,
                details: '5 orphaned records reference non-existent user IDs',
                fixable: true,
                fixStrategies: ['delete', 'set_null'],
                metadata: {
                  parentTable: 'users',
                  parentColumn: 'id',
                  fkId: 0
                }
              },
              {
                id: 'fk-2',
                type: 'foreign_key',
                severity: 'warning',
                table: 'comments',
                column: 'post_id',
                affectedRows: 2,
                details: '2 orphaned records reference non-existent post IDs',
                fixable: true,
                fixStrategies: ['delete'],
                metadata: {
                  parentTable: 'posts',
                  parentColumn: 'id',
                  fkId: 0
                }
              },
              {
                id: 'nn-1',
                type: 'not_null',
                severity: 'critical',
                table: 'users',
                column: 'email',
                affectedRows: 1,
                details: '1 row has NULL value in NOT NULL column "email"',
                fixable: false,
                fixStrategies: ['manual']
              }
            ],
            isHealthy: false
          },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const report = await validateDatabase(dbId, env);
      
      return new Response(JSON.stringify({
        result: report,
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // POST /api/constraints/:dbId/validate-table - Single table validation
    if (request.method === 'POST' && url.pathname === `/api/constraints/${dbId}/validate-table`) {
      console.log('[Constraints] Running single table validation');
      
      const body = await request.json() as { tableName: string };
      const { tableName } = body;
      
      if (!tableName) {
        return new Response(JSON.stringify({ 
          error: 'Table name required' 
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
            database: dbId,
            timestamp: new Date().toISOString(),
            totalViolations: 1,
            violationsByType: {
              foreign_key: 1,
              not_null: 0,
              unique: 0
            },
            violations: [
              {
                id: 'fk-1',
                type: 'foreign_key',
                severity: 'warning',
                table: tableName,
                column: 'user_id',
                affectedRows: 3,
                details: `3 orphaned records in ${tableName}`,
                fixable: true,
                fixStrategies: ['delete', 'set_null'],
                metadata: {
                  parentTable: 'users',
                  parentColumn: 'id',
                  fkId: 0
                }
              }
            ],
            isHealthy: false
          },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const report = await validateTable(dbId, tableName, env);
      
      return new Response(JSON.stringify({
        result: report,
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // POST /api/constraints/:dbId/fix - Apply fixes
    if (request.method === 'POST' && url.pathname === `/api/constraints/${dbId}/fix`) {
      console.log('[Constraints] Applying constraint fixes');
      
      const body = await request.json() as { 
        violations: string[];
        fixStrategy: 'delete' | 'set_null';
      };
      const { violations, fixStrategy } = body;
      
      if (!violations || !Array.isArray(violations) || violations.length === 0) {
        return new Response(JSON.stringify({ 
          error: 'Violations array required' 
        }), { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      if (!fixStrategy || !['delete', 'set_null'].includes(fixStrategy)) {
        return new Response(JSON.stringify({ 
          error: 'Valid fix strategy required (delete or set_null)' 
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
          result: violations.map(vid => ({
            violationId: vid,
            success: true,
            rowsAffected: Math.floor(Math.random() * 10) + 1,
          })),
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const results = await applyFixes(dbId, violations, fixStrategy, env);
      
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

    // Unknown route
    return new Response(JSON.stringify({ 
      error: 'Unknown constraint endpoint' 
    }), { 
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (err) {
    console.error('[Constraints] Error:', err);
    return new Response(JSON.stringify({ 
      error: 'Constraint validation failed',
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

/**
 * Validate all constraints in a database
 */
async function validateDatabase(dbId: string, env: Env): Promise<ValidationReport> {
  const violations: ConstraintViolation[] = [];
  
  // Get all tables
  const tableListQuery = "PRAGMA table_list";
  const tableListResult = await executeQueryViaAPI(dbId, tableListQuery, env);
  const allTables = (tableListResult.results as Array<{ name: string; type: string }>)
    .filter(t => !t.name.startsWith('sqlite_') && !t.name.startsWith('_cf_') && t.type === 'table');
  
  // Check foreign key constraints for all tables
  for (const table of allTables) {
    const fkViolations = await checkForeignKeyViolations(dbId, table.name, env);
    violations.push(...fkViolations);
  }
  
  // Check NOT NULL constraints
  for (const table of allTables) {
    const notNullViolations = await checkNotNullViolations(dbId, table.name, env);
    violations.push(...notNullViolations);
  }
  
  // Check UNIQUE constraints
  for (const table of allTables) {
    const uniqueViolations = await checkUniqueViolations(dbId, table.name, env);
    violations.push(...uniqueViolations);
  }
  
  // Calculate summary
  const violationsByType = {
    foreign_key: violations.filter(v => v.type === 'foreign_key').length,
    not_null: violations.filter(v => v.type === 'not_null').length,
    unique: violations.filter(v => v.type === 'unique').length
  };
  
  return {
    database: dbId,
    timestamp: new Date().toISOString(),
    totalViolations: violations.length,
    violationsByType,
    violations,
    isHealthy: violations.length === 0
  };
}

/**
 * Validate constraints for a specific table
 */
async function validateTable(dbId: string, tableName: string, env: Env): Promise<ValidationReport> {
  const violations: ConstraintViolation[] = [];
  
  // Check foreign key constraints
  const fkViolations = await checkForeignKeyViolations(dbId, tableName, env);
  violations.push(...fkViolations);
  
  // Check NOT NULL constraints
  const notNullViolations = await checkNotNullViolations(dbId, tableName, env);
  violations.push(...notNullViolations);
  
  // Check UNIQUE constraints
  const uniqueViolations = await checkUniqueViolations(dbId, tableName, env);
  violations.push(...uniqueViolations);
  
  // Calculate summary
  const violationsByType = {
    foreign_key: violations.filter(v => v.type === 'foreign_key').length,
    not_null: violations.filter(v => v.type === 'not_null').length,
    unique: violations.filter(v => v.type === 'unique').length
  };
  
  return {
    database: dbId,
    timestamp: new Date().toISOString(),
    totalViolations: violations.length,
    violationsByType,
    violations,
    isHealthy: violations.length === 0
  };
}

/**
 * Check foreign key violations for a table
 */
async function checkForeignKeyViolations(
  dbId: string,
  tableName: string,
  env: Env
): Promise<ConstraintViolation[]> {
  const violations: ConstraintViolation[] = [];
  const sanitizedTable = sanitizeIdentifier(tableName);
  
  try {
    // Use PRAGMA foreign_key_check to find orphaned records
    const fkCheckQuery = `PRAGMA foreign_key_check("${sanitizedTable}")`;
    const fkCheckResult = await executeQueryViaAPI(dbId, fkCheckQuery, env);
    
    // Group violations by foreign key
    const violationMap = new Map<string, {
      parentTable: string;
      column: string;
      fkId: number;
      rowIds: unknown[];
    }>();
    
    for (const row of fkCheckResult.results as Array<{
      table: string;
      rowid: number;
      parent: string;
      fkid: number;
    }>) {
      const key = `${row.table}-${row.fkid}`;
      if (!violationMap.has(key)) {
        // Get foreign key details
        const fkListQuery = `PRAGMA foreign_key_list("${sanitizedTable}")`;
        const fkListResult = await executeQueryViaAPI(dbId, fkListQuery, env);
        const fkInfo = (fkListResult.results as Array<{
          id: number;
          seq: number;
          table: string;
          from: string;
          to: string;
          on_update: string;
          on_delete: string;
        }>).find(fk => fk.id === row.fkid);
        
        if (fkInfo) {
          violationMap.set(key, {
            parentTable: row.parent,
            column: fkInfo.from,
            fkId: row.fkid,
            rowIds: [row.rowid]
          });
        }
      } else {
        violationMap.get(key)!.rowIds.push(row.rowid);
      }
    }
    
    // Create violation entries
    for (const [, info] of violationMap) {
      const affectedRows = info.rowIds.length;
      
      // Determine if fixable based on column nullability
      const tableInfoQuery = `PRAGMA table_info("${sanitizedTable}")`;
      const tableInfoResult = await executeQueryViaAPI(dbId, tableInfoQuery, env);
      const columnInfo = (tableInfoResult.results as Array<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }>).find(col => col.name === info.column);
      
      const canSetNull = columnInfo && columnInfo.notnull === 0 && columnInfo.pk === 0;
      const fixStrategies: Array<'delete' | 'set_null' | 'manual'> = ['delete'];
      if (canSetNull) {
        fixStrategies.push('set_null');
      }
      
      violations.push({
        id: `fk-${tableName}-${info.column}-${info.fkId}`,
        type: 'foreign_key',
        severity: affectedRows > 50 ? 'critical' : affectedRows > 10 ? 'warning' : 'info',
        table: tableName,
        column: info.column,
        affectedRows,
        details: `${affectedRows} orphaned record${affectedRows !== 1 ? 's' : ''} reference non-existent ${info.parentTable}`,
        fixable: true,
        fixStrategies,
        metadata: {
          parentTable: info.parentTable,
          parentColumn: 'id', // SQLite default
          fkId: info.fkId
        }
      });
    }
  } catch (err) {
    console.error(`[Constraints] Error checking FK violations for ${tableName}:`, err);
  }
  
  return violations;
}

/**
 * Check NOT NULL violations for a table
 */
async function checkNotNullViolations(
  dbId: string,
  tableName: string,
  env: Env
): Promise<ConstraintViolation[]> {
  const violations: ConstraintViolation[] = [];
  const sanitizedTable = sanitizeIdentifier(tableName);
  
  try {
    // Get table schema
    const tableInfoQuery = `PRAGMA table_info("${sanitizedTable}")`;
    const tableInfoResult = await executeQueryViaAPI(dbId, tableInfoQuery, env);
    const columns = tableInfoResult.results as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>;
    
    // Check each NOT NULL column for NULL values
    for (const column of columns) {
      if (column.notnull === 1) {
        const sanitizedColumn = sanitizeIdentifier(column.name);
        const countQuery = `SELECT COUNT(*) as count FROM "${sanitizedTable}" WHERE "${sanitizedColumn}" IS NULL`;
        const countResult = await executeQueryViaAPI(dbId, countQuery, env);
        const count = (countResult.results[0] as { count: number })?.count || 0;
        
        if (count > 0) {
          violations.push({
            id: `nn-${tableName}-${column.name}`,
            type: 'not_null',
            severity: 'critical',
            table: tableName,
            column: column.name,
            affectedRows: count,
            details: `${count} row${count !== 1 ? 's have' : ' has'} NULL value in NOT NULL column "${column.name}"`,
            fixable: false,
            fixStrategies: ['manual']
          });
        }
      }
    }
  } catch (err) {
    console.error(`[Constraints] Error checking NOT NULL violations for ${tableName}:`, err);
  }
  
  return violations;
}

/**
 * Check UNIQUE constraint violations for a table
 */
async function checkUniqueViolations(
  dbId: string,
  tableName: string,
  env: Env
): Promise<ConstraintViolation[]> {
  const violations: ConstraintViolation[] = [];
  const sanitizedTable = sanitizeIdentifier(tableName);
  
  try {
    // Get unique indexes
    const indexListQuery = `PRAGMA index_list("${sanitizedTable}")`;
    const indexListResult = await executeQueryViaAPI(dbId, indexListQuery, env);
    const indexes = (indexListResult.results as Array<{
      seq: number;
      name: string;
      unique: number;
      origin: string;
      partial: number;
    }>).filter(idx => idx.unique === 1 && idx.origin !== 'pk'); // Skip primary key
    
    for (const index of indexes) {
      // Get index columns
      const indexInfoQuery = `PRAGMA index_info("${sanitizeIdentifier(index.name)}")`;
      const indexInfoResult = await executeQueryViaAPI(dbId, indexInfoQuery, env);
      const indexColumns = indexInfoResult.results as Array<{
        seqno: number;
        cid: number;
        name: string;
      }>;
      
      if (indexColumns.length === 1) {
        // Single column unique constraint
        const columnName = indexColumns[0].name;
        const sanitizedColumn = sanitizeIdentifier(columnName);
        
        // Find duplicates
        const duplicateQuery = `
          SELECT "${sanitizedColumn}", COUNT(*) as cnt 
          FROM "${sanitizedTable}" 
          WHERE "${sanitizedColumn}" IS NOT NULL
          GROUP BY "${sanitizedColumn}" 
          HAVING cnt > 1
        `;
        const duplicateResult = await executeQueryViaAPI(dbId, duplicateQuery, env);
        
        if (duplicateResult.results.length > 0) {
          const totalDuplicates = (duplicateResult.results as Array<{ cnt: number }>)
            .reduce((sum, row) => sum + row.cnt, 0);
          
          violations.push({
            id: `uq-${tableName}-${columnName}`,
            type: 'unique',
            severity: 'warning',
            table: tableName,
            column: columnName,
            affectedRows: totalDuplicates,
            details: `${duplicateResult.results.length} duplicate value${duplicateResult.results.length !== 1 ? 's' : ''} found in UNIQUE column "${columnName}"`,
            fixable: false,
            fixStrategies: ['manual']
          });
        }
      }
    }
  } catch (err) {
    console.error(`[Constraints] Error checking UNIQUE violations for ${tableName}:`, err);
  }
  
  return violations;
}

/**
 * Apply fixes to violations
 */
async function applyFixes(
  dbId: string,
  violationIds: string[],
  fixStrategy: 'delete' | 'set_null',
  env: Env
): Promise<FixResult[]> {
  const results: FixResult[] = [];
  
  // Parse violation IDs to extract fix information
  for (const violationId of violationIds) {
    try {
      // Parse violation ID format: fk-tableName-columnName-fkId
      const parts = violationId.split('-');
      
      if (parts[0] === 'fk' && parts.length >= 4) {
        const tableName = parts[1];
        const columnName = parts[2];
        const sanitizedTable = sanitizeIdentifier(tableName);
        const sanitizedColumn = sanitizeIdentifier(columnName);
        
        // Get foreign key info to find parent table
        const fkListQuery = `PRAGMA foreign_key_list("${sanitizedTable}")`;
        const fkListResult = await executeQueryViaAPI(dbId, fkListQuery, env);
        const fkInfo = (fkListResult.results as Array<{
          id: number;
          table: string;
          from: string;
          to: string;
        }>).find(fk => fk.from === columnName);
        
        if (!fkInfo) {
          results.push({
            violationId,
            success: false,
            rowsAffected: 0,
            error: 'Foreign key not found'
          });
          continue;
        }
        
        const parentTable = fkInfo.table;
        const parentColumn = fkInfo.to;
        const sanitizedParentTable = sanitizeIdentifier(parentTable);
        const sanitizedParentColumn = sanitizeIdentifier(parentColumn);
        
        let fixQuery: string;
        if (fixStrategy === 'delete') {
          // Delete orphaned records
          fixQuery = `
            DELETE FROM "${sanitizedTable}" 
            WHERE "${sanitizedColumn}" NOT IN (
              SELECT "${sanitizedParentColumn}" FROM "${sanitizedParentTable}"
            )
          `;
        } else {
          // Set to NULL
          fixQuery = `
            UPDATE "${sanitizedTable}" 
            SET "${sanitizedColumn}" = NULL 
            WHERE "${sanitizedColumn}" NOT IN (
              SELECT "${sanitizedParentColumn}" FROM "${sanitizedParentTable}"
            )
          `;
        }
        
        const fixResult = await executeQueryViaAPI(dbId, fixQuery, env);
        
        results.push({
          violationId,
          success: true,
          rowsAffected: (fixResult.meta?.changes as number) || 0
        });
      } else {
        results.push({
          violationId,
          success: false,
          rowsAffected: 0,
          error: 'Unsupported violation type'
        });
      }
    } catch (err) {
      results.push({
        violationId,
        success: false,
        rowsAffected: 0,
        error: err instanceof Error ? err.message : 'Unknown error'
      });
    }
  }
  
  return results;
}

/**
 * Execute a query against a specific D1 database using the REST API
 */
async function executeQueryViaAPI(
  databaseId: string,
  query: string,
  env: Env
): Promise<{ results: unknown[]; meta?: Record<string, unknown>; success: boolean }> {
  const response = await fetch(
    `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${databaseId}/query`,
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
    console.error('[Constraints] Query error:', errorText);
    throw new Error(`Query failed: ${response.status}`);
  }
  
  const data = await response.json() as { result: Array<{ results: unknown[]; meta?: Record<string, unknown>; success: boolean }> };
  return data.result[0];
}

