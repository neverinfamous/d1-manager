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
        'isNull' | 'isNotNull' | 'startsWith' | 'endsWith' | 
        'between' | 'notBetween' | 'in' | 'notIn';
  value?: string | number;
  value2?: string | number; // For BETWEEN operators
  values?: (string | number)[]; // For IN operators
  logicOperator?: 'AND' | 'OR'; // For combining with next filter
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
  
  const filterEntries = Object.entries(filters);
  
  for (let i = 0; i < filterEntries.length; i++) {
    const [columnName, filter] = filterEntries[i];
    
    // Validate column exists in schema
    if (!columnMap.has(columnName)) {
      console.warn(`[buildWhereClause] Invalid column name: ${columnName}`);
      continue;
    }
    
    const sanitizedColumn = sanitizeIdentifier(columnName);
    const columnType = columnMap.get(columnName)?.toUpperCase() || '';
    let condition = '';
    
    // Handle NULL checks (no value needed)
    if (filter.type === 'isNull') {
      condition = `"${sanitizedColumn}" IS NULL`;
    } else if (filter.type === 'isNotNull') {
      condition = `"${sanitizedColumn}" IS NOT NULL`;
    }
    // Handle BETWEEN operator
    else if (filter.type === 'between' || filter.type === 'notBetween') {
      if ((filter.value === undefined || filter.value === null || filter.value === '') ||
          (filter.value2 === undefined || filter.value2 === null || filter.value2 === '')) {
        console.warn(`[buildWhereClause] BETWEEN requires both value and value2`);
        continue;
      }
      
      const escapedValue1 = typeof filter.value === 'string' 
        ? filter.value.replace(/'/g, "''") 
        : filter.value;
      const escapedValue2 = typeof filter.value2 === 'string' 
        ? filter.value2.replace(/'/g, "''") 
        : filter.value2;
      
      const operator = filter.type === 'between' ? 'BETWEEN' : 'NOT BETWEEN';
      
      if (typeof filter.value === 'number' && typeof filter.value2 === 'number') {
        condition = `"${sanitizedColumn}" ${operator} ${escapedValue1} AND ${escapedValue2}`;
      } else {
        condition = `"${sanitizedColumn}" ${operator} '${escapedValue1}' AND '${escapedValue2}'`;
      }
    }
    // Handle IN operator
    else if (filter.type === 'in' || filter.type === 'notIn') {
      if (!filter.values || filter.values.length === 0) {
        console.warn(`[buildWhereClause] IN requires values array`);
        continue;
      }
      
      // Limit to 100 values for performance
      const limitedValues = filter.values.slice(0, 100);
      
      const escapedValues = limitedValues.map(val => {
        if (typeof val === 'string') {
          return `'${val.replace(/'/g, "''")}'`;
        }
        return val;
      }).join(', ');
      
      const operator = filter.type === 'in' ? 'IN' : 'NOT IN';
      condition = `"${sanitizedColumn}" ${operator} (${escapedValues})`;
    }
    // Handle value-based filters
    else {
      // Skip if no value provided
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
            condition = `"${sanitizedColumn}" = ${escapedValue}`;
          } else if (columnType.includes('TEXT') || columnType.includes('CHAR')) {
            // Case-insensitive comparison for text
            condition = `LOWER("${sanitizedColumn}") = LOWER('${escapedValue}')`;
          } else {
            condition = `"${sanitizedColumn}" = '${escapedValue}'`;
          }
          break;
          
        case 'notEquals':
          if (typeof filter.value === 'number') {
            condition = `"${sanitizedColumn}" != ${escapedValue}`;
          } else if (columnType.includes('TEXT') || columnType.includes('CHAR')) {
            // Case-insensitive comparison for text
            condition = `LOWER("${sanitizedColumn}") != LOWER('${escapedValue}')`;
          } else {
            condition = `"${sanitizedColumn}" != '${escapedValue}'`;
          }
          break;
          
        case 'contains':
          if (typeof filter.value === 'string') {
            const escaped = escapeLikePattern(filter.value.replace(/'/g, "''"));
            condition = `LOWER("${sanitizedColumn}") LIKE LOWER('%${escaped}%') ESCAPE '\\'`;
          }
          break;
          
        case 'startsWith':
          if (typeof filter.value === 'string') {
            const escaped = escapeLikePattern(filter.value.replace(/'/g, "''"));
            condition = `LOWER("${sanitizedColumn}") LIKE LOWER('${escaped}%') ESCAPE '\\'`;
          }
          break;
          
        case 'endsWith':
          if (typeof filter.value === 'string') {
            const escaped = escapeLikePattern(filter.value.replace(/'/g, "''"));
            condition = `LOWER("${sanitizedColumn}") LIKE LOWER('%${escaped}') ESCAPE '\\'`;
          }
          break;
          
        case 'gt':
          if (typeof filter.value === 'number') {
            condition = `"${sanitizedColumn}" > ${escapedValue}`;
          } else {
            condition = `"${sanitizedColumn}" > '${escapedValue}'`;
          }
          break;
          
        case 'gte':
          if (typeof filter.value === 'number') {
            condition = `"${sanitizedColumn}" >= ${escapedValue}`;
          } else {
            condition = `"${sanitizedColumn}" >= '${escapedValue}'`;
          }
          break;
          
        case 'lt':
          if (typeof filter.value === 'number') {
            condition = `"${sanitizedColumn}" < ${escapedValue}`;
          } else {
            condition = `"${sanitizedColumn}" < '${escapedValue}'`;
          }
          break;
          
        case 'lte':
          if (typeof filter.value === 'number') {
            condition = `"${sanitizedColumn}" <= ${escapedValue}`;
          } else {
            condition = `"${sanitizedColumn}" <= '${escapedValue}'`;
          }
          break;
      }
    }
    
    // Add condition if it was built
    if (condition) {
      conditions.push(condition);
    }
  }
  
  // Build WHERE clause with support for OR logic
  let whereClause = '';
  
  if (conditions.length > 0) {
    // Group conditions based on logic operators
    const groups: string[] = [];
    let currentGroup: string[] = [];
    
    for (let i = 0; i < filterEntries.length; i++) {
      const [, filter] = filterEntries[i];
      
      // Find corresponding condition
      if (conditions.length > groups.length + currentGroup.length) {
        const conditionIndex = groups.length + currentGroup.length;
        if (conditionIndex < conditions.length) {
          currentGroup.push(conditions[conditionIndex]);
          
          // Check if next filter should be joined with OR
          if (filter.logicOperator === 'OR' && i < filterEntries.length - 1) {
            // Continue building current OR group
          } else {
            // End current group
            if (currentGroup.length > 0) {
              if (currentGroup.length > 1) {
                groups.push(`(${currentGroup.join(' OR ')})`);
              } else {
                groups.push(currentGroup[0]);
              }
              currentGroup = [];
            }
          }
        }
      }
    }
    
    // Add any remaining conditions
    if (currentGroup.length > 0) {
      if (currentGroup.length > 1) {
        groups.push(`(${currentGroup.join(' OR ')})`);
      } else {
        groups.push(currentGroup[0]);
      }
    }
    
    whereClause = ' WHERE ' + groups.join(' AND ');
  }
  
  return {
    whereClause,
    hasFilters: conditions.length > 0
  };
}

