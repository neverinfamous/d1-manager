import type { 
  Env, 
  MetricsTimeRange, 
  MetricsResponse, 
  MetricsDataPoint,
  StorageDataPoint,
  DatabaseMetricsSummary,
  GraphQLResponse,
  D1AnalyticsResult,
  D1DatabaseInfo
} from '../types';
import { CF_API } from '../types';
import { logInfo, logWarning, logError } from '../utils/error-logger';

const GRAPHQL_API = 'https://api.cloudflare.com/client/v4/graphql';

/**
 * Helper to create response headers with CORS
 */
function jsonHeaders(corsHeaders: HeadersInit): Headers {
  const headers = new Headers(corsHeaders);
  headers.set('Content-Type', 'application/json');
  return headers;
}

/**
 * Calculate date range based on time range string
 */
function getDateRange(timeRange: MetricsTimeRange): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  
  switch (timeRange) {
    case '24h':
      start.setHours(start.getHours() - 24);
      break;
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
  }
  
  return {
    start: start.toISOString().split('T')[0] ?? '',
    end: end.toISOString().split('T')[0] ?? ''
  };
}

/**
 * Build GraphQL query for D1 analytics
 */
function buildAnalyticsQuery(accountId: string, start: string, end: string): string {
  return `
    query D1Metrics {
      viewer {
        accounts(filter: { accountTag: "${accountId}" }) {
          d1AnalyticsAdaptiveGroups(
            limit: 10000
            filter: { date_geq: "${start}", date_leq: "${end}" }
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
            filter: { date_geq: "${start}", date_leq: "${end}" }
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
        }
      }
    }
  `;
}

/**
 * Fetch database names for mapping IDs to names
 */
async function fetchDatabaseNames(
  env: Env,
  cfHeaders: Record<string, string>
): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();
  
  try {
    const response = await fetch(
      `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database`,
      { headers: cfHeaders }
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
    logWarning('Failed to fetch database names for metrics', {
      module: 'metrics',
      operation: 'fetch_names',
      metadata: { error: err instanceof Error ? err.message : String(err) }
    });
  }
  
  return nameMap;
}

/**
 * Execute GraphQL query against Cloudflare Analytics API
 */
async function executeGraphQLQuery(
  env: Env,
  query: string,
  isLocalDev: boolean
): Promise<D1AnalyticsResult | null> {
  const cfHeaders = {
    'Authorization': `Bearer ${env.API_KEY}`,
    'Content-Type': 'application/json'
  };
  
  try {
    logInfo('Executing GraphQL analytics query', {
      module: 'metrics',
      operation: 'graphql_query'
    });
    
    const response = await fetch(GRAPHQL_API, {
      method: 'POST',
      headers: cfHeaders,
      body: JSON.stringify({ query })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      void logError(env, `GraphQL API error: ${errorText}`, {
        module: 'metrics',
        operation: 'graphql_query',
        metadata: { status: response.status }
      }, isLocalDev);
      return null;
    }
    
    const result: GraphQLResponse<D1AnalyticsResult> = await response.json();
    
    if (result.errors && result.errors.length > 0) {
      const errorMessages = result.errors.map(e => e.message).join(', ');
      void logError(env, `GraphQL errors: ${errorMessages}`, {
        module: 'metrics',
        operation: 'graphql_query',
        metadata: { errors: result.errors }
      }, isLocalDev);
      return null;
    }
    
    return result.data ?? null;
  } catch (err) {
    void logError(env, err instanceof Error ? err : String(err), {
      module: 'metrics',
      operation: 'graphql_query'
    }, isLocalDev);
    return null;
  }
}

/**
 * Process raw GraphQL results into structured metrics response
 */
function processMetricsData(
  data: D1AnalyticsResult,
  timeRange: MetricsTimeRange,
  startDate: string,
  endDate: string,
  databaseNames: Map<string, string>
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
        databaseCount: 0
      },
      byDatabase: [],
      timeSeries: [],
      storageSeries: []
    };
  }
  
  const analyticsGroups = account.d1AnalyticsAdaptiveGroups ?? [];
  const storageGroups = account.d1StorageAdaptiveGroups ?? [];
  
  // Build time series data
  const timeSeries: MetricsDataPoint[] = analyticsGroups.map(group => ({
    date: group.dimensions.date,
    databaseId: group.dimensions.databaseId,
    readQueries: group.sum.readQueries,
    writeQueries: group.sum.writeQueries,
    rowsRead: group.sum.rowsRead,
    rowsWritten: group.sum.rowsWritten,
    queryBatchTimeMsP50: group.quantiles?.queryBatchTimeMsP50,
    queryBatchTimeMsP90: group.quantiles?.queryBatchTimeMsP90,
    queryBatchResponseBytes: group.sum.queryBatchResponseBytes
  }));
  
  // Build storage series data
  const storageSeries: StorageDataPoint[] = storageGroups.map(group => ({
    date: group.dimensions.date,
    databaseId: group.dimensions.databaseId,
    databaseSizeBytes: group.max.databaseSizeBytes
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
        totalRowsWritten: group.sum.rowsWritten
      });
    }
    
    // Collect latency samples for averaging
    if (group.quantiles?.queryBatchTimeMsP90 !== undefined && group.quantiles.queryBatchTimeMsP90 !== null) {
      const samples = latencySamples.get(dbId) ?? [];
      samples.push(group.quantiles.queryBatchTimeMsP90);
      latencySamples.set(dbId, samples);
    }
  }
  
  // Calculate average P90 latency per database
  for (const [dbId, samples] of latencySamples) {
    const dbMetrics = byDatabaseMap.get(dbId);
    if (dbMetrics && samples.length > 0) {
      dbMetrics.p90LatencyMs = samples.reduce((a, b) => a + b, 0) / samples.length;
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
  
  const avgLatencyMs = allLatencySamples.length > 0
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
      databaseCount: byDatabase.length
    },
    byDatabase,
    timeSeries,
    storageSeries
  };
}

