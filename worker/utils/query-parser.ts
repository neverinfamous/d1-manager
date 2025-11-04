/**
 * SQL Query Parser for Index Analyzer
 * 
 * Extracts columns used in WHERE, JOIN, ORDER BY, and GROUP BY clauses
 * from SQL query strings to identify indexing opportunities.
 */

export interface ParsedQuery {
  whereColumns: string[];
  joinColumns: string[];
  orderByColumns: string[];
  groupByColumns: string[];
  tables: string[];
}

export interface ColumnUsageFrequency {
  [tableName: string]: {
    [columnName: string]: {
      whereCount: number;
      joinCount: number;
      orderByCount: number;
      groupByCount: number;
      totalCount: number;
    };
  };
}

/**
 * Parse a SQL query to extract column references
 */
export function parseQuery(sql: string): ParsedQuery {
  const result: ParsedQuery = {
    whereColumns: [],
    joinColumns: [],
    orderByColumns: [],
    groupByColumns: [],
    tables: [],
  };

  // Normalize SQL: remove comments, extra spaces, and normalize to uppercase for parsing
  const normalizedSQL = sql
    .replace(/--[^\n]*/g, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Extract tables from FROM and JOIN clauses
  result.tables = extractTables(normalizedSQL);

  // Extract WHERE clause columns
  result.whereColumns = extractWhereColumns(normalizedSQL);

  // Extract JOIN clause columns
  result.joinColumns = extractJoinColumns(normalizedSQL);

  // Extract ORDER BY columns
  result.orderByColumns = extractOrderByColumns(normalizedSQL);

  // Extract GROUP BY columns
  result.groupByColumns = extractGroupByColumns(normalizedSQL);

  return result;
}

/**
 * Extract table names from FROM and JOIN clauses
 */
function extractTables(sql: string): string[] {
  const tables: string[] = [];
  
  // Match FROM clause: FROM table_name or FROM table_name AS alias
  const fromMatch = sql.match(/\bFROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
  if (fromMatch && fromMatch[1]) {
    tables.push(fromMatch[1]);
  }

  // Match JOIN clauses: JOIN table_name
  const joinMatches = sql.matchAll(/\b(?:INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|FULL\s+JOIN|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi);
  for (const match of joinMatches) {
    if (match[1]) {
      tables.push(match[1]);
    }
  }

  return [...new Set(tables)]; // Remove duplicates
}

/**
 * Extract columns from WHERE clause
 */
function extractWhereColumns(sql: string): string[] {
  const columns: string[] = [];
  
  // Find WHERE clause
  const whereMatch = sql.match(/\bWHERE\s+(.*?)(?:\bGROUP\s+BY|\bORDER\s+BY|\bLIMIT|\bOFFSET|$)/is);
  if (!whereMatch) return columns;

  const whereClause = whereMatch[1];

  // Match column references: table.column or column
  // Handles: column = ?, table.column = ?, column IN (...), etc.
  const columnMatches = whereClause.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=|<|>|<=|>=|!=|<>|LIKE|IN|IS|BETWEEN)/gi);
  
  for (const match of columnMatches) {
    const tableName = match[1] ? match[1].replace('.', '') : null;
    const columnName = match[2];
    
    // Skip SQL keywords
    if (isSQLKeyword(columnName)) continue;
    
    if (tableName) {
      columns.push(`${tableName}.${columnName}`);
    } else {
      columns.push(columnName);
    }
  }

  return [...new Set(columns)];
}

/**
 * Extract columns from JOIN clauses
 */
function extractJoinColumns(sql: string): string[] {
  const columns: string[] = [];
  
  // Find all JOIN...ON clauses
  const joinMatches = sql.matchAll(/\b(?:INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|FULL\s+JOIN|JOIN)\s+[a-zA-Z_][a-zA-Z0-9_]*\s+(?:AS\s+[a-zA-Z_][a-zA-Z0-9_]*\s+)?ON\s+(.*?)(?:\bINNER\s+JOIN|\bLEFT\s+JOIN|\bRIGHT\s+JOIN|\bFULL\s+JOIN|\bJOIN|\bWHERE|\bGROUP\s+BY|\bORDER\s+BY|\bLIMIT|$)/gis);
  
  for (const match of joinMatches) {
    const onClause = match[1];
    
    // Extract columns from ON condition: table1.col1 = table2.col2
    const columnMatches = onClause.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*\.)([a-zA-Z_][a-zA-Z0-9_]*)/g);
    
    for (const colMatch of columnMatches) {
      const tableName = colMatch[1].replace('.', '');
      const columnName = colMatch[2];
      
      if (!isSQLKeyword(columnName)) {
        columns.push(`${tableName}.${columnName}`);
      }
    }
  }

  return [...new Set(columns)];
}

/**
 * Extract columns from ORDER BY clause
 */
