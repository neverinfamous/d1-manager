import { useState, useEffect } from "react";
import {
  Zap,
  RefreshCw,
  Loader2,
  Copy,
  Check,
  AlertCircle,
  TrendingUp,
  Database,
  Sparkles,
  PlayCircle,
  Cloud,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  analyzeIndexes,
  createIndex,
  getR2BackupStatus,
  backupToR2,
  type IndexRecommendation,
  type IndexAnalysisResult,
  type R2BackupStatus,
  type R2BackupSource,
} from "@/services/api";
import { ErrorMessage } from "@/components/ui/error-message";

interface IndexAnalyzerProps {
  databaseId: string;
  databaseName: string;
}

export function IndexAnalyzer({
  databaseId,
  databaseName,
}: IndexAnalyzerProps): React.JSX.Element {
  const [analysis, setAnalysis] = useState<IndexAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedSQL, setCopiedSQL] = useState<string | null>(null);
  const [creatingIndex, setCreatingIndex] = useState<string | null>(null);

  // Create All Indexes dialog state
  const [showCreateAllDialog, setShowCreateAllDialog] = useState(false);
  const [createAllProgress, setCreateAllProgress] = useState<{
    current: number;
    total: number;
    currentIndex: string;
    succeeded: string[];
    failed: { name: string; error: string }[];
  } | null>(null);
  const [creatingAll, setCreatingAll] = useState(false);
  const [r2BackupStatus, setR2BackupStatus] = useState<R2BackupStatus | null>(
    null,
  );
  const [backingUp, setBackingUp] = useState(false);
  const [backupComplete, setBackupComplete] = useState(false);

  useEffect(() => {
    // Auto-load analysis on mount (uses cache)
    void loadAnalysis(false);
    // Load R2 backup status
    void loadR2Status();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseId]);

  const loadR2Status = async (): Promise<void> => {
    try {
      const status = await getR2BackupStatus();
      setR2BackupStatus(status);
    } catch {
      setR2BackupStatus(null);
    }
  };

  const loadAnalysis = async (skipCache = false): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await analyzeIndexes(databaseId, skipCache);
      setAnalysis(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to analyze indexes",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCopySQL = (sql: string): void => {
    void navigator.clipboard.writeText(sql);
    setCopiedSQL(sql);
    setTimeout(() => setCopiedSQL(null), 2000);
  };

  const handleCreateIndex = async (
    recommendation: IndexRecommendation,
  ): Promise<void> => {
    const key = `${recommendation.tableName}.${recommendation.columnName}`;
    setCreatingIndex(key);
    try {
      // Extract index name from SQL (e.g., "CREATE INDEX idx_users_email ON users(email)")
      const indexNameMatch =
        /CREATE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i.exec(
          recommendation.suggestedSQL,
        );
      const indexName = indexNameMatch?.[1];

      // Determine columns (could be single or composite)
      const columns =
        recommendation.indexType === "composite" &&
        recommendation.compositeColumns
          ? recommendation.compositeColumns
          : [recommendation.columnName];

      await createIndex(databaseId, recommendation.suggestedSQL, {
        tableName: recommendation.tableName,
        ...(indexName ? { indexName } : {}),
        columns,
      });
      // Reload analysis to update recommendations
      await loadAnalysis();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create index");
    } finally {
      setCreatingIndex(null);
    }
  };

  const handleBackupToR2 = async (): Promise<void> => {
    setBackingUp(true);
    try {
      // Use 'manual' source since 'index_creation' isn't a defined source type
      await backupToR2(databaseId, databaseName, "manual" as R2BackupSource);
      setBackupComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to backup to R2");
    } finally {
      setBackingUp(false);
    }
  };

  const handleCreateAllIndexes = async (): Promise<void> => {
    if (!analysis?.recommendations || analysis.recommendations.length === 0)
      return;

    setCreatingAll(true);
    const recommendations = analysis.recommendations;
    const total = recommendations.length;
    const succeeded: string[] = [];
    const failed: { name: string; error: string }[] = [];

    setCreateAllProgress({
      current: 0,
      total,
      currentIndex: "",
      succeeded: [],
      failed: [],
    });

    for (let i = 0; i < recommendations.length; i++) {
      const rec = recommendations[i];
      if (!rec) continue;

      const indexName = `${rec.tableName}.${rec.columnName}`;

      setCreateAllProgress({
        current: i,
        total,
        currentIndex: indexName,
        succeeded: [...succeeded],
        failed: [...failed],
      });

      try {
        const indexNameMatch =
          /CREATE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i.exec(
            rec.suggestedSQL,
          );
        const extractedName = indexNameMatch?.[1];

        const columns =
          rec.indexType === "composite" && rec.compositeColumns
            ? rec.compositeColumns
            : [rec.columnName];

        await createIndex(databaseId, rec.suggestedSQL, {
          tableName: rec.tableName,
          ...(extractedName ? { indexName: extractedName } : {}),
          columns,
        });

        succeeded.push(indexName);
      } catch (err) {
        failed.push({
          name: indexName,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }

      // Small delay to avoid rate limits
      if (i < recommendations.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    setCreateAllProgress({
      current: total,
      total,
      currentIndex: "",
      succeeded,
      failed,
    });

    setCreatingAll(false);

    // Reload analysis to reflect changes
    await loadAnalysis(true);
  };

  const resetCreateAllDialog = (): void => {
    setShowCreateAllDialog(false);
    setCreateAllProgress(null);
    setBackupComplete(false);
  };

  const getPriorityColor = (priority: "high" | "medium" | "low"): string => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      case "medium":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "low":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    }
  };

  const getPriorityIcon = (
    priority: "high" | "medium" | "low",
  ): React.JSX.Element => {
    switch (priority) {
      case "high":
        return <AlertCircle className="w-4 h-4" />;
      case "medium":
        return <TrendingUp className="w-4 h-4" />;
      case "low":
        return <Sparkles className="w-4 h-4" />;
    }
  };

  const groupedRecommendations = analysis?.recommendations.reduce(
    (acc, rec) => {
      const arr = acc[rec.priority] ?? [];
      arr.push(rec);
      acc[rec.priority] = arr;
      return acc;
    },
    {} as Record<"high" | "medium" | "low", IndexRecommendation[]>,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Performance Analyzer
          </h2>
          <p className="text-muted-foreground">
            Intelligent index recommendations for {databaseName}
          </p>
        </div>
        <div className="flex gap-2">
          {analysis && analysis.recommendations.length > 0 && (
            <Button
              variant="default"
              onClick={() => setShowCreateAllDialog(true)}
              disabled={loading || creatingIndex !== null}
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              Create All Indexes ({analysis.recommendations.length})
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => void loadAnalysis(true)}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {loading ? "Analyzing..." : "Re-analyze"}
          </Button>
        </div>
      </div>

      {/* Error State */}
      <ErrorMessage error={error} variant="card" />

      {/* Loading State */}
      {loading && !analysis && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-3 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">
                Analyzing database schema and query patterns...
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Statistics Dashboard */}
      {analysis && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Recommendations
              </CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analysis.statistics.totalRecommendations}
              </div>
              <p className="text-xs text-muted-foreground">
                Index optimization opportunities
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Tables Without Indexes
              </CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analysis.statistics.tablesWithoutIndexes}
              </div>
              <p className="text-xs text-muted-foreground">
                Excluding primary key auto-indexes
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Query Efficiency
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analysis.statistics.averageQueryEfficiency !== undefined
                  ? `${(analysis.statistics.averageQueryEfficiency * 100).toFixed(0)}%`
                  : "N/A"}
              </div>
              <p className="text-xs text-muted-foreground">
                Based on recent queries
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recommendations */}
      {analysis && analysis.recommendations.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Index Recommendations</h3>

          {/* High Priority */}
          {groupedRecommendations?.high &&
            groupedRecommendations.high.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 ${getPriorityColor("high")}`}
                  >
                    {getPriorityIcon("high")}
                    High Priority
                  </span>
                  <span className="text-sm text-muted-foreground">
                    ({groupedRecommendations.high.length}{" "}
                    {groupedRecommendations.high.length === 1
                      ? "recommendation"
                      : "recommendations"}
                    )
                  </span>
                </div>
                {groupedRecommendations.high.map((rec, idx) => (
                  <RecommendationCard
                    key={`high-${String(idx)}`}
                    recommendation={rec}
                    copiedSQL={copiedSQL}
                    creatingIndex={creatingIndex}
                    onCopySQL={handleCopySQL}
                    onCreateIndex={(r) => void handleCreateIndex(r)}
                    getPriorityColor={getPriorityColor}
                  />
                ))}
              </div>
            )}

          {/* Medium Priority */}
          {groupedRecommendations?.medium &&
            groupedRecommendations.medium.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 ${getPriorityColor("medium")}`}
                  >
                    {getPriorityIcon("medium")}
                    Medium Priority
                  </span>
                  <span className="text-sm text-muted-foreground">
                    ({groupedRecommendations.medium.length}{" "}
                    {groupedRecommendations.medium.length === 1
                      ? "recommendation"
                      : "recommendations"}
                    )
                  </span>
                </div>
                {groupedRecommendations.medium.map((rec, idx) => (
                  <RecommendationCard
                    key={`medium-${String(idx)}`}
                    recommendation={rec}
                    copiedSQL={copiedSQL}
                    creatingIndex={creatingIndex}
                    onCopySQL={handleCopySQL}
                    onCreateIndex={(r) => void handleCreateIndex(r)}
                    getPriorityColor={getPriorityColor}
                  />
                ))}
              </div>
            )}

          {/* Low Priority */}
          {groupedRecommendations?.low &&
            groupedRecommendations.low.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 ${getPriorityColor("low")}`}
                  >
                    {getPriorityIcon("low")}
                    Low Priority
                  </span>
                  <span className="text-sm text-muted-foreground">
                    ({groupedRecommendations.low.length}{" "}
                    {groupedRecommendations.low.length === 1
                      ? "recommendation"
                      : "recommendations"}
                    )
                  </span>
                </div>
                {groupedRecommendations.low.map((rec, idx) => (
                  <RecommendationCard
                    key={`low-${String(idx)}`}
                    recommendation={rec}
                    copiedSQL={copiedSQL}
                    creatingIndex={creatingIndex}
                    onCopySQL={handleCopySQL}
                    onCreateIndex={(r) => void handleCreateIndex(r)}
                    getPriorityColor={getPriorityColor}
                  />
                ))}
              </div>
            )}
        </div>
      )}

      {/* No Recommendations */}
      {analysis?.recommendations.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Check className="h-12 w-12 text-green-600 dark:text-green-400" />
              <div>
                <h3 className="text-lg font-semibold">
                  Database is Well Optimized
                </h3>
                <p className="text-muted-foreground mt-1">
                  No index recommendations at this time. Your database appears
                  to have appropriate indexes based on schema and query
                  patterns.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing Indexes */}
      {analysis && analysis.existingIndexes.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Existing Indexes</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {analysis.existingIndexes.map((tableIndex) => (
              <Card key={tableIndex.tableName}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {tableIndex.tableName}
                  </CardTitle>
                  <CardDescription>
                    {tableIndex.indexes.length}{" "}
                    {tableIndex.indexes.length === 1 ? "index" : "indexes"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {tableIndex.indexes.map((index, idx) => (
                      <div key={idx} className="text-sm">
                        <div className="font-mono text-xs bg-muted px-2 py-1 rounded flex items-center justify-between">
                          <span className="truncate">{index.name}</span>
                          {index.unique && (
                            <span className="text-xs text-muted-foreground ml-2">
                              UNIQUE
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 ml-2">
                          Columns: {index.columns.join(", ")}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Create All Indexes Dialog */}
      <Dialog
        open={showCreateAllDialog}
        onOpenChange={() => !creatingAll && resetCreateAllDialog()}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlayCircle className="h-5 w-5" />
              Create All Recommended Indexes
            </DialogTitle>
            <DialogDescription>
              This will create {analysis?.recommendations.length ?? 0} indexes
              on your database.
            </DialogDescription>
          </DialogHeader>

          {/* Warning */}
          {!createAllProgress && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-800 dark:text-yellow-200">
                    Creating indexes modifies your database schema
                  </p>
                  <p className="text-yellow-700 dark:text-yellow-300 mt-1">
                    While indexes improve query performance, they also increase
                    storage usage and can affect write performance. Consider
                    creating a backup before proceeding.
                  </p>
                </div>
              </div>

              {/* Backup Options */}
              {r2BackupStatus?.configured &&
                r2BackupStatus?.bucketAvailable && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      Optional: Create a backup first
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleBackupToR2()}
                      disabled={backingUp || backupComplete}
                      className="w-full"
                    >
                      {backingUp ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : backupComplete ? (
                        <Check className="h-4 w-4 mr-2 text-green-500" />
                      ) : (
                        <Cloud className="h-4 w-4 mr-2" />
                      )}
                      {backupComplete ? "Backed up to R2" : "Backup to R2"}
                    </Button>
                  </div>
                )}

              {/* Index List Preview */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Indexes to be created:</p>
                <div className="max-h-40 overflow-y-auto border rounded-lg p-2 bg-muted/30">
                  {analysis?.recommendations.map((rec, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 py-1 text-sm"
                    >
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs font-medium ${getPriorityColor(rec.priority)}`}
                      >
                        {rec.priority[0]?.toUpperCase()}
                      </span>
                      <span className="font-mono text-xs truncate">
                        {rec.tableName}.{rec.columnName}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Progress */}
          {createAllProgress && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>
                    {createAllProgress.current} / {createAllProgress.total}
                  </span>
                </div>
                <Progress
                  value={
                    (createAllProgress.current / createAllProgress.total) * 100
                  }
                />
                {createAllProgress.currentIndex && (
                  <p className="text-xs text-muted-foreground">
                    Creating: {createAllProgress.currentIndex}
                  </p>
                )}
              </div>

              {/* Results */}
              {createAllProgress.current === createAllProgress.total && (
                <div className="space-y-3">
                  {createAllProgress.succeeded.length > 0 && (
                    <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg">
                      <div className="flex items-center gap-2 text-green-700 dark:text-green-300 font-medium text-sm">
                        <Check className="h-4 w-4" />
                        {createAllProgress.succeeded.length} indexes created
                        successfully
                      </div>
                    </div>
                  )}
                  {createAllProgress.failed.length > 0 && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg">
                      <div className="flex items-center gap-2 text-red-700 dark:text-red-300 font-medium text-sm mb-2">
                        <AlertCircle className="h-4 w-4" />
                        {createAllProgress.failed.length} indexes failed
                      </div>
                      <div className="space-y-1 text-xs text-red-600 dark:text-red-400">
                        {createAllProgress.failed.map((f, idx) => (
                          <div key={idx}>
                            <span className="font-mono">{f.name}</span>:{" "}
                            {f.error}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {!createAllProgress ? (
              <>
                <Button variant="outline" onClick={resetCreateAllDialog}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void handleCreateAllIndexes()}
                  disabled={creatingAll}
                >
                  {creatingAll && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Create All Indexes
                </Button>
              </>
            ) : createAllProgress.current === createAllProgress.total ? (
              <Button onClick={resetCreateAllDialog}>Done</Button>
            ) : (
              <Button variant="outline" disabled>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating indexes...
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface RecommendationCardProps {
  recommendation: IndexRecommendation;
  copiedSQL: string | null;
  creatingIndex: string | null;
  onCopySQL: (sql: string) => void;
  onCreateIndex: (rec: IndexRecommendation) => void;
  getPriorityColor: (priority: "high" | "medium" | "low") => string;
}

function RecommendationCard({
  recommendation,
  copiedSQL,
  creatingIndex,
  onCopySQL,
  onCreateIndex,
  getPriorityColor,
}: RecommendationCardProps): React.JSX.Element {
  const key = `${recommendation.tableName}.${recommendation.columnName}`;
  const isCreating = creatingIndex === key;
  const isCopied = copiedSQL === recommendation.suggestedSQL;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">
              {recommendation.tableName}.{recommendation.columnName}
            </CardTitle>
            <CardDescription>
              {recommendation.indexType === "composite" &&
              recommendation.compositeColumns
                ? `Composite index: ${recommendation.compositeColumns.join(", ")}`
                : "Single column index"}
            </CardDescription>
          </div>
          <span
            className={`px-2 py-1 rounded-md text-xs font-medium ${getPriorityColor(recommendation.priority)}`}
          >
            {recommendation.priority.toUpperCase()}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Rationale */}
        <div>
          <h4 className="text-sm font-medium mb-1">Why this index?</h4>
          <p className="text-sm text-muted-foreground">
            {recommendation.rationale}
          </p>
        </div>

        {/* Estimated Impact */}
        <div>
          <h4 className="text-sm font-medium mb-1">Estimated Impact</h4>
          <p className="text-sm text-muted-foreground">
            {recommendation.estimatedImpact}
          </p>
        </div>

        {/* SQL */}
        <div>
          <h4 className="text-sm font-medium mb-1">SQL</h4>
          <div className="bg-muted p-3 rounded-md font-mono text-xs break-all">
            {recommendation.suggestedSQL}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onCopySQL(recommendation.suggestedSQL)}
            className="flex-1"
          >
            {isCopied ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Copy SQL
              </>
            )}
          </Button>
          <Button
            size="sm"
            onClick={() => onCreateIndex(recommendation)}
            disabled={isCreating}
            className="flex-1"
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Create Index
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