/**
 * Generate mock metrics data for local development
 */
function generateMockMetrics(timeRange: MetricsTimeRange): MetricsResponse {
  const { start, end } = getDateRange(timeRange);
  
  const mockDatabases = [
    { id: 'mock-db-1', name: 'dev-database' },
    { id: 'mock-db-2', name: 'test-database' }
  ];
  
  const timeSeries: MetricsDataPoint[] = [];
  const storageSeries: StorageDataPoint[] = [];
  
  // Generate sample data for each day
  const days = timeRange === '24h' ? 1 : timeRange === '7d' ? 7 : 30;
  const endDate = new Date();
  
  for (let i = 0; i < days; i++) {
    const date = new Date(endDate);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0] ?? '';
    
    for (const db of mockDatabases) {
      timeSeries.push({
        date: dateStr,
        databaseId: db.id,
        readQueries: Math.floor(Math.random() * 1000) + 100,
        writeQueries: Math.floor(Math.random() * 200) + 20,
        rowsRead: Math.floor(Math.random() * 50000) + 5000,
        rowsWritten: Math.floor(Math.random() * 1000) + 100,
        queryBatchTimeMsP50: Math.random() * 10 + 2,
        queryBatchTimeMsP90: Math.random() * 50 + 10
      });
      
      storageSeries.push({
        date: dateStr,
        databaseId: db.id,
        databaseSizeBytes: Math.floor(Math.random() * 1024 * 1024) + 100000
      });
    }
  }
  
  const byDatabase: DatabaseMetricsSummary[] = mockDatabases.map(db => ({
    databaseId: db.id,
    databaseName: db.name,
    totalReadQueries: Math.floor(Math.random() * 10000) + 1000,
    totalWriteQueries: Math.floor(Math.random() * 2000) + 200,
    totalRowsRead: Math.floor(Math.random() * 500000) + 50000,
    totalRowsWritten: Math.floor(Math.random() * 10000) + 1000,
    p90LatencyMs: Math.random() * 30 + 5,
    currentSizeBytes: Math.floor(Math.random() * 10 * 1024 * 1024) + 100000
  }));
  
  const totalReadQueries = byDatabase.reduce((sum, db) => sum + db.totalReadQueries, 0);
  const totalWriteQueries = byDatabase.reduce((sum, db) => sum + db.totalWriteQueries, 0);
  const totalRowsRead = byDatabase.reduce((sum, db) => sum + db.totalRowsRead, 0);
  const totalRowsWritten = byDatabase.reduce((sum, db) => sum + db.totalRowsWritten, 0);
  const totalStorageBytes = byDatabase.reduce((sum, db) => sum + (db.currentSizeBytes ?? 0), 0);
  const avgLatencyMs = byDatabase.reduce((sum, db) => sum + (db.p90LatencyMs ?? 0), 0) / byDatabase.length;
  
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
      databaseCount: mockDatabases.length
    },
    byDatabase,
    timeSeries,
    storageSeries
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
  _userEmail: string
): Promise<Response | null> {
  // GET /api/metrics - Get D1 analytics
  if (request.method === 'GET' && url.pathname === '/api/metrics') {
    const timeRange = (url.searchParams.get('range') ?? '7d') as MetricsTimeRange;
    
    // Validate time range
    if (!['24h', '7d', '30d'].includes(timeRange)) {
      return new Response(JSON.stringify({
        error: 'Invalid time range',
        message: 'Time range must be one of: 24h, 7d, 30d'
      }), {
        status: 400,
        headers: jsonHeaders(corsHeaders)
      });
    }
    
    logInfo(`Fetching D1 metrics for range: ${timeRange}`, {
      module: 'metrics',
      operation: 'get_metrics',
      metadata: { timeRange }
    });
    
    // Return mock data for local development
    if (isLocalDev) {
      logInfo('Using mock metrics data for local development', {
        module: 'metrics',
        operation: 'get_metrics'
      });
      
      return new Response(JSON.stringify({
        result: generateMockMetrics(timeRange),
        success: true
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    }
    
    const { start, end } = getDateRange(timeRange);
    const query = buildAnalyticsQuery(env.ACCOUNT_ID, start, end);
    
    // Fetch database names and analytics in parallel
    const cfHeaders = {
      'Authorization': `Bearer ${env.API_KEY}`,
      'Content-Type': 'application/json'
    };
    
    const [analyticsData, databaseNames] = await Promise.all([
      executeGraphQLQuery(env, query, isLocalDev),
      fetchDatabaseNames(env, cfHeaders)
    ]);
    
    if (!analyticsData) {
      return new Response(JSON.stringify({
        error: 'Failed to fetch metrics',
        message: 'Unable to retrieve analytics data from Cloudflare. This may be a permissions issue with your API token.',
        success: false
      }), {
        status: 500,
        headers: jsonHeaders(corsHeaders)
      });
    }
    
    const metrics = processMetricsData(analyticsData, timeRange, start, end, databaseNames);
    
    logInfo('Successfully retrieved D1 metrics', {
      module: 'metrics',
      operation: 'get_metrics',
      metadata: { 
        databaseCount: metrics.summary.databaseCount,
        totalQueries: metrics.summary.totalReadQueries + metrics.summary.totalWriteQueries
      }
    });
    
    return new Response(JSON.stringify({
      result: metrics,
      success: true
    }), {
      headers: jsonHeaders(corsHeaders)
    });
  }
  
  // Route not handled
  return null;
}

