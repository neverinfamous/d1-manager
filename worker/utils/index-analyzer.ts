/**
 * Index Analyzer Engine
 * 
 * Analyzes database schema and query patterns to recommend optimal indexes
 */

import type { Env, IndexRecommendation, IndexAnalysisResult, ColumnInfo, TableInfo, QueryHistoryEntry } from '../types';
import { analyzeQueryPatterns, type ColumnUsageFrequency } from './query-parser';
import { sanitizeIdentifier } from './helpers';

interface ForeignKeyInfo {
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
}

interface ExistingIndex {
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

interface IndexColumn {
  seqno: number;
  cid: number;
  name: string;
}

/**
 * Analyze database and generate index recommendations
 */
export async function analyzeIndexes(
  dbId: string,
  env: Env,
  isLocalDev: boolean
): Promise<IndexAnalysisResult> {
  const recommendations: IndexRecommendation[] = [];
  const existingIndexes: Array<{
    tableName: string;
    indexes: Array<{ name: string; columns: string[]; unique: boolean }>;
  }> = [];

  // Get all tables in the database
  const tables = await getTables(dbId, env, isLocalDev);
  
  // Get query history for pattern analysis
  const queryFrequency = await getQueryPatterns(dbId, env, isLocalDev);

  let tablesWithoutIndexes = 0;

  for (const table of tables) {
    // Get existing indexes for this table
    const tableIndexes = await getTableIndexes(dbId, table.name, env, isLocalDev);
    const indexedColumns = new Set<string>();
    
    // Store existing indexes
    const indexList: Array<{ name: string; columns: string[]; unique: boolean }> = [];
    for (const idx of tableIndexes) {
      const indexColumns = await getIndexColumns(dbId, table.name, idx.name, env, isLocalDev);
      indexList.push({
        name: idx.name,
        columns: indexColumns,
        unique: idx.unique === 1,
      });
      
      // Track which columns are already indexed
      indexColumns.forEach(col => indexedColumns.add(col));
    }
    
    existingIndexes.push({
      tableName: table.name,
      indexes: indexList,
    });

    if (indexList.length === 0) {
      tablesWithoutIndexes++;
    }

    // Get table schema (columns)
    const columns = await getTableColumns(dbId, table.name, env, isLocalDev);
    
    // Get foreign key relationships
    const foreignKeys = await getForeignKeys(dbId, table.name, env, isLocalDev);

    // Analyze schema for recommendations
    const schemaRecommendations = analyzeSchemaForIndexes(
      table.name,
      columns,
      foreignKeys,
      indexedColumns
    );

    // Analyze query patterns for recommendations
    const queryRecommendations = analyzeQueryPatternsForIndexes(
      table.name,
      columns,
      queryFrequency,
      indexedColumns
    );

    // Combine and deduplicate recommendations
    const allRecommendations = [...schemaRecommendations, ...queryRecommendations];
    const uniqueRecommendations = deduplicateRecommendations(allRecommendations);

    recommendations.push(...uniqueRecommendations);
  }

  // Calculate statistics
  const statistics = {
    totalRecommendations: recommendations.length,
    tablesWithoutIndexes,
    averageQueryEfficiency: await calculateAverageQueryEfficiency(dbId, env, isLocalDev),
  };

  return {
    recommendations: sortRecommendationsByPriority(recommendations),
    existingIndexes,
    statistics,
  };
}

/**
 * Get all tables in a database
 */
async function getTables(dbId: string, env: Env, isLocalDev: boolean): Promise<TableInfo[]> {
  if (isLocalDev) {
    return [
      { name: 'users', type: 'table', ncol: 5, wr: 0, strict: 0 },
      { name: 'posts', type: 'table', ncol: 7, wr: 0, strict: 0 },
      { name: 'comments', type: 'table', ncol: 4, wr: 0, strict: 0 },
    ];
  }

  const query = "PRAGMA table_list";
  const result = await executeQueryViaAPI(dbId, query, env);
  return (result.results as TableInfo[]).filter(
    (table: TableInfo) => !table.name.startsWith('sqlite_') && !table.name.startsWith('_cf_')
  );
}

/**
 * Get table columns
 */
async function getTableColumns(dbId: string, tableName: string, env: Env, isLocalDev: boolean): Promise<ColumnInfo[]> {
  if (isLocalDev) {
    return [
      { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 },
      { cid: 1, name: 'email', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: 'name', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
      { cid: 3, name: 'created_at', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
    ];
  }

  const sanitizedTable = sanitizeIdentifier(tableName);
  const query = `PRAGMA table_info("${sanitizedTable}")`;
  const result = await executeQueryViaAPI(dbId, query, env);
  return result.results as ColumnInfo[];
}

/**
 * Get foreign keys for a table
 */
async function getForeignKeys(dbId: string, tableName: string, env: Env, isLocalDev: boolean): Promise<ForeignKeyInfo[]> {
  if (isLocalDev) {
    return [];
  }

  const sanitizedTable = sanitizeIdentifier(tableName);
  const query = `PRAGMA foreign_key_list("${sanitizedTable}")`;
  const result = await executeQueryViaAPI(dbId, query, env);
  return result.results as ForeignKeyInfo[];
}

/**
 * Get existing indexes for a table
 */
async function getTableIndexes(dbId: string, tableName: string, env: Env, isLocalDev: boolean): Promise<ExistingIndex[]> {
  if (isLocalDev) {
    return [
      { name: 'idx_users_email', unique: 1, origin: 'c', partial: 0 },
    ];
  }

  const sanitizedTable = sanitizeIdentifier(tableName);
  const query = `PRAGMA index_list("${sanitizedTable}")`;
  const result = await executeQueryViaAPI(dbId, query, env);
  return result.results as ExistingIndex[];
}

/**
 * Get columns in an index
 */
async function getIndexColumns(dbId: string, _tableName: string, indexName: string, env: Env, isLocalDev: boolean): Promise<string[]> {
  if (isLocalDev) {
    return ['email'];
  }

  const sanitizedIndex = sanitizeIdentifier(indexName);
  const query = `PRAGMA index_info("${sanitizedIndex}")`;
  const result = await executeQueryViaAPI(dbId, query, env);
  const indexColumns = result.results as IndexColumn[];
  return indexColumns.map(col => col.name);
}

/**
 * Analyze schema for index recommendations
 */
function analyzeSchemaForIndexes(
  tableName: string,
  columns: ColumnInfo[],
  foreignKeys: ForeignKeyInfo[],
  indexedColumns: Set<string>
): IndexRecommendation[] {
  const recommendations: IndexRecommendation[] = [];

  // Check foreign key columns
  for (const fk of foreignKeys) {
    if (!indexedColumns.has(fk.from)) {
      const column = columns.find(c => c.name === fk.from);
      if (column) {
        recommendations.push({
          tableName,
          columnName: fk.from,
          indexType: 'single',
          priority: 'high',
          rationale: `Foreign key column referencing ${fk.table}.${fk.to}. Indexes on foreign keys significantly improve JOIN performance.`,
          estimatedImpact: 'High - Foreign key lookups will be much faster, especially for JOINs',
          suggestedSQL: `CREATE INDEX idx_${tableName}_${fk.from} ON ${tableName}(${fk.from});`,
        });
      }
    }
  }

  // Check TEXT and INTEGER columns that aren't primary keys (common filter columns)
  for (const column of columns) {
    // Skip primary keys (auto-indexed), already indexed columns
    if (column.pk === 1 || indexedColumns.has(column.name)) continue;

    const columnType = column.type.toUpperCase();
    
    // TEXT columns are common filter targets (email, username, status, etc.)
    if (columnType === 'TEXT' && column.notnull === 1) {
      recommendations.push({
        tableName,
        columnName: column.name,
        indexType: 'single',
        priority: 'medium',
        rationale: `Non-null TEXT column. Commonly used for filtering (e.g., usernames, emails, status fields).`,
        estimatedImpact: 'Medium - Improves WHERE clause performance on text lookups',
        suggestedSQL: `CREATE INDEX idx_${tableName}_${column.name} ON ${tableName}(${column.name});`,
      });
    }
    
    // INTEGER columns (other than PK) might be foreign keys or status codes
    if ((columnType === 'INTEGER' || columnType === 'INT') && column.name !== 'id') {
      recommendations.push({
        tableName,
        columnName: column.name,
        indexType: 'single',
        priority: 'low',
        rationale: `Integer column that may be used for filtering or relationships.`,
        estimatedImpact: 'Low to Medium - Depends on query patterns',
        suggestedSQL: `CREATE INDEX idx_${tableName}_${column.name} ON ${tableName}(${column.name});`,
      });
    }
  }

  return recommendations;
}

/**
 * Analyze query patterns for index recommendations
 */
function analyzeQueryPatternsForIndexes(
  tableName: string,
  columns: ColumnInfo[],
  queryFrequency: ColumnUsageFrequency,
  indexedColumns: Set<string>
): IndexRecommendation[] {
  const recommendations: IndexRecommendation[] = [];

  // Check if we have query data for this table
  const tableFrequency = queryFrequency[tableName];
  if (!tableFrequency) return recommendations;

  // Analyze each column's usage
  for (const [columnName, usage] of Object.entries(tableFrequency)) {
    if (indexedColumns.has(columnName)) continue;

    const column = columns.find(c => c.name === columnName);
    if (!column || column.pk === 1) continue;

    // High-frequency WHERE clause usage
    if (usage.whereCount >= 3) {
      recommendations.push({
        tableName,
        columnName,
        indexType: 'single',
        priority: 'high',
        rationale: `Used in WHERE clause ${usage.whereCount} times in recent queries. High filter frequency indicates strong indexing candidate.`,
        estimatedImpact: 'High - Will significantly speed up filtered queries',
        suggestedSQL: `CREATE INDEX idx_${tableName}_${columnName} ON ${tableName}(${columnName});`,
      });
    } else if (usage.whereCount >= 1) {
      recommendations.push({
        tableName,
        columnName,
        indexType: 'single',
        priority: 'medium',
        rationale: `Used in WHERE clause ${usage.whereCount} time(s) in recent queries.`,
        estimatedImpact: 'Medium - Will improve filtered query performance',
        suggestedSQL: `CREATE INDEX idx_${tableName}_${columnName} ON ${tableName}(${columnName});`,
      });
    }

    // JOIN column usage
    if (usage.joinCount >= 2) {
      recommendations.push({
        tableName,
        columnName,
        indexType: 'single',
        priority: 'high',
        rationale: `Used in JOIN conditions ${usage.joinCount} times. Indexes on join columns are critical for performance.`,
        estimatedImpact: 'High - Dramatically improves JOIN performance',
        suggestedSQL: `CREATE INDEX idx_${tableName}_${columnName} ON ${tableName}(${columnName});`,
      });
    }

    // ORDER BY usage
    if (usage.orderByCount >= 2) {
      recommendations.push({
        tableName,
        columnName,
        indexType: 'single',
        priority: 'medium',
        rationale: `Used in ORDER BY clause ${usage.orderByCount} times. Indexes can avoid full table sorts.`,
        estimatedImpact: 'Medium - Speeds up sorted result retrieval',
        suggestedSQL: `CREATE INDEX idx_${tableName}_${columnName} ON ${tableName}(${columnName});`,
      });
    }
  }

  return recommendations;
}

/**
 * Get query patterns from history
 */
async function getQueryPatterns(dbId: string, env: Env, isLocalDev: boolean): Promise<ColumnUsageFrequency> {
  if (isLocalDev) {
    // Return mock query patterns for local dev
    return {
      users: {
        email: { whereCount: 5, joinCount: 0, orderByCount: 0, groupByCount: 0, totalCount: 5 },
        created_at: { whereCount: 2, joinCount: 0, orderByCount: 3, groupByCount: 0, totalCount: 5 },
      },
      posts: {
        user_id: { whereCount: 0, joinCount: 4, orderByCount: 0, groupByCount: 0, totalCount: 4 },
      },
    };
  }

  try {
    // Query the metadata database for recent queries
    const result = await env.METADATA.prepare(
      'SELECT query FROM query_history WHERE database_id = ? AND error IS NULL ORDER BY executed_at DESC LIMIT 100'
    ).bind(dbId).all();

    const queries = (result.results as unknown as QueryHistoryEntry[]).map(entry => ({
      query: entry.query,
    }));

    return analyzeQueryPatterns(queries);
  } catch (err) {
    console.error('[IndexAnalyzer] Failed to fetch query history:', err);
    return {};
  }
}

/**
 * Calculate average query efficiency from history
 */
async function calculateAverageQueryEfficiency(_dbId: string, _env: Env, isLocalDev: boolean): Promise<number | undefined> {
  if (isLocalDev) {
    return 0.65;
  }

  try {
    // This would require storing rows_read and rows_returned in query history
    // For now, return undefined as we don't have this data
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Deduplicate recommendations
 */
function deduplicateRecommendations(recommendations: IndexRecommendation[]): IndexRecommendation[] {
  const seen = new Set<string>();
  const unique: IndexRecommendation[] = [];

  for (const rec of recommendations) {
    const key = `${rec.tableName}.${rec.columnName}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(rec);
    }
  }

  return unique;
}

/**
 * Sort recommendations by priority
 */
function sortRecommendationsByPriority(recommendations: IndexRecommendation[]): IndexRecommendation[] {
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

/**
 * Execute query via Cloudflare D1 REST API
 */
async function executeQueryViaAPI(
  dbId: string,
  query: string,
  env: Env
): Promise<{ results: unknown[]; meta?: Record<string, unknown> }> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql: query }),
    }
  );

  if (!response.ok) {
    throw new Error(`D1 API error: ${response.statusText}`);
  }

  const data = await response.json() as {
    success: boolean;
    result: Array<{ results: unknown[]; meta?: Record<string, unknown> }>;
  };

  if (!data.success || !data.result || data.result.length === 0) {
    throw new Error('Invalid D1 API response');
  }

  return data.result[0];
}

