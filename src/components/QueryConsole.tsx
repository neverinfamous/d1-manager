import { useState } from 'react';
import { Play, Loader2, Download, History, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { executeQuery } from '@/services/api';

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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Query Console</h3>
          <p className="text-sm text-muted-foreground">{databaseName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <History className="h-4 w-4 mr-2" />
            History
          </Button>
          <Button variant="outline" size="sm">
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
                  <Button variant="outline" size="sm">
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
    </div>
  );
}

