import type { Env } from '../types';

/**
 * Get database size using D1 PRAGMA
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getDatabaseSize(_databaseId: string, _env: Env): Promise<number> {
  // For now, return 0 - will be implemented when we have dynamic database bindings
  // In production, this would query the specific D1 database
  return 0;
}

/**
 * Validate SQL query to prevent dangerous operations without confirmation
 */
export function validateQuery(query: string): { valid: boolean; warning?: string } {
  const upperQuery = query.trim().toUpperCase();
  
  // Check for DROP without confirmation
  if (upperQuery.startsWith('DROP ')) {
    return { valid: false, warning: 'DROP operations require explicit confirmation' };
  }
  
  // Check for DELETE/UPDATE without WHERE clause
  if (upperQuery.startsWith('DELETE ') || upperQuery.startsWith('UPDATE ')) {
    if (!upperQuery.includes(' WHERE ')) {
      return { 
        valid: false, 
        warning: 'DELETE/UPDATE without WHERE clause requires explicit confirmation' 
      };
    }
  }
  
  return { valid: true };
}

/**
 * Sanitize table/column names to prevent SQL injection
 */
export function sanitizeIdentifier(identifier: string): string {
  // Remove any non-alphanumeric characters except underscore
  return identifier.replace(/[^a-zA-Z0-9_]/g, '');
}

/**
 * Parse D1 error messages
 */
export function parseD1Error(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Filter condition types for row-level filtering
 */
export interface FilterCondition {
  type: 'contains' | 'equals' | 'notEquals' | 'gt' | 'gte' | 'lt' | 'lte' | 
        'isNull' | 'isNotNull' | 'startsWith' | 'endsWith';
  value?: string | number;
  value2?: string | number;
}

/**
 * Column info for validation
 */
interface ColumnInfo {
  name: string;
  type: string | null;
}

/**
 * Escape special characters in LIKE patterns
 */
function escapeLikePattern(value: string): string {
  return value
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/%/g, '\\%')    // Escape percent signs
    .replace(/_/g, '\\_');   // Escape underscores
}

/**
 * Build SQL WHERE clause from filters with proper escaping
 * Returns parameterized query parts for security
 */
export function buildWhereClause(
  filters: Record<string, FilterCondition>,
  schema: ColumnInfo[]
): { whereClause: string; hasFilters: boolean } {
  const conditions: string[] = [];
  const columnMap = new Map(schema.map(col => [col.name, col.type]));
  
  for (const [columnName, filter] of Object.entries(filters)) {
    // Validate column exists in schema
    if (!columnMap.has(columnName)) {
      console.warn(`[buildWhereClause] Invalid column name: ${columnName}`);
      continue;
    }
    
    const sanitizedColumn = sanitizeIdentifier(columnName);
    const columnType = columnMap.get(columnName)?.toUpperCase() || '';
    
    // Handle NULL checks (no value needed)
    if (filter.type === 'isNull') {
      conditions.push(`"${sanitizedColumn}" IS NULL`);
      continue;
    }
    
    if (filter.type === 'isNotNull') {
      conditions.push(`"${sanitizedColumn}" IS NOT NULL`);
      continue;
    }
    
    // Skip if no value provided for value-based filters
    if (filter.value === undefined || filter.value === null || filter.value === '') {
      continue;
    }
    
    // Escape the value for SQL
    const escapedValue = typeof filter.value === 'string' 
      ? filter.value.replace(/'/g, "''") 
      : filter.value;
    
    // Build condition based on filter type
    switch (filter.type) {
      case 'equals':
        if (typeof filter.value === 'number') {
          conditions.push(`"${sanitizedColumn}" = ${escapedValue}`);
        } else if (columnType.includes('TEXT') || columnType.includes('CHAR')) {
          // Case-insensitive comparison for text
          conditions.push(`LOWER("${sanitizedColumn}") = LOWER('${escapedValue}')`);
        } else {
          conditions.push(`"${sanitizedColumn}" = '${escapedValue}'`);
        }
        break;
        
      case 'notEquals':
        if (typeof filter.value === 'number') {
          conditions.push(`"${sanitizedColumn}" != ${escapedValue}`);
        } else if (columnType.includes('TEXT') || columnType.includes('CHAR')) {
          // Case-insensitive comparison for text
          conditions.push(`LOWER("${sanitizedColumn}") != LOWER('${escapedValue}')`);
        } else {
          conditions.push(`"${sanitizedColumn}" != '${escapedValue}'`);
        }
        break;
        
      case 'contains':
        if (typeof filter.value === 'string') {
          const escaped = escapeLikePattern(filter.value.replace(/'/g, "''"));
          conditions.push(`LOWER("${sanitizedColumn}") LIKE LOWER('%${escaped}%') ESCAPE '\\'`);
        }
        break;
        
      case 'startsWith':
        if (typeof filter.value === 'string') {
          const escaped = escapeLikePattern(filter.value.replace(/'/g, "''"));
          conditions.push(`LOWER("${sanitizedColumn}") LIKE LOWER('${escaped}%') ESCAPE '\\'`);
        }
        break;
        
      case 'endsWith':
        if (typeof filter.value === 'string') {
          const escaped = escapeLikePattern(filter.value.replace(/'/g, "''"));
          conditions.push(`LOWER("${sanitizedColumn}") LIKE LOWER('%${escaped}') ESCAPE '\\'`);
        }
        break;
        
      case 'gt':
        if (typeof filter.value === 'number') {
          conditions.push(`"${sanitizedColumn}" > ${escapedValue}`);
        } else {
          conditions.push(`"${sanitizedColumn}" > '${escapedValue}'`);
        }
        break;
        
      case 'gte':
        if (typeof filter.value === 'number') {
          conditions.push(`"${sanitizedColumn}" >= ${escapedValue}`);
        } else {
          conditions.push(`"${sanitizedColumn}" >= '${escapedValue}'`);
        }
        break;
        
      case 'lt':
        if (typeof filter.value === 'number') {
          conditions.push(`"${sanitizedColumn}" < ${escapedValue}`);
        } else {
          conditions.push(`"${sanitizedColumn}" < '${escapedValue}'`);
        }
        break;
        
      case 'lte':
        if (typeof filter.value === 'number') {
          conditions.push(`"${sanitizedColumn}" <= ${escapedValue}`);
        } else {
          conditions.push(`"${sanitizedColumn}" <= '${escapedValue}'`);
        }
        break;
    }
  }
  
  const whereClause = conditions.length > 0 
    ? ' WHERE ' + conditions.join(' AND ') 
    : '';
  
  return {
    whereClause,
    hasFilters: conditions.length > 0
  };
}

