/**
 * FTS5 Route Handlers
 * 
 * API endpoints for managing FTS5 virtual tables, performing searches,
 * and maintaining indexes.
 */

import type { Env } from '../types';
import type {
  FTS5TableConfig,
  FTS5SearchParams,
  FTS5SearchResponse,
  FTS5Stats,
  FTS5TableInfo,
  FTS5CreateFromTableParams,
} from '../types/fts5';
import {
  buildFTS5CreateStatement,
  buildFTS5SearchQuery,
  isFTS5Table,
  extractFTS5Config,
  validateTokenizerConfig,
  generateFTS5SyncTriggers,
  buildFTS5PopulateQuery,
  sanitizeFTS5Query,
} from '../utils/fts5-helpers';
import { sanitizeIdentifier } from '../utils/helpers';
import { isProtectedDatabase, createProtectedDatabaseResponse, getDatabaseInfo } from '../utils/database-protection';

export async function handleFTS5Routes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean
): Promise<Response> {
  console.log('[FTS5] Handling FTS5 operation');
  
  // Extract database ID from URL (format: /api/fts5/:dbId/...)
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
      console.warn('[FTS5] Attempted to access protected database:', dbInfo.name);
      return createProtectedDatabaseResponse(corsHeaders);
    }
  }
  
  try {
    // List FTS5 tables in database
    if (request.method === 'GET' && url.pathname === `/api/fts5/${dbId}/list`) {
      console.log('[FTS5] Listing FTS5 tables for database:', dbId);
      
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: [
            {
              name: 'articles_fts',
              type: 'fts5',
              columns: ['title', 'content', 'author'],
              tokenizer: { type: 'porter', parameters: { remove_diacritics: 1 } },
              rowCount: 1250,
              indexSize: 524288,
              prefixIndex: { enabled: true, lengths: [2, 3] },
            },
            {
              name: 'products_fts',
              type: 'fts5',
              columns: ['name', 'description'],
              tokenizer: { type: 'unicode61' },
              contentTable: 'products',
              rowCount: 458,
              indexSize: 196608,
            },
          ] as FTS5TableInfo[],
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Get all tables
      const tableListQuery = "PRAGMA table_list";
      const tableListResult = await executeQueryViaAPI(dbId, tableListQuery, env);
      const allTables = (tableListResult.results as Array<{ name: string; type: string }>)
        .filter(t => !t.name.startsWith('sqlite_') && !t.name.startsWith('_cf_'));
      
      const fts5Tables: FTS5TableInfo[] = [];
      
      for (const table of allTables) {
        // Get CREATE statement to check if it's FTS5
        const createQuery = `SELECT sql FROM sqlite_master WHERE type='table' AND name='${sanitizeIdentifier(table.name)}'`;
        const createResult = await executeQueryViaAPI(dbId, createQuery, env);
        const createSql = (createResult.results[0] as { sql: string })?.sql;
        
        if (isFTS5Table(createSql)) {
          const config = extractFTS5Config(createSql);
          
          // Get row count
          const countQuery = `SELECT COUNT(*) as count FROM "${sanitizeIdentifier(table.name)}"`;
          const countResult = await executeQueryViaAPI(dbId, countQuery, env);
          const rowCount = (countResult.results[0] as { count: number })?.count || 0;
          
          const tableInfo: FTS5TableInfo = {
            name: table.name,
            type: 'fts5',
            columns: config?.columns || [],
            tokenizer: config?.tokenizer || { type: 'unicode61' },
            rowCount,
          };
          if (config?.contentTable) {
            tableInfo.contentTable = config.contentTable;
          }
          if (config?.prefixIndex) {
            tableInfo.prefixIndex = config.prefixIndex;
          }
          fts5Tables.push(tableInfo);
        }
      }
      
      return new Response(JSON.stringify({
        result: fts5Tables,
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Create new FTS5 table
    if (request.method === 'POST' && url.pathname === `/api/fts5/${dbId}/create`) {
      console.log('[FTS5] Creating FTS5 table');
      
      const body = await request.json() as FTS5TableConfig;
      
      // Validate tokenizer config
      const validation = validateTokenizerConfig(body.tokenizer);
      if (!validation.valid) {
        return new Response(JSON.stringify({ 
          error: validation.error 
        }), { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: { tableName: body.tableName, created: true },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Build and execute CREATE VIRTUAL TABLE statement
      const createSQL = buildFTS5CreateStatement(body);
      await executeQueryViaAPI(dbId, createSQL, env);
      
      return new Response(JSON.stringify({
        result: { tableName: body.tableName, created: true },
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Create FTS5 table from existing table
    if (request.method === 'POST' && url.pathname === `/api/fts5/${dbId}/create-from-table`) {
      console.log('[FTS5] Creating FTS5 table from existing table');
      
      const body = await request.json() as FTS5CreateFromTableParams;
      
      // Validate tokenizer config
      const validation = validateTokenizerConfig(body.tokenizer);
      if (!validation.valid) {
        return new Response(JSON.stringify({ 
          error: validation.error 
        }), { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: { 
            ftsTableName: body.ftsTableName, 
            created: true,
            triggersCreated: body.createTriggers || false
          },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Build FTS5 config
      const ftsConfig: FTS5TableConfig = {
        tableName: body.ftsTableName,
        columns: body.columns,
        tokenizer: body.tokenizer,
      };
      if (body.prefixIndex) {
        ftsConfig.prefixIndex = body.prefixIndex;
      }
      
      if (body.externalContent) {
        ftsConfig.contentTable = body.sourceTable;
        ftsConfig.contentRowId = 'rowid';
      }
      
      // Create FTS5 table
      const createSQL = buildFTS5CreateStatement(ftsConfig);
      await executeQueryViaAPI(dbId, createSQL, env);
      
      // Populate FTS5 table
      const populateSQL = buildFTS5PopulateQuery(
        body.ftsTableName,
        body.sourceTable,
        body.columns,
        body.externalContent
      );
      await executeQueryViaAPI(dbId, populateSQL, env);
      
      // Create triggers if requested
      let triggersCreated = false;
      if (body.createTriggers && body.externalContent) {
        const triggers = generateFTS5SyncTriggers(body);
        for (const trigger of triggers) {
          await executeQueryViaAPI(dbId, trigger.sql, env);
        }
        triggersCreated = true;
      }
      
      return new Response(JSON.stringify({
        result: { 
          ftsTableName: body.ftsTableName, 
          created: true,
          triggersCreated
        },
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Get FTS5 table configuration
    if (request.method === 'GET' && url.pathname.match(/^\/api\/fts5\/[^/]+\/[^/]+\/config$/)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      console.log('[FTS5] Getting config for FTS5 table:', tableName);
      
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: {
            tableName,
            columns: ['title', 'content', 'author'],
            tokenizer: { type: 'porter', parameters: { remove_diacritics: 1 } },
            prefixIndex: { enabled: true, lengths: [2, 3] },
          } as Partial<FTS5TableConfig>,
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Get CREATE statement
      const createQuery = `SELECT sql FROM sqlite_master WHERE type='table' AND name='${sanitizeIdentifier(tableName)}'`;
      const createResult = await executeQueryViaAPI(dbId, createQuery, env);
      const createSql = (createResult.results[0] as { sql: string })?.sql;
      
      if (!isFTS5Table(createSql)) {
        return new Response(JSON.stringify({ 
          error: 'Table is not an FTS5 virtual table' 
        }), { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const config = extractFTS5Config(createSql);
      
      return new Response(JSON.stringify({
        result: config,
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Delete FTS5 table
    if (request.method === 'DELETE' && url.pathname.match(/^\/api\/fts5\/[^/]+\/[^/]+$/)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      console.log('[FTS5] Deleting FTS5 table:', tableName);
      
      if (isLocalDev) {
        return new Response(JSON.stringify({
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const sanitizedTable = sanitizeIdentifier(tableName);
      const dropQuery = `DROP TABLE "${sanitizedTable}"`;
      await executeQueryViaAPI(dbId, dropQuery, env);
      
      return new Response(JSON.stringify({
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Rebuild FTS5 index
    if (request.method === 'POST' && url.pathname.match(/^\/api\/fts5\/[^/]+\/[^/]+\/rebuild$/)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      console.log('[FTS5] Rebuilding FTS5 index for:', tableName);
      
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: { rebuilt: true },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const sanitizedTable = sanitizeIdentifier(tableName);
      const rebuildQuery = `INSERT INTO "${sanitizedTable}"("${sanitizedTable}") VALUES('rebuild')`;
      await executeQueryViaAPI(dbId, rebuildQuery, env);
      
      return new Response(JSON.stringify({
        result: { rebuilt: true },
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Optimize FTS5 index
    if (request.method === 'POST' && url.pathname.match(/^\/api\/fts5\/[^/]+\/[^/]+\/optimize$/)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      console.log('[FTS5] Optimizing FTS5 index for:', tableName);
      
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: { optimized: true },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const sanitizedTable = sanitizeIdentifier(tableName);
      const optimizeQuery = `INSERT INTO "${sanitizedTable}"("${sanitizedTable}") VALUES('optimize')`;
      await executeQueryViaAPI(dbId, optimizeQuery, env);
      
      return new Response(JSON.stringify({
        result: { optimized: true },
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Search FTS5 table
    if (request.method === 'POST' && url.pathname.match(/^\/api\/fts5\/[^/]+\/[^/]+\/search$/)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      console.log('[FTS5] Searching FTS5 table:', tableName);
      
      if (!tableName) {
        return new Response(JSON.stringify({ 
          error: 'Table name is required' 
        }), { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const body = await request.json() as FTS5SearchParams;
      
      // Sanitize query
      body.query = sanitizeFTS5Query(body.query);
      
      // Validate query is not empty after sanitization
      if (!body.query || body.query.trim() === '') {
        return new Response(JSON.stringify({ 
          error: 'Invalid search query. Please enter text to search for. Special characters like @, #, $, %, & are not supported.',
          hint: 'Try searching with words like "hello", "test", or use operators like "word1 AND word2"'
        }), { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: {
            results: [
              {
                row: { 
                  rowid: 1, 
                  title: 'Getting Started with FTS5', 
                  content: 'FTS5 is a full-text search extension for SQLite...',
                  author: 'John Doe'
                },
                rank: -1.234,
                snippet: 'Getting Started with <mark>FTS5</mark>... <mark>FTS5</mark> is a full-text search extension...',
              },
              {
                row: { 
                  rowid: 2, 
                  title: 'Advanced FTS5 Techniques', 
                  content: 'Learn how to use FTS5 tokenizers and ranking functions...',
                  author: 'Jane Smith'
                },
                rank: -2.456,
                snippet: 'Advanced <mark>FTS5</mark> Techniques... Learn how to use <mark>FTS5</mark> tokenizers...',
              },
            ],
            total: 2,
            executionTime: 12.5,
            meta: {
              rowsScanned: 1250,
              tokenizerUsed: 'porter',
            },
          } as FTS5SearchResponse,
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Build search query
      const { query: searchSQL, includeSnippet } = buildFTS5SearchQuery(tableName, body);
      console.log('[FTS5] Search SQL:', searchSQL);
      console.log('[FTS5] Search params:', JSON.stringify(body));
      
      try {
        // Execute search
        const startTime = Date.now();
        const searchResult = await executeQueryViaAPI(dbId, searchSQL, env);
        const executionTime = Date.now() - startTime;
        
        // Get total count (without limit) - use same table name format as search query
        const countQuery = `SELECT COUNT(*) as total FROM "${tableName}" WHERE "${tableName}" MATCH '${body.query.replace(/'/g, "''")}'`;
        console.log('[FTS5] Count SQL:', countQuery);
        const countResult = await executeQueryViaAPI(dbId, countQuery, env);
        const total = (countResult.results[0] as { total: number })?.total || 0;
        
        // Format results
        const results = (searchResult.results as Array<Record<string, unknown>>).map(row => {
          const result: { row: Record<string, unknown>; rank: number; snippet?: string } = {
            row,
            rank: row['rank'] as number,
          };
          if (includeSnippet && row['snippet']) {
            result.snippet = row['snippet'] as string;
          }
          return result;
        });
        
        const response: FTS5SearchResponse = {
          results,
          total,
          executionTime,
          meta: {
            rowsScanned: searchResult.meta?.['rows_read'] as number,
          },
        };
        
        return new Response(JSON.stringify({
          result: response,
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      } catch (searchErr) {
        const errMessage = searchErr instanceof Error ? searchErr.message : 'Search failed';
        console.error('[FTS5] Search execution error:', errMessage);
        
        // Check for common FTS5 syntax errors and provide helpful messages
        let userMessage = errMessage;
        if (errMessage.includes('SQLITE_ERROR') || errMessage.includes('fts5: syntax error')) {
          userMessage = `Invalid search syntax. The query "${body.query}" contains characters that FTS5 cannot process. Try using simple words or phrases.`;
        } else if (errMessage.includes('unknown special query')) {
          userMessage = `Invalid FTS5 operator in query. Try using simple words, "exact phrases", or operators like AND, OR, NOT.`;
        }
        
        return new Response(JSON.stringify({ 
          error: userMessage,
          hint: 'Valid examples: hello, "exact phrase", word1 AND word2, prefix*'
        }), { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // Get FTS5 table statistics
    if (request.method === 'GET' && url.pathname.match(/^\/api\/fts5\/[^/]+\/[^/]+\/stats$/)) {
      const tableName = decodeURIComponent(pathParts[4] ?? '');
      console.log('[FTS5] Getting stats for FTS5 table:', tableName);
      
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: {
            tableName,
            rowCount: 1250,
            indexSize: 524288,
            averageRowSize: 419.4,
            fragmentation: 15,
          } as FTS5Stats,
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const sanitizedTable = sanitizeIdentifier(tableName);
      
      try {
        // Get row count
        const countQuery = `SELECT COUNT(*) as count FROM "${sanitizedTable}"`;
        const countResult = await executeQueryViaAPI(dbId, countQuery, env);
        const rowCount = (countResult.results[0] as { count: number })?.count || 0;
        
        // Estimate index size based on row count
        // D1 doesn't expose page_size or other SQLite internals reliably
        // Use a rough estimate: ~500 bytes per row for FTS5 index
        const estimatedBytesPerRow = 500;
        const indexSize = rowCount * estimatedBytesPerRow;
        const averageRowSize = estimatedBytesPerRow;
        
        const stats: FTS5Stats = {
          tableName,
          rowCount,
          indexSize,
          averageRowSize,
        };
        
        return new Response(JSON.stringify({
          result: stats,
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      } catch (error) {
        console.error('[FTS5] Stats error:', error);
        // Return basic stats even if detailed stats fail
        const stats: FTS5Stats = {
          tableName,
          rowCount: 0,
          indexSize: 0,
          averageRowSize: 0,
        };
        
        return new Response(JSON.stringify({
          result: stats,
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    return new Response(JSON.stringify({ 
      error: 'Route not found' 
    }), { 
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[FTS5] Error:', errorMessage);
    // Log stack trace server-side only (not exposed to client)
    if (err instanceof Error && err.stack) {
      console.error('[FTS5] Stack:', err.stack);
    }
    return new Response(JSON.stringify({ 
      error: errorMessage
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
 * Execute a query against a specific D1 database using the REST API
 */
async function executeQueryViaAPI(
  databaseId: string,
  query: string,
  env: Env
): Promise<{ results: unknown[]; meta: Record<string, unknown>; success: boolean }> {
  console.log('[FTS5] Executing query:', query);
  
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/d1/database/${databaseId}/query`,
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
    console.error('[FTS5] Query error:', errorText);
    // Try to parse the error for a more helpful message
    let errorMessage = `${response.status} - ${errorText}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.errors?.[0]?.message || errorJson.error || errorText;
    } catch {
      // Keep the default error message if JSON parsing fails
    }
    throw new Error(`D1 query failed: ${errorMessage}`);
  }
  
  const data = await response.json() as { 
    result: Array<{ results: unknown[]; meta: Record<string, unknown>; success: boolean; error?: string }>;
    success: boolean;
    errors?: Array<{ message: string }>;
  };
  
  // Check for API-level errors
  if (!data.success && data.errors?.length) {
    const errorMessage = data.errors.map(e => e.message).join('; ');
    console.error('[FTS5] D1 API error:', errorMessage);
    throw new Error(`D1 query failed: ${errorMessage}`);
  }
  
  const firstResult = data.result?.[0];
  if (!firstResult) {
    throw new Error('Empty result from D1 API');
  }
  
  // Check for query-level errors
  if (firstResult.error) {
    console.error('[FTS5] Query execution error:', firstResult.error);
    throw new Error(`SQL error: ${firstResult.error}`);
  }
  
  return firstResult;
}

