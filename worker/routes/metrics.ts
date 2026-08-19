import type {
  Env,
  MetricsTimeRange,
  MetricsResponse,
  MetricsDataPoint,
  StorageDataPoint,
  DatabaseMetricsSummary,
  D1AnalyticsResult,
  QueryInsight,
} from "../types";
import { logInfo } from "../utils/error-logger";

import {
  getDateRange,
  buildAnalyticsQuery,
  fetchDatabaseNames,
  executeGraphQLQuery,
} from "../utils/analytics";

/**
 * Helper to create response headers with CORS
 */
function jsonHeaders(corsHeaders: HeadersInit): Headers {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json");
  return headers;
}

/**
 * Process raw GraphQL results into structured metrics response
 */
function processMetricsData(
  data: D1AnalyticsResult,
  timeRange: MetricsTimeRange,
  startDate: string,
  endDate: string,
  databaseNames: Map<string, string>,
): MetricsResponse {
  const accounts = data.viewer.accounts;
  const account = accounts[0];

  if (!account) {
    return {
      summary: {
        timeRange,
        startDate,
        endDate,
        totalReadQueries: 0,
        totalWriteQueries: 0,
        totalRowsRead: 0,
        totalRowsWritten: 0,
        totalStorageBytes: 0,
        databaseCount: 0,
      },
      byDatabase: [],
      timeSeries: [],
      storageSeries: [],
      queryInsights: [],
    };
  }

  const analyticsGroups = account.d1AnalyticsAdaptiveGroups ?? [];
  const storageGroups = account.d1StorageAdaptiveGroups ?? [];
  const queryGroups = account.d1QueriesAdaptiveGroups ?? [];

  // Build time series data
  const timeSeries: MetricsDataPoint[] = analyticsGroups.map((group) => ({
    date: group.dimensions.date,
    databaseId: group.dimensions.databaseId,
    readQueries: group.sum.readQueries,
    writeQueries: group.sum.writeQueries,
    rowsRead: group.sum.rowsRead,
    rowsWritten: group.sum.rowsWritten,
    queryBatchTimeMsP50: group.quantiles?.queryBatchTimeMsP50,
    queryBatchTimeMsP90: group.quantiles?.queryBatchTimeMsP90,
    queryBatchResponseBytes: group.sum.queryBatchResponseBytes,
  }));

  // Build storage series data
  const storageSeries: StorageDataPoint[] = storageGroups.map((group) => ({
    date: group.dimensions.date,
    databaseId: group.dimensions.databaseId,
    databaseSizeBytes: group.max.databaseSizeBytes,
  }));

  // Build Query Insights for slow query analysis
  // Note: d1QueriesAdaptiveGroups only provides 'query' dimension, no databaseId per query
  const queryInsights: QueryInsight[] = queryGroups.map((group) => ({
    queryHash: group.dimensions.query.slice(0, 16), // Generate hash from query prefix
    queryString: group.dimensions.query,
    databaseId: "", // Not available per-query from this endpoint
    databaseName: undefined,
    totalTimeMs: group.sum.queryDurationMs,
    avgTimeMs: group.avg?.queryDurationMs ?? 0,
    executionCount: group.count,
    rowsRead: group.sum.rowsRead,
    rowsWritten: group.sum.rowsWritten,
  }));

  // Aggregate by database
  const byDatabaseMap = new Map<string, DatabaseMetricsSummary>();
  const latencySamples = new Map<string, number[]>();

  for (const group of analyticsGroups) {
    const dbId = group.dimensions.databaseId;
    const existing = byDatabaseMap.get(dbId);

    if (existing) {
      existing.totalReadQueries += group.sum.readQueries;
      existing.totalWriteQueries += group.sum.writeQueries;
      existing.totalRowsRead += group.sum.rowsRead;
      existing.totalRowsWritten += group.sum.rowsWritten;
    } else {
      byDatabaseMap.set(dbId, {
        databaseId: dbId,
        databaseName: databaseNames.get(dbId),
        totalReadQueries: group.sum.readQueries,
        totalWriteQueries: group.sum.writeQueries,
        totalRowsRead: group.sum.rowsRead,
        totalRowsWritten: group.sum.rowsWritten,
      });
    }

    // Collect latency samples for averaging
    if (
      group.quantiles?.queryBatchTimeMsP90 !== undefined &&
      group.quantiles.queryBatchTimeMsP90 !== null
    ) {
      const samples = latencySamples.get(dbId) ?? [];
      samples.push(group.quantiles.queryBatchTimeMsP90);
      latencySamples.set(dbId, samples);
    }
  }

  // Calculate average P90 latency per database
  for (const [dbId, samples] of latencySamples) {
    const dbMetrics = byDatabaseMap.get(dbId);
    if (dbMetrics && samples.length > 0) {
      dbMetrics.p90LatencyMs =
        samples.reduce((a, b) => a + b, 0) / samples.length;
    }
  }

  // Get latest storage size per database
  const latestStorageByDb = new Map<string, number>();
  for (const group of storageGroups) {
    const dbId = group.dimensions.databaseId;
    if (!latestStorageByDb.has(dbId)) {
      latestStorageByDb.set(dbId, group.max.databaseSizeBytes);
    }
  }

  for (const [dbId, size] of latestStorageByDb) {
    const dbMetrics = byDatabaseMap.get(dbId);
    if (dbMetrics) {
      dbMetrics.currentSizeBytes = size;
    }
  }

  const byDatabase = Array.from(byDatabaseMap.values());

  // Calculate totals
  let totalReadQueries = 0;
  let totalWriteQueries = 0;
  let totalRowsRead = 0;
  let totalRowsWritten = 0;
  let totalStorageBytes = 0;
  const allLatencySamples: number[] = [];

  for (const db of byDatabase) {
    totalReadQueries += db.totalReadQueries;
    totalWriteQueries += db.totalWriteQueries;
    totalRowsRead += db.totalRowsRead;
    totalRowsWritten += db.totalRowsWritten;
    if (db.currentSizeBytes !== undefined && db.currentSizeBytes !== null) {
      totalStorageBytes += db.currentSizeBytes;
    }
    if (db.p90LatencyMs !== undefined && db.p90LatencyMs !== null) {
      allLatencySamples.push(db.p90LatencyMs);
    }
  }

  const avgLatencyMs =
    allLatencySamples.length > 0
      ? allLatencySamples.reduce((a, b) => a + b, 0) / allLatencySamples.length
      : undefined;

  return {
    summary: {
      timeRange,
      startDate,
      endDate,
      totalReadQueries,
      totalWriteQueries,
      totalRowsRead,
      totalRowsWritten,
      avgLatencyMs,
      totalStorageBytes,
      databaseCount: byDatabase.length,
    },
    byDatabase,
    timeSeries,
    storageSeries,
    queryInsights,
  };
}

