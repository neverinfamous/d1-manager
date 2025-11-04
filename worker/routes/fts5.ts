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
          
          fts5Tables.push({
            name: table.name,
            type: 'fts5',
            columns: config?.columns || [],
            tokenizer: config?.tokenizer || { type: 'unicode61' },
            contentTable: config?.contentTable,
            rowCount,
            prefixIndex: config?.prefixIndex,
          });
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
        prefixIndex: body.prefixIndex,
      };
      
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
      const tableName = decodeURIComponent(pathParts[4]);
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
      const tableName = decodeURIComponent(pathParts[4]);
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
      const tableName = decodeURIComponent(pathParts[4]);
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
      const tableName = decodeURIComponent(pathParts[4]);
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
      const tableName = decodeURIComponent(pathParts[4]);
      console.log('[FTS5] Searching FTS5 table:', tableName);
      
      const body = await request.json() as FTS5SearchParams;
      
      // Sanitize query
      body.query = sanitizeFTS5Query(body.query);
      
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
      
      // Execute search
      const startTime = Date.now();
      const searchResult = await executeQueryViaAPI(dbId, searchSQL, env);
      const executionTime = Date.now() - startTime;
      
      // Get total count (without limit)
      const countQuery = `
        SELECT COUNT(*) as total
        FROM "${sanitizeIdentifier(tableName)}"
        WHERE "${sanitizeIdentifier(tableName)}" MATCH '${body.query.replace(/'/g, "''")}'
      `;
      const countResult = await executeQueryViaAPI(dbId, countQuery, env);
      const total = (countResult.results[0] as { total: number })?.total || 0;
      
      // Format results
      const results = (searchResult.results as Array<Record<string, unknown>>).map(row => ({
        row,
        rank: row.rank as number,
        snippet: includeSnippet ? (row.snippet as string) : undefined,
      }));
      
      const response: FTS5SearchResponse = {
        results,
        total,
        executionTime,
        meta: {
          rowsScanned: searchResult.meta?.rows_read as number,
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
    }

    // Get FTS5 table statistics
    if (request.method === 'GET' && url.pathname.match(/^\/api\/fts5\/[^/]+\/[^/]+\/stats$/)) {
      const tableName = decodeURIComponent(pathParts[4]);
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
      
      // Get row count
      const countQuery = `SELECT COUNT(*) as count FROM "${sanitizedTable}"`;
      const countResult = await executeQueryViaAPI(dbId, countQuery, env);
      const rowCount = (countResult.results[0] as { count: number })?.count || 0;
      
      // Get index size (approximate via page count)
      // Note: This is an approximation as D1 doesn't expose all SQLite internals
      const pageSizeQuery = `PRAGMA page_size`;
      const pageSizeResult = await executeQueryViaAPI(dbId, pageSizeQuery, env);
      const pageSize = (pageSizeResult.results[0] as { page_size: number })?.page_size || 4096;
      
      // Estimate index size based on row count and page size
      // This is a rough estimate
      const indexSize = Math.ceil(rowCount / 100) * pageSize;
      const averageRowSize = rowCount > 0 ? indexSize / rowCount : 0;
      
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
    console.error('[FTS5] Error:', err);
    return new Response(JSON.stringify({ 
      error: 'FTS5 operation failed',
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
 * Execute a query against a specific D1 database using the REST API
 */
async function executeQueryViaAPI(
  databaseId: string,
  query: string,
  env: Env
): Promise<{ results: unknown[]; meta: Record<string, unknown>; success: boolean }> {
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
    throw new Error(`Query failed: ${response.status}`);
  }
  
  const data = await response.json() as { 
    result: Array<{ results: unknown[]; meta: Record<string, unknown>; success: boolean }>;
    success: boolean;
  };
  
  return data.result[0];
}

