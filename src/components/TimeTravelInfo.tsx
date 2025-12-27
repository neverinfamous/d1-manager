import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getCurrentBookmark,
  getBookmarkHistory,
  captureBookmark,
  deleteBookmarkEntry,
  generateRestoreCommand,
  type BookmarkInfo,
  type BookmarkHistoryEntry
} from '../services/api';
import {
  Clock,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  History,
  Trash2,
  Terminal,
  ChevronDown,
  ChevronUp,
  Bookmark,
  Info
} from 'lucide-react';
import { ErrorMessage } from '@/components/ui/error-message';

interface TimeTravelInfoProps {
  databaseId: string;
  databaseName: string;
}

export function TimeTravelInfo({ databaseId, databaseName }: TimeTravelInfoProps): React.JSX.Element {
  const [currentBookmark, setCurrentBookmark] = useState<BookmarkInfo | null>(null);
  const [history, setHistory] = useState<BookmarkHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (skipCache?: boolean) => {
    try {
      setLoading(true);
      setError(null);
      
      // Use cache on initial load for instant tab switching
      const [bookmarkResult, historyResult] = await Promise.all([
        getCurrentBookmark(databaseId, skipCache),
        getBookmarkHistory(databaseId, 10, skipCache)
      ]);
      
      setCurrentBookmark(bookmarkResult);
      setHistory(historyResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Time Travel data');
    } finally {
      setLoading(false);
    }
  }, [databaseId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRefresh = async (): Promise<void> => {
    try {
      setRefreshing(true);
      await loadData(true); // Skip cache on manual refresh
    } finally {
      setRefreshing(false);
    }
  };

  const handleCopy = async (text: string, id: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Silently ignore copy failures
    }
  };

  const handleCapture = async (): Promise<void> => {
    try {
      setCapturing(true);
      await captureBookmark(databaseId, 'Manual checkpoint');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to capture bookmark');
    } finally {
      setCapturing(false);
    }
  };

  const handleDeleteBookmark = async (bookmarkId: number): Promise<void> => {
    try {
      await deleteBookmarkEntry(databaseId, bookmarkId);
      setHistory(prev => prev.filter(h => h.id !== bookmarkId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete bookmark');
    }
  };

  const formatRelativeTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${String(diffMins)}m ago`;
    if (diffHours < 24) return `${String(diffHours)}h ago`;
    if (diffDays < 7) return `${String(diffDays)}d ago`;
    return date.toLocaleDateString();
  };

  const getOperationLabel = (type: string): string => {
    switch (type) {
      case 'manual':
        return 'Manual Checkpoint';
      case 'pre_drop_table':
        return 'Pre-Drop Table';
      case 'pre_delete_rows':
        return 'Pre-Delete Rows';
      case 'pre_drop_column':
        return 'Pre-Drop Column';
      case 'pre_import':
        return 'Pre-Import';
      case 'pre_rename':
        return 'Pre-Rename';
      default:
        return type;
    }
  };

  const truncateBookmark = (bookmark: string, length = 40): string => {
    if (bookmark.length <= length) return bookmark;
    return bookmark.substring(0, length) + '...';
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading Time Travel data...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6">
          <ErrorMessage error={error} className="mb-4" />
          <Button variant="outline" onClick={() => void handleRefresh()} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const restoreCommand = currentBookmark?.bookmark
    ? generateRestoreCommand(databaseName, currentBookmark.bookmark)
    : '';

  return (
    <div className="space-y-4">
      {/* Current Bookmark Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Time Travel</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
          <CardDescription>
            View and manage database checkpoints for point-in-time recovery
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Bookmark */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Current Bookmark</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-muted rounded-md font-mono text-xs break-all">
                {currentBookmark?.bookmark || 'No bookmark available'}
              </code>
              {currentBookmark?.bookmark && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleCopy(currentBookmark.bookmark, 'current')}
                  className="shrink-0"
                >
                  {copiedId === 'current' ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Retention Info */}
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md">
            <Info className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">
              Retention: <strong>30 days</strong> (Paid plans) / <strong>7 days</strong> (Free plan)
            </span>
          </div>

          {/* CLI Restore Command */}
          {currentBookmark?.bookmark && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                Restore Command
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-zinc-900 dark:bg-zinc-950 text-green-400 rounded-md font-mono text-xs overflow-x-auto whitespace-nowrap">
                  {restoreCommand}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleCopy(restoreCommand, 'restore')}
                  className="shrink-0"
                >
                  {copiedId === 'restore' ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Run this command in your terminal with Wrangler CLI to restore the database to this point.
              </p>
            </div>
          )}

          {/* Create Checkpoint Button */}
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleCapture()}
              disabled={capturing}
              className="w-full"
            >
              {capturing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Bookmark className="h-4 w-4 mr-2" />
              )}
              Create Manual Checkpoint
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bookmark History Card */}
      <Card>
        <CardHeader className="pb-2 cursor-pointer" onClick={() => setHistoryExpanded(!historyExpanded)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Checkpoint History</CardTitle>
              <span className="text-sm text-muted-foreground">({history.length})</span>
            </div>
            <Button variant="ghost" size="sm">
              {historyExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
          <CardDescription>
            Checkpoints captured before destructive operations
          </CardDescription>
        </CardHeader>
        
        {historyExpanded && (
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No checkpoint history yet. Checkpoints are automatically created before destructive operations.
              </p>
            ) : (
              <div className="space-y-3">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-3 bg-muted/50 rounded-lg space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium px-2 py-0.5 bg-primary/10 text-primary rounded">
                            {getOperationLabel(entry.operation_type)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeTime(entry.captured_at)}
                          </span>
                        </div>
                        {entry.description && (
                          <p className="text-sm text-muted-foreground truncate">
                            {entry.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleCopy(
                            generateRestoreCommand(databaseName, entry.bookmark),
                            `history-${String(entry.id)}`
                          )}
                          title="Copy restore command"
                        >
                          {copiedId === `history-${String(entry.id)}` ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Terminal className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDeleteBookmark(entry.id)}
                          title="Delete checkpoint"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <code className="block text-xs font-mono text-muted-foreground bg-muted rounded px-2 py-1 truncate">
                      {truncateBookmark(entry.bookmark)}
                    </code>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Help Card */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong>D1 Time Travel</strong> allows you to restore your database to any point within the retention period.
              </p>
              <p>
                Restore operations require the <strong>Wrangler CLI</strong>. The D1 REST API does not support restore operations.
              </p>
              <p>
                <a
                  href="https://developers.cloudflare.com/d1/reference/time-travel/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Learn more about Time Travel →
                </a>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

