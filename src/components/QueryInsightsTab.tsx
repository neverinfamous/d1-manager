import { useState, useMemo } from 'react';
import {
    Clock,
    Database,
    ChevronDown,
    ChevronUp,
    AlertTriangle,
    CheckCircle,
    AlertCircle,
    FileText,
    Hash
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { type QueryInsight } from '@/services/api';

interface QueryInsightsTabProps {
    queryInsights: QueryInsight[];
    onDatabaseFilter?: (databaseId: string | null) => void;
}

type SortField = 'totalTime' | 'avgTime' | 'execCount' | 'rowsRead';
type PerformanceLevel = 'critical' | 'warning' | 'good';

/**
 * Get performance level based on average execution time
 */
function getPerformanceLevel(avgTimeMs: number): PerformanceLevel {
    if (avgTimeMs >= 100) return 'critical';
    if (avgTimeMs >= 50) return 'warning';
    return 'good';
}

/**
 * Get performance badge component
 */
function PerformanceBadge({ level }: { level: PerformanceLevel }): React.JSX.Element {
    switch (level) {
        case 'critical':
            return (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full">
                    <AlertCircle className="h-3 w-3" aria-hidden="true" />
                    Slow
                </span>
            );
        case 'warning':
            return (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    Moderate
                </span>
            );
        default:
            return (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                    <CheckCircle className="h-3 w-3" aria-hidden="true" />
                    Fast
                </span>
            );
    }
}

/**
 * Format milliseconds to readable latency
 */
function formatLatency(ms: number): string {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
    if (ms < 1000) return `${ms.toFixed(1)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
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

export function QueryInsightsTab({
    queryInsights
}: QueryInsightsTabProps): React.JSX.Element {
    const [sortField, setSortField] = useState<SortField>('totalTime');
    const [expandedQueries, setExpandedQueries] = useState<Set<string>>(new Set());

    const sortedInsights = useMemo(() => {
        const sorted = [...queryInsights];
        sorted.sort((a, b) => {
            switch (sortField) {
                case 'totalTime':
                    return b.totalTimeMs - a.totalTimeMs;
                case 'avgTime':
                    return b.avgTimeMs - a.avgTimeMs;
                case 'execCount':
                    return b.executionCount - a.executionCount;
                case 'rowsRead':
                    return b.rowsRead - a.rowsRead;
                default:
                    return 0;
            }
        });
        return sorted;
    }, [queryInsights, sortField]);

    const toggleExpand = (queryHash: string): void => {
        const newExpanded = new Set(expandedQueries);
        if (newExpanded.has(queryHash)) {
            newExpanded.delete(queryHash);
        } else {
            newExpanded.add(queryHash);
        }
        setExpandedQueries(newExpanded);
    };

    if (queryInsights.length === 0) {
        return (
            <Card>
                <CardContent className="py-12">
                    <div className="text-center text-muted-foreground">
                        <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">No Query Insights Available</p>
                        <p className="text-sm mt-1">
                            Query insights will appear here once queries are executed against your databases.
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header with sort controls */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold">Query Insights</h3>
                    <p className="text-sm text-muted-foreground">
                        Analyze slow queries and optimize database performance
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Sort by:</span>
                    <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
                        <SelectTrigger className="w-[140px]" aria-label="Sort queries by">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="totalTime">Total Time</SelectItem>
                            <SelectItem value="avgTime">Avg Time</SelectItem>
                            <SelectItem value="execCount">Execution Count</SelectItem>
                            <SelectItem value="rowsRead">Rows Read</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Performance summary cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-red-500" />
                            Critical Queries
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                            {queryInsights.filter(q => getPerformanceLevel(q.avgTimeMs) === 'critical').length}
                        </div>
                        <p className="text-xs text-muted-foreground">&gt;100ms avg execution</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                            Moderate Queries
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                            {queryInsights.filter(q => getPerformanceLevel(q.avgTimeMs) === 'warning').length}
                        </div>
                        <p className="text-xs text-muted-foreground">50-100ms avg execution</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            Fast Queries
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                            {queryInsights.filter(q => getPerformanceLevel(q.avgTimeMs) === 'good').length}
                        </div>
                        <p className="text-xs text-muted-foreground">&lt;50ms avg execution</p>
                    </CardContent>
                </Card>
            </div>

            {/* Query list */}
            <Card>
                <CardHeader>
                    <CardTitle>Slow Queries</CardTitle>
                    <CardDescription>
                        Top {sortedInsights.length} queries by {sortField === 'totalTime' ? 'total execution time' :
                            sortField === 'avgTime' ? 'average execution time' :
                                sortField === 'execCount' ? 'execution count' : 'rows read'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {sortedInsights.map((insight) => {
                            const isExpanded = expandedQueries.has(insight.queryHash);
                            const perfLevel = getPerformanceLevel(insight.avgTimeMs);

                            return (
                                <div
                                    key={insight.queryHash}
                                    className="border rounded-lg overflow-hidden"
                                >
                                    {/* Query header row */}
                                    <button
                                        type="button"
                                        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
                                        onClick={() => toggleExpand(insight.queryHash)}
                                        aria-expanded={isExpanded}
                                        aria-label={`Toggle query details for ${insight.queryHash.slice(0, 8)}`}
                                    >
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <PerformanceBadge level={perfLevel} />
                                            <span className="font-mono text-sm truncate max-w-[300px] lg:max-w-[500px]">
                                                {insight.queryString}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-4 flex-shrink-0">
                                            <div className="text-right">
                                                <div className="text-sm font-medium">{formatLatency(insight.totalTimeMs)}</div>
                                                <div className="text-xs text-muted-foreground">total</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-sm font-medium">{formatLatency(insight.avgTimeMs)}</div>
                                                <div className="text-xs text-muted-foreground">avg</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-sm font-medium">{formatNumber(insight.executionCount)}</div>
                                                <div className="text-xs text-muted-foreground">calls</div>
                                            </div>
                                            {isExpanded ? (
                                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                            ) : (
                                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                            )}
                                        </div>
                                    </button>

                                    {/* Expanded details */}
                                    {isExpanded && (
                                        <div className="border-t bg-muted/30 p-4 space-y-3">
                                            {/* Full query */}
                                            <div>
                                                <div className="flex items-center gap-2 text-sm font-medium mb-2">
                                                    <FileText className="h-4 w-4" />
                                                    Query
                                                </div>
                                                <pre className="bg-muted p-3 rounded-md text-sm font-mono whitespace-pre-wrap break-all overflow-x-auto">
                                                    {insight.queryString}
                                                </pre>
                                            </div>

                                            {/* Metrics grid */}
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                                <div>
                                                    <span className="text-muted-foreground flex items-center gap-1">
                                                        <Database className="h-3 w-3" />
                                                        Database
                                                    </span>
                                                    <span className="font-medium">
                                                        {insight.databaseName ?? insight.databaseId.slice(0, 8)}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-muted-foreground flex items-center gap-1">
                                                        <Hash className="h-3 w-3" />
                                                        Query Hash
                                                    </span>
                                                    <span className="font-mono font-medium">{insight.queryHash}</span>
                                                </div>
                                                <div>
                                                    <span className="text-muted-foreground">Rows Read</span>
                                                    <span className="font-medium block">{formatNumber(insight.rowsRead)}</span>
                                                </div>
                                                <div>
                                                    <span className="text-muted-foreground">Rows Written</span>
                                                    <span className="font-medium block">{formatNumber(insight.rowsWritten)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
