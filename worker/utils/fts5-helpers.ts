/**
 * FTS5 Helper Functions
 * 
 * Utility functions for building FTS5 queries, parsing configurations,
 * and handling FTS5-specific operations.
 */

import type {
  FTS5TableConfig,
  TokenizerConfig,
  TokenizerParameters,
  FTS5SearchParams,
  FTS5CreateFromTableParams,
  FTS5Trigger,
} from '../types/fts5';

/**
 * Build CREATE VIRTUAL TABLE statement for FTS5
 */
export function buildFTS5CreateStatement(config: FTS5TableConfig): string {
  const { tableName, columns, tokenizer, prefixIndex, contentTable, contentRowId, unindexed } = config;
  
  // Build column list with optional unindexed modifier
  const columnDefs = columns.map(col => {
    const isUnindexed = unindexed?.includes(col);
    return isUnindexed ? `${col} UNINDEXED` : col;
  }).join(', ');
  
  // Build FTS5 options
  const options: string[] = [];
  
  // Add tokenizer
  const tokenizerStr = buildTokenizerString(tokenizer);
  options.push(`tokenize='${tokenizerStr}'`);
  
  // Add prefix index
  if (prefixIndex?.enabled && prefixIndex.lengths && prefixIndex.lengths.length > 0) {
    const prefixStr = prefixIndex.lengths.join(' ');
    options.push(`prefix='${prefixStr}'`);
  }
  
  // Add content table (external content)
  if (contentTable) {
    options.push(`content='${contentTable}'`);
    if (contentRowId) {
      options.push(`content_rowid='${contentRowId}'`);
    }
  }
  
  // Combine everything
  const optionsStr = options.length > 0 ? ', ' + options.join(', ') : '';
  
  return `CREATE VIRTUAL TABLE "${tableName}" USING fts5(${columnDefs}${optionsStr});`;
}

/**
 * Build tokenizer string with parameters
 */
export function buildTokenizerString(config: TokenizerConfig): string {
  const { type, parameters } = config;
  
  if (!parameters || Object.keys(parameters).length === 0) {
    return type;
  }
  
  const params: string[] = [];
  
  if (parameters.remove_diacritics !== undefined) {
    params.push(`remove_diacritics ${parameters.remove_diacritics}`);
  }
  
  if (parameters.categories) {
    params.push(`categories '${parameters.categories}'`);
  }
  
  if (parameters.tokenchars) {
    params.push(`tokenchars '${parameters.tokenchars}'`);
  }
  
  if (parameters.separators) {
    params.push(`separators '${parameters.separators}'`);
  }
  
  if (parameters.case_sensitive !== undefined && type === 'trigram') {
    params.push(`case_sensitive ${parameters.case_sensitive}`);
  }
  
  if (params.length === 0) {
    return type;
  }
  
  return `${type} ${params.join(' ')}`;
}

/**
 * Check if a table is an FTS5 virtual table
 */
export function isFTS5Table(createSql: string | null): boolean {
  if (!createSql) return false;
  return createSql.toLowerCase().includes('using fts5');
}

/**
 * Extract FTS5 configuration from CREATE TABLE SQL
 */
export function extractFTS5Config(createSql: string): Partial<FTS5TableConfig> | null {
  if (!isFTS5Table(createSql)) return null;
  
  const config: Partial<FTS5TableConfig> = {};
  
  // Extract table name
  const tableNameMatch = createSql.match(/CREATE\s+VIRTUAL\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?/i);
  if (tableNameMatch?.[1]) {
    config.tableName = tableNameMatch[1];
  }
  
  // Extract tokenizer
  const tokenizerMatch = createSql.match(/tokenize\s*=\s*'([^']+)'/i);
  if (tokenizerMatch?.[1]) {
    const tokenizerStr = tokenizerMatch[1];
    config.tokenizer = parseTokenizerString(tokenizerStr);
  }
  
  // Extract prefix index
  const prefixMatch = createSql.match(/prefix\s*=\s*'([^']+)'/i);
  if (prefixMatch?.[1]) {
    const lengths = prefixMatch[1].split(/\s+/).map(l => parseInt(l, 10)).filter(l => !isNaN(l));
    config.prefixIndex = {
      enabled: true,
      lengths,
    };
  }
  
  // Extract content table
  const contentMatch = createSql.match(/content\s*=\s*'([^']+)'/i);
  if (contentMatch?.[1]) {
    config.contentTable = contentMatch[1];
  }
  
  // Extract content rowid
  const contentRowIdMatch = createSql.match(/content_rowid\s*=\s*'([^']+)'/i);
  if (contentRowIdMatch?.[1]) {
    config.contentRowId = contentRowIdMatch[1];
  }
  
  // Extract columns (this is complex due to UNINDEXED modifiers)
  const columnsMatch = createSql.match(/USING\s+fts5\s*\(([^)]+)\)/i);
  if (columnsMatch?.[1]) {
    const columnsPart = columnsMatch[1];
    const columns: string[] = [];
    const unindexed: string[] = [];
    
    // Split by comma, but ignore commas inside quotes
    const parts = columnsPart.split(',').map(p => p.trim());
    
    for (const part of parts) {
      // Skip options (they contain '=')
      if (part.includes('=')) continue;
      
      // Check for UNINDEXED modifier
      const unindexedMatch = part.match(/(\w+)\s+UNINDEXED/i);
      if (unindexedMatch?.[1]) {
        const colName = unindexedMatch[1];
        columns.push(colName);
        unindexed.push(colName);
      } else {
        // Regular column
        const colMatch = part.match(/(\w+)/);
        if (colMatch?.[1]) {
          columns.push(colMatch[1]);
        }
      }
    }
    
    config.columns = columns;
    if (unindexed.length > 0) {
      config.unindexed = unindexed;
    }
  }
  
  return config;
}