/**
 * Generate mock metrics data for local development
 */
function generateMockMetrics(timeRange: MetricsTimeRange): MetricsResponse {
  const { start, end } = getDateRange(timeRange);

  const mockDatabases = [
    { id: "mock-db-1", name: "dev-database" },
    { id: "mock-db-2", name: "test-database" },
  ];

  const timeSeries: MetricsDataPoint[] = [];
  const storageSeries: StorageDataPoint[] = [];

  // Generate sample data for each day
  const days = timeRange === "24h" ? 1 : timeRange === "7d" ? 7 : 30;
  const endDate = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(endDate);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0] ?? "";

    for (const db of mockDatabases) {
      timeSeries.push({
        date: dateStr,
        databaseId: db.id,
        readQueries: Math.floor(Math.random() * 1000) + 100,
        writeQueries: Math.floor(Math.random() * 200) + 20,
        rowsRead: Math.floor(Math.random() * 50000) + 5000,
        rowsWritten: Math.floor(Math.random() * 1000) + 100,
        queryBatchTimeMsP50: Math.random() * 10 + 2,
        queryBatchTimeMsP90: Math.random() * 50 + 10,
      });

      storageSeries.push({
        date: dateStr,
        databaseId: db.id,
        databaseSizeBytes: Math.floor(Math.random() * 1024 * 1024) + 100000,
      });
    }
  }

  const byDatabase: DatabaseMetricsSummary[] = mockDatabases.map((db) => ({
    databaseId: db.id,
    databaseName: db.name,
    totalReadQueries: Math.floor(Math.random() * 10000) + 1000,
    totalWriteQueries: Math.floor(Math.random() * 2000) + 200,
    totalRowsRead: Math.floor(Math.random() * 500000) + 50000,
    totalRowsWritten: Math.floor(Math.random() * 10000) + 1000,
    p90LatencyMs: Math.random() * 30 + 5,
    currentSizeBytes: Math.floor(Math.random() * 10 * 1024 * 1024) + 100000,
  }));

  // Generate mock Query Insights (slow query examples)
  const mockQueries = [
    { query: "SELECT * FROM users WHERE email LIKE ?", hash: "a1b2c3d4" },
    {
      query: "SELECT u.*, p.* FROM users u JOIN posts p ON u.id = p.user_id",
      hash: "e5f6g7h8",
    },
    {
      query: "UPDATE sessions SET last_active = ? WHERE user_id = ?",
      hash: "i9j0k1l2",
    },
    {
      query: "SELECT COUNT(*) FROM events WHERE created_at > ?",
      hash: "m3n4o5p6",
    },
    {
      query: "INSERT INTO logs (action, data, timestamp) VALUES (?, ?, ?)",
      hash: "q7r8s9t0",
    },
    {
      query: "DELETE FROM expired_tokens WHERE expires_at < ?",
      hash: "u1v2w3x4",
    },
  ];

  const queryInsights: QueryInsight[] = mockQueries
    .map((q, i) => ({
      queryHash: q.hash,
      queryString: q.query,
      databaseId: mockDatabases[i % 2]?.id ?? "mock-db-1",
      databaseName: mockDatabases[i % 2]?.name,
      totalTimeMs: Math.floor(Math.random() * 5000) + 100,
      avgTimeMs: Math.random() * 100 + 5,
      executionCount: Math.floor(Math.random() * 1000) + 10,
      rowsRead: Math.floor(Math.random() * 100000) + 1000,
      rowsWritten: Math.floor(Math.random() * 1000) + 10,
    }))
    .sort((a, b) => b.totalTimeMs - a.totalTimeMs);

  const totalReadQueries = byDatabase.reduce(
    (sum, db) => sum + db.totalReadQueries,
    0,
  );
  const totalWriteQueries = byDatabase.reduce(
    (sum, db) => sum + db.totalWriteQueries,
    0,
  );
  const totalRowsRead = byDatabase.reduce(
    (sum, db) => sum + db.totalRowsRead,
    0,
  );
  const totalRowsWritten = byDatabase.reduce(
    (sum, db) => sum + db.totalRowsWritten,
    0,
  );
  const totalStorageBytes = byDatabase.reduce(
    (sum, db) => sum + (db.currentSizeBytes ?? 0),
    0,
  );
  const avgLatencyMs =
    byDatabase.reduce((sum, db) => sum + (db.p90LatencyMs ?? 0), 0) /
    byDatabase.length;

  return {
    summary: {
      timeRange,
      startDate: start,
      endDate: end,
      totalReadQueries,
      totalWriteQueries,
      totalRowsRead,
      totalRowsWritten,
      avgLatencyMs,
      totalStorageBytes,
      databaseCount: mockDatabases.length,
    },
    byDatabase,
    timeSeries,
    storageSeries,
    queryInsights,
  };
}

