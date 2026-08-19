import type {
  Env,
  MetricsTimeRange,
  D1AnalyticsResult,
  D1DatabaseInfo,
  GraphQLResponse,
} from "../types";
import { CF_API } from "../types";
import { logInfo, logWarning, logError } from "./error-logger";

const GRAPHQL_API = "https://api.cloudflare.com/client/v4/graphql";

/**
 * Calculate date range based on time range string
 */
export function getDateRange(timeRange: MetricsTimeRange): {
  start: string;
  end: string;
} {
  const end = new Date();
  const start = new Date();

  switch (timeRange) {
    case "24h":
      start.setHours(start.getHours() - 24);
      break;
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    case "30d":
      start.setDate(start.getDate() - 30);
      break;
  }

  return {
    start: start.toISOString().split("T")[0] ?? "",
    end: end.toISOString().split("T")[0] ?? "",
  };
}

/**
 * Build GraphQL query for D1 analytics
 * Queries all three adaptive dataset groups for comprehensive metrics
 */
export function buildAnalyticsQuery(
  accountId: string,
  start: string,
  end: string,
  databaseId?: string,
): string {
  const dbFilter = databaseId ? `, databaseId: "${databaseId}"` : "";

  return `
    query D1Metrics {
      viewer {
        accounts(filter: { accountTag: "${accountId}" }) {
          d1AnalyticsAdaptiveGroups(
            limit: 10000
            filter: { date_geq: "${start}", date_leq: "${end}"${dbFilter} }
            orderBy: [date_DESC]
          ) {
            sum {
              readQueries
              writeQueries
              rowsRead
              rowsWritten
              queryBatchResponseBytes
            }
            quantiles {
              queryBatchTimeMsP50
              queryBatchTimeMsP90
            }
            avg {
              queryBatchTimeMs
            }
            dimensions {
              date
              databaseId
            }
          }
          d1StorageAdaptiveGroups(
            limit: 10000
            filter: { date_geq: "${start}", date_leq: "${end}"${dbFilter} }
            orderBy: [date_DESC]
          ) {
            max {
              databaseSizeBytes
            }
            dimensions {
              date
              databaseId
            }
          }
          d1QueriesAdaptiveGroups(
            limit: 100
            filter: { datetimeHour_geq: "${start}T00:00:00Z", datetimeHour_leq: "${end}T23:59:59Z"${dbFilter} }
            orderBy: [sum_queryDurationMs_DESC]
          ) {
            sum {
              queryDurationMs
              rowsRead
              rowsWritten
              rowsReturned
            }
            avg {
              queryDurationMs
              rowsRead
              rowsWritten
              rowsReturned
            }
            count
            dimensions {
              query
            }
          }
        }
      }
    }
  `;
}

/**
 * Fetch database names for mapping IDs to names
 */
export async function fetchDatabaseNames(
  env: Env,
  cfHeaders: Record<string, string>,
): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();

  try {
    const response = await fetch(
      `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database`,
      { headers: cfHeaders },
    );

    if (response.ok) {
      const data: { result?: D1DatabaseInfo[] } = await response.json();
      if (data.result) {
        for (const db of data.result) {
          nameMap.set(db.uuid, db.name);
        }
      }
    }
  } catch (err) {
    logWarning("Failed to fetch database names for analytics", {
      module: "analytics",
      operation: "fetch_names",
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
  }

  return nameMap;
}

/**
 * Execute GraphQL query against Cloudflare Analytics API
 */
export async function executeGraphQLQuery(
  env: Env,
  query: string,
  isLocalDev: boolean,
): Promise<D1AnalyticsResult | null> {
  const cfHeaders = {
    Authorization: `Bearer ${env.API_KEY}`,
    "Content-Type": "application/json",
  };

  try {
    logInfo("Executing GraphQL analytics query", {
      module: "analytics",
      operation: "graphql_query",
    });

    const response = await fetch(GRAPHQL_API, {
      method: "POST",
      headers: cfHeaders,
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      void logError(
        env,
        `GraphQL API error: ${errorText}`,
        {
          module: "analytics",
          operation: "graphql_query",
          metadata: { status: response.status },
        },
        isLocalDev,
      );
      return null;
    }

    const result: GraphQLResponse<D1AnalyticsResult> = await response.json();

    if (result.errors && result.errors.length > 0) {
      const errorMessages = result.errors.map((e) => e.message).join(", ");
      void logError(
        env,
        `GraphQL errors: ${errorMessages}`,
        {
          module: "analytics",
          operation: "graphql_query",
          metadata: { errors: result.errors },
        },
        isLocalDev,
      );
      return null;
    }

    return result.data ?? null;
  } catch (err) {
    void logError(
      env,
      err instanceof Error ? err : String(err),
      {
        module: "analytics",
        operation: "graphql_query",
      },
      isLocalDev,
    );
    return null;
  }
}
