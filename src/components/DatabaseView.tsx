import { useState, useEffect } from 'react';
import { ArrowLeft, Table, RefreshCw, Plus, Search, Loader2, Wand2, Copy, Download, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { listTables, executeQuery, type TableInfo, type TableDependenciesResponse } from '@/services/api';
import { api } from '@/services/api';
import { SchemaDesigner } from './SchemaDesigner';
import { QueryBuilder } from './QueryBuilder';
import { TableDependenciesView } from './TableDependenciesView';

interface DatabaseViewProps {
  databaseId: string;
  databaseName: string;
  onBack: () => void;
  onSelectTable: (tableName: string) => void;
}

export function DatabaseView({ databaseId, databaseName, onBack, onSelectTable }: DatabaseViewProps) {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSchemaDesigner, setShowSchemaDesigner] = useState(false);
  const [activeTab, setActiveTab] = useState<'tables' | 'builder'>('tables');
  
  // Selection state
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  
  // Rename dialog state
  const [renameDialogState, setRenameDialogState] = useState<{
    tableName: string;
    newName: string;
    isRenaming: boolean;
    error?: string;
  } | null>(null);
  
  // Clone dialog state
  const [cloneDialogState, setCloneDialogState] = useState<{
    tableNames: string[];
    cloneNames: Record<string, string>;
    isCloning: boolean;
    progress?: { current: number; total: number };
    error?: string;
  } | null>(null);
  
  // Export dialog state
  const [exportDialogState, setExportDialogState] = useState<{
    tableNames: string[];
    format: 'sql' | 'csv';
    isExporting: boolean;
    progress?: number;
    error?: string;
  } | null>(null);
  
  // Delete dialog state
  const [deleteDialogState, setDeleteDialogState] = useState<{
    tableNames: string[];
    isDeleting: boolean;
    progress?: { current: number; total: number };
    error?: string;
    dependencies?: TableDependenciesResponse;
    loadingDependencies?: boolean;
    confirmDependencies?: boolean;
  } | null>(null);

  useEffect(() => {
    loadTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseId]);

  const loadTables = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await listTables(databaseId);
      setTables(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tables');
    } finally {
      setLoading(false);
    }
  };

  const filteredTables = tables.filter(table =>
    table.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateTable = async (tableName: string, columns: Array<{ name: string; type: string; primaryKey: boolean; notNull: boolean; defaultValue: string }>) => {
    // Generate CREATE TABLE SQL
    const columnDefs = columns.map(col => {
      let def = `${col.name} ${col.type}`;
      if (col.primaryKey) def += ' PRIMARY KEY';
      if (col.notNull && !col.primaryKey) def += ' NOT NULL';
      if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
      return def;
    }).join(', ');

    const sql = `CREATE TABLE ${tableName} (${columnDefs});`;

    // Execute the query
    await executeQuery(databaseId, sql);

    // Reload tables
    await loadTables();
  };
  
  // Selection handlers
  const toggleTableSelection = (tableName: string) => {
    setSelectedTables(prev => {
      if (prev.includes(tableName)) {
        return prev.filter(name => name !== tableName);
      } else {
        return [...prev, tableName];
      }
    });
  };
  
  const selectAllTables = () => {
    setSelectedTables(filteredTables.map(table => table.name));
  };
  
  const clearSelection = () => {
    setSelectedTables([]);
  };
  
  // Rename handler
  const handleRenameClick = (tableName: string) => {
    setRenameDialogState({
      tableName,
      newName: tableName,
      isRenaming: false
    });
  };
  
  const handleRenameTable = async () => {
    if (!renameDialogState) return;
    
    if (!renameDialogState.newName.trim()) {
      setRenameDialogState(prev => prev ? { ...prev, error: 'Table name is required' } : null);
      return;
    }
    
    if (renameDialogState.newName === renameDialogState.tableName) {
      setRenameDialogState(prev => prev ? { ...prev, error: 'New name must be different' } : null);
      return;
    }
    
    setRenameDialogState(prev => prev ? { ...prev, isRenaming: true, error: undefined } : null);
    setError(null);
    
    try {
      await api.renameTable(databaseId, renameDialogState.tableName, renameDialogState.newName);
      await loadTables();
      setRenameDialogState(null);
    } catch (err) {
      setRenameDialogState(prev => prev ? {
        ...prev,
        isRenaming: false,
        error: err instanceof Error ? err.message : 'Failed to rename table'
      } : null);
    }
  };
  
  // Clone handlers
  const handleCloneClick = () => {
    if (selectedTables.length === 0) return;
    
    const cloneNames: Record<string, string> = {};
    selectedTables.forEach(name => {
      cloneNames[name] = `${name}_copy`;
    });
    
    setCloneDialogState({
      tableNames: selectedTables,
      cloneNames,
      isCloning: false
    });
  };
  
  const handleCloneTables = async () => {
    if (!cloneDialogState) return;
    
    // Validate all names
    for (const oldName of cloneDialogState.tableNames) {
      const newName = cloneDialogState.cloneNames[oldName];
      if (!newName.trim()) {
        setCloneDialogState(prev => prev ? { ...prev, error: `Clone name required for ${oldName}` } : null);
        return;
      }
      if (newName === oldName) {
        setCloneDialogState(prev => prev ? { ...prev, error: `Clone name for ${oldName} must be different` } : null);
        return;
      }
    }
    
    setCloneDialogState(prev => prev ? { ...prev, isCloning: true, error: undefined } : null);
    setError(null);
    
    try {
      const tablesToClone = cloneDialogState.tableNames.map(name => ({
        name,
        newName: cloneDialogState.cloneNames[name]
      }));
      
      const result = await api.cloneTables(databaseId, tablesToClone, (current, total) => {
        setCloneDialogState(prev => prev ? {
          ...prev,
          progress: { current, total }
        } : null);
      });
      
      if (result.failed.length > 0) {
        setError(`Some tables failed to clone:\n${result.failed.map(f => `${f.name}: ${f.error}`).join('\n')}`);
      }
      
      await loadTables();
      clearSelection();
      setCloneDialogState(null);
    } catch (err) {
      setCloneDialogState(prev => prev ? {
        ...prev,
        isCloning: false,
        error: err instanceof Error ? err.message : 'Failed to clone tables'
      } : null);
    }
  };
  
  // Export handlers
  const handleExportClick = () => {
    if (selectedTables.length === 0) return;
    
    setExportDialogState({
      tableNames: selectedTables,
      format: 'sql',
      isExporting: false
    });
  };
  
  const handleExportTables = async () => {
    if (!exportDialogState) return;
    
    setExportDialogState(prev => prev ? { ...prev, isExporting: true, error: undefined } : null);
    setError(null);
    
    try {
      if (exportDialogState.tableNames.length === 1) {
        await api.exportTable(databaseId, exportDialogState.tableNames[0], exportDialogState.format);
      } else {
        await api.exportTables(databaseId, exportDialogState.tableNames, exportDialogState.format, (progress) => {
          setExportDialogState(prev => prev ? { ...prev, progress } : null);
        });
      }
      
      clearSelection();
      setExportDialogState(null);
    } catch (err) {
      setExportDialogState(prev => prev ? {
        ...prev,
        isExporting: false,
        error: err instanceof Error ? err.message : 'Failed to export tables'
      } : null);
    }
  };
  
  // Delete handlers
  const handleDeleteClick = async () => {
    if (selectedTables.length === 0) return;
    
    setDeleteDialogState({
      tableNames: selectedTables,
      isDeleting: false,
      loadingDependencies: true
    });

    // Fetch dependencies
    try {
      const deps = await api.getTableDependencies(databaseId, selectedTables);
      setDeleteDialogState(prev => prev ? {
        ...prev,
        dependencies: deps,
        loadingDependencies: false
      } : null);
    } catch (err) {
      console.error('Failed to load dependencies:', err);
      setDeleteDialogState(prev => prev ? {
        ...prev,
        loadingDependencies: false,
        error: 'Failed to load table dependencies. You can still proceed with deletion.'
      } : null);
    }
  };
  
  const handleDeleteTables = async () => {
    if (!deleteDialogState) return;
    
    setDeleteDialogState(prev => prev ? { ...prev, isDeleting: true, error: undefined } : null);
    setError(null);
    
    try {
      const result = await api.deleteTables(databaseId, deleteDialogState.tableNames, (current, total) => {
        setDeleteDialogState(prev => prev ? {
          ...prev,
          progress: { current, total }
        } : null);
      });
      
      if (result.failed.length > 0) {
        setError(`Some tables failed to delete:\n${result.failed.map(f => `${f.name}: ${f.error}`).join('\n')}`);
      }
      
      await loadTables();
      clearSelection();
      setDeleteDialogState(null);
    } catch (err) {
      setDeleteDialogState(prev => prev ? {
        ...prev,
        isDeleting: false,
        error: err instanceof Error ? err.message : 'Failed to delete tables'
      } : null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-3xl font-semibold">{databaseName}</h2>
            <p className="text-sm text-muted-foreground">{databaseId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 mr-4">
            <Button
              variant={activeTab === 'tables' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('tables')}
            >
              <Table className="h-4 w-4 mr-2" />
              Tables
            </Button>
            <Button
              variant={activeTab === 'builder' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('builder')}
            >
              <Wand2 className="h-4 w-4 mr-2" />
              Query Builder
            </Button>
          </div>
          {activeTab === 'tables' && (
            <>
              <Button variant="outline" size="icon" onClick={loadTables}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button onClick={() => setShowSchemaDesigner(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Table
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content based on active tab */}
      {activeTab === 'builder' ? (
        <QueryBuilder databaseId={databaseId} databaseName={databaseName} />
      ) : (
        <>
          {/* Search Bar */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="table-search"
                name="table-search"
                placeholder="Search tables..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                aria-label="Search tables"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {filteredTables.length} {filteredTables.length === 1 ? 'table' : 'tables'}
            </div>
          </div>

          {/* Selection Toolbar */}
          {filteredTables.length > 0 && (
            <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
              <div className="flex items-center gap-4">
                {selectedTables.length === 0 && (
                  <Button variant="outline" onClick={selectAllTables}>
                    Select All
                  </Button>
                )}
                {selectedTables.length > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {selectedTables.length} table{selectedTables.length !== 1 ? 's' : ''} selected
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectedTables.length > 0 && (
                  <>
                    <Button variant="outline" onClick={clearSelection}>
                      Clear Selection
                    </Button>
                    <Button variant="outline" onClick={handleCloneClick}>
                      <Copy className="h-4 w-4 mr-2" />
                      Clone Selected
                    </Button>
                    <Button variant="outline" onClick={handleExportClick}>
                      <Download className="h-4 w-4 mr-2" />
                      Export Selected
                    </Button>
                    <Button variant="destructive" onClick={handleDeleteClick}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Selected
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Tables Grid */}
      {!loading && !error && (
        <>
          {filteredTables.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Table className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  {searchQuery ? 'No tables found' : 'No tables yet'}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {searchQuery
                    ? 'Try adjusting your search query'
                    : 'Create your first table to get started'}
                </p>
                {!searchQuery && (
                  <Button onClick={() => setShowSchemaDesigner(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Table
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTables.map((table) => {
                const isSelected = selectedTables.includes(table.name);
                return (
                  <Card
                    key={table.name}
                    className={`hover:shadow-lg transition-shadow relative ${
                      isSelected ? 'ring-2 ring-primary' : ''
                    }`}
                  >
                    <div className="absolute top-4 left-4 z-10">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleTableSelection(table.name)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <CardHeader className="pb-3 pl-12">
                      <div className="flex items-center gap-2">
                        <Table className="h-5 w-5 text-primary" />
                        <CardTitle className="text-base">{table.name}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm mb-4">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Type:</span>
                          <span className="font-medium capitalize">{table.type}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Columns:</span>
                          <span className="font-medium">{table.ncol}</span>
                        </div>
                        {table.type === 'table' && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Without rowid:</span>
                              <span className="font-medium">{table.wr ? 'Yes' : 'No'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Strict:</span>
                              <span className="font-medium">{table.strict ? 'Yes' : 'No'}</span>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => onSelectTable(table.name)}
                        >
                          <Table className="h-3.5 w-3.5 mr-1.5" />
                          Browse
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRenameClick(table.name);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />
                          Rename
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
        </>
      )}

      {/* Schema Designer Dialog */}
      <SchemaDesigner
        open={showSchemaDesigner}
        onOpenChange={setShowSchemaDesigner}
        onCreateTable={handleCreateTable}
      />

      {/* Rename Table Dialog */}
      {renameDialogState && (
        <Dialog open={true} onOpenChange={() => !renameDialogState.isRenaming && setRenameDialogState(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename Table</DialogTitle>
              <DialogDescription>
                Rename "{renameDialogState.tableName}" to a new name
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="rename-table-name">New Table Name</Label>
                <Input
                  id="rename-table-name"
                  placeholder="new_table_name"
                  value={renameDialogState.newName}
                  onChange={(e) => setRenameDialogState(prev => prev ? {
                    ...prev,
                    newName: e.target.value,
                    error: undefined
                  } : null)}
                  disabled={renameDialogState.isRenaming}
                />
              </div>
              {renameDialogState.error && (
                <div className="bg-destructive/10 border border-destructive text-destructive px-3 py-2 rounded-lg text-sm">
                  {renameDialogState.error}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRenameDialogState(null)}
                disabled={renameDialogState.isRenaming}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRenameTable}
                disabled={renameDialogState.isRenaming || !renameDialogState.newName.trim()}
              >
                {renameDialogState.isRenaming && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {renameDialogState.isRenaming ? 'Renaming...' : 'Rename Table'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Clone Tables Dialog */}
      {cloneDialogState && (
        <Dialog open={true} onOpenChange={() => !cloneDialogState.isCloning && setCloneDialogState(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Clone Tables</DialogTitle>
              <DialogDescription>
                Specify new names for the cloned tables. Structure, data, and indexes will be copied.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {cloneDialogState.tableNames.map((tableName) => (
                <div key={tableName} className="grid gap-2">
                  <Label htmlFor={`clone-${tableName}`}>
                    Clone of "{tableName}"
                  </Label>
                  <Input
                    id={`clone-${tableName}`}
                    placeholder={`${tableName}_copy`}
                    value={cloneDialogState.cloneNames[tableName]}
                    onChange={(e) => setCloneDialogState(prev => prev ? {
                      ...prev,
                      cloneNames: {
                        ...prev.cloneNames,
                        [tableName]: e.target.value
                      },
                      error: undefined
                    } : null)}
                    disabled={cloneDialogState.isCloning}
                  />
                </div>
              ))}
              {cloneDialogState.isCloning && cloneDialogState.progress && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Cloning table {cloneDialogState.progress.current} of {cloneDialogState.progress.total}...
                  </p>
                  <Progress
                    value={(cloneDialogState.progress.current / cloneDialogState.progress.total) * 100}
                  />
                </div>
              )}
              {cloneDialogState.error && (
                <div className="bg-destructive/10 border border-destructive text-destructive px-3 py-2 rounded-lg text-sm">
                  {cloneDialogState.error}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCloneDialogState(null)}
                disabled={cloneDialogState.isCloning}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCloneTables}
                disabled={cloneDialogState.isCloning}
              >
                {cloneDialogState.isCloning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {cloneDialogState.isCloning ? 'Cloning...' : `Clone ${cloneDialogState.tableNames.length} Table${cloneDialogState.tableNames.length !== 1 ? 's' : ''}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Export Tables Dialog */}
      {exportDialogState && (
        <Dialog open={true} onOpenChange={() => !exportDialogState.isExporting && setExportDialogState(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Export Tables</DialogTitle>
              <DialogDescription>
                Choose the export format for {exportDialogState.tableNames.length} table{exportDialogState.tableNames.length !== 1 ? 's' : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Export Format</Label>
                <RadioGroup
                  value={exportDialogState.format}
                  onValueChange={(value) => setExportDialogState(prev => prev ? {
                    ...prev,
                    format: value as 'sql' | 'csv'
                  } : null)}
                  disabled={exportDialogState.isExporting}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="sql" id="format-sql" />
                    <Label htmlFor="format-sql" className="font-normal">
                      SQL (includes structure and data)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="csv" id="format-csv" />
                    <Label htmlFor="format-csv" className="font-normal">
                      CSV (data only)
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="bg-muted p-3 rounded-md">
                <p className="text-sm text-muted-foreground">
                  Tables to export:
                </p>
                <ul className="text-sm list-disc list-inside mt-2">
                  {exportDialogState.tableNames.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
              {exportDialogState.isExporting && exportDialogState.progress !== undefined && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Exporting... {Math.round(exportDialogState.progress)}%
                  </p>
                  <Progress value={exportDialogState.progress} />
                </div>
              )}
              {exportDialogState.error && (
                <div className="bg-destructive/10 border border-destructive text-destructive px-3 py-2 rounded-lg text-sm">
                  {exportDialogState.error}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setExportDialogState(null)}
                disabled={exportDialogState.isExporting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleExportTables}
                disabled={exportDialogState.isExporting}
              >
                {exportDialogState.isExporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {exportDialogState.isExporting ? 'Exporting...' : 'Export'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Tables Dialog */}
      {deleteDialogState && (
        <Dialog open={true} onOpenChange={() => !deleteDialogState.isDeleting && setDeleteDialogState(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {deleteDialogState.tableNames.length === 1
                  ? 'Delete Table?'
                  : `Delete ${deleteDialogState.tableNames.length} Tables?`}
              </DialogTitle>
              <DialogDescription>
                This action cannot be undone. This will permanently delete the table{deleteDialogState.tableNames.length !== 1 ? 's' : ''} and all {deleteDialogState.tableNames.length !== 1 ? 'their' : 'its'} data.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              {/* Loading dependencies */}
              {deleteDialogState.loadingDependencies && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
                  <span className="text-sm text-muted-foreground">Checking dependencies...</span>
                </div>
              )}

              {/* Single table delete */}
              {!deleteDialogState.loadingDependencies && deleteDialogState.tableNames.length === 1 && (
                <div className="space-y-4">
                  <p className="text-sm">
                    Table: <strong>{deleteDialogState.tableNames[0]}</strong>
                  </p>
                  
                  {deleteDialogState.dependencies && deleteDialogState.dependencies[deleteDialogState.tableNames[0]] && (
                    <TableDependenciesView
                      tableName={deleteDialogState.tableNames[0]}
                      dependencies={deleteDialogState.dependencies[deleteDialogState.tableNames[0]]}
                    />
                  )}
                </div>
              )}

              {/* Bulk delete with per-table accordion */}
              {!deleteDialogState.loadingDependencies && deleteDialogState.tableNames.length > 1 && (
                <div className="space-y-4">
                  <p className="text-sm font-medium">Tables to delete ({deleteDialogState.tableNames.length}):</p>
                  
                  {deleteDialogState.dependencies && (
                    <Accordion type="multiple" className="w-full">
                      {deleteDialogState.tableNames.map((tableName) => {
                        const deps = deleteDialogState.dependencies?.[tableName];
                        const hasDeps = deps && (deps.inbound.length > 0 || deps.outbound.length > 0);
                        const depCount = deps ? deps.inbound.length + deps.outbound.length : 0;
                        
                        return (
                          <AccordionItem key={tableName} value={tableName}>
                            <AccordionTrigger className="hover:no-underline">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{tableName}</span>
                                {hasDeps && (
                                  <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 px-2 py-0.5 rounded-full">
                                    {depCount} {depCount === 1 ? 'dependency' : 'dependencies'}
                                  </span>
                                )}
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              {deps ? (
                                <div className="pt-2">
                                  <TableDependenciesView
                                    tableName={tableName}
                                    dependencies={deps}
                                  />
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground pt-2">No dependencies</p>
                              )}
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  )}
                </div>
              )}

              {/* Confirmation checkbox for tables with dependencies */}
              {!deleteDialogState.loadingDependencies && deleteDialogState.dependencies && (() => {
                const hasDependencies = Object.values(deleteDialogState.dependencies).some(
                  dep => dep.inbound.length > 0 || dep.outbound.length > 0
                );
                return hasDependencies && (
                  <div className="flex items-start space-x-3 rounded-md border border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/30 p-4">
                    <Checkbox
                      id="confirm-dependencies"
                      checked={deleteDialogState.confirmDependencies || false}
                      onCheckedChange={(checked) => setDeleteDialogState(prev => prev ? {
                        ...prev,
                        confirmDependencies: checked === true
                      } : null)}
                    />
                    <div className="space-y-1 leading-none">
                      <Label
                        htmlFor="confirm-dependencies"
                        className="text-sm font-medium cursor-pointer"
                      >
                        I understand that deleting {deleteDialogState.tableNames.length === 1 ? 'this table' : 'these tables'} will affect dependent tables
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Foreign key constraints may cause cascading deletions or prevent deletion entirely.
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Progress indicator */}
              {deleteDialogState.isDeleting && deleteDialogState.progress && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Deleting table {deleteDialogState.progress.current} of {deleteDialogState.progress.total}...
                  </p>
                  <Progress
                    value={(deleteDialogState.progress.current / deleteDialogState.progress.total) * 100}
                  />
                </div>
              )}

              {/* Error message */}
              {deleteDialogState.error && (
                <div className="bg-destructive/10 border border-destructive text-destructive px-3 py-2 rounded-lg text-sm">
                  {deleteDialogState.error}
                </div>
              )}
            </div>
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
                onClick={handleDeleteTables}
                disabled={
                  deleteDialogState.isDeleting ||
                  deleteDialogState.loadingDependencies ||
                  (deleteDialogState.dependencies && 
                   Object.values(deleteDialogState.dependencies).some(dep => dep.inbound.length > 0 || dep.outbound.length > 0) &&
                   !deleteDialogState.confirmDependencies)
                }
              >
                {deleteDialogState.isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {deleteDialogState.isDeleting
                  ? 'Deleting...'
                  : deleteDialogState.tableNames.length === 1
                    ? 'Delete Table'
                    : `Delete ${deleteDialogState.tableNames.length} Tables`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