/**
 * Handle metrics API routes
 */
export async function handleMetricsRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  _userEmail: string,
): Promise<Response | null> {
  // GET /api/metrics - Get D1 analytics with optional database filter
  if (request.method === "GET" && url.pathname === "/api/metrics") {
    const timeRange = (url.searchParams.get("range") ??
      "7d") as MetricsTimeRange;
    const databaseId = url.searchParams.get("databaseId") ?? undefined;

    // Validate time range
    if (!["24h", "7d", "30d"].includes(timeRange)) {
      return new Response(
        JSON.stringify({
          error: "Invalid time range",
          message: "Time range must be one of: 24h, 7d, 30d",
        }),
        {
          status: 400,
          headers: jsonHeaders(corsHeaders),
        },
      );
    }

    logInfo(
      `Fetching D1 metrics for range: ${timeRange}${databaseId ? ` (filtered to ${databaseId})` : ""}`,
      {
        module: "metrics",
        operation: "get_metrics",
        metadata: { timeRange, databaseId },
      },
    );

    // Return mock data for local development
    if (isLocalDev) {
      logInfo("Using mock metrics data for local development", {
        module: "metrics",
        operation: "get_metrics",
      });

      return new Response(
        JSON.stringify({
          result: generateMockMetrics(timeRange),
          success: true,
        }),
        {
          headers: jsonHeaders(corsHeaders),
        },
      );
    }

    const { start, end } = getDateRange(timeRange);
    const query = buildAnalyticsQuery(env.ACCOUNT_ID, start, end, databaseId);

    // Fetch database names and analytics in parallel
    const cfHeaders = {
      Authorization: `Bearer ${env.API_KEY}`,
      "Content-Type": "application/json",
    };

    const [analyticsData, databaseNames] = await Promise.all([
      executeGraphQLQuery(env, query, isLocalDev),
      fetchDatabaseNames(env, cfHeaders),
    ]);

    if (!analyticsData) {
      return new Response(
        JSON.stringify({
          error: "Failed to fetch metrics",
          message:
            "Unable to retrieve analytics data from Cloudflare. This may be a permissions issue with your API token.",
          success: false,
        }),
        {
          status: 500,
          headers: jsonHeaders(corsHeaders),
        },
      );
    }

    const metrics = processMetricsData(
      analyticsData,
      timeRange,
      start,
      end,
      databaseNames,
    );

    logInfo("Successfully retrieved D1 metrics", {
      module: "metrics",
      operation: "get_metrics",
      metadata: {
        databaseCount: metrics.summary.databaseCount,
        totalQueries:
          metrics.summary.totalReadQueries + metrics.summary.totalWriteQueries,
        queryInsightsCount: metrics.queryInsights?.length ?? 0,
      },
    });

    return new Response(
      JSON.stringify({
        result: metrics,
        success: true,
      }),
      {
        headers: jsonHeaders(corsHeaders),
      },
    );
  }

  // Route not handled
  return null;
}
