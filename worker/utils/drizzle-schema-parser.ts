/**
 * Drizzle Schema Parser
 * 
 * Parses Drizzle ORM TypeScript schema files to extract table and column definitions.
 * This is a simplified parser that handles common Drizzle patterns.
 */

import { logInfo, logWarning } from './error-logger';

/**
 * Parsed column from Drizzle schema
 */
export interface ParsedColumn {
  name: string;
  type: string;
  drizzleType: string;
  isPrimaryKey: boolean;
  isAutoIncrement: boolean;
  isNotNull: boolean;
  isUnique: boolean;
  defaultValue: string | null;
  references: {
    table: string;
    column: string;
  } | null;
}

/**
 * Parsed table from Drizzle schema
 */
export interface ParsedTable {
  name: string;
  variableName: string;
  columns: ParsedColumn[];
}

/**
 * Result of parsing a Drizzle schema file
 */
export interface ParsedSchema {
  success: boolean;
  tables: ParsedTable[];
  errors: string[];
}

/**
 * Map Drizzle type to SQLite type
 */
function drizzleTypeToSqlite(drizzleType: string): string {
  switch (drizzleType.toLowerCase()) {
    case 'integer':
    case 'int':
      return 'INTEGER';
    case 'text':
      return 'TEXT';
    case 'real':
      return 'REAL';
    case 'blob':
      return 'BLOB';
    case 'numeric':
      return 'NUMERIC';
    default:
      return 'TEXT';
  }
}

/**
 * Parse column modifiers from a column definition string
 */
