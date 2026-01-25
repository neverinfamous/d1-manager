/**
 * FTS5 Route Handlers
 *
 * API endpoints for managing FTS5 virtual tables, performing searches,
 * and maintaining indexes.
 */

import type { Env } from "../types";
import type {
  FTS5TableConfig,
  FTS5SearchParams,
  FTS5SearchResponse,
  FTS5Stats,
  FTS5TableInfo,
  TokenizerConfig,
} from "../types/fts5";
import {
  buildFTS5CreateStatement,
  buildFTS5SearchQuery,
  isFTS5Table,
  extractFTS5Config,
  validateTokenizerConfig,
  generateFTS5SyncTriggers,
  buildFTS5PopulateQuery,
  sanitizeFTS5Query,
} from "../utils/fts5-helpers";
import { sanitizeIdentifier } from "../utils/helpers";
import {
  isProtectedDatabase,
  createProtectedDatabaseResponse,
  getDatabaseInfo,
} from "../utils/database-protection";
import {
  OperationType,
  startJobTracking,
  finishJobTracking,
} from "../utils/job-tracking";
import { logError, logInfo, logWarning } from "../utils/error-logger";
import { captureTableSnapshot, saveUndoSnapshot } from "../utils/undo";

// Helper to create response headers with CORS
function jsonHeaders(corsHeaders: HeadersInit): Headers {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json");
  return headers;
}

// Body types for FTS5 operations
interface FTS5CreateBody {
  tableName: string;
  columns: string[];
  tokenizer?: TokenizerConfig;
  prefixIndex?: { enabled: boolean; lengths: number[] };
  contentTable?: string;
}

interface FTS5CreateFromTableBody {
  ftsTableName: string;
  sourceTable: string;
  columns: string[];
  tokenizer?: TokenizerConfig;
  prefixIndex?: { enabled: boolean; lengths: number[] };
  externalContent?: boolean;
  createTriggers?: boolean;
}

interface FTS5SearchBody {
  query: string;
  limit?: number;
  offset?: number;
  includeSnippet?: boolean;
  snippetOptions?: {
    startMark?: string;
    endMark?: string;
    ellipsis?: string;
    tokenCount?: number;
  };
  rankingFunction?: string;
  bm25_k1?: number;
  bm25_b?: number;
}

interface D1ApiResponse {
  success: boolean;
  result?: {
    results: unknown[];
    meta?: Record<string, unknown>;
    success: boolean;
    error?: string;
  }[];
  errors?: { message: string }[];
}

