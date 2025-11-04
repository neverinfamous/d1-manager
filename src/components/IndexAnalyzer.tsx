import { useState, useEffect } from 'react';
import { Zap, RefreshCw, Loader2, Copy, Check, AlertCircle, TrendingUp, Database, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { analyzeIndexes, createIndex, type IndexRecommendation, type IndexAnalysisResult } from '@/services/api';

interface IndexAnalyzerProps {
  databaseId: string;
  databaseName: string;
}

export function IndexAnalyzer({ databaseId, databaseName }: IndexAnalyzerProps) {
  const [analysis, setAnalysis] = useState<IndexAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedSQL, setCopiedSQL] = useState<string | null>(null);
  const [creatingIndex, setCreatingIndex] = useState<string | null>(null);

  useEffect(() => {
    // Auto-load analysis on mount
    loadAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseId]);

  const loadAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await analyzeIndexes(databaseId);
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze indexes');
    } finally {
      setLoading(false);
    }
  };

  const handleCopySQL = (sql: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedSQL(sql);
    setTimeout(() => setCopiedSQL(null), 2000);
  };

  const handleCreateIndex = async (recommendation: IndexRecommendation) => {
    const key = `${recommendation.tableName}.${recommendation.columnName}`;
    setCreatingIndex(key);
    try {
      await createIndex(databaseId, recommendation.suggestedSQL);
      // Reload analysis to update recommendations
      await loadAnalysis();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create index');
    } finally {
      setCreatingIndex(null);
    }
  };

  const getPriorityColor = (priority: 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'low':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    }
  };

  const getPriorityIcon = (priority: 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'high':
        return <AlertCircle className="w-4 h-4" />;
      case 'medium':
        return <TrendingUp className="w-4 h-4" />;
      case 'low':
        return <Sparkles className="w-4 h-4" />;
    }
  };

  const groupedRecommendations = analysis?.recommendations.reduce((acc, rec) => {
    if (!acc[rec.priority]) {
      acc[rec.priority] = [];
    }
    acc[rec.priority].push(rec);
    return acc;
  }, {} as Record<'high' | 'medium' | 'low', IndexRecommendation[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Performance Analyzer</h2>
          <p className="text-muted-foreground">
            Intelligent index recommendations for {databaseName}
          </p>
        </div>
        <Button onClick={loadAnalysis} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {loading ? 'Analyzing...' : 'Re-analyze'}
        </Button>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertCircle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && !analysis && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-3 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">Analyzing database schema and query patterns...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Statistics Dashboard */}
      {analysis && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recommendations</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analysis.statistics.totalRecommendations}</div>
              <p className="text-xs text-muted-foreground">
                Index optimization opportunities
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tables Without Indexes</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analysis.statistics.tablesWithoutIndexes}</div>
              <p className="text-xs text-muted-foreground">
                Excluding primary key auto-indexes
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Query Efficiency</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analysis.statistics.averageQueryEfficiency !== undefined
                  ? `${(analysis.statistics.averageQueryEfficiency * 100).toFixed(0)}%`
                  : 'N/A'}
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
          {groupedRecommendations?.high && groupedRecommendations.high.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 ${getPriorityColor('high')}`}>
                  {getPriorityIcon('high')}
                  High Priority
                </span>
                <span className="text-sm text-muted-foreground">
                  ({groupedRecommendations.high.length} {groupedRecommendations.high.length === 1 ? 'recommendation' : 'recommendations'})
                </span>
              </div>
              {groupedRecommendations.high.map((rec, idx) => (
                <RecommendationCard
                  key={`high-${idx}`}
                  recommendation={rec}
                  copiedSQL={copiedSQL}
                  creatingIndex={creatingIndex}
                  onCopySQL={handleCopySQL}
                  onCreateIndex={handleCreateIndex}
                  getPriorityColor={getPriorityColor}
                />
              ))}
            </div>
          )}

          {/* Medium Priority */}
          {groupedRecommendations?.medium && groupedRecommendations.medium.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 ${getPriorityColor('medium')}`}>
                  {getPriorityIcon('medium')}
                  Medium Priority
                </span>
                <span className="text-sm text-muted-foreground">
                  ({groupedRecommendations.medium.length} {groupedRecommendations.medium.length === 1 ? 'recommendation' : 'recommendations'})
                </span>
              </div>
              {groupedRecommendations.medium.map((rec, idx) => (
                <RecommendationCard
                  key={`medium-${idx}`}
                  recommendation={rec}
                  copiedSQL={copiedSQL}
                  creatingIndex={creatingIndex}
                  onCopySQL={handleCopySQL}
                  onCreateIndex={handleCreateIndex}
                  getPriorityColor={getPriorityColor}
                />
              ))}
            </div>
          )}

          {/* Low Priority */}
          {groupedRecommendations?.low && groupedRecommendations.low.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 ${getPriorityColor('low')}`}>
                  {getPriorityIcon('low')}
                  Low Priority
                </span>
                <span className="text-sm text-muted-foreground">
                  ({groupedRecommendations.low.length} {groupedRecommendations.low.length === 1 ? 'recommendation' : 'recommendations'})
                </span>
              </div>
              {groupedRecommendations.low.map((rec, idx) => (
                <RecommendationCard
                  key={`low-${idx}`}
                  recommendation={rec}
                  copiedSQL={copiedSQL}
                  creatingIndex={creatingIndex}
                  onCopySQL={handleCopySQL}
                  onCreateIndex={handleCreateIndex}
                  getPriorityColor={getPriorityColor}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* No Recommendations */}
      {analysis && analysis.recommendations.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Check className="h-12 w-12 text-green-600 dark:text-green-400" />
              <div>
                <h3 className="text-lg font-semibold">Database is Well Optimized</h3>
                <p className="text-muted-foreground mt-1">
                  No index recommendations at this time. Your database appears to have appropriate indexes based on schema and query patterns.
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
                  <CardTitle className="text-base">{tableIndex.tableName}</CardTitle>
                  <CardDescription>
                    {tableIndex.indexes.length} {tableIndex.indexes.length === 1 ? 'index' : 'indexes'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {tableIndex.indexes.map((index, idx) => (
                      <div key={idx} className="text-sm">
                        <div className="font-mono text-xs bg-muted px-2 py-1 rounded flex items-center justify-between">
                          <span className="truncate">{index.name}</span>
                          {index.unique && (
                            <span className="text-xs text-muted-foreground ml-2">UNIQUE</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 ml-2">
                          Columns: {index.columns.join(', ')}
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
    </div>
  );
}

interface RecommendationCardProps {
  recommendation: IndexRecommendation;
  copiedSQL: string | null;
  creatingIndex: string | null;
  onCopySQL: (sql: string) => void;
  onCreateIndex: (rec: IndexRecommendation) => void;
  getPriorityColor: (priority: 'high' | 'medium' | 'low') => string;
}

function RecommendationCard({
  recommendation,
  copiedSQL,
  creatingIndex,
  onCopySQL,
  onCreateIndex,
  getPriorityColor
}: RecommendationCardProps) {
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
              {recommendation.indexType === 'composite' && recommendation.compositeColumns
                ? `Composite index: ${recommendation.compositeColumns.join(', ')}`
                : 'Single column index'}
            </CardDescription>
          </div>
          <span className={`px-2 py-1 rounded-md text-xs font-medium ${getPriorityColor(recommendation.priority)}`}>
            {recommendation.priority.toUpperCase()}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Rationale */}
        <div>
          <h4 className="text-sm font-medium mb-1">Why this index?</h4>
          <p className="text-sm text-muted-foreground">{recommendation.rationale}</p>
        </div>

        {/* Estimated Impact */}
        <div>
          <h4 className="text-sm font-medium mb-1">Estimated Impact</h4>
          <p className="text-sm text-muted-foreground">{recommendation.estimatedImpact}</p>
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