function parseColumnModifiers(columnDef: string): Partial<ParsedColumn> {
  const result: Partial<ParsedColumn> = {
    isPrimaryKey: false,
    isAutoIncrement: false,
    isNotNull: false,
    isUnique: false,
    defaultValue: null,
    references: null,
  };

  // Check for primaryKey
  if (/\.primaryKey\s*\(/.test(columnDef)) {
    result.isPrimaryKey = true;
    // Check for autoIncrement in primaryKey options
    if (/autoIncrement\s*:\s*true/.test(columnDef)) {
      result.isAutoIncrement = true;
    }
  }

  // Check for notNull
  if (/\.notNull\s*\(/.test(columnDef)) {
    result.isNotNull = true;
  }

  // Check for unique
  if (/\.unique\s*\(/.test(columnDef)) {
    result.isUnique = true;
  }

  // Check for default value
  const defaultMatch = /\.default\s*\(\s*(.+?)\s*\)/.exec(columnDef);
  if (defaultMatch?.[1]) {
    let defaultVal = defaultMatch[1].trim();
    // Handle sql`` template literals
    if (defaultVal.startsWith('sql`') && defaultVal.endsWith('`')) {
      defaultVal = defaultVal.slice(4, -1);
    } else if (defaultVal.startsWith('sql(') && defaultVal.endsWith(')')) {
      // Handle sql() function calls
      const innerMatch = /sql\s*\(\s*['"`](.+?)['"`]\s*\)/.exec(defaultVal);
      if (innerMatch?.[1]) {
        defaultVal = innerMatch[1];
      }
    }
    result.defaultValue = defaultVal;
  }

  // Check for references
  const refMatch = /\.references\s*\(\s*\(\s*\)\s*=>\s*(\w+)\.(\w+)/.exec(columnDef);
  if (refMatch?.[1] && refMatch[2]) {
    result.references = {
      table: refMatch[1],
      column: refMatch[2],
    };
  }

  return result;
}

/**
 * Parse a single column definition
 */
function parseColumn(columnName: string, columnDef: string): ParsedColumn | null {
  // Extract the type from the column definition
  // Patterns: integer('name'), text('name'), real('name'), blob('name'), numeric('name')
  const typeMatch = /^(\w+)\s*\(\s*['"]([^'"]+)['"]\s*\)/.exec(columnDef.trim());
  
  if (!typeMatch) {
    return null;
  }

  const drizzleType = typeMatch[1] ?? 'text';
  const declaredName = typeMatch[2] ?? columnName;
  
  const modifiers = parseColumnModifiers(columnDef);

  return {
    name: declaredName,
    type: drizzleTypeToSqlite(drizzleType),
    drizzleType,
    isPrimaryKey: modifiers.isPrimaryKey ?? false,
    isAutoIncrement: modifiers.isAutoIncrement ?? false,
    isNotNull: modifiers.isNotNull ?? false,
    isUnique: modifiers.isUnique ?? false,
    defaultValue: modifiers.defaultValue ?? null,
    references: modifiers.references ?? null,
  };
}

/**
 * Parse table columns from the table definition body
 */
function parseTableColumns(tableBody: string): ParsedColumn[] {
  const columns: ParsedColumn[] = [];
  
  // Normalize whitespace - replace newlines and multiple spaces with single space
  const body = tableBody.replace(/\s+/g, ' ').trim();
  
  // Split by commas that are followed by a word and colon (column definitions)
  // This handles: name: text('name').notNull(), email: text('email')
  const columnDefs: string[] = [];
  let depth = 0;
  let current = '';
  
  for (const char of body) {
    if (char === '(' || char === '{' || char === '[') {
      depth++;
      current += char;
    } else if (char === ')' || char === '}' || char === ']') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      // End of a column definition
      if (current.trim()) {
        columnDefs.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }
  
  // Don't forget the last column
  if (current.trim()) {
    columnDefs.push(current.trim());
  }
  
  // Parse each column definition
  for (const def of columnDefs) {
    // Match: columnName: type('name')...
    const match = /^(\w+)\s*:\s*((?:integer|text|real|blob|numeric|int)\s*\(.+)$/i.exec(def);
    
    if (match?.[1] && match[2]) {
      const column = parseColumn(match[1], match[2]);
      if (column) {
        columns.push(column);
      }
    }
  }

  return columns;
}

/**
 * Extract table body by matching braces properly
 */
function extractTableBody(content: string, startIndex: number): string | null {
  let depth = 0;
  let started = false;
  let bodyStart = -1;
  
  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];
    
    if (char === '{') {
      if (!started) {
        started = true;
        bodyStart = i + 1;
      }
      depth++;
    } else if (char === '}') {
      depth--;
      if (started && depth === 0) {
        return content.slice(bodyStart, i);
      }
    }
  }
  
  return null;
}

/**
 * Parse a Drizzle schema TypeScript file
 */
export function parseDrizzleSchema(schemaContent: string): ParsedSchema {
  const errors: string[] = [];
  const tables: ParsedTable[] = [];

  try {
    logInfo('Parsing Drizzle schema', { module: 'drizzle-parser', operation: 'parse' });

    // Remove single-line comments
    let content = schemaContent.replace(/\/\/.*$/gm, '');
    
    // Remove multi-line comments
    content = content.replace(/\/\*[\s\S]*?\*\//g, '');

    // Find all sqliteTable definitions - just the header part
    // Pattern: export const tableName = sqliteTable('table_name',
    const tableHeaderPattern = /export\s+const\s+(\w+)\s*=\s*sqliteTable\s*\(\s*['"]([^'"]+)['"]\s*,\s*/g;

    let headerMatch;
    while ((headerMatch = tableHeaderPattern.exec(content)) !== null) {
      const variableName = headerMatch[1];
      const tableName = headerMatch[2];
      const bodyStartIndex = headerMatch.index + headerMatch[0].length;

      if (!variableName || !tableName) {
        continue;
      }

      // Extract the table body by matching braces
      const tableBody = extractTableBody(content, bodyStartIndex);
      
      if (!tableBody) {
        errors.push(`Table '${tableName}' has malformed definition`);
        continue;
      }

      const columns = parseTableColumns(tableBody);

      if (columns.length === 0) {
        errors.push(`Table '${tableName}' has no parseable columns`);
        continue;
      }

      tables.push({
        name: tableName,
        variableName,
        columns,
      });

      logInfo(`Parsed table: ${tableName} with ${columns.length} columns`, {
        module: 'drizzle-parser',
        operation: 'parse',
        metadata: { tableName, columnCount: columns.length }
      });
    }

    if (tables.length === 0) {
      errors.push('No valid sqliteTable definitions found in schema');
    }

    return {
      success: errors.length === 0 || tables.length > 0,
      tables,
      errors,
    };
  } catch (error) {
    logWarning(`Schema parsing failed: ${error instanceof Error ? error.message : String(error)}`, {
      module: 'drizzle-parser',
      operation: 'parse'
    });

    return {
      success: false,
      tables: [],
      errors: [error instanceof Error ? error.message : 'Unknown parsing error'],
    };
  }
}

/**
 * Schema difference types
 */
export type SchemaDiffType = 
  | 'table_add'
  | 'table_drop'
  | 'column_add'
  | 'column_drop'
  | 'column_modify';

/**
 * Single schema difference
 */
export interface SchemaDiff {
  type: SchemaDiffType;
  tableName: string;
  columnName?: string;
  sql: string;
  warning?: string;
}

/**
 * Result of comparing two schemas
 */
export interface SchemaComparisonResult {
  success: boolean;
  differences: SchemaDiff[];
  sqlStatements: string[];
  summary: string;
  warnings: string[];
}

/**
 * Compare uploaded schema against current database schema
 */
export function compareSchemas(
  uploadedSchema: ParsedTable[],
  currentSchema: ParsedTable[]
): SchemaComparisonResult {
  const differences: SchemaDiff[] = [];
  const warnings: string[] = [];

  const currentTableNames = new Set(currentSchema.map(t => t.name));
  const uploadedTableNames = new Set(uploadedSchema.map(t => t.name));

  // Find new tables (in uploaded but not in current)
  for (const uploadedTable of uploadedSchema) {
    if (!currentTableNames.has(uploadedTable.name)) {
      // Generate CREATE TABLE statement
      const columnDefs = uploadedTable.columns.map(col => {
        let def = `"${col.name}" ${col.type}`;
        if (col.isPrimaryKey) {
          def += ' PRIMARY KEY';
          if (col.isAutoIncrement) {
            def += ' AUTOINCREMENT';
          }
        }
        if (col.isNotNull && !col.isPrimaryKey) {
          def += ' NOT NULL';
        }
        if (col.isUnique && !col.isPrimaryKey) {
          def += ' UNIQUE';
        }
        if (col.defaultValue !== null) {
          def += ` DEFAULT ${col.defaultValue}`;
        }
        return def;
      });

      const sql = `CREATE TABLE "${uploadedTable.name}" (\n  ${columnDefs.join(',\n  ')}\n);`;

      differences.push({
        type: 'table_add',
        tableName: uploadedTable.name,
        sql,
      });
    }
  }

  // Find dropped tables (in current but not in uploaded)
  for (const currentTable of currentSchema) {
    if (!uploadedTableNames.has(currentTable.name)) {
      differences.push({
        type: 'table_drop',
        tableName: currentTable.name,
        sql: `DROP TABLE "${currentTable.name}";`,
        warning: `This will permanently delete the '${currentTable.name}' table and all its data`,
      });
      warnings.push(`Table '${currentTable.name}' will be dropped`);
    }
  }

  // Find column differences in existing tables
  for (const uploadedTable of uploadedSchema) {
    const currentTable = currentSchema.find(t => t.name === uploadedTable.name);
    if (!currentTable) continue;

    const currentColNames = new Set(currentTable.columns.map(c => c.name));
    const uploadedColNames = new Set(uploadedTable.columns.map(c => c.name));

    // New columns
    for (const uploadedCol of uploadedTable.columns) {
      if (!currentColNames.has(uploadedCol.name)) {
        let sql = `ALTER TABLE "${uploadedTable.name}" ADD COLUMN "${uploadedCol.name}" ${uploadedCol.type}`;
        
        // SQLite restrictions: can't add NOT NULL without default, can't add PRIMARY KEY
        if (uploadedCol.isPrimaryKey) {
          warnings.push(`Cannot add PRIMARY KEY column '${uploadedCol.name}' to existing table '${uploadedTable.name}' - requires table rebuild`);
          continue;
        }
        
        if (uploadedCol.isNotNull && uploadedCol.defaultValue === null) {
          warnings.push(`Column '${uploadedCol.name}' is NOT NULL without default - adding with default NULL instead`);
        } else {
          if (uploadedCol.isNotNull) {
            sql += ' NOT NULL';
          }
        }
        
        if (uploadedCol.isUnique) {
          sql += ' UNIQUE';
        }
        
        if (uploadedCol.defaultValue !== null) {
          sql += ` DEFAULT ${uploadedCol.defaultValue}`;
        }
        
        sql += ';';

        differences.push({
          type: 'column_add',
          tableName: uploadedTable.name,
          columnName: uploadedCol.name,
          sql,
        });
      }
    }

    // Dropped columns
    for (const currentCol of currentTable.columns) {
      if (!uploadedColNames.has(currentCol.name)) {
        differences.push({
          type: 'column_drop',
          tableName: currentTable.name,
          columnName: currentCol.name,
          sql: `ALTER TABLE "${currentTable.name}" DROP COLUMN "${currentCol.name}";`,
          warning: `This will permanently delete column '${currentCol.name}' and its data`,
        });
        warnings.push(`Column '${currentTable.name}.${currentCol.name}' will be dropped`);
      }
    }

    // Modified columns (type changes, constraint changes)
    for (const uploadedCol of uploadedTable.columns) {
      const currentCol = currentTable.columns.find(c => c.name === uploadedCol.name);
      if (!currentCol) continue;

      // Check for type changes
      if (currentCol.type !== uploadedCol.type) {
        warnings.push(`Column '${uploadedTable.name}.${uploadedCol.name}' type change from ${currentCol.type} to ${uploadedCol.type} requires table rebuild`);
      }

      // Check for constraint changes
      if (currentCol.isNotNull !== uploadedCol.isNotNull) {
        warnings.push(`Column '${uploadedTable.name}.${uploadedCol.name}' NOT NULL constraint change requires table rebuild`);
      }
    }
  }

  // Generate summary
  const addedTables = differences.filter(d => d.type === 'table_add').length;
  const droppedTables = differences.filter(d => d.type === 'table_drop').length;
  const addedCols = differences.filter(d => d.type === 'column_add').length;
  const droppedCols = differences.filter(d => d.type === 'column_drop').length;

  const parts: string[] = [];
  if (addedTables > 0) parts.push(`${addedTables} table(s) to create`);
  if (droppedTables > 0) parts.push(`${droppedTables} table(s) to drop`);
  if (addedCols > 0) parts.push(`${addedCols} column(s) to add`);
  if (droppedCols > 0) parts.push(`${droppedCols} column(s) to drop`);

  const summary = parts.length > 0 ? parts.join(', ') : 'No changes detected';

  return {
    success: true,
    differences,
    sqlStatements: differences.map(d => d.sql),
    summary,
    warnings,
  };
}
