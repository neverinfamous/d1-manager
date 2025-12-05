import React, { useState } from 'react';
import { GitCompare, Loader2, ChevronDown, ChevronRight, Plus, Minus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { listTables, getTableSchema, type ColumnInfo } from '@/services/api';

interface DatabaseComparisonProps {
  databases: { uuid: string; name: string }[];
  preSelectedDatabases?: [string, string];
  onClose?: () => void;
}

interface SchemaDiff {
  table: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  columnDiffs?: ColumnDiff[];
}

interface ColumnDiff {
  column: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  leftDef?: string;
  rightDef?: string;
}

export function DatabaseComparison({ databases, preSelectedDatabases, onClose: _onClose }: DatabaseComparisonProps): React.JSX.Element {
  const [leftDb, setLeftDb] = useState<string>(preSelectedDatabases?.[0] ?? '');
  const [rightDb, setRightDb] = useState<string>(preSelectedDatabases?.[1] ?? '');
  const [comparing, setComparing] = useState(false);
  const [diffs, setDiffs] = useState<SchemaDiff[]>([]);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [autoRan, setAutoRan] = useState(false);

  // Auto-run comparison when pre-selected databases are provided
  React.useEffect(() => {
    if (preSelectedDatabases?.[0] && preSelectedDatabases[1] && !autoRan) {
      setAutoRan(true);
      void handleCompare();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preSelectedDatabases]);

  const handleCompare = async (): Promise<void> => {
    if (!leftDb || !rightDb) {
      setError('Please select two databases to compare');
      return;
    }

    if (leftDb === rightDb) {
      setError('Please select two different databases');
      return;
    }

    try {
      setComparing(true);
      setError(null);
      setDiffs([]);

      // Get tables from both databases
      const [leftTables, rightTables] = await Promise.all([
        listTables(leftDb),
        listTables(rightDb)
      ]);

      const leftTableNames = new Set(leftTables.map(t => t.name));
      const rightTableNames = new Set(rightTables.map(t => t.name));

      const allTables = new Set([...leftTableNames, ...rightTableNames]);
      const results: SchemaDiff[] = [];

      // Compare each table
      for (const tableName of allTables) {
        const inLeft = leftTableNames.has(tableName);
        const inRight = rightTableNames.has(tableName);

        if (inLeft && !inRight) {
          results.push({
            table: tableName,
            status: 'removed'
          });
        } else if (!inLeft && inRight) {
          results.push({
            table: tableName,
            status: 'added'
          });
        } else if (inLeft && inRight) {
          // Compare schemas
          const [leftSchema, rightSchema] = await Promise.all([
            getTableSchema(leftDb, tableName),
            getTableSchema(rightDb, tableName)
          ]);

          const columnDiffs = compareColumns(leftSchema, rightSchema);
          const hasChanges = columnDiffs.some(c => c.status !== 'unchanged');

          results.push({
            table: tableName,
            status: hasChanges ? 'modified' : 'unchanged',
            columnDiffs
          });
        }
      }

      setDiffs(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comparison failed');
    } finally {
      setComparing(false);
    }
  };

  const compareColumns = (leftCols: ColumnInfo[], rightCols: ColumnInfo[]): ColumnDiff[] => {
    const leftColMap = new Map(leftCols.map(c => [c.name, c]));
    const rightColMap = new Map(rightCols.map(c => [c.name, c]));
    const allColNames = new Set([...leftColMap.keys(), ...rightColMap.keys()]);

    const diffs: ColumnDiff[] = [];

    for (const colName of allColNames) {
      const leftCol = leftColMap.get(colName);
      const rightCol = rightColMap.get(colName);

      if (leftCol && !rightCol) {
        diffs.push({
          column: colName,
          status: 'removed',
          leftDef: formatColumnDef(leftCol)
        });
      } else if (!leftCol && rightCol) {
        diffs.push({
          column: colName,
          status: 'added',
          rightDef: formatColumnDef(rightCol)
        });
      } else if (leftCol && rightCol) {
        const leftDef = formatColumnDef(leftCol);
        const rightDef = formatColumnDef(rightCol);
        const isModified = leftDef !== rightDef;

        diffs.push({
          column: colName,
          status: isModified ? 'modified' : 'unchanged',
          leftDef,
          rightDef
        });
      }
    }

    return diffs;
  };

  const formatColumnDef = (col: ColumnInfo): string => {
    let def = col.type || 'ANY';
    if (col.pk > 0) def += ' PRIMARY KEY';
    if (col.notnull && col.pk === 0) def += ' NOT NULL';
    if (col.dflt_value) def += ` DEFAULT ${col.dflt_value}`;
    return def;
  };

  const toggleTable = (tableName: string): void => {
    const newExpanded = new Set(expandedTables);
    if (newExpanded.has(tableName)) {
      newExpanded.delete(tableName);
    } else {
      newExpanded.add(tableName);
    }
    setExpandedTables(newExpanded);
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'added':
        return 'text-green-600 dark:text-green-400';
      case 'removed':
        return 'text-red-600 dark:text-red-400';
      case 'modified':
        return 'text-yellow-600 dark:text-yellow-400';
      default:
        return 'text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string): React.JSX.Element | null => {
    switch (status) {
      case 'added':
        return <Plus className="h-4 w-4" />;
      case 'removed':
        return <Minus className="h-4 w-4" />;
      case 'modified':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const leftDbName = databases.find(d => d.uuid === leftDb)?.name || '';
  const rightDbName = databases.find(d => d.uuid === rightDb)?.name || '';

  const stats = {
    added: diffs.filter(d => d.status === 'added').length,
    removed: diffs.filter(d => d.status === 'removed').length,
    modified: diffs.filter(d => d.status === 'modified').length,
    unchanged: diffs.filter(d => d.status === 'unchanged').length
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <GitCompare className="h-5 w-5" />
          Database Comparison
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Compare schemas between two databases
        </p>
      </div>

      {/* Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Databases to Compare</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="left-database-select" className="text-sm font-medium">Left Database</label>
              <select
                id="left-database-select"
                name="left-database"
                className="w-full h-10 px-3 rounded-md border border-input bg-background"
                value={leftDb}
                onChange={(e) => setLeftDb(e.target.value)}
              >
                <option value="">Select database...</option>
                {databases.map(db => (
                  <option key={db.uuid} value={db.uuid}>{db.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="right-database-select" className="text-sm font-medium">Right Database</label>
              <select
                id="right-database-select"
                name="right-database"
                className="w-full h-10 px-3 rounded-md border border-input bg-background"
                value={rightDb}
                onChange={(e) => setRightDb(e.target.value)}
              >
                <option value="">Select database...</option>
                {databases.map(db => (
                  <option key={db.uuid} value={db.uuid}>{db.name}</option>
                ))}
              </select>
            </div>
          </div>

          <Button
            onClick={() => void handleCompare()}
            disabled={!leftDb || !rightDb || comparing}
            className="w-full"
          >
            {comparing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Comparing...
              </>
            ) : (
              <>
                <GitCompare className="h-4 w-4 mr-2" />
                Compare Databases
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {diffs.length > 0 && (
        <>
          {/* Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Comparison Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {stats.added}
                  </div>
                  <div className="text-sm text-muted-foreground">Added</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {stats.removed}
                  </div>
                  <div className="text-sm text-muted-foreground">Removed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                    {stats.modified}
                  </div>
                  <div className="text-sm text-muted-foreground">Modified</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-muted-foreground">
                    {stats.unchanged}
                  </div>
                  <div className="text-sm text-muted-foreground">Unchanged</div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Left:</span> {leftDbName}
                </div>
                <div>
                  <span className="font-medium">Right:</span> {rightDbName}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Differences */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Schema Differences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {diffs.map(diff => (
                <Card key={diff.table} className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => diff.columnDiffs && toggleTable(diff.table)}
                    >
                      <div className="flex items-center gap-2">
                        {diff.columnDiffs && (
                          expandedTables.has(diff.table) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )
                        )}
                        <div className={`flex items-center gap-2 font-medium ${getStatusColor(diff.status)}`}>
                          {getStatusIcon(diff.status)}
                          <span>{diff.table}</span>
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded ${getStatusColor(diff.status)}`}>
                        {diff.status}
                      </span>
                    </div>

                    {/* Column Differences */}
                    {diff.columnDiffs && expandedTables.has(diff.table) && (
                      <div className="mt-4 space-y-2 pl-6">
                        {diff.columnDiffs.filter(c => c.status !== 'unchanged').map(colDiff => (
                          <div key={colDiff.column} className="text-sm">
                            <div className={`flex items-center gap-2 font-medium ${getStatusColor(colDiff.status)}`}>
                              {getStatusIcon(colDiff.status)}
                              <span>{colDiff.column}</span>
                            </div>
                            {colDiff.status === 'modified' && (
                              <div className="mt-1 pl-6 space-y-1">
                                <div className="text-red-600 dark:text-red-400">
                                  - {colDiff.leftDef}
                                </div>
                                <div className="text-green-600 dark:text-green-400">
                                  + {colDiff.rightDef}
                                </div>
                              </div>
                            )}
                            {colDiff.status === 'removed' && (
                              <div className="mt-1 pl-6 text-red-600 dark:text-red-400">
                                - {colDiff.leftDef}
                              </div>
                            )}
                            {colDiff.status === 'added' && (
                              <div className="mt-1 pl-6 text-green-600 dark:text-green-400">
                                + {colDiff.rightDef}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {/* Empty State */}
      {diffs.length === 0 && !comparing && !error && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          Select two databases and click "Compare Databases" to see schema differences
        </div>
      )}
    </div>
  );
}