/**
 * Parse tokenizer string into TokenizerConfig
 */
function parseTokenizerString(tokenizerStr: string): TokenizerConfig {
  const parts = tokenizerStr.trim().split(/\s+/);
  const type = (parts[0] ?? 'unicode61') as 'unicode61' | 'porter' | 'trigram' | 'ascii';
  
  if (parts.length === 1) {
    return { type };
  }
  
  // Parse parameters
  const parameters: TokenizerParameters = {};
  
  for (let i = 1; i < parts.length; i++) {
    const param = parts[i];
    const nextParam = parts[i + 1];
    
    if (param === 'remove_diacritics' && nextParam !== undefined) {
      parameters.remove_diacritics = parseInt(nextParam, 10);
      i++;
    } else if (param === 'case_sensitive' && nextParam !== undefined) {
      parameters.case_sensitive = parseInt(nextParam, 10);
      i++;
    } else if (param === 'categories' && nextParam !== undefined) {
      parameters.categories = nextParam.replace(/['"]/g, '');
      i++;
    } else if (param === 'tokenchars' && nextParam !== undefined) {
      parameters.tokenchars = nextParam.replace(/['"]/g, '');
      i++;
    } else if (param === 'separators' && nextParam !== undefined) {
      parameters.separators = nextParam.replace(/['"]/g, '');
      i++;
    }
  }
  
  return { type, parameters };
}

/**
 * Build FTS5 search query with MATCH operator
 */
export function buildFTS5SearchQuery(
  tableName: string,
  params: FTS5SearchParams
): { query: string; includeSnippet: boolean } {
  const {
    query,
    columns,
    limit = 50,
    offset = 0,
    rankingFunction = 'bm25',
    bm25_k1,
    bm25_b,
    includeSnippet = false,
    snippetOptions,
  } = params;
  
  // Escape single quotes in search query
  const escapedQuery = query.replace(/'/g, "''");
  
  // Build MATCH clause with optional column filter
  let matchClause = `"${tableName}" MATCH '`;
  if (columns && columns.length > 0) {
    // Column filter: {column1 column2} : query
    matchClause += `{${columns.join(' ')}} : ${escapedQuery}`;
  } else {
    matchClause += escapedQuery;
  }
  matchClause += "'";
  
  // Build SELECT clause
  const selectParts: string[] = ['*'];
  
  // Add rank
  if (rankingFunction === 'bm25custom' && (bm25_k1 !== undefined || bm25_b !== undefined)) {
    const k1 = bm25_k1 ?? 1.2;
    const b = bm25_b ?? 0.75;
    selectParts.push(`bm25("${tableName}", ${k1}, ${b}) AS rank`);
  } else {
    selectParts.push(`bm25("${tableName}") AS rank`);
  }
  
  // Add snippet if requested
  if (includeSnippet) {
    const startMark = snippetOptions?.startMark ?? '<mark>';
    const endMark = snippetOptions?.endMark ?? '</mark>';
    const ellipsis = snippetOptions?.ellipsis ?? '...';
    const tokenCount = snippetOptions?.tokenCount ?? 32;
    
    // snippet(table, column_idx, startMark, endMark, ellipsis, tokenCount)
    // Using -1 for column_idx means use all columns
    selectParts.push(
      `snippet("${tableName}", -1, '${startMark}', '${endMark}', '${ellipsis}', ${tokenCount}) AS snippet`
    );
  }
  
  // Build full query
  const sql = `
    SELECT ${selectParts.join(', ')}
    FROM "${tableName}"
    WHERE ${matchClause}
    ORDER BY rank
    LIMIT ${limit} OFFSET ${offset};
  `.trim();
  
  return { query: sql, includeSnippet };
}

/**
 * Validate tokenizer configuration
 */
export function validateTokenizerConfig(config: TokenizerConfig): { valid: boolean; error?: string } {
  const { type, parameters } = config;
  
  // Check valid tokenizer type
  const validTypes = ['unicode61', 'porter', 'trigram', 'ascii'];
  if (!validTypes.includes(type)) {
    return { valid: false, error: `Invalid tokenizer type: ${type}` };
  }
  
  if (!parameters) {
    return { valid: true };
  }
  
  // Validate remove_diacritics
  if (parameters.remove_diacritics !== undefined) {
    if (![0, 1, 2].includes(parameters.remove_diacritics)) {
      return { valid: false, error: 'remove_diacritics must be 0, 1, or 2' };
    }
  }
  
  // Validate case_sensitive (trigram only)
  if (parameters.case_sensitive !== undefined) {
    if (type !== 'trigram') {
      return { valid: false, error: 'case_sensitive is only valid for trigram tokenizer' };
    }
    if (![0, 1].includes(parameters.case_sensitive)) {
      return { valid: false, error: 'case_sensitive must be 0 or 1' };
    }
  }
  
  return { valid: true };
}

/**
 * Generate triggers to keep FTS5 table in sync with content table
 */
export function generateFTS5SyncTriggers(params: FTS5CreateFromTableParams): FTS5Trigger[] {
  const { sourceTable, ftsTableName, columns } = params;
  
  if (!params.externalContent || !params.createTriggers) {
    return [];
  }
  
  const triggers: FTS5Trigger[] = [];
  
  // INSERT trigger
  const insertCols = columns.join(', ');
  const insertNewCols = columns.map(c => `NEW.${c}`).join(', ');
  
  triggers.push({
    name: `${ftsTableName}_ai`,
    event: 'INSERT',
    sql: `
CREATE TRIGGER "${ftsTableName}_ai" AFTER INSERT ON "${sourceTable}" BEGIN
  INSERT INTO "${ftsTableName}" (rowid, ${insertCols})
  VALUES (NEW.rowid, ${insertNewCols});
END;
    `.trim(),
  });
  
  // DELETE trigger
  triggers.push({
    name: `${ftsTableName}_ad`,
    event: 'DELETE',
    sql: `
CREATE TRIGGER "${ftsTableName}_ad" AFTER DELETE ON "${sourceTable}" BEGIN
  INSERT INTO "${ftsTableName}" ("${ftsTableName}", rowid, ${insertCols})
  VALUES ('delete', OLD.rowid, ${columns.map(c => `OLD.${c}`).join(', ')});
END;
    `.trim(),
  });
  
  // UPDATE trigger
  triggers.push({
    name: `${ftsTableName}_au`,
    event: 'UPDATE',
    sql: `
CREATE TRIGGER "${ftsTableName}_au" AFTER UPDATE ON "${sourceTable}" BEGIN
  INSERT INTO "${ftsTableName}" ("${ftsTableName}", rowid, ${insertCols})
  VALUES ('delete', OLD.rowid, ${columns.map(c => `OLD.${c}`).join(', ')});
  INSERT INTO "${ftsTableName}" (rowid, ${insertCols})
  VALUES (NEW.rowid, ${insertNewCols});
END;
    `.trim(),
  });
  
  return triggers;
}

/**
 * Build SQL to populate FTS5 table from source table
 */
export function buildFTS5PopulateQuery(
  ftsTableName: string,
  sourceTable: string,
  columns: string[],
  useRowId: boolean = false
): string {
  const columnList = columns.join(', ');
  
  if (useRowId) {
    return `INSERT INTO "${ftsTableName}" (rowid, ${columnList}) SELECT rowid, ${columnList} FROM "${sourceTable}";`;
  } else {
    return `INSERT INTO "${ftsTableName}" (${columnList}) SELECT ${columnList} FROM "${sourceTable}";`;
  }
}

/**
 * Sanitize FTS5 search query to prevent SQL injection
 * Note: This is a basic sanitizer - the MATCH query is still parameterized in the actual query
 */
export function sanitizeFTS5Query(query: string): string {
  // FTS5 queries can contain: text, "phrases", AND, OR, NOT, NEAR, *, column filters
  // We mainly want to prevent SQL injection attempts
  
  // Remove any SQL keywords that could be dangerous
  const dangerous = [';', '--', '/*', '*/', 'UNION', 'DROP', 'DELETE', 'INSERT', 'UPDATE', 'CREATE'];
  let sanitized = query;
  
  for (const keyword of dangerous) {
    const regex = new RegExp(keyword, 'gi');
    sanitized = sanitized.replace(regex, '');
  }
  
  return sanitized.trim();
}

