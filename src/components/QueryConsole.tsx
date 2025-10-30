import { useState } from 'react';
import { Play, Loader2, Download, History, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { executeQuery, getSavedQueries, createSavedQuery, deleteSavedQuery, type SavedQuery } from '@/services/api';

interface QueryConsoleProps {
  databaseId: string;
  databaseName: string;
}

interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowsAffected?: number;
  executionTime: number;
}

export function QueryConsole({ databaseId, databaseName }: QueryConsoleProps) {
  const [query, setQuery] = useState('SELECT * FROM sqlite_master WHERE type=\'table\';');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showSavedQueries, setShowSavedQueries] = useState(false);
  const [queryName, setQueryName] = useState('');
  const [queryDescription, setQueryDescription] = useState('');
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [savingQuery, setSavingQuery] = useState(false);
  const [loadingQueries, setLoadingQueries] = useState(false);

  const handleExecute = async () => {
    if (!query.trim()) {
      setError('Please enter a query');
      return;
    }

    try {
      setExecuting(true);
      setError(null);
      
      const startTime = performance.now();
      const response = await executeQuery(databaseId, query);
      const endTime = performance.now();

      // Response is already unwrapped by api.ts: { results: [], meta: {}, success: boolean }
      if (response.results && response.results.length > 0) {
        const resultsArray = response.results as Record<string, unknown>[];
        
        // Extract columns from first row
        const columns = Object.keys(resultsArray[0]);
        
        // Convert results to rows array
        const rows = resultsArray.map((row: Record<string, unknown>) =>
          columns.map(col => row[col])
        );

        setResult({
          columns,
          rows,
          rowsAffected: response.meta?.rows_written || response.meta?.rows_read,
          executionTime: endTime - startTime
        });
      } else {
        setResult({
          columns: [],
          rows: [],
          executionTime: endTime - startTime
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query execution failed');
      setResult(null);
    } finally {
      setExecuting(false);
    }
  };

  const formatValue = (value: unknown): string => {
    if (value === null) return 'NULL';
    if (value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleExecute();
    }
  };

  const loadSavedQueries = async () => {
    setLoadingQueries(true);
    try {
      const queries = await getSavedQueries(databaseId);
      setSavedQueries(queries);
    } catch (err) {
      console.error('[QueryConsole] Failed to load saved queries:', err);
      setError('Failed to load saved queries');
    } finally {
      setLoadingQueries(false);
    }
  };

  const handleSaveQuery = async () => {
    if (!queryName.trim() || !query.trim()) return;

    setSavingQuery(true);
    setError(null);
    try {
      await createSavedQuery(
        queryName.trim(),
        query,
        queryDescription.trim() || undefined,
        databaseId
      );
      
      setQueryName('');
      setQueryDescription('');
      setShowSaveDialog(false);
      alert('Query saved successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save query');
    } finally {
      setSavingQuery(false);
    }
  };

  const handleShowSavedQueries = async () => {
    await loadSavedQueries();
    setShowSavedQueries(true);
  };

  const handleLoadSavedQuery = (savedQuery: SavedQuery) => {
    setQuery(savedQuery.query);
    setShowSavedQueries(false);
  };

  const handleDeleteSavedQuery = async (id: number) => {
    try {
      await deleteSavedQuery(id);
      await loadSavedQueries();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete query');
    }
  };

  const handleExportCSV = () => {
    console.log('[QueryConsole] Export CSV clicked');
    console.log('[QueryConsole] Result:', result);
    
    if (!result || result.rows.length === 0) {
      console.log('[QueryConsole] No results to export');
      return;
    }

    try {
      // Create CSV content
      const csvRows = [];
      
      // Add headers
      csvRows.push(result.columns.map(col => `"${col}"`).join(','));
      
      // Add data rows
      for (const row of result.rows) {
        const values = row.map(cell => {
          if (cell === null) return 'NULL';
          if (cell === undefined) return '';
          const str = String(cell);
          // Escape quotes and wrap in quotes if contains comma, quote, or newline
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        });
        csvRows.push(values.join(','));
      }

      // Create blob and download
      const csvContent = csvRows.join('\n');
      console.log('[QueryConsole] CSV content length:', csvContent.length);
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.href = url;
      link.download = `query_results_${Date.now()}.csv`;
      
      console.log('[QueryConsole] Triggering download:', link.download);
      
      document.body.appendChild(link);
      link.click();
      
      // Clean up after a small delay
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        console.log('[QueryConsole] Download cleanup complete');
      }, 100);
    } catch (err) {
      console.error('[QueryConsole] Export CSV error:', err);
      alert('Failed to export CSV: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Query Console</h3>
          <p className="text-sm text-muted-foreground">{databaseName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleShowSavedQueries}>
            <History className="h-4 w-4 mr-2" />
            Saved Queries
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowSaveDialog(true)}>
            <Save className="h-4 w-4 mr-2" />
            Save Query
          </Button>
        </div>
      </div>

      {/* Query Editor */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">SQL Query</CardTitle>
            <Button
              size="sm"
              onClick={handleExecute}
              disabled={executing}
            >
              {executing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Execute (Ctrl+Enter)
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter your SQL query here..."
            className="w-full h-48 p-4 font-mono text-sm bg-muted rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Press Ctrl+Enter (Cmd+Enter on Mac) to execute
          </p>
        </CardContent>
      </Card>

      {/* Error Message */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive font-mono">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                Results ({result.rows.length} {result.rows.length === 1 ? 'row' : 'rows'})
              </CardTitle>
              <div className="flex items-center gap-4">
                <span className="text-xs text-muted-foreground">
                  Executed in {result.executionTime.toFixed(2)}ms
                </span>
                {result.rows.length > 0 && (
                  <Button variant="outline" size="sm" onClick={handleExportCSV}>
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {result.rows.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {result.rowsAffected !== undefined
                  ? `Query executed successfully. ${result.rowsAffected} row(s) affected.`
                  : 'Query returned no results'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      {result.columns.map((col, index) => (
                        <th
                          key={index}
                          className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="hover:bg-muted/50">
                        {row.map((cell, cellIndex) => (
                          <td
                            key={cellIndex}
                            className="px-4 py-2 text-sm whitespace-nowrap"
                          >
                            <span
                              className={
                                cell === null
                                  ? 'italic text-muted-foreground'
                                  : ''
                              }
                            >
                              {formatValue(cell)}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Save Query Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Query</DialogTitle>
            <DialogDescription>Give your query a name to save it for later use.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="query-name">Query Name</Label>
              <Input
                id="query-name"
                placeholder="My saved query"
                value={queryName}
                onChange={(e) => setQueryName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="query-description">Description (Optional)</Label>
              <Input
                id="query-description"
                placeholder="What does this query do?"
                value={queryDescription}
                onChange={(e) => setQueryDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)} disabled={savingQuery}>
              Cancel
            </Button>
            <Button onClick={handleSaveQuery} disabled={!queryName.trim() || savingQuery}>
              {savingQuery ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Saved Queries Dialog */}
      <Dialog open={showSavedQueries} onOpenChange={setShowSavedQueries}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Saved Queries</DialogTitle>
            <DialogDescription>
              {savedQueries.length} saved {savedQueries.length === 1 ? 'query' : 'queries'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {loadingQueries ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">Loading saved queries...</p>
              </div>
            ) : savedQueries.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No saved queries yet</p>
            ) : (
              savedQueries.map(savedQuery => (
                <Card key={savedQuery.id} className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold">{savedQuery.name}</h4>
                        {savedQuery.description && (
                          <p className="text-sm text-muted-foreground mt-1">{savedQuery.description}</p>
                        )}
                        <pre className="text-xs font-mono mt-2 p-2 bg-background rounded overflow-x-auto">
                          {savedQuery.query}
                        </pre>
                        <p className="text-xs text-muted-foreground mt-2">
                          Saved {new Date(savedQuery.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleLoadSavedQuery(savedQuery)}
                        >
                          Load
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSavedQuery(savedQuery.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

