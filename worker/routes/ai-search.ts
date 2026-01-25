/**
 * AI Search Routes for D1 Manager
 *
 * Provides semantic search over D1 database schemas and data using Cloudflare AI Search.
 * Uses a D1→R2 connector pattern: exports database content as markdown documents
 * to R2, which are then indexed by AI Search for semantic querying.
 */

import type {
  Env,
  CorsHeaders,
  AISearchCompatibility,
  AISearchInstance,
  AISearchQueryRequest,
  AISearchResponse,
  AISearchSyncResponse,
} from "../types";
import { CF_API } from "../types";
import { logInfo, logError, logWarning } from "../utils/error-logger";

/**
 * Get Cloudflare API headers for authenticated requests
 */
function getCloudflareHeaders(env: Env): HeadersInit {
  return {
    Authorization: `Bearer ${env.API_KEY}`,
    "Content-Type": "application/json",
  };
}

/**
 * Cloudflare API response wrapper
 */
interface CloudflareApiResponse<T> {
  success: boolean;
  result?: T;
  errors?: { message: string; code?: number }[];
}

/**
 * Export database schema and data to R2 for AI Search indexing
 * Creates markdown documents at: ai-search/{dbId}/
 */
async function exportDatabaseToR2(
  env: Env,
  databaseId: string,
  databaseName: string,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean,
): Promise<Response> {
  logInfo("Exporting database to R2 for AI Search", {
    module: "ai_search",
    operation: "export",
    databaseId,
    databaseName,
  });

  if (!env.BACKUP_BUCKET) {
    return new Response(
      JSON.stringify({
        error: "R2 bucket not configured",
        message:
          "BACKUP_BUCKET binding required for AI Search export. Add it to wrangler.toml.",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }

  if (isLocalDev) {
    // Return mock export success for local development
    return new Response(
      JSON.stringify({
        success: true,
        message: "Database exported successfully (mock)",
        exportPath: `ai-search/${databaseId}/`,
        filesExported: [
          "schema.md",
          "tables/users.md",
          "relationships.md",
          "data/users.md",
        ],
      }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }

  const cfHeaders = getCloudflareHeaders(env);
  const exportPath = `ai-search/${databaseId}`;
  const filesExported: string[] = [];

  try {
    // Step 1: Get list of tables
    const tablesResponse = await fetch(
      `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${databaseId}/query`,
      {
        method: "POST",
        headers: cfHeaders,
        body: JSON.stringify({
          sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
        }),
      },
    );

    if (!tablesResponse.ok) {
      throw new Error(`Failed to get tables: ${tablesResponse.status}`);
    }

    const tablesData = (await tablesResponse.json()) as CloudflareApiResponse<
      { results: { name: string }[] }[]
    >;
    const tables = tablesData.result?.[0]?.results ?? [];

    // Step 2: Build schema.md - full database schema
    let schemaContent = `# Database: ${databaseName}\n\n`;
    schemaContent += `**Database ID:** \`${databaseId}\`\n`;
    schemaContent += `**Exported:** ${new Date().toISOString()}\n\n`;
    schemaContent += `## Tables (${tables.length})\n\n`;

    const tableSchemas: {
      name: string;
      createSql: string;
      columns: string[];
    }[] = [];

    for (const table of tables) {
      const tableName = table.name;

      // Get CREATE TABLE statement
      const schemaResponse = await fetch(
        `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${databaseId}/query`,
        {
          method: "POST",
          headers: cfHeaders,
          body: JSON.stringify({
            sql: `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`,
            params: [tableName],
          }),
        },
      );

      const schemaData = (await schemaResponse.json()) as CloudflareApiResponse<
        { results: { sql: string }[] }[]
      >;
      const createSql = schemaData.result?.[0]?.results?.[0]?.sql ?? "";

      // Get column info
      const columnsResponse = await fetch(
        `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${databaseId}/query`,
        {
          method: "POST",
          headers: cfHeaders,
          body: JSON.stringify({ sql: `PRAGMA table_info("${tableName}")` }),
        },
      );

      const columnsData =
        (await columnsResponse.json()) as CloudflareApiResponse<
          {
            results: {
              name: string;
              type: string;
              notnull: number;
              pk: number;
            }[];
          }[]
        >;
      const columns = columnsData.result?.[0]?.results ?? [];

      tableSchemas.push({
        name: tableName,
        createSql,
        columns: columns.map(
          (c) =>
            `${c.name} (${c.type}${c.pk ? ", PRIMARY KEY" : ""}${c.notnull ? ", NOT NULL" : ""})`,
        ),
      });

      schemaContent += `### ${tableName}\n\n`;
      schemaContent += "```sql\n" + createSql + "\n```\n\n";
      schemaContent += `**Columns:** ${columns.map((c) => c.name).join(", ")}\n\n`;
    }

    // Upload schema.md
    await env.BACKUP_BUCKET.put(`${exportPath}/schema.md`, schemaContent, {
      customMetadata: {
        databaseId,
        databaseName,
        type: "schema",
        exportedAt: new Date().toISOString(),
      },
    });
    filesExported.push("schema.md");

    // Step 3: Export foreign key relationships
    let relationshipsContent = `# Relationships: ${databaseName}\n\n`;
    let totalRelationships = 0;

    for (const table of tables) {
      const fkResponse = await fetch(
        `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${databaseId}/query`,
        {
          method: "POST",
          headers: cfHeaders,
          body: JSON.stringify({
            sql: `PRAGMA foreign_key_list("${table.name}")`,
          }),
        },
      );

      const fkData = (await fkResponse.json()) as CloudflareApiResponse<
        { results: { table: string; from: string; to: string }[] }[]
      >;
      const fks = fkData.result?.[0]?.results ?? [];

      if (fks.length > 0) {
        relationshipsContent += `## ${table.name}\n\n`;
        for (const fk of fks) {
          relationshipsContent += `- \`${table.name}.${fk.from}\` → \`${fk.table}.${fk.to}\`\n`;
          totalRelationships++;
        }
        relationshipsContent += "\n";
      }
    }

    if (totalRelationships === 0) {
      relationshipsContent += "*No foreign key relationships defined.*\n";
    }

    await env.BACKUP_BUCKET.put(
      `${exportPath}/relationships.md`,
      relationshipsContent,
      {
        customMetadata: {
          databaseId,
          databaseName,
          type: "relationships",
          exportedAt: new Date().toISOString(),
        },
      },
    );
    filesExported.push("relationships.md");

    // Step 4: Export full table data
    for (const table of tables) {
      const tableName = table.name;

      // Get row count first
      const countResponse = await fetch(
        `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${databaseId}/query`,
        {
          method: "POST",
          headers: cfHeaders,
          body: JSON.stringify({
            sql: `SELECT COUNT(*) as count FROM "${tableName}"`,
          }),
        },
      );

      const countData = (await countResponse.json()) as CloudflareApiResponse<
        { results: { count: number }[] }[]
      >;
      const rowCount = countData.result?.[0]?.results?.[0]?.count ?? 0;

      // Get all data (chunked for large tables)
      const CHUNK_SIZE = 1000;
      let dataContent = `# Data: ${tableName}\n\n`;
      dataContent += `**Total Rows:** ${rowCount}\n\n`;

      let offset = 0;
      let chunkIndex = 0;

      while (offset < rowCount) {
        const dataResponse = await fetch(
          `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${databaseId}/query`,
          {
            method: "POST",
            headers: cfHeaders,
            body: JSON.stringify({
              sql: `SELECT * FROM "${tableName}" LIMIT ${CHUNK_SIZE} OFFSET ${offset}`,
            }),
          },
        );

        const dataResult = (await dataResponse.json()) as CloudflareApiResponse<
          { results: Record<string, unknown>[] }[]
        >;
        const rows = dataResult.result?.[0]?.results ?? [];

        if (rows.length === 0) break;

        // Format as markdown table
        if (chunkIndex === 0 && rows.length > 0) {
          const headers = Object.keys(rows[0] ?? {});
          dataContent += "| " + headers.join(" | ") + " |\n";
          dataContent += "| " + headers.map(() => "---").join(" | ") + " |\n";
        }

        for (const row of rows) {
          const values = Object.values(row).map((v) => {
            if (v === null || v === undefined) return "*null*";
            if (typeof v === "string")
              return v
                .replace(/\\/g, "\\\\")
                .replace(/\|/g, "\\|")
                .replace(/\n/g, " ");
            if (
              typeof v === "number" ||
              typeof v === "boolean" ||
              typeof v === "bigint"
            ) {
              return String(v);
            }
            // For objects and arrays, stringify
            return JSON.stringify(v)
              .replace(/\\/g, "\\\\")
              .replace(/\|/g, "\\|")
              .replace(/\n/g, " ");
          });
          dataContent += "| " + values.join(" | ") + " |\n";
        }

        offset += CHUNK_SIZE;
        chunkIndex++;

        // Safety limit: 50 chunks (50k rows per table max)
        if (chunkIndex >= 50) {
          dataContent += `\n*... truncated at ${offset} rows for indexing performance.*\n`;
          break;
        }
      }

      await env.BACKUP_BUCKET.put(
        `${exportPath}/data/${tableName}.md`,
        dataContent,
        {
          customMetadata: {
            databaseId,
            databaseName,
            tableName,
            type: "data",
            rowCount: String(rowCount),
            exportedAt: new Date().toISOString(),
          },
        },
      );
      filesExported.push(`data/${tableName}.md`);

      // Also export table-specific schema doc
      const tableSchema = tableSchemas.find((t) => t.name === tableName);
      if (tableSchema) {
        let tableDoc = `# Table: ${tableName}\n\n`;
        tableDoc += `**Database:** ${databaseName}\n`;
        tableDoc += `**Row Count:** ${rowCount}\n\n`;
        tableDoc +=
          "## Schema\n\n```sql\n" + tableSchema.createSql + "\n```\n\n";
        tableDoc += "## Columns\n\n";
        for (const col of tableSchema.columns) {
          tableDoc += `- ${col}\n`;
        }

        await env.BACKUP_BUCKET.put(
          `${exportPath}/tables/${tableName}.md`,
          tableDoc,
          {
            customMetadata: {
              databaseId,
              databaseName,
              tableName,
              type: "table",
              exportedAt: new Date().toISOString(),
            },
          },
        );
        filesExported.push(`tables/${tableName}.md`);
      }
    }

    logInfo("Database export completed", {
      module: "ai_search",
      operation: "export_complete",
      databaseId,
      metadata: { filesExported: filesExported.length },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Database exported successfully for AI Search indexing",
        exportPath: `${exportPath}/`,
        filesExported,
        note: "Create an AI Search instance pointing to your backup bucket to enable semantic search.",
      }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (err) {
    await logError(
      env,
      err instanceof Error ? err : String(err),
      {
        module: "ai_search",
        operation: "export",
        databaseId,
      },
      isLocalDev,
    );

    return new Response(
      JSON.stringify({
        error: "Export failed",
        message: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
}

/**
 * Handle AI Search routes
 */
export async function handleAISearchRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean,
  _userEmail: string | null,
): Promise<Response> {
  logInfo("Handling AI Search operation", {
    module: "ai_search",
    operation: "handle_request",
  });

  const cfHeaders = getCloudflareHeaders(env);

  try {
    // POST /api/ai-search/export/:dbId - Export database to R2 for indexing
    const exportRegex = /^\/api\/ai-search\/export\/([^/]+)$/;
    const exportMatch = exportRegex.exec(url.pathname);
    if (request.method === "POST" && exportMatch?.[1] !== undefined) {
      const databaseId = decodeURIComponent(exportMatch[1]);
      const body = (await request.json()) as { databaseName?: string };
      const databaseName = body.databaseName ?? databaseId;

      return await exportDatabaseToR2(
        env,
        databaseId,
        databaseName,
        corsHeaders,
        isLocalDev,
      );
    }

    // GET /api/ai-search/compatibility/:dbId - Analyze database for AI Search
    const compatibilityRegex = /^\/api\/ai-search\/compatibility\/([^/]+)$/;
    const compatibilityMatch = compatibilityRegex.exec(url.pathname);
    if (request.method === "GET" && compatibilityMatch?.[1] !== undefined) {
      const databaseId = decodeURIComponent(compatibilityMatch[1]);
      logInfo("Checking AI Search compatibility", {
        module: "ai_search",
        operation: "compatibility",
        databaseId,
      });

      if (isLocalDev) {
        const mockResponse: AISearchCompatibility = {
          databaseId,
          databaseName: "dev-database",
          totalTables: 5,
          totalRows: 1250,
          exportableContent: {
            schemaSize: 4096,
            dataSize: 128000,
            relationshipCount: 3,
          },
        };
        return new Response(JSON.stringify(mockResponse), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Get table count and row counts from database
      try {
        const tablesResponse = await fetch(
          `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${databaseId}/query`,
          {
            method: "POST",
            headers: cfHeaders,
            body: JSON.stringify({
              sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
            }),
          },
        );

        const tablesData =
          (await tablesResponse.json()) as CloudflareApiResponse<
            { results: { name: string }[] }[]
          >;
        const tables = tablesData.result?.[0]?.results ?? [];

        let totalRows = 0;
        for (const table of tables.slice(0, 10)) {
          // Limit to first 10 for performance
          const countResponse = await fetch(
            `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${databaseId}/query`,
            {
              method: "POST",
              headers: cfHeaders,
              body: JSON.stringify({
                sql: `SELECT COUNT(*) as count FROM "${table.name}"`,
              }),
            },
          );
          const countData =
            (await countResponse.json()) as CloudflareApiResponse<
              { results: { count: number }[] }[]
            >;
          totalRows += countData.result?.[0]?.results?.[0]?.count ?? 0;
        }

        // Check for existing export
        let lastExport: string | undefined;
        if (env.BACKUP_BUCKET) {
          const schemaFile = await env.BACKUP_BUCKET.head(
            `ai-search/${databaseId}/schema.md`,
          );
          if (schemaFile) {
            lastExport = schemaFile.uploaded.toISOString();
          }
        }

        const response: AISearchCompatibility = {
          databaseId,
          databaseName: databaseId, // Would need to fetch from API for actual name
          totalTables: tables.length,
          totalRows,
          exportableContent: {
            schemaSize: tables.length * 500, // Estimate
            dataSize: totalRows * 100, // Rough estimate
            relationshipCount: 0, // Would need FK query
          },
          ...(lastExport !== undefined && { lastExport }),
          ...(lastExport !== undefined && {
            exportPath: `ai-search/${databaseId}/`,
          }),
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (err) {
        await logError(
          env,
          err instanceof Error ? err : String(err),
          {
            module: "ai_search",
            operation: "compatibility",
            databaseId,
          },
          isLocalDev,
        );
        return new Response(
          JSON.stringify({ error: "Failed to analyze database" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }
    }

    // GET /api/ai-search/instances - List AI Search instances
    if (
      request.method === "GET" &&
      url.pathname === "/api/ai-search/instances"
    ) {
      logInfo("Listing AI Search instances", {
        module: "ai_search",
        operation: "list_instances",
      });

      if (isLocalDev) {
        const mockInstances: AISearchInstance[] = [
          {
            name: "dev-d1-search",
            description: "Development D1 database search",
            created_at: new Date().toISOString(),
            status: "active",
            data_source: { type: "r2", bucket_name: "d1-manager-backups" },
          },
        ];
        return new Response(JSON.stringify({ instances: mockInstances }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      try {
        const response = await fetch(
          `${CF_API}/accounts/${env.ACCOUNT_ID}/autorag/rags`,
          { headers: cfHeaders },
        );

        const responseText = await response.text();

        if (!response.ok) {
          logWarning("AI Search API returned error", {
            module: "ai_search",
            operation: "list_instances",
            metadata: {
              status: response.status,
              statusText: response.statusText,
            },
          });
          return new Response(
            JSON.stringify({
              instances: [],
              error:
                "AI Search API not available. Create instances via Cloudflare Dashboard.",
              dashboardUrl:
                "https://dash.cloudflare.com/?to=/:account/ai/ai-search",
            }),
            {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            },
          );
        }

        const data = JSON.parse(responseText) as CloudflareApiResponse<
          AISearchInstance[]
        >;
        // API returns result as array directly, NOT result.rags
        const instances = Array.isArray(data.result) ? data.result : [];

        logInfo("Listed AI Search instances", {
          module: "ai_search",
          operation: "list_instances",
          metadata: { count: instances.length },
        });

        return new Response(
          JSON.stringify({
            instances,
          }),
          {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      } catch (err) {
        await logError(
          env,
          err instanceof Error ? err : String(err),
          {
            module: "ai_search",
            operation: "list_instances",
          },
          isLocalDev,
        );
        return new Response(
          JSON.stringify({
            instances: [],
            error: "Failed to fetch AI Search instances",
          }),
          {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }
    }

    // POST /api/ai-search/instances/:name/sync - Trigger sync/re-index
    const syncRegex = /^\/api\/ai-search\/instances\/([^/]+)\/sync$/;
    const syncMatch = syncRegex.exec(url.pathname);
    if (request.method === "POST" && syncMatch?.[1] !== undefined) {
      const instanceName = decodeURIComponent(syncMatch[1]);
      logInfo("Triggering AI Search sync", {
        module: "ai_search",
        operation: "sync",
        metadata: { instanceName },
      });

      if (isLocalDev) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Sync triggered successfully (mock)",
            job_id: "mock-job-123",
          } as AISearchSyncResponse),
          {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      try {
        const response = await fetch(
          `${CF_API}/accounts/${env.ACCOUNT_ID}/autorag/rags/${instanceName}/sync`,
          { method: "POST", headers: cfHeaders },
        );

        const data =
          (await response.json()) as CloudflareApiResponse<AISearchSyncResponse>;

        if (!response.ok) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "Failed to trigger sync",
            }),
            {
              status: response.status,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            },
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: "Sync triggered successfully",
            job_id: data.result?.job_id,
          }),
          {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      } catch (err) {
        await logError(
          env,
          err instanceof Error ? err : String(err),
          {
            module: "ai_search",
            operation: "sync",
          },
          isLocalDev,
        );
        return new Response(
          JSON.stringify({ success: false, error: "Sync failed" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }
    }

    // POST /api/ai-search/:instanceName/search - Semantic search
    const searchRegex = /^\/api\/ai-search\/([^/]+)\/search$/;
    const searchMatch = searchRegex.exec(url.pathname);
    if (request.method === "POST" && searchMatch?.[1] !== undefined) {
      const instanceName = decodeURIComponent(searchMatch[1]);
      const body = (await request.json()) as AISearchQueryRequest;
      logInfo("Semantic search query", {
        module: "ai_search",
        operation: "search",
        metadata: { instanceName },
      });

      if (isLocalDev) {
        const mockResponse: AISearchResponse = {
          data: [
            {
              file_id: "mock-1",
              filename: "schema.md",
              score: 0.92,
              content: [
                {
                  id: "1",
                  type: "text",
                  text: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE)",
                },
              ],
            },
            {
              file_id: "mock-2",
              filename: "tables/users.md",
              score: 0.85,
              content: [
                {
                  id: "2",
                  type: "text",
                  text: "The users table contains user account information with email validation.",
                },
              ],
            },
          ],
          has_more: false,
          next_page: null,
        };
        return new Response(JSON.stringify(mockResponse), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Use AI binding if available
      if (env.AI) {
        try {
          const searchParams: {
            query: string;
            rewrite_query: boolean;
            max_num_results: number;
            ranking_options?: { score_threshold: number };
            reranking?: { enabled: boolean; model?: string };
          } = {
            query: body.query,
            rewrite_query: body.rewrite_query ?? false,
            max_num_results: body.max_num_results ?? 10,
          };

          if (body.score_threshold !== undefined) {
            searchParams.ranking_options = {
              score_threshold: body.score_threshold,
            };
          }
          if (body.reranking !== undefined) {
            searchParams.reranking = body.reranking;
          }

          const result =
            await env.AI.autorag(instanceName).search(searchParams);

          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        } catch (err) {
          await logError(
            env,
            err instanceof Error ? err : String(err),
            {
              module: "ai_search",
              operation: "search",
            },
            isLocalDev,
          );
          return new Response(
            JSON.stringify({
              error: "Search failed",
              details: err instanceof Error ? err.message : "Unknown error",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            },
          );
        }
      } else {
        // Fall back to REST API
        try {
          const response = await fetch(
            `${CF_API}/accounts/${env.ACCOUNT_ID}/autorag/rags/${instanceName}/search`,
            {
              method: "POST",
              headers: cfHeaders,
              body: JSON.stringify(body),
            },
          );

          const data = await response.json();
          return new Response(JSON.stringify(data), {
            status: response.status,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        } catch (err) {
          await logError(
            env,
            err instanceof Error ? err : String(err),
            {
              module: "ai_search",
              operation: "search",
            },
            isLocalDev,
          );
          return new Response(JSON.stringify({ error: "Search failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      }
    }

    // POST /api/ai-search/:instanceName/ai-search - AI-powered search with generation
    const aiSearchRegex = /^\/api\/ai-search\/([^/]+)\/ai-search$/;
    const aiSearchMatch = aiSearchRegex.exec(url.pathname);
    if (request.method === "POST" && aiSearchMatch?.[1] !== undefined) {
      const instanceName = decodeURIComponent(aiSearchMatch[1]);
      const body = (await request.json()) as AISearchQueryRequest;
      logInfo("AI Search query", {
        module: "ai_search",
        operation: "ai_search",
        metadata: { instanceName },
      });

      if (isLocalDev) {
        const mockResponse: AISearchResponse = {
          response:
            "Based on your database schema, the `users` table has columns for id, name, and email. You can query users by email using: `SELECT * FROM users WHERE email = ?`",
          data: [
            {
              file_id: "mock-1",
              filename: "schema.md",
              score: 0.92,
              content: [
                {
                  id: "1",
                  type: "text",
                  text: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE)",
                },
              ],
            },
          ],
          has_more: false,
          next_page: null,
        };
        return new Response(JSON.stringify(mockResponse), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Use AI binding if available
      if (env.AI) {
        try {
          if (body.stream === true) {
            // Streaming response
            const streamParams: {
              query: string;
              rewrite_query: boolean;
              max_num_results: number;
              stream: true;
              ranking_options?: { score_threshold: number };
              reranking?: { enabled: boolean; model?: string };
            } = {
              query: body.query,
              rewrite_query: body.rewrite_query ?? false,
              max_num_results: body.max_num_results ?? 10,
              stream: true,
            };

            if (body.score_threshold !== undefined) {
              streamParams.ranking_options = {
                score_threshold: body.score_threshold,
              };
            }
            if (body.reranking !== undefined) {
              streamParams.reranking = body.reranking;
            }

            const streamResult =
              await env.AI.autorag(instanceName).aiSearch(streamParams);

            return new Response(streamResult.body, {
              headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
                ...corsHeaders,
              },
            });
          } else {
            // Non-streaming response
            const searchParams: {
              query: string;
              rewrite_query: boolean;
              max_num_results: number;
              ranking_options?: { score_threshold: number };
              reranking?: { enabled: boolean; model?: string };
            } = {
              query: body.query,
              rewrite_query: body.rewrite_query ?? false,
              max_num_results: body.max_num_results ?? 10,
            };

            if (body.score_threshold !== undefined) {
              searchParams.ranking_options = {
                score_threshold: body.score_threshold,
              };
            }
            if (body.reranking !== undefined) {
              searchParams.reranking = body.reranking;
            }

            const result =
              await env.AI.autorag(instanceName).aiSearch(searchParams);

            return new Response(JSON.stringify(result), {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }
        } catch (err) {
          await logError(
            env,
            err instanceof Error ? err : String(err),
            {
              module: "ai_search",
              operation: "ai_search",
            },
            isLocalDev,
          );
          return new Response(
            JSON.stringify({
              error: "AI Search failed",
              details: err instanceof Error ? err.message : "Unknown error",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            },
          );
        }
      } else {
        // Fall back to REST API
        try {
          const response = await fetch(
            `${CF_API}/accounts/${env.ACCOUNT_ID}/autorag/rags/${instanceName}/ai-search`,
            {
              method: "POST",
              headers: cfHeaders,
              body: JSON.stringify(body),
            },
          );

          const data = await response.json();
          return new Response(JSON.stringify(data), {
            status: response.status,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        } catch (err) {
          await logError(
            env,
            err instanceof Error ? err : String(err),
            {
              module: "ai_search",
              operation: "ai_search",
            },
            isLocalDev,
          );
          return new Response(JSON.stringify({ error: "AI Search failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      }
    }

    // GET /api/ai-search/dashboard-url - Get Cloudflare dashboard URL
    if (
      request.method === "GET" &&
      url.pathname === "/api/ai-search/dashboard-url"
    ) {
      return new Response(
        JSON.stringify({
          url: "https://dash.cloudflare.com/?to=/:account/ai/ai-search",
          accountId: isLocalDev ? "local-dev" : env.ACCOUNT_ID,
        }),
        {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }
  } catch (err) {
    await logError(
      env,
      err instanceof Error ? err : String(err),
      {
        module: "ai_search",
        operation: "handle_request",
      },
      isLocalDev,
    );
    return new Response(
      JSON.stringify({ error: "AI Search operation failed" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }

  return new Response("Not Found", { status: 404, headers: corsHeaders });
}
