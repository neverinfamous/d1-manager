import type { Env } from "../types";
import { analyzeIndexes } from "../utils/index-analyzer";
import {
  isProtectedDatabase,
  createProtectedDatabaseResponse,
  getDatabaseInfo,
} from "../utils/database-protection";
import { OperationType, trackOperation } from "../utils/job-tracking";
import { logError, logInfo, logWarning } from "../utils/error-logger";

const CF_API = "https://api.cloudflare.com/client/v4";

// Helper to create response headers with CORS
function jsonHeaders(corsHeaders: HeadersInit): Headers {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json");
  return headers;
}

interface IndexCreateBody {
  sql: string;
  tableName?: string;
  indexName?: string;
  columns?: string[];
}

/**
 * Handle Index Analyzer routes
 */
export async function handleIndexRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string | null,
): Promise<Response> {
  logInfo("Handling index analyzer operation", {
    module: "indexes",
    operation: "request",
  });

  // Extract database ID from URL (format: /api/indexes/:dbId/...)
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
        module: "indexes",
        operation: "access_check",
        databaseId: dbId,
        databaseName: dbInfo.name,
      });
      return createProtectedDatabaseResponse(corsHeaders);
    }
  }

  try {
    // Analyze indexes
    if (
      request.method === "GET" &&
      url.pathname === `/api/indexes/${dbId}/analyze`
    ) {
      logInfo(`Analyzing indexes for database: ${dbId}`, {
        module: "indexes",
        operation: "analyze",
        databaseId: dbId,
      });

      // Mock response for local development
      if (isLocalDev) {
        return new Response(
          JSON.stringify({
            recommendations: [
              {
                tableName: "users",
                columnName: "email",
                indexType: "single",
                priority: "high",
                rationale:
                  "Used in WHERE clause 5 times in recent queries. High filter frequency indicates strong indexing candidate.",
                estimatedImpact:
                  "High - Will significantly speed up filtered queries",
                suggestedSQL: "CREATE INDEX idx_users_email ON users(email);",
              },
              {
                tableName: "posts",
                columnName: "user_id",
                indexType: "single",
                priority: "high",
                rationale:
                  "Foreign key column referencing users.id. Indexes on foreign keys significantly improve JOIN performance.",
                estimatedImpact:
                  "High - Foreign key lookups will be much faster, especially for JOINs",
                suggestedSQL:
                  "CREATE INDEX idx_posts_user_id ON posts(user_id);",
              },
              {
                tableName: "users",
                columnName: "created_at",
                indexType: "single",
                priority: "medium",
                rationale:
                  "Used in ORDER BY clause 3 times. Indexes can avoid full table sorts.",
                estimatedImpact: "Medium - Speeds up sorted result retrieval",
                suggestedSQL:
                  "CREATE INDEX idx_users_created_at ON users(created_at);",
              },
              {
                tableName: "comments",
                columnName: "post_id",
                indexType: "single",
                priority: "high",
                rationale:
                  "Foreign key column referencing posts.id. Indexes on foreign keys significantly improve JOIN performance.",
                estimatedImpact:
                  "High - Foreign key lookups will be much faster, especially for JOINs",
                suggestedSQL:
                  "CREATE INDEX idx_comments_post_id ON comments(post_id);",
              },
            ],
            existingIndexes: [
              {
                tableName: "users",
                indexes: [
                  {
                    name: "sqlite_autoindex_users_1",
                    columns: ["id"],
                    unique: true,
                  },
                ],
              },
              {
                tableName: "posts",
                indexes: [
                  {
                    name: "sqlite_autoindex_posts_1",
                    columns: ["id"],
                    unique: true,
                  },
                ],
              },
              {
                tableName: "comments",
                indexes: [
                  {
                    name: "sqlite_autoindex_comments_1",
                    columns: ["id"],
                    unique: true,
                  },
                ],
              },
            ],
            statistics: {
              totalRecommendations: 4,
              tablesWithoutIndexes: 0,
              averageQueryEfficiency: 0.65,
            },
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      // Perform actual analysis
      const analysis = await analyzeIndexes(dbId, env, isLocalDev);

      return new Response(
        JSON.stringify({
          ...analysis,
          success: true,
        }),
        {
          headers: jsonHeaders(corsHeaders),
        },
      );
    }

    // Create index
    if (
      request.method === "POST" &&
      url.pathname === `/api/indexes/${dbId}/create`
    ) {
      logInfo(`Creating index for database: ${dbId}`, {
        module: "indexes",
        operation: "create",
        databaseId: dbId,
      });

      const body: IndexCreateBody = await request.json();

      if (!body.sql) {
        return new Response(
          JSON.stringify({
            error: "SQL statement required",
          }),
          {
            status: 400,
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      // Mock response for local development
      if (isLocalDev) {
        return new Response(
          JSON.stringify({
            result: {
              success: true,
              message: "Index created successfully (mock)",
            },
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      // Track index creation with job history
      try {
        const { result, jobId } = await trackOperation({
          env,
          operationType: OperationType.INDEX_CREATE,
          databaseId: dbId,
          userEmail: userEmail ?? "unknown",
          isLocalDev,
          metadata: {
            sql: body.sql,
            tableName: body.tableName,
            indexName: body.indexName,
            columns: body.columns,
          },
          totalItems: 1,
          operation: async () => {
            // Execute the CREATE INDEX statement via Cloudflare API
            const response = await fetch(
              `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}/query`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${env.API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ sql: body.sql }),
              },
            );

            if (!response.ok) {
              const errorData = (await response.json().catch(() => ({}))) as {
                errors?: { message: string }[];
              };
              const errorMessage =
                errorData.errors?.[0]?.message ??
                `API error: ${String(response.status)}`;
              throw new Error(errorMessage);
            }

            return { success: true, message: "Index created successfully" };
          },
        });

        return new Response(
          JSON.stringify({
            result,
            jobId,
            success: true,
          }),
          {
            headers: jsonHeaders(corsHeaders),
          },
        );
      } catch (err) {
        void logError(
          env,
          err instanceof Error ? err : String(err),
          { module: "indexes", operation: "create", databaseId: dbId },
          isLocalDev,
        );
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        return new Response(
          JSON.stringify({
            error: "Failed to create index",
            message: errorMessage,
            success: false,
          }),
          {
            status: 500,
            headers: jsonHeaders(corsHeaders),
          },
        );
      }
    }

    // Route not found
    return new Response(
      JSON.stringify({
        error: "Route not found",
      }),
      {
        status: 404,
        headers: jsonHeaders(corsHeaders),
      },
    );
  } catch (error) {
    void logError(
      env,
      error instanceof Error ? error : String(error),
      { module: "indexes", operation: "request", databaseId: dbId },
      isLocalDev,
    );
    return new Response(
      JSON.stringify({
        error: "Failed to analyze indexes",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: jsonHeaders(corsHeaders),
      },
    );
  }
}