function extractOrderByColumns(sql: string): string[] {
  const columns: string[] = [];
  
  // Find ORDER BY clause
  const orderByMatch = sql.match(/\bORDER\s+BY\s+(.*?)(?:\bLIMIT|\bOFFSET|$)/is);
  if (!orderByMatch) return columns;

  const orderByClause = orderByMatch[1];

  // Match columns: column ASC/DESC or table.column ASC/DESC
  const columnMatches = orderByClause.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*\.)?([a-zA-Z_][a-zA-Z0-9_]*)/g);
  
  for (const match of columnMatches) {
    const tableName = match[1] ? match[1].replace('.', '') : null;
    const columnName = match[2];
    
    // Skip ASC/DESC keywords
    if (columnName.toUpperCase() === 'ASC' || columnName.toUpperCase() === 'DESC') continue;
    if (isSQLKeyword(columnName)) continue;
    
    if (tableName) {
      columns.push(`${tableName}.${columnName}`);
    } else {
      columns.push(columnName);
    }
  }

  return [...new Set(columns)];
}

/**
 * Extract columns from GROUP BY clause
 */
function extractGroupByColumns(sql: string): string[] {
  const columns: string[] = [];
  
  // Find GROUP BY clause
  const groupByMatch = sql.match(/\bGROUP\s+BY\s+(.*?)(?:\bHAVING|\bORDER\s+BY|\bLIMIT|\bOFFSET|$)/is);
  if (!groupByMatch) return columns;

  const groupByClause = groupByMatch[1];

  // Match columns: column or table.column
  const columnMatches = groupByClause.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*\.)?([a-zA-Z_][a-zA-Z0-9_]*)/g);
  
  for (const match of columnMatches) {
    const tableName = match[1] ? match[1].replace('.', '') : null;
    const columnName = match[2];
    
    if (isSQLKeyword(columnName)) continue;
    
    if (tableName) {
      columns.push(`${tableName}.${columnName}`);
    } else {
      columns.push(columnName);
    }
  }

  return [...new Set(columns)];
}

/**
 * Check if a word is a SQL keyword that should be ignored
 */
function isSQLKeyword(word: string): boolean {
  const keywords = [
    'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER',
    'ON', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS', 'NULL', 'AS',
    'GROUP', 'BY', 'HAVING', 'ORDER', 'ASC', 'DESC', 'LIMIT', 'OFFSET',
    'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TABLE',
    'INDEX', 'VIEW', 'PRAGMA', 'EXPLAIN', 'DISTINCT', 'COUNT', 'SUM', 'AVG',
    'MIN', 'MAX', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'CAST', 'UNION',
    'INTERSECT', 'EXCEPT', 'EXISTS', 'ALL', 'ANY', 'SOME',
  ];
  
  return keywords.includes(word.toUpperCase());
}

/**
 * Analyze multiple queries and aggregate column usage frequency
 */
export function analyzeQueryPatterns(queries: { query: string; table?: string }[]): ColumnUsageFrequency {
  const frequency: ColumnUsageFrequency = {};

  for (const { query } of queries) {
    try {
      const parsed = parseQuery(query);
      
      // For each table mentioned in the query
      for (const table of parsed.tables) {
        if (!frequency[table]) {
          frequency[table] = {};
        }

        // Count WHERE columns
        for (const col of parsed.whereColumns) {
          const { table: colTable, column } = parseColumnReference(col, table);
          if (colTable === table) {
            if (!frequency[table][column]) {
              frequency[table][column] = { whereCount: 0, joinCount: 0, orderByCount: 0, groupByCount: 0, totalCount: 0 };
            }
            frequency[table][column].whereCount++;
            frequency[table][column].totalCount++;
          }
        }

        // Count JOIN columns
        for (const col of parsed.joinColumns) {
          const { table: colTable, column } = parseColumnReference(col, table);
          if (colTable === table) {
            if (!frequency[table][column]) {
              frequency[table][column] = { whereCount: 0, joinCount: 0, orderByCount: 0, groupByCount: 0, totalCount: 0 };
            }
            frequency[table][column].joinCount++;
            frequency[table][column].totalCount++;
          }
        }

        // Count ORDER BY columns
        for (const col of parsed.orderByColumns) {
          const { table: colTable, column } = parseColumnReference(col, table);
          if (colTable === table) {
            if (!frequency[table][column]) {
              frequency[table][column] = { whereCount: 0, joinCount: 0, orderByCount: 0, groupByCount: 0, totalCount: 0 };
            }
            frequency[table][column].orderByCount++;
            frequency[table][column].totalCount++;
          }
        }

        // Count GROUP BY columns
        for (const col of parsed.groupByColumns) {
          const { table: colTable, column } = parseColumnReference(col, table);
          if (colTable === table) {
            if (!frequency[table][column]) {
              frequency[table][column] = { whereCount: 0, joinCount: 0, orderByCount: 0, groupByCount: 0, totalCount: 0 };
            }
            frequency[table][column].groupByCount++;
            frequency[table][column].totalCount++;
          }
        }
      }
    } catch (error) {
      // Skip queries that fail to parse
      console.warn('Failed to parse query:', error);
    }
  }

  return frequency;
}

/**
 * Parse column reference to extract table and column name
 */
function parseColumnReference(colRef: string, defaultTable: string): { table: string; column: string } {
  if (colRef.includes('.')) {
    const parts = colRef.split('.');
    return { table: parts[0], column: parts[1] };
  }
  return { table: defaultTable, column: colRef };
}

