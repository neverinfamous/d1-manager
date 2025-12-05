import { useState, useEffect } from 'react';
import { Plus, RefreshCw, Loader2, Search, Sparkles, Trash2, RotateCcw, Zap, Info, Table, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FTS5SchemaDesigner } from './FTS5SchemaDesigner';
import { FTS5FromTableConverter } from './FTS5FromTableConverter';
import { FTS5SearchDialog } from './FTS5SearchDialog';
import { FTS5Stats } from './FTS5Stats';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  listFTS5Tables,
  createFTS5Table,
  createFTS5FromTable,
  deleteFTS5Table,
  rebuildFTS5Index,
  optimizeFTS5,
  getFTS5Stats,
  listTables,
} from '@/services/api';
import type { FTS5TableInfo, FTS5TableConfig, FTS5CreateFromTableParams, FTS5Stats as FTS5StatsType } from '@/services/fts5-types';
import { ErrorMessage } from '@/components/ui/error-message';

interface FTS5ManagerProps {
  databaseId: string;
  databaseName: string;
  onNavigateToTables?: () => void;
  onConvertFTS5ToTable?: (tableName: string) => void;
  onUndoableOperation?: (() => void) | undefined;
}

export function FTS5Manager({ databaseId, databaseName: _databaseName, onNavigateToTables, onConvertFTS5ToTable, onUndoableOperation }: FTS5ManagerProps): React.JSX.Element {
  void _databaseName; // Passed to parent callback via onConvertFTS5ToTable
  const [fts5Tables, setFts5Tables] = useState<FTS5TableInfo[]>([]);
  const [canConvertTables, setCanConvertTables] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSchemaDesigner, setShowSchemaDesigner] = useState(false);
  const [showConverter, setShowConverter] = useState(false);
  const [selectedTable, setSelectedTable] = useState<FTS5TableInfo | null>(null);
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [tableStats, setTableStats] = useState<Record<string, FTS5StatsType>>({});
  
  // Delete dialog state
  const [deleteDialogState, setDeleteDialogState] = useState<{
    tableName: string;
    isDeleting: boolean;
  } | null>(null);

  // Rebuild/Optimize state
  const [rebuildingTable, setRebuildingTable] = useState<string | null>(null);
  const [optimizingTable, setOptimizingTable] = useState<string | null>(null);
  
  useEffect(() => {
    void loadFTS5Tables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseId]);

  const loadFTS5Tables = async (skipCache = false): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      
      // Load FTS5 tables and regular tables in parallel (use cache on initial load)
      const [tables, allTables] = await Promise.all([
        listFTS5Tables(databaseId, skipCache),
        listTables(databaseId, skipCache).catch(() => []) // Non-critical, default to empty
      ]);
      
      setFts5Tables(tables);
      
      // Show "Convert to FTS5" button when there are regular tables available to convert
      const regularTables = allTables.filter(t => t.type === 'table');
      setCanConvertTables(regularTables.length > 0);
      
      // Load stats for all tables in parallel (much faster)
      if (tables.length > 0) {
        const statsPromises = tables.map(async (table) => {
          try {
            const stat = await getFTS5Stats(databaseId, table.name);
            return { name: table.name, stat };
          } catch {
            return { name: table.name, stat: null };
          }
        });
        
        const statsResults = await Promise.all(statsPromises);
        const stats: Record<string, FTS5StatsType> = {};
        for (const result of statsResults) {
          if (result.stat) {
            stats[result.name] = result.stat;
          }
        }
        setTableStats(stats);
      } else {
        setTableStats({});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load FTS5 tables');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFTS5Table = async (config: FTS5TableConfig): Promise<void> => {
    await createFTS5Table(databaseId, config);
    await loadFTS5Tables();
  };

  const handleConvertTable = async (params: FTS5CreateFromTableParams): Promise<void> => {
    await createFTS5FromTable(databaseId, params);
    await loadFTS5Tables();
  };

  const handleDeleteClick = (tableName: string): void => {
    setDeleteDialogState({
      tableName,
      isDeleting: false,
    });
  };

  const handleDeleteTable = async (): Promise<void> => {
    if (!deleteDialogState) return;

    try {
      setDeleteDialogState(prev => prev ? { ...prev, isDeleting: true } : null);
      await deleteFTS5Table(databaseId, deleteDialogState.tableName);
      await loadFTS5Tables();
      setDeleteDialogState(null);
      
      // Notify parent of undoable operation
      onUndoableOperation?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete FTS5 table');
      setDeleteDialogState(prev => prev ? { ...prev, isDeleting: false } : null);
    }
  };

  const handleRebuild = async (tableName: string): Promise<void> => {
    try {
      setRebuildingTable(tableName);
      await rebuildFTS5Index(databaseId, tableName);
      await loadFTS5Tables();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rebuild index');
    } finally {
      setRebuildingTable(null);
    }
  };

  const handleOptimize = async (tableName: string): Promise<void> => {
    try {
      setOptimizingTable(tableName);
      await optimizeFTS5(databaseId, tableName);
      await loadFTS5Tables();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to optimize index');
    } finally {
      setOptimizingTable(null);
    }
  };

  const handleSearchClick = (table: FTS5TableInfo): void => {
    setSelectedTable(table);
    setShowSearchDialog(true);
  };
  
  const handleConvertToTableClick = (tableName: string): void => {
    // Delegate to parent component's dialog
    onConvertFTS5ToTable?.(tableName);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i] ?? ''}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-purple-500" />
            FTS5 Search
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Manage FTS5 virtual tables for advanced full-text search capabilities
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => void loadFTS5Tables(true)} disabled={loading} title="Refresh FTS5 tables">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          {canConvertTables && (
            <Button variant="outline" onClick={() => setShowConverter(true)}>
              Convert to FTS5
            </Button>
          )}
          <Button onClick={() => setShowSchemaDesigner(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create FTS5 Table
          </Button>
        </div>
      </div>

      {/* Error Display */}
      <ErrorMessage error={error} variant="card" />

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* FTS5 Tables Grid */}
      {!loading && (
        <>
          {fts5Tables.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Sparkles className="h-12 w-12 text-purple-500 mb-4 opacity-50" />
                <h3 className="text-lg font-semibold mb-2">No FTS5 Tables Yet</h3>
                <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
                  Create full-text search indexes to enable powerful text searching with ranking and highlighting
                </p>
                <div className="flex gap-2">
                  <Button onClick={() => setShowSchemaDesigner(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create FTS5 Table
                  </Button>
                  <Button variant="outline" onClick={() => setShowConverter(true)}>
                    Convert Table to FTS5
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Stats Overview */}
              {Object.keys(tableStats).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-3">Overview</h4>
                  <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold">{fts5Tables.length}</div>
                        <p className="text-xs text-muted-foreground mt-1">FTS5 Tables</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold">
                          {Object.values(tableStats).reduce((sum, s) => sum + s.rowCount, 0).toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Total Indexed Rows</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold">
                          {formatBytes(Object.values(tableStats).reduce((sum, s) => sum + s.indexSize, 0))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Total Index Size</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold">
                          {fts5Tables.filter(t => t.contentTable).length}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">External Content</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {/* Edit Notice */}
              <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        <span className="font-medium">Need to edit data?</span> FTS5 tables support INSERT, UPDATE, and DELETE operations just like regular tables.
                        To browse or edit rows, use the Tables view.
                      </p>
                      {onNavigateToTables && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 border-blue-300 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                          onClick={onNavigateToTables}
                        >
                          <Table className="h-3.5 w-3.5 mr-1.5" />
                          Go to Tables View
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* FTS5 Tables List */}
              <div>
                <h4 className="text-sm font-semibold mb-3">FTS5 Tables</h4>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {fts5Tables.map((table) => (
                    <Card key={table.name} className="hover:shadow-lg transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-purple-500" />
                            {table.name}
                          </CardTitle>
                          <span className="px-2 py-1 text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                            FTS5
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* Metadata */}
                        <div className="text-sm space-y-1">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Tokenizer:</span>
                            <span className="font-medium">{table.tokenizer.type}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Columns:</span>
                            <span className="font-medium">{table.columns.join(', ')}</span>
                          </div>
                          {table.contentTable && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Content Table:</span>
                              <span className="font-medium">{table.contentTable}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Rows:</span>
                            <span className="font-medium">{table.rowCount.toLocaleString()}</span>
                          </div>
                          {table.indexSize && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Size:</span>
                              <span className="font-medium">{formatBytes(table.indexSize)}</span>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="grid grid-cols-2 gap-2 pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSearchClick(table)}
                          >
                            <Search className="h-3.5 w-3.5 mr-1.5" />
                            Search
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleOptimize(table.name)}
                            disabled={optimizingTable === table.name}
                          >
                            {optimizingTable === table.name ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <Zap className="h-3.5 w-3.5 mr-1.5" />
                            )}
                            Optimize
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleRebuild(table.name)}
                            disabled={rebuildingTable === table.name}
                          >
                            {rebuildingTable === table.name ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                            )}
                            Rebuild
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleConvertToTableClick(table.name)}
                            title="Convert FTS5 to regular table"
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
                            Convert
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteClick(table.name)}
                            className="text-destructive hover:text-destructive col-span-2"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                            Delete
                          </Button>
                        </div>

                        {/* Stats for this table */}
                        {(() => {
                          const stats = tableStats[table.name];
                          return stats ? (
                            <div className="pt-2 border-t">
                              <FTS5Stats stats={stats} />
                            </div>
                          ) : null;
                        })()}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Schema Designer Dialog */}
      <FTS5SchemaDesigner
        open={showSchemaDesigner}
        onOpenChange={setShowSchemaDesigner}
        onCreateTable={handleCreateFTS5Table}
      />

      {/* Table Converter Dialog */}
      <FTS5FromTableConverter
        open={showConverter}
        onOpenChange={setShowConverter}
        databaseId={databaseId}
        onConvert={handleConvertTable}
      />

      {/* Search Dialog */}
      {selectedTable && (
        <FTS5SearchDialog
          open={showSearchDialog}
          onClose={() => {
            setShowSearchDialog(false);
            setSelectedTable(null);
          }}
          databaseId={databaseId}
          tableName={selectedTable.name}
          columns={selectedTable.columns}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteDialogState && (
        <Dialog open={true} onOpenChange={() => !deleteDialogState.isDeleting && setDeleteDialogState(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete FTS5 Table?</DialogTitle>
              <DialogDescription>
                This will permanently delete the FTS5 virtual table "{deleteDialogState.tableName}".
                {fts5Tables.find(t => t.name === deleteDialogState.tableName)?.contentTable 
                  ? ' The source content table will not be affected.'
                  : ' All indexed data will be lost.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogState(null)}
                disabled={deleteDialogState.isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleDeleteTable()}
                disabled={deleteDialogState.isDeleting}
              >
                {deleteDialogState.isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {deleteDialogState.isDeleting ? 'Deleting...' : 'Delete Table'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

