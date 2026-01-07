import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  Database,
  Clock,
  HardDrive,
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown,
  FileText,
  Zap,
  Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MetricsChart, MetricsBarChart } from './MetricsChart';
import { QueryInsightsTab } from './QueryInsightsTab';
import {
  getMetrics,
  type MetricsResponse,
  type MetricsTimeRange,
  type MetricsDataPoint
} from '@/services/api';
import { ErrorMessage } from '@/components/ui/error-message';

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i] ?? 'B'}`;
}

/**
 * Format large numbers with K, M, B suffixes
 */
function formatNumber(num: number): string {
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toLocaleString();
}

/**
 * Format milliseconds to readable latency
 */
function formatLatency(ms: number | undefined): string {
  if (ms === undefined) return 'N/A';
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Aggregate time series data by date
 */
function aggregateByDate(data: MetricsDataPoint[]): { date: string; reads: number; writes: number }[] {
  const byDate = new Map<string, { reads: number; writes: number }>();

  for (const point of data) {
    const existing = byDate.get(point.date);
    if (existing) {
      existing.reads += point.readQueries;
      existing.writes += point.writeQueries;
    } else {
      byDate.set(point.date, {
        reads: point.readQueries,
        writes: point.writeQueries
      });
    }
  }

  return Array.from(byDate.entries())
    .map(([date, values]) => ({ date, ...values }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Format date for display on chart axis
 */
function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function MetricsDashboard(): React.JSX.Element {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<MetricsTimeRange>('7d');
  const [activeTab, setActiveTab] = useState<'overview' | 'insights'>('overview');

  const loadMetrics = useCallback(async (skipCache: boolean) => {
    setLoading(true);
    setError(null);

    try {
      // Use cache on initial load for instant revisits
      const data = await getMetrics(timeRange, skipCache);
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    void loadMetrics(false); // Use cache on initial load
  }, [loadMetrics]);

  const handleTimeRangeChange = (value: string): void => {
    setTimeRange(value as MetricsTimeRange);
  };

  // Prepare chart data
  const queryChartData = metrics ? aggregateByDate(metrics.timeSeries).map(d => ({
    label: formatDateLabel(d.date),
    value: d.reads + d.writes,
    tooltip: `${formatDateLabel(d.date)}: ${formatNumber(d.reads)} reads, ${formatNumber(d.writes)} writes`
  })) : [];

  const rowsChartData = metrics ? aggregateByDate(metrics.timeSeries).map(d => {
    const point = metrics.timeSeries.find(p => p.date === d.date);
    return {
      label: formatDateLabel(d.date),
      value: point ? point.rowsRead : 0,
      tooltip: `${formatDateLabel(d.date)}: ${formatNumber(point?.rowsRead ?? 0)} rows read`
    };
  }) : [];

  const databaseBarData = metrics?.byDatabase
    .slice()
    .sort((a, b) => (b.totalReadQueries + b.totalWriteQueries) - (a.totalReadQueries + a.totalWriteQueries))
    .map(db => ({
      label: db.databaseName ?? db.databaseId.slice(0, 8),
      value: db.totalReadQueries + db.totalWriteQueries,
      color: '#3b82f6'
    })) ?? [];

  const storageBarData = metrics?.byDatabase
    .filter(db => db.currentSizeBytes !== undefined)
    .slice()
    .sort((a, b) => (b.currentSizeBytes ?? 0) - (a.currentSizeBytes ?? 0))
    .map(db => ({
      label: db.databaseName ?? db.databaseId.slice(0, 8),
      value: db.currentSizeBytes ?? 0,
      color: '#10b981'
    })) ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Metrics</h2>
          <p className="text-muted-foreground">
            D1 database analytics and performance metrics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={timeRange}
            onValueChange={handleTimeRangeChange}
            disabled={loading}
          >
            <SelectTrigger
              className="w-[140px]"
              aria-label="Select time range"
            >
              <SelectValue placeholder="Time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => void loadMetrics(true)}
            disabled={loading}
            aria-label="Refresh metrics"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Error State */}
      <ErrorMessage error={error} variant="card" showTitle />

      {/* Loading State */}
      {loading && !metrics && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Summary Cards */}
      {metrics && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'overview' | 'insights')} className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Query Insights
              {metrics.queryInsights && metrics.queryInsights.length > 0 && (
                <span className="ml-1 bg-primary/10 text-primary text-xs px-1.5 py-0.5 rounded-full">
                  {metrics.queryInsights.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Queries</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatNumber(metrics.summary.totalReadQueries + metrics.summary.totalWriteQueries)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-blue-500">{formatNumber(metrics.summary.totalReadQueries)} reads</span>
                    {' / '}
                    <span className="text-green-500">{formatNumber(metrics.summary.totalWriteQueries)} writes</span>
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Rows Read</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatNumber(metrics.summary.totalRowsRead)}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-amber-500" />
                    Used for billing calculations
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Latency (P90)</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatLatency(metrics.summary.avgLatencyMs)}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    {metrics.summary.avgLatencyMs && metrics.summary.avgLatencyMs < 50 ? (
                      <>
                        <Zap className="h-3 w-3 text-green-500" />
                        Good performance
                      </>
                    ) : metrics.summary.avgLatencyMs && metrics.summary.avgLatencyMs < 200 ? (
                      <>
                        <Clock className="h-3 w-3 text-yellow-500" />
                        Acceptable latency
                      </>
                    ) : (
                      <>
                        <TrendingDown className="h-3 w-3 text-red-500" />
                        Consider optimizing
                      </>
                    )}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Storage</CardTitle>
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatBytes(metrics.summary.totalStorageBytes)}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Database className="h-3 w-3" />
                    {metrics.summary.databaseCount} database{metrics.summary.databaseCount !== 1 ? 's' : ''}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Query Volume</CardTitle>
                  <CardDescription>
                    Total read and write queries over time
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <MetricsChart
                    data={queryChartData}
                    title=""
                    color="#3b82f6"
                    height={250}
                    formatValue={formatNumber}
                    ariaLabel="Query volume over time chart"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Rows Read</CardTitle>
                  <CardDescription>
                    Rows scanned across all queries (affects billing)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <MetricsChart
                    data={rowsChartData}
                    title=""
                    color="#f59e0b"
                    height={250}
                    formatValue={formatNumber}
                    ariaLabel="Rows read over time chart"
                  />
                </CardContent>
              </Card>
            </div>

            {/* Per-Database Breakdown */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Queries by Database</CardTitle>
                  <CardDescription>
                    Query distribution across databases
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <MetricsBarChart
                    data={databaseBarData}
                    title=""
                    height={300}
                    formatValue={formatNumber}
                    ariaLabel="Queries per database bar chart"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Storage by Database</CardTitle>
                  <CardDescription>
                    Current storage usage per database
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <MetricsBarChart
                    data={storageBarData}
                    title=""
                    height={300}
                    formatValue={formatBytes}
                    ariaLabel="Storage per database bar chart"
                  />
                </CardContent>
              </Card>
            </div>

            {/* Detailed Table */}
            <Card>
              <CardHeader>
                <CardTitle>Database Details</CardTitle>
                <CardDescription>
                  Detailed metrics for each database
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" role="table" aria-label="Database metrics details">
                    <thead>
                      <tr className="border-b">
                        <th scope="col" className="text-left py-3 px-2 font-medium">Database</th>
                        <th scope="col" className="text-right py-3 px-2 font-medium">Read Queries</th>
                        <th scope="col" className="text-right py-3 px-2 font-medium">Write Queries</th>
                        <th scope="col" className="text-right py-3 px-2 font-medium">Rows Read</th>
                        <th scope="col" className="text-right py-3 px-2 font-medium">Rows Written</th>
                        <th scope="col" className="text-right py-3 px-2 font-medium">P90 Latency</th>
                        <th scope="col" className="text-right py-3 px-2 font-medium">Storage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.byDatabase.map((db) => (
                        <tr key={db.databaseId} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              <Database className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="font-medium truncate max-w-[200px]" title={db.databaseName ?? db.databaseId}>
                                {db.databaseName ?? db.databaseId.slice(0, 12) + '...'}
                              </span>
                            </div>
                          </td>
                          <td className="text-right py-3 px-2 text-blue-600 dark:text-blue-400">
                            {formatNumber(db.totalReadQueries)}
                          </td>
                          <td className="text-right py-3 px-2 text-green-600 dark:text-green-400">
                            {formatNumber(db.totalWriteQueries)}
                          </td>
                          <td className="text-right py-3 px-2">
                            {formatNumber(db.totalRowsRead)}
                          </td>
                          <td className="text-right py-3 px-2">
                            {formatNumber(db.totalRowsWritten)}
                          </td>
                          <td className="text-right py-3 px-2">
                            {formatLatency(db.p90LatencyMs)}
                          </td>
                          <td className="text-right py-3 px-2">
                            {db.currentSizeBytes ? formatBytes(db.currentSizeBytes) : 'N/A'}
                          </td>
                        </tr>
                      ))}
                      {metrics.byDatabase.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-muted-foreground">
                            No database metrics available for this time period
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Query Insights Tab */}
          <TabsContent value="insights">
            <QueryInsightsTab queryInsights={metrics.queryInsights ?? []} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