export async function handleFTS5Routes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string | null,
): Promise<Response> {
  logInfo("Handling FTS5 operation", {
    module: "fts5",
    operation: "request",
    ...(userEmail !== null && { userId: userEmail }),
    metadata: { method: request.method, path: url.pathname },
  });

  // Extract database ID from URL (format: /api/fts5/:dbId/...)
  const pathParts = url.pathname.split("/");
  const dbId = pathParts[3];

  if (!dbId) {
    return new Response(
      JSON.stringify({
        error: "Database ID required",
      }),
      {
        status: 400,
        headers: jsonHeaders(corsHeaders),
      },
    );
  }

  // Check if accessing a protected database
  if (!isLocalDev) {
    const dbInfo = await getDatabaseInfo(dbId, env);
    if (dbInfo && isProtectedDatabase(dbInfo.name)) {
      logWarning(`Attempted to access protected database: ${dbInfo.name}`, {
        module: "fts5",
        operation: "access_check",
        databaseId: dbId,
        databaseName: dbInfo.name,
      });
      return createProtectedDatabaseResponse(corsHeaders);
    }
  }

  try {
    // List FTS5 tables in database
    if (request.method === "GET" && url.pathname === `/api/fts5/${dbId}/list`) {
      logInfo(`Listing FTS5 tables for database: ${dbId}`, {
        module: "fts5",
        operation: "list",
        databaseId: dbId,
      });

      if (isLocalDev) {
        return new Response(
          JSON.stringify({
            result: [
              {
                name: "articles_fts",
                type: "fts5",
                columns: ["title", "content", "author"],
                tokenizer: {
                  type: "porter",
                  parameters: { remove_diacritics: 1 },
                },
                rowCount: 1250,
                indexSize: 524288,
                prefixIndex: { enabled: true, lengths: [2, 3] },
              },
              {
                name: "products_fts",
                type: "fts5",
                columns: ["name", "description"],
                tokenizer: { type: "unicode61" },
                contentTable: "products",
                rowCount: 458,
                indexSize: 196608,
              },
            ] as FTS5TableInfo[],
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      // Get all tables
      const tableListQuery = "PRAGMA table_list";
      const tableListResult = await executeQueryViaAPI(
        dbId,
        tableListQuery,
        env,
      );
      const allTables = (
        tableListResult.results as { name: string; type: string }[]
      ).filter(
        (t) => !t.name.startsWith("sqlite_") && !t.name.startsWith("_cf_"),
      );

      const fts5Tables: FTS5TableInfo[] = [];

      for (const table of allTables) {
        // Get CREATE statement to check if it's FTS5
        const createQuery = `SELECT sql FROM sqlite_master WHERE type='table' AND name='${sanitizeIdentifier(table.name)}'`;
        const createResult = await executeQueryViaAPI(dbId, createQuery, env);
        const createSql =
          (createResult.results[0] as { sql: string } | undefined)?.sql ?? null;

        if (createSql && isFTS5Table(createSql)) {
          const config = extractFTS5Config(createSql);

          // Get row count
          const countQuery = `SELECT COUNT(*) as count FROM "${sanitizeIdentifier(table.name)}"`;
          const countResult = await executeQueryViaAPI(dbId, countQuery, env);
          const rowCount =
            (countResult.results[0] as { count: number } | undefined)?.count ??
            0;

          const tableInfo: FTS5TableInfo = {
            name: table.name,
            type: "fts5",
            columns: config?.columns ?? [],
            tokenizer: config?.tokenizer ?? { type: "unicode61" },
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

      return new Response(
        JSON.stringify({
          result: fts5Tables,
          success: true,
        }),
        {
          headers: jsonHeaders(corsHeaders),
        },
      );
    }

    // Create new FTS5 table
    if (
      request.method === "POST" &&
      url.pathname === `/api/fts5/${dbId}/create`
    ) {
      logInfo("Creating FTS5 table", {
        module: "fts5",
        operation: "create",
        databaseId: dbId,
      });

      const body: FTS5CreateBody = await request.json();

      // Use default tokenizer if not specified
      const tokenizer: TokenizerConfig = body.tokenizer ?? {
        type: "unicode61",
      };

      // Validate tokenizer config
      const validation = validateTokenizerConfig(tokenizer);
      if (!validation.valid) {
        return new Response(
          JSON.stringify({
            error: validation.error,
          }),
          {
            status: 400,
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      if (isLocalDev) {
        return new Response(
          JSON.stringify({
            result: { tableName: body.tableName, created: true },
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      // Start job tracking
      const jobId = await startJobTracking(
        env,
        OperationType.FTS5_CREATE,
        dbId,
        userEmail ?? "unknown",
        isLocalDev,
        { tableName: body.tableName, columns: body.columns },
      );

      try {
        // Build and execute CREATE VIRTUAL TABLE statement
        const ftsConfig: FTS5TableConfig = {
          tableName: body.tableName,
          columns: body.columns,
          tokenizer,
        };
        if (body.prefixIndex) ftsConfig.prefixIndex = body.prefixIndex;
        if (body.contentTable) ftsConfig.contentTable = body.contentTable;
        const createSQL = buildFTS5CreateStatement(ftsConfig);
        await executeQueryViaAPI(dbId, createSQL, env);

        // Complete job tracking
        await finishJobTracking(
          env,
          jobId,
          "completed",
          userEmail ?? "unknown",
          isLocalDev,
          { processedItems: 1, errorCount: 0 },
        );

        return new Response(
          JSON.stringify({
            result: { tableName: body.tableName, created: true },
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      } catch (err) {
        // Mark job as failed
        await finishJobTracking(
          env,
          jobId,
          "failed",
          userEmail ?? "unknown",
          isLocalDev,
          {
            processedItems: 0,
            errorCount: 1,
            errorMessage: err instanceof Error ? err.message : "Unknown error",
          },
        );
        throw err;
      }
    }

    // Create FTS5 table from existing table
    if (
      request.method === "POST" &&
      url.pathname === `/api/fts5/${dbId}/create-from-table`
    ) {
      logInfo("Creating FTS5 table from existing table", {
        module: "fts5",
        operation: "create_from_table",
        databaseId: dbId,
      });

      const body: FTS5CreateFromTableBody = await request.json();

      // Use default tokenizer if not specified
      const tokenizer: TokenizerConfig = body.tokenizer ?? {
        type: "unicode61",
      };

      // Validate tokenizer config
      const validation = validateTokenizerConfig(tokenizer);
      if (!validation.valid) {
        return new Response(
          JSON.stringify({
            error: validation.error,
          }),
          {
            status: 400,
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      if (isLocalDev) {
        return new Response(
          JSON.stringify({
            result: {
              ftsTableName: body.ftsTableName,
              created: true,
              triggersCreated: body.createTriggers ?? false,
            },
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      // Start job tracking
      const jobId = await startJobTracking(
        env,
        OperationType.FTS5_CREATE_FROM_TABLE,
        dbId,
        userEmail ?? "unknown",
        isLocalDev,
        {
          ftsTableName: body.ftsTableName,
          sourceTable: body.sourceTable,
          columns: body.columns,
        },
      );

      try {
        // Build FTS5 config
        const ftsConfig: FTS5TableConfig = {
          tableName: body.ftsTableName,
          columns: body.columns,
          tokenizer,
        };
        if (body.prefixIndex) {
          ftsConfig.prefixIndex = body.prefixIndex;
        }

        if (body.externalContent) {
          ftsConfig.contentTable = body.sourceTable;
          ftsConfig.contentRowId = "rowid";
        }

        // Create FTS5 table
        const createSQL = buildFTS5CreateStatement(ftsConfig);
        await executeQueryViaAPI(dbId, createSQL, env);

        // Populate FTS5 table
        const populateSQL = buildFTS5PopulateQuery(
          body.ftsTableName,
          body.sourceTable,
          body.columns,
          body.externalContent ?? false,
        );
        await executeQueryViaAPI(dbId, populateSQL, env);

        // Create triggers if requested
        let triggersCreated = false;
        if (body.createTriggers && body.externalContent) {
          const triggerParams = {
            ftsTableName: body.ftsTableName,
            sourceTable: body.sourceTable,
            columns: body.columns,
            tokenizer: body.tokenizer ?? { type: "unicode61" as const },
            externalContent: body.externalContent,
            createTriggers: body.createTriggers,
          };
          const triggers = generateFTS5SyncTriggers(triggerParams);
          for (const trigger of triggers) {
            await executeQueryViaAPI(dbId, trigger.sql, env);
          }
          triggersCreated = true;
        }

        // Complete job tracking
        await finishJobTracking(
          env,
          jobId,
          "completed",
          userEmail ?? "unknown",
          isLocalDev,
          { processedItems: 1, errorCount: 0 },
        );

        return new Response(
          JSON.stringify({
            result: {
              ftsTableName: body.ftsTableName,
              created: true,
              triggersCreated,
            },
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      } catch (err) {
        // Mark job as failed
        await finishJobTracking(
          env,
          jobId,
          "failed",
          userEmail ?? "unknown",
          isLocalDev,
          {
            processedItems: 0,
            errorCount: 1,
            errorMessage: err instanceof Error ? err.message : "Unknown error",
          },
        );
        throw err;
      }
    }

    // Get FTS5 table configuration
    if (
      request.method === "GET" &&
      /^\/api\/fts5\/[^/]+\/[^/]+\/config$/.exec(url.pathname)
    ) {
      const tableName = decodeURIComponent(pathParts[4] ?? "");
      logInfo(`Getting config for FTS5 table: ${tableName}`, {
        module: "fts5",
        operation: "get_config",
        databaseId: dbId,
        metadata: { tableName },
      });

      if (isLocalDev) {
        return new Response(
          JSON.stringify({
            result: {
              tableName,
              columns: ["title", "content", "author"],
              tokenizer: {
                type: "porter",
                parameters: { remove_diacritics: 1 },
              },
              prefixIndex: { enabled: true, lengths: [2, 3] },
            } as Partial<FTS5TableConfig>,
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      // Get CREATE statement
      const createQuery = `SELECT sql FROM sqlite_master WHERE type='table' AND name='${sanitizeIdentifier(tableName)}'`;
      const createResult = await executeQueryViaAPI(dbId, createQuery, env);
      const createSql =
        (createResult.results[0] as { sql: string } | undefined)?.sql ?? null;

      if (!createSql || !isFTS5Table(createSql)) {
        return new Response(
          JSON.stringify({
            error: "Table is not an FTS5 virtual table",
          }),
          {
            status: 400,
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      const config = extractFTS5Config(createSql);

      return new Response(
        JSON.stringify({
          result: config,
          success: true,
        }),
        {
          headers: jsonHeaders(corsHeaders),
        },
      );
    }

    // Delete FTS5 table
    if (
      request.method === "DELETE" &&
      /^\/api\/fts5\/[^/]+\/[^/]+$/.exec(url.pathname)
    ) {
      const tableName = decodeURIComponent(pathParts[4] ?? "");
      logInfo(`Deleting FTS5 table: ${tableName}`, {
        module: "fts5",
        operation: "delete",
        databaseId: dbId,
        metadata: { tableName },
      });

      if (isLocalDev) {
        return new Response(
          JSON.stringify({
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      // Start job tracking
      const jobId = await startJobTracking(
        env,
        OperationType.FTS5_DELETE,
        dbId,
        userEmail ?? "unknown",
        isLocalDev,
        { tableName },
      );

      try {
        // Capture snapshot before drop (best effort for undo support)
        try {
          const snapshot = await captureTableSnapshot(dbId, tableName, env);
          await saveUndoSnapshot(
            dbId,
            "DROP_TABLE",
            tableName,
            null,
            `Dropped FTS5 table "${tableName}"`,
            snapshot,
            userEmail,
            env,
          );
        } catch (snapshotErr) {
          // Log warning but continue with delete - undo is best effort
          logWarning(
            `Failed to capture undo snapshot for FTS5 table: ${snapshotErr instanceof Error ? snapshotErr.message : String(snapshotErr)}`,
            {
              module: "fts5",
              operation: "snapshot_capture",
              databaseId: dbId,
              metadata: { tableName },
            },
          );
        }

        const sanitizedTable = sanitizeIdentifier(tableName);
        const dropQuery = `DROP TABLE "${sanitizedTable}"`;
        await executeQueryViaAPI(dbId, dropQuery, env);

        // Complete job tracking
        await finishJobTracking(
          env,
          jobId,
          "completed",
          userEmail ?? "unknown",
          isLocalDev,
          { processedItems: 1, errorCount: 0 },
        );

        return new Response(
          JSON.stringify({
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      } catch (err) {
        // Mark job as failed
        await finishJobTracking(
          env,
          jobId,
          "failed",
          userEmail ?? "unknown",
          isLocalDev,
          {
            processedItems: 0,
            errorCount: 1,
            errorMessage: err instanceof Error ? err.message : "Unknown error",
          },
        );
        throw err;
      }
    }

    // Convert FTS5 table to regular table
    if (
      request.method === "POST" &&
      /^\/api\/fts5\/[^/]+\/[^/]+\/convert-to-table$/.exec(url.pathname)
    ) {
      const tableName = decodeURIComponent(pathParts[4] ?? "");
      logInfo(`Converting FTS5 table to regular table: ${tableName}`, {
        module: "fts5",
        operation: "convert_to_table",
        databaseId: dbId,
        metadata: { tableName },
      });

      interface ConvertToTableBody {
        newTableName?: string;
        deleteOriginal?: boolean;
      }

      let body: ConvertToTableBody = {};
      try {
        body = (await request.json()) as ConvertToTableBody;
      } catch {
        // Body may be empty, use defaults
      }

      const newTableName = body.newTableName ?? `${tableName}_converted`;
      const deleteOriginal: boolean = body.deleteOriginal ?? false;

      if (isLocalDev) {
        return new Response(
          JSON.stringify({
            result: {
              tableName: newTableName,
              rowsCopied: 10,
              originalDeleted: deleteOriginal,
            },
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      // Start job tracking
      const jobId = await startJobTracking(
        env,
        OperationType.FTS5_DELETE, // Reuse delete since we're essentially removing FTS5
        dbId,
        userEmail ?? "unknown",
        isLocalDev,
        { ftsTableName: tableName, newTableName, deleteOriginal },
      );

      try {
        const sanitizedFtsTable = sanitizeIdentifier(tableName);
        const sanitizedNewTable = sanitizeIdentifier(newTableName);

        // Check if target table already exists
        const tableExistsQuery = `SELECT name FROM sqlite_master WHERE type='table' AND name='${sanitizedNewTable}'`;
        const tableExistsResult = await executeQueryViaAPI(
          dbId,
          tableExistsQuery,
          env,
        );
        if (tableExistsResult.results.length > 0) {
          await finishJobTracking(
            env,
            jobId,
            "failed",
            userEmail ?? "unknown",
            isLocalDev,
            {
              processedItems: 0,
              errorCount: 1,
              errorMessage: `Table "${newTableName}" already exists`,
            },
          );
          return new Response(
            JSON.stringify({
              error: `Table "${newTableName}" already exists. Please choose a different name or delete the existing table first.`,
            }),
            {
              status: 400,
              headers: jsonHeaders(corsHeaders),
            },
          );
        }

        // Get FTS5 table columns (excluding internal rowid)
        // FTS5 stores data differently, we need to query the content
        const schemaQuery = `PRAGMA table_info("${sanitizedFtsTable}")`;
        const schemaResult = await executeQueryViaAPI(dbId, schemaQuery, env);
        const columns = schemaResult.results as {
          cid: number;
          name: string;
          type: string;
          notnull: number;
          dflt_value: string | null;
          pk: number;
        }[];

        // FTS5 tables have columns but they're all TEXT in the virtual table
        // The actual content is stored in shadow tables
        // We'll create a regular table with TEXT columns
        const filteredColumns = columns.filter((col) => col.name !== "rowid"); // Exclude virtual rowid

        // Check if there's already an id column
        const hasIdColumn = filteredColumns.some(
          (col) => col.name.toLowerCase() === "id",
        );

        const columnDefs = filteredColumns
          .map((col) => `"${col.name}" TEXT`)
          .join(", ");

        if (!columnDefs) {
          throw new Error("No columns found in FTS5 table");
        }

        // Only add an id column if the table doesn't already have one
        const createQuery = hasIdColumn
          ? `CREATE TABLE "${sanitizedNewTable}" (${columnDefs})`
          : `CREATE TABLE "${sanitizedNewTable}" (id INTEGER PRIMARY KEY AUTOINCREMENT, ${columnDefs})`;
        await executeQueryViaAPI(dbId, createQuery, env);

        // Copy data from FTS5 table to new table
        const columnNames = filteredColumns
          .map((col) => `"${col.name}"`)
          .join(", ");

        const copyQuery = `INSERT INTO "${sanitizedNewTable}" (${columnNames}) SELECT ${columnNames} FROM "${sanitizedFtsTable}"`;
        const copyResult = await executeQueryViaAPI(dbId, copyQuery, env);
        const rowsCopied =
          ((copyResult.meta as Record<string, unknown> | undefined)?.[
            "changes"
          ] as number) ?? 0;

        // Optionally delete the original FTS5 table
        if (deleteOriginal) {
          // Capture snapshot before drop (best effort for undo support)
          try {
            const snapshot = await captureTableSnapshot(dbId, tableName, env);
            await saveUndoSnapshot(
              dbId,
              "DROP_TABLE",
              tableName,
              null,
              `Dropped FTS5 table "${tableName}" during conversion`,
              snapshot,
              userEmail,
              env,
            );
          } catch (snapshotErr) {
            // Log warning but continue - undo is best effort
            logWarning(
              `Failed to capture undo snapshot for FTS5 table during conversion: ${snapshotErr instanceof Error ? snapshotErr.message : String(snapshotErr)}`,
              {
                module: "fts5",
                operation: "snapshot_capture",
                databaseId: dbId,
                metadata: { tableName },
              },
            );
          }

          const dropQuery = `DROP TABLE "${sanitizedFtsTable}"`;
          await executeQueryViaAPI(dbId, dropQuery, env);
        }

        // Complete job tracking
        await finishJobTracking(
          env,
          jobId,
          "completed",
          userEmail ?? "unknown",
          isLocalDev,
          {
            processedItems: 1,
            errorCount: 0,
          },
        );

        return new Response(
          JSON.stringify({
            result: {
              tableName: newTableName,
              rowsCopied,
              originalDeleted: deleteOriginal,
            },
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      } catch (err) {
        // Mark job as failed
        await finishJobTracking(
          env,
          jobId,
          "failed",
          userEmail ?? "unknown",
          isLocalDev,
          {
            processedItems: 0,
            errorCount: 1,
            errorMessage: err instanceof Error ? err.message : "Unknown error",
          },
        );
        throw err;
      }
    }

    // Rebuild FTS5 index
    if (
      request.method === "POST" &&
      /^\/api\/fts5\/[^/]+\/[^/]+\/rebuild$/.exec(url.pathname)
    ) {
      const tableName = decodeURIComponent(pathParts[4] ?? "");
      logInfo(`Rebuilding FTS5 index for: ${tableName}`, {
        module: "fts5",
        operation: "rebuild",
        databaseId: dbId,
        metadata: { tableName },
      });

      if (isLocalDev) {
        return new Response(
          JSON.stringify({
            result: { rebuilt: true },
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      // Start job tracking
      const jobId = await startJobTracking(
        env,
        OperationType.FTS5_REBUILD,
        dbId,
        userEmail ?? "unknown",
        isLocalDev,
        { tableName },
      );

      try {
        const sanitizedTable = sanitizeIdentifier(tableName);
        const rebuildQuery = `INSERT INTO "${sanitizedTable}"("${sanitizedTable}") VALUES('rebuild')`;
        await executeQueryViaAPI(dbId, rebuildQuery, env);

        // Complete job tracking
        await finishJobTracking(
          env,
          jobId,
          "completed",
          userEmail ?? "unknown",
          isLocalDev,
          { processedItems: 1, errorCount: 0 },
        );

        return new Response(
          JSON.stringify({
            result: { rebuilt: true },
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      } catch (err) {
        // Mark job as failed
        await finishJobTracking(
          env,
          jobId,
          "failed",
          userEmail ?? "unknown",
          isLocalDev,
          {
            processedItems: 0,
            errorCount: 1,
            errorMessage: err instanceof Error ? err.message : "Unknown error",
          },
        );
        throw err;
      }
    }

    // Optimize FTS5 index
    if (
      request.method === "POST" &&
      /^\/api\/fts5\/[^/]+\/[^/]+\/optimize$/.exec(url.pathname)
    ) {
      const tableName = decodeURIComponent(pathParts[4] ?? "");
      logInfo(`Optimizing FTS5 index for: ${tableName}`, {
        module: "fts5",
        operation: "optimize",
        databaseId: dbId,
        metadata: { tableName },
      });

      if (isLocalDev) {
        return new Response(
          JSON.stringify({
            result: { optimized: true },
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      // Start job tracking
      const jobId = await startJobTracking(
        env,
        OperationType.FTS5_OPTIMIZE,
        dbId,
        userEmail ?? "unknown",
        isLocalDev,
        { tableName },
      );

      try {
        const sanitizedTable = sanitizeIdentifier(tableName);
        const optimizeQuery = `INSERT INTO "${sanitizedTable}"("${sanitizedTable}") VALUES('optimize')`;
        await executeQueryViaAPI(dbId, optimizeQuery, env);

        // Complete job tracking
        await finishJobTracking(
          env,
          jobId,
          "completed",
          userEmail ?? "unknown",
          isLocalDev,
          { processedItems: 1, errorCount: 0 },
        );

        return new Response(
          JSON.stringify({
            result: { optimized: true },
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      } catch (err) {
        // Mark job as failed
        await finishJobTracking(
          env,
          jobId,
          "failed",
          userEmail ?? "unknown",
          isLocalDev,
          {
            processedItems: 0,
            errorCount: 1,
            errorMessage: err instanceof Error ? err.message : "Unknown error",
          },
        );
        throw err;
      }
    }

    // Search FTS5 table
    if (
      request.method === "POST" &&
      /^\/api\/fts5\/[^/]+\/[^/]+\/search$/.exec(url.pathname)
    ) {
      const tableName = decodeURIComponent(pathParts[4] ?? "");
      logInfo(`Searching FTS5 table: ${tableName}`, {
        module: "fts5",
        operation: "search",
        databaseId: dbId,
        metadata: { tableName },
      });

      if (!tableName) {
        return new Response(
          JSON.stringify({
            error: "Table name is required",
          }),
          {
            status: 400,
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      const body: FTS5SearchBody = await request.json();

      // Sanitize query
      body.query = sanitizeFTS5Query(body.query);

      // Validate query is not empty after sanitization
      if (!body.query || body.query.trim() === "") {
        return new Response(
          JSON.stringify({
            error:
              "Invalid search query. Please enter text to search for. Special characters like @, #, $, %, & are not supported.",
            hint: 'Try searching with words like "hello", "test", or use operators like "word1 AND word2"',
          }),
          {
            status: 400,
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      if (isLocalDev) {
        return new Response(
          JSON.stringify({
            result: {
              results: [
                {
                  row: {
                    rowid: 1,
                    title: "Getting Started with FTS5",
                    content:
                      "FTS5 is a full-text search extension for SQLite...",
                    author: "John Doe",
                  },
                  rank: -1.234,
                  snippet:
                    "Getting Started with <mark>FTS5</mark>... <mark>FTS5</mark> is a full-text search extension...",
                },
                {
                  row: {
                    rowid: 2,
                    title: "Advanced FTS5 Techniques",
                    content:
                      "Learn how to use FTS5 tokenizers and ranking functions...",
                    author: "Jane Smith",
                  },
                  rank: -2.456,
                  snippet:
                    "Advanced <mark>FTS5</mark> Techniques... Learn how to use <mark>FTS5</mark> tokenizers...",
                },
              ],
              total: 2,
              executionTime: 12.5,
              meta: {
                rowsScanned: 1250,
                tokenizerUsed: "porter",
              },
            } as FTS5SearchResponse,
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      // Build search query - only include defined properties to satisfy exactOptionalPropertyTypes
      const searchParams: FTS5SearchParams = { query: body.query };
      if (body.limit !== undefined) searchParams.limit = body.limit;
      if (body.offset !== undefined) searchParams.offset = body.offset;
      if (body.includeSnippet !== undefined)
        searchParams.includeSnippet = body.includeSnippet;
      if (body.snippetOptions !== undefined)
        searchParams.snippetOptions = body.snippetOptions;
      if (
        body.rankingFunction === "bm25" ||
        body.rankingFunction === "bm25custom"
      )
        searchParams.rankingFunction = body.rankingFunction;
      if (body.bm25_k1 !== undefined) searchParams.bm25_k1 = body.bm25_k1;
      if (body.bm25_b !== undefined) searchParams.bm25_b = body.bm25_b;

      const { query: searchSQL, includeSnippet } = buildFTS5SearchQuery(
        tableName,
        searchParams,
      );
      logInfo(`Search SQL: ${searchSQL}`, {
        module: "fts5",
        operation: "search",
        databaseId: dbId,
        metadata: { tableName, params: body },
      });

      try {
        // Execute search
        const startTime = Date.now();
        const searchResult = await executeQueryViaAPI(dbId, searchSQL, env);
        const executionTime = Date.now() - startTime;

        // Get total count (without limit) - use same table name format as search query
        const countQuery = `SELECT COUNT(*) as total FROM "${tableName}" WHERE "${tableName}" MATCH '${body.query.replace(/'/g, "''")}'`;
        logInfo(`Count SQL: ${countQuery}`, {
          module: "fts5",
          operation: "search_count",
          databaseId: dbId,
          metadata: { tableName },
        });
        const countResult = await executeQueryViaAPI(dbId, countQuery, env);
        const total =
          (countResult.results[0] as { total: number } | undefined)?.total ?? 0;

        // Format results
        const results = (searchResult.results as Record<string, unknown>[]).map(
          (row) => {
            const result: {
              row: Record<string, unknown>;
              rank: number;
              snippet?: string;
            } = {
              row,
              rank: row["rank"] as number,
            };
            if (
              includeSnippet &&
              row["snippet"] !== undefined &&
              row["snippet"] !== null
            ) {
              result.snippet = row["snippet"] as string;
            }
            return result;
          },
        );

        const response: FTS5SearchResponse = {
          results,
          total,
          executionTime,
        };
        // Only add meta if rowsScanned is a number
        const rowsScanned = searchResult.meta["rows_read"] as
          | number
          | undefined;
        if (rowsScanned !== undefined) {
          response.meta = { rowsScanned };
        }

        return new Response(
          JSON.stringify({
            result: response,
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      } catch (searchErr) {
        const errMessage =
          searchErr instanceof Error ? searchErr.message : "Search failed";
        void logError(
          env,
          `Search execution error: ${errMessage}`,
          {
            module: "fts5",
            operation: "search",
            databaseId: dbId,
            metadata: { tableName },
          },
          isLocalDev,
        );

        // Check for common FTS5 syntax errors and provide helpful messages
        let userMessage = errMessage;
        if (
          errMessage.includes("SQLITE_ERROR") ||
          errMessage.includes("fts5: syntax error")
        ) {
          userMessage = `Invalid search syntax. The query "${body.query}" contains characters that FTS5 cannot process. Try using simple words or phrases.`;
        } else if (errMessage.includes("unknown special query")) {
          userMessage = `Invalid FTS5 operator in query. Try using simple words, "exact phrases", or operators like AND, OR, NOT.`;
        }

        return new Response(
          JSON.stringify({
            error: userMessage,
            hint: 'Valid examples: hello, "exact phrase", word1 AND word2, prefix*',
          }),
          {
            status: 400,
            headers: jsonHeaders(corsHeaders),
          },
        );
      }
    }

    // Get FTS5 table statistics
    if (
      request.method === "GET" &&
      /^\/api\/fts5\/[^/]+\/[^/]+\/stats$/.exec(url.pathname)
    ) {
      const tableName = decodeURIComponent(pathParts[4] ?? "");
      logInfo(`Getting stats for FTS5 table: ${tableName}`, {
        module: "fts5",
        operation: "stats",
        databaseId: dbId,
        metadata: { tableName },
      });

      if (isLocalDev) {
        return new Response(
          JSON.stringify({
            result: {
              tableName,
              rowCount: 1250,
              indexSize: 524288,
              averageRowSize: 419.4,
              fragmentation: 15,
            } as FTS5Stats,
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      const sanitizedTable = sanitizeIdentifier(tableName);

      try {
        // Get row count
        const countQuery = `SELECT COUNT(*) as count FROM "${sanitizedTable}"`;
        const countResult = await executeQueryViaAPI(dbId, countQuery, env);
        const rowCount =
          (countResult.results[0] as { count: number } | undefined)?.count ?? 0;

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

        return new Response(
          JSON.stringify({
            result: stats,
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      } catch (error) {
        void logError(
          env,
          error instanceof Error ? error : String(error),
          {
            module: "fts5",
            operation: "stats",
            databaseId: dbId,
            metadata: { tableName },
          },
          isLocalDev,
        );
        // Return basic stats even if detailed stats fail
        const stats: FTS5Stats = {
          tableName,
          rowCount: 0,
          indexSize: 0,
          averageRowSize: 0,
        };

        return new Response(
          JSON.stringify({
            result: stats,
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      }
    }

    return new Response(
      JSON.stringify({
        error: "Route not found",
      }),
      {
        status: 404,
        headers: jsonHeaders(corsHeaders),
      },
    );
  } catch (err) {
    void logError(
      env,
      err instanceof Error ? err : String(err),
      {
        module: "fts5",
        operation: "request",
        databaseId: dbId,
      },
      isLocalDev,
    );
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({
        error: errorMessage,
      }),
      {
        status: 500,
        headers: jsonHeaders(corsHeaders),
      },
    );
  }
}

/**
 * Execute a query against a specific D1 database using the REST API
 */
async function executeQueryViaAPI(
  databaseId: string,
  query: string,
  env: Env,
): Promise<{
  results: unknown[];
  meta: Record<string, unknown>;
  success: boolean;
}> {
  logInfo(
    `Executing query: ${query.substring(0, 100)}${query.length > 100 ? "..." : ""}`,
    { module: "fts5", operation: "query", databaseId: databaseId },
  );

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql: query, params: [] }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    logWarning(`Query error: ${errorText}`, {
      module: "fts5",
      operation: "query",
      databaseId: databaseId,
      metadata: { status: response.status },
    });
    // Try to parse the error for a more helpful message
    let errorMessage = `${String(response.status)} - ${errorText}`;
    try {
      const errorJson = JSON.parse(errorText) as {
        errors?: { message: string }[];
        error?: string;
      };
      errorMessage =
        errorJson.errors?.[0]?.message ?? errorJson.error ?? errorText;
    } catch {
      // Keep the default error message if JSON parsing fails
    }
    throw new Error(`D1 query failed: ${errorMessage}`);
  }

  const data: D1ApiResponse = await response.json();

  // Check for API-level errors
  if (!data.success && data.errors && data.errors.length > 0) {
    const errorMessage = data.errors
      .map((e: { message: string }) => e.message)
      .join("; ");
    logWarning(`D1 API error: ${errorMessage}`, {
      module: "fts5",
      operation: "query",
      databaseId: databaseId,
    });
    throw new Error(`D1 query failed: ${errorMessage}`);
  }

  const firstResult = data.result?.[0];
  if (!firstResult) {
    throw new Error("Empty result from D1 API");
  }

  // Check for query-level errors
  if (firstResult.error) {
    logWarning(`Query execution error: ${firstResult.error}`, {
      module: "fts5",
      operation: "query",
      databaseId: databaseId,
    });
    throw new Error(`SQL error: ${firstResult.error}`);
  }

  return {
    results: firstResult.results,
    meta: firstResult.meta ?? {},
    success: firstResult.success,
  };
}
