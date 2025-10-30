import { useState, useEffect } from 'react';
import { Plus, Trash2, Play, Save, History, Loader2 } from 'lucide-react';
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
import { listTables, getTableSchema, executeQuery, type TableInfo, type ColumnInfo } from '@/services/api';

interface QueryBuilderProps {
  databaseId: string;
  databaseName: string;
}

interface QueryCondition {
  id: string;
  column: string;
  operator: string;
  value: string;
}

interface SavedQuery {
  id: string;
  name: string;
  query: string;
  createdAt: string;
}

const OPERATORS = [
  { value: '=', label: 'Equals (=)' },
  { value: '!=', label: 'Not Equals (!=)' },
  { value: '>', label: 'Greater Than (>)' },
  { value: '<', label: 'Less Than (<)' },
  { value: '>=', label: 'Greater or Equal (>=)' },
  { value: '<=', label: 'Less or Equal (<=)' },
  { value: 'LIKE', label: 'Like (LIKE)' },
  { value: 'IN', label: 'In (IN)' },
  { value: 'IS NULL', label: 'Is Null' },
  { value: 'IS NOT NULL', label: 'Is Not Null' },
];

export function QueryBuilder({ databaseId, databaseName }: QueryBuilderProps) {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(['*']);
  const [conditions, setConditions] = useState<QueryCondition[]>([]);
  const [orderBy, setOrderBy] = useState<string>('');
  const [orderDirection, setOrderDirection] = useState<'ASC' | 'DESC'>('ASC');
  const [limit, setLimit] = useState<string>('100');
  const [generatedSQL, setGeneratedSQL] = useState<string>('');
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [resultColumns, setResultColumns] = useState<string[]>([]);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [queryName, setQueryName] = useState('');
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [showSavedQueries, setShowSavedQueries] = useState(false);

  useEffect(() => {
    loadTables();
    loadSavedQueries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseId]);

  useEffect(() => {
    if (selectedTable) {
      loadTableSchema();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable]);

  useEffect(() => {
    generateSQL();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable, selectedColumns, conditions, orderBy, orderDirection, limit]);

  const loadTables = async () => {
    try {
      const tableList = await listTables(databaseId);
      setTables(tableList.filter(t => t.type === 'table'));
    } catch (err) {
      console.error('Failed to load tables:', err);
    }
  };

  const loadTableSchema = async () => {
    try {
      const schema = await getTableSchema(databaseId, selectedTable);
      setColumns(schema);
      setSelectedColumns(['*']);
      setConditions([]);
    } catch (err) {
      console.error('Failed to load schema:', err);
    }
  };

  const loadSavedQueries = () => {
    // Load from localStorage for now
    const stored = localStorage.getItem(`d1-saved-queries-${databaseId}`);
    if (stored) {
      setSavedQueries(JSON.parse(stored));
    }
  };

  const generateSQL = () => {
    if (!selectedTable) {
      setGeneratedSQL('');
      return;
    }

    let sql = 'SELECT ';
    sql += selectedColumns.join(', ');
    sql += ` FROM ${selectedTable}`;

    if (conditions.length > 0) {
      const whereClauses = conditions
        .filter(c => c.column && c.operator)
        .map(c => {
          if (c.operator === 'IS NULL' || c.operator === 'IS NOT NULL') {
            return `${c.column} ${c.operator}`;
          }
          if (c.operator === 'IN') {
            return `${c.column} IN (${c.value})`;
          }
          return `${c.column} ${c.operator} '${c.value.replace(/'/g, "''")}'`;
        });

      if (whereClauses.length > 0) {
        sql += ' WHERE ' + whereClauses.join(' AND ');
      }
    }

    if (orderBy) {
      sql += ` ORDER BY ${orderBy} ${orderDirection}`;
    }

    if (limit) {
      sql += ` LIMIT ${limit}`;
    }

    sql += ';';
    setGeneratedSQL(sql);
  };

  const addCondition = () => {
    setConditions([
      ...conditions,
      { id: String(Date.now()), column: '', operator: '=', value: '' }
    ]);
  };

  const removeCondition = (id: string) => {
    setConditions(conditions.filter(c => c.id !== id));
  };

  const updateCondition = (id: string, field: keyof QueryCondition, value: string) => {
    setConditions(conditions.map(c =>
      c.id === id ? { ...c, [field]: value } : c
    ));
  };

  const executeGeneratedQuery = async () => {
    if (!generatedSQL) return;

    try {
      setExecuting(true);
      setError(null);
      const response = await executeQuery(databaseId, generatedSQL);

      if (response.results && response.results[0]?.results) {
        const rows = response.results[0].results as Record<string, unknown>[];
        setResults(rows);
        if (rows.length > 0) {
          setResultColumns(Object.keys(rows[0]));
        } else {
          setResultColumns([]);
        }
      } else {
        setResults([]);
        setResultColumns([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query execution failed');
    } finally {
      setExecuting(false);
    }
  };

  const saveQuery = () => {
    if (!queryName.trim() || !generatedSQL) return;

    const newQuery: SavedQuery = {
      id: String(Date.now()),
      name: queryName.trim(),
      query: generatedSQL,
      createdAt: new Date().toISOString()
    };

    const updated = [...savedQueries, newQuery];
    setSavedQueries(updated);
    localStorage.setItem(`d1-saved-queries-${databaseId}`, JSON.stringify(updated));

    setQueryName('');
    setShowSaveDialog(false);
  };

  const loadSavedQuery = (query: SavedQuery) => {
    setGeneratedSQL(query.query);
    setShowSavedQueries(false);
    // Optionally parse and populate the builder fields
  };

  const deleteSavedQuery = (id: string) => {
    const updated = savedQueries.filter(q => q.id !== id);
    setSavedQueries(updated);
    localStorage.setItem(`d1-saved-queries-${databaseId}`, JSON.stringify(updated));
  };

  const formatValue = (value: unknown): string => {
    if (value === null) return 'NULL';
    if (value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Visual Query Builder</h3>
          <p className="text-sm text-muted-foreground">{databaseName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSavedQueries(true)}
          >
            <History className="h-4 w-4 mr-2" />
            Saved Queries ({savedQueries.length})
          </Button>
        </div>
      </div>

      {/* Query Builder Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Build Your Query</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Table Selection */}
          <div className="space-y-2">
            <Label>Select Table</Label>
            <select
              className="w-full h-10 px-3 rounded-md border border-input bg-background"
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
            >
              <option value="">Choose a table...</option>
              {tables.map(table => (
                <option key={table.name} value={table.name}>{table.name}</option>
              ))}
            </select>
          </div>

          {selectedTable && (
            <>
              {/* Column Selection */}
              <div className="space-y-2">
                <Label>Select Columns</Label>
                <div className="flex flex-wrap gap-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedColumns.includes('*')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedColumns(['*']);
                        }
                      }}
                    />
                    <span className="text-sm">All columns (*)</span>
                  </label>
                  {columns.map(col => (
                    <label key={col.name} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedColumns.includes(col.name) && !selectedColumns.includes('*')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const filtered = selectedColumns.filter(c => c !== '*');
                            setSelectedColumns([...filtered, col.name]);
                          } else {
                            setSelectedColumns(selectedColumns.filter(c => c !== col.name));
                          }
                        }}
                        disabled={selectedColumns.includes('*')}
                      />
                      <span className="text-sm">{col.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* WHERE Conditions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>WHERE Conditions</Label>
                  <Button variant="outline" size="sm" onClick={addCondition}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Condition
                  </Button>
                </div>

                {conditions.length > 0 && (
                  <div className="space-y-2">
                    {conditions.map((condition, index) => (
                      <div key={condition.id} className="flex gap-2 items-start">
                        {index > 0 && (
                          <div className="text-sm font-semibold text-muted-foreground pt-2">
                            AND
                          </div>
                        )}
                        <select
                          className="flex-1 h-10 px-3 rounded-md border border-input bg-background"
                          value={condition.column}
                          onChange={(e) => updateCondition(condition.id, 'column', e.target.value)}
                        >
                          <option value="">Column...</option>
                          {columns.map(col => (
                            <option key={col.name} value={col.name}>{col.name}</option>
                          ))}
                        </select>
                        <select
                          className="w-40 h-10 px-3 rounded-md border border-input bg-background"
                          value={condition.operator}
                          onChange={(e) => updateCondition(condition.id, 'operator', e.target.value)}
                        >
                          {OPERATORS.map(op => (
                            <option key={op.value} value={op.value}>{op.label}</option>
                          ))}
                        </select>
                        {!['IS NULL', 'IS NOT NULL'].includes(condition.operator) && (
                          <Input
                            className="flex-1"
                            placeholder="Value..."
                            value={condition.value}
                            onChange={(e) => updateCondition(condition.id, 'value', e.target.value)}
                          />
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeCondition(condition.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ORDER BY and LIMIT */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Order By</Label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                    value={orderBy}
                    onChange={(e) => setOrderBy(e.target.value)}
                  >
                    <option value="">None</option>
                    {columns.map(col => (
                      <option key={col.name} value={col.name}>{col.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Direction</Label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                    value={orderDirection}
                    onChange={(e) => setOrderDirection(e.target.value as 'ASC' | 'DESC')}
                    disabled={!orderBy}
                  >
                    <option value="ASC">Ascending</option>
                    <option value="DESC">Descending</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Limit</Label>
                <Input
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  placeholder="100"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Generated SQL */}
      {generatedSQL && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Generated SQL</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSaveDialog(true)}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save Query
                </Button>
                <Button size="sm" onClick={executeGeneratedQuery} disabled={executing}>
                  {executing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Executing...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Execute
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="p-4 bg-muted rounded-md text-sm font-mono overflow-x-auto">
              {generatedSQL}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive font-mono">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Results ({results.length} {results.length === 1 ? 'row' : 'rows'})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    {resultColumns.map((col, index) => (
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
                  {results.map((row, rowIndex) => (
                    <tr key={rowIndex} className="hover:bg-muted/50">
                      {resultColumns.map((col, cellIndex) => (
                        <td
                          key={cellIndex}
                          className="px-4 py-2 text-sm whitespace-nowrap"
                        >
                          <span className={row[col] === null ? 'italic text-muted-foreground' : ''}>
                            {formatValue(row[col])}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveQuery} disabled={!queryName.trim()}>
              Save
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
            {savedQueries.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No saved queries yet</p>
            ) : (
              savedQueries.map(query => (
                <Card key={query.id} className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold">{query.name}</h4>
                        <pre className="text-xs font-mono mt-2 p-2 bg-background rounded overflow-x-auto">
                          {query.query}
                        </pre>
                        <p className="text-xs text-muted-foreground mt-2">
                          Saved {new Date(query.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => loadSavedQuery(query)}
                        >
                          Load
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteSavedQuery(query.id)}
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

