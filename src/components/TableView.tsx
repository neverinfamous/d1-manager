import { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, Download, Trash2, Edit, Plus, Loader2, Columns, Settings, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getTableSchema, getTableData, executeQuery, type ColumnInfo, type FilterCondition, api } from '@/services/api';
import { FilterBar } from '@/components/FilterBar';
import { deserializeFilters, serializeFilters, getActiveFilterCount } from '@/utils/filters';

interface TableViewProps {
  databaseId: string;
  databaseName: string;
  tableName: string;
  onBack: () => void;
}

export function TableView({ databaseId, databaseName, tableName, onBack }: TableViewProps) {
  const [schema, setSchema] = useState<ColumnInfo[]>([]);
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const rowsPerPage = 50;
  const [showInsertDialog, setShowInsertDialog] = useState(false);
  const [insertValues, setInsertValues] = useState<Record<string, string>>({});
  const [inserting, setInserting] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [updating, setUpdating] = useState(false);
  const [allowEditPrimaryKey, setAllowEditPrimaryKey] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingRow, setDeletingRow] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  // Filter state
  const [filters, setFilters] = useState<Record<string, FilterCondition>>({});
  const [showFilters, setShowFilters] = useState(false);
  
  // Column management state
  const [showAddColumnDialog, setShowAddColumnDialog] = useState(false);
  const [addColumnValues, setAddColumnValues] = useState({
    name: '',
    type: 'TEXT',
    notnull: false,
    defaultValue: ''
  });
  const [addingColumn, setAddingColumn] = useState(false);
  const [showRenameColumnDialog, setShowRenameColumnDialog] = useState(false);
  const [renamingColumn, setRenamingColumn] = useState<ColumnInfo | null>(null);
  const [renameColumnValue, setRenameColumnValue] = useState('');
  const [renamingColumnInProgress, setRenamingColumnInProgress] = useState(false);
  const [showModifyColumnDialog, setShowModifyColumnDialog] = useState(false);
  const [modifyingColumn, setModifyingColumn] = useState<ColumnInfo | null>(null);
  const [modifyColumnValues, setModifyColumnValues] = useState({
    type: 'TEXT',
    notnull: false,
    defaultValue: ''
  });
  const [modifyingColumnInProgress, setModifyingColumnInProgress] = useState(false);
  const [showDeleteColumnDialog, setShowDeleteColumnDialog] = useState(false);
  const [deletingColumn, setDeletingColumn] = useState<ColumnInfo | null>(null);
  const [deletingColumnInProgress, setDeletingColumnInProgress] = useState(false);

  // Sync filters with URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlFilters = deserializeFilters(params);
    
    if (Object.keys(urlFilters).length > 0) {
      setFilters(urlFilters);
      setShowFilters(true);
    }
  }, []);
  
  // Update URL when filters change
  useEffect(() => {
    const params = serializeFilters(filters);
    const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
    window.history.replaceState({}, '', newUrl);
  }, [filters]);
  
  useEffect(() => {
    loadTableData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseId, tableName, page, filters]);

  const loadTableData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Load schema and data in parallel
      const [schemaResult, dataResult] = await Promise.all([
        getTableSchema(databaseId, tableName),
        getTableData(databaseId, tableName, rowsPerPage, (page - 1) * rowsPerPage, filters)
      ]);
      
      setSchema(schemaResult);
      setData(dataResult.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load table data');
    } finally {
      setLoading(false);
    }
  };
  
  const handleFiltersChange = (newFilters: Record<string, FilterCondition>) => {
    setFilters(newFilters);
    setPage(1); // Reset to first page when filters change
  };

  const formatValue = (value: unknown): string => {
    if (value === null) return 'NULL';
    if (value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const handleOpenInsertDialog = () => {
    // Initialize insert values with empty strings for all columns
    const initialValues: Record<string, string> = {};
    schema.forEach(col => {
      initialValues[col.name] = '';
    });
    setInsertValues(initialValues);
    setShowInsertDialog(true);
  };

  const handleInsertRow = async () => {
    setInserting(true);
    setError(null);
    
    try {
      // Build INSERT query
      // Filter columns to include based on whether they have values or need explicit insertion
      const columnsWithValues = schema.filter(col => {
        const value = insertValues[col.name];
        const hasValue = value !== '' && value !== null && value !== undefined;
        
        // If column has a value, always include it
        if (hasValue) return true;
        
        // If it's a primary key with INTEGER type (auto-increment), skip it when empty
        if (col.pk > 0 && col.type && col.type.toUpperCase().includes('INTEGER')) {
          return false;
        }
        
        // Otherwise include it (will be set to NULL or default)
        return true;
      });
      
      // If no columns need explicit values (e.g., only auto-increment PK), use DEFAULT VALUES
      let query: string;
      if (columnsWithValues.length === 0) {
        query = `INSERT INTO "${tableName}" DEFAULT VALUES`;
      } else {
        const columnNames = columnsWithValues.map(col => col.name);
        const values = columnsWithValues.map(col => {
          const value = insertValues[col.name];
          if (value === '' || value === null || value === undefined) return 'NULL';
          // Try to determine if it's a number
          if (!isNaN(Number(value)) && value.trim() !== '') return value;
          // Otherwise treat as string
          return `'${value.replace(/'/g, "''")}'`; // Escape single quotes
        });
        
        query = `INSERT INTO "${tableName}" (${columnNames.map(n => `"${n}"`).join(', ')}) VALUES (${values.join(', ')})`;
      }
      
      await executeQuery(databaseId, query, [], true); // Skip validation for INSERT
      
      setShowInsertDialog(false);
      setInsertValues({});
      await loadTableData(); // Reload data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to insert row');
    } finally {
      setInserting(false);
    }
  };

  const handleOpenEditDialog = (row: Record<string, unknown>) => {
    setEditingRow(row);
    // Convert all values to strings for the form
    const stringValues: Record<string, string> = {};
    schema.forEach(col => {
      const value = row[col.name];
      stringValues[col.name] = value !== null && value !== undefined ? String(value) : '';
    });
    setEditValues(stringValues);
    setAllowEditPrimaryKey(false); // Reset checkbox when opening dialog
    setShowEditDialog(true);
  };

  const handleUpdateRow = async () => {
    if (!editingRow) return;
    
    setUpdating(true);
    setError(null);
    
    try {
      // Build UPDATE query with WHERE clause based on primary keys
      const pkColumns = schema.filter(col => col.pk > 0);
      if (pkColumns.length === 0) {
        throw new Error('Cannot update row: No primary key found');
      }
      
      // Build SET clause - include PKs if editing is allowed
      const updateColumns = allowEditPrimaryKey 
        ? schema // Include all columns when PK editing is enabled
        : schema.filter(col => col.pk === 0); // Only non-PK columns otherwise
      
      const setClause = updateColumns.map(col => {
        const value = editValues[col.name];
        if (value === '' || value === null) return `"${col.name}" = NULL`;
        if (!isNaN(Number(value)) && value.trim() !== '') return `"${col.name}" = ${value}`;
        return `"${col.name}" = '${value.replace(/'/g, "''")}'`;
      }).join(', ');
      
      // Build WHERE clause based on ORIGINAL primary key values (from editingRow, not editValues)
      const whereClause = pkColumns.map(col => {
        const value = editingRow[col.name];
        return `"${col.name}" = ${typeof value === 'number' ? value : `'${String(value).replace(/'/g, "''")}'`}`;
      }).join(' AND ');
      
      const query = `UPDATE "${tableName}" SET ${setClause} WHERE ${whereClause}`;
      
      await executeQuery(databaseId, query, [], true);
      
      setShowEditDialog(false);
      setEditingRow(null);
      setEditValues({});
      await loadTableData(); // Reload data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update row');
    } finally {
      setUpdating(false);
    }
  };

  const handleOpenDeleteDialog = (row: Record<string, unknown>) => {
    setDeletingRow(row);
    setShowDeleteDialog(true);
  };

  const handleDeleteRow = async () => {
    if (!deletingRow) return;
    
    setDeleting(true);
    setError(null);
    
    try {
      // Build DELETE query with WHERE clause based on primary keys
      const pkColumns = schema.filter(col => col.pk > 0);
      if (pkColumns.length === 0) {
        throw new Error('Cannot delete row: No primary key found');
      }
      
      const whereClause = pkColumns.map(col => {
        const value = deletingRow[col.name];
        return `"${col.name}" = ${typeof value === 'number' ? value : `'${String(value).replace(/'/g, "''")}'`}`;
      }).join(' AND ');
      
      const query = `DELETE FROM "${tableName}" WHERE ${whereClause}`;
      
      await executeQuery(databaseId, query, [], true);
      
      setShowDeleteDialog(false);
      setDeletingRow(null);
      await loadTableData(); // Reload data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete row');
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenAddColumnDialog = () => {
    setAddColumnValues({
      name: '',
      type: 'TEXT',
      notnull: false,
      defaultValue: ''
    });
    setShowAddColumnDialog(true);
  };

  const handleAddColumn = async () => {
    setAddingColumn(true);
    setError(null);
    
    try {
      // Validate column name
      if (!addColumnValues.name.trim()) {
        throw new Error('Column name is required');
      }
      
      // Check for duplicate column name
      if (schema.some(col => col.name.toLowerCase() === addColumnValues.name.toLowerCase())) {
        throw new Error('Column name already exists');
      }
      
      // Call API to add column
      await api.addColumn(databaseId, tableName, {
        name: addColumnValues.name,
        type: addColumnValues.type,
        notnull: addColumnValues.notnull,
        defaultValue: addColumnValues.defaultValue || undefined
      });
      
      setShowAddColumnDialog(false);
      setAddColumnValues({
        name: '',
        type: 'TEXT',
        notnull: false,
        defaultValue: ''
      });
      await loadTableData(); // Reload data to refresh schema
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add column');
    } finally {
      setAddingColumn(false);
    }
  };

  const handleRenameColumn = async () => {
    if (!renamingColumn) return;
    
    setRenamingColumnInProgress(true);
    setError(null);
    
    try {
      // Validate column name
      if (!renameColumnValue.trim()) {
        throw new Error('Column name is required');
      }
      
      // Check if name is different
      if (renameColumnValue === renamingColumn.name) {
        throw new Error('New name must be different from current name');
      }
      
      // Check for duplicate column name
      if (schema.some(col => col.name.toLowerCase() === renameColumnValue.toLowerCase())) {
        throw new Error('Column name already exists');
      }
      
      // Call API to rename column
      await api.renameColumn(databaseId, tableName, renamingColumn.name, renameColumnValue);
      
      setShowRenameColumnDialog(false);
      setRenamingColumn(null);
      setRenameColumnValue('');
      await loadTableData(); // Reload data to refresh schema
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename column');
    } finally {
      setRenamingColumnInProgress(false);
    }
  };

  const handleModifyColumn = async () => {
    if (!modifyingColumn) return;
    
    setModifyingColumnInProgress(true);
    setError(null);
    
    try {
      // Call API to modify column (will use table recreation)
      await api.modifyColumn(databaseId, tableName, modifyingColumn.name, {
        type: modifyColumnValues.type,
        notnull: modifyColumnValues.notnull,
        defaultValue: modifyColumnValues.defaultValue || undefined
      });
      
      setShowModifyColumnDialog(false);
      setModifyingColumn(null);
      setModifyColumnValues({
        type: 'TEXT',
        notnull: false,
        defaultValue: ''
      });
      await loadTableData(); // Reload data to refresh schema
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to modify column');
    } finally {
      setModifyingColumnInProgress(false);
    }
  };

  const handleDeleteColumn = async () => {
    if (!deletingColumn) return;
    
    setDeletingColumnInProgress(true);
    setError(null);
    
    try {
      // Call API to delete column
      await api.deleteColumn(databaseId, tableName, deletingColumn.name);
      
      setShowDeleteColumnDialog(false);
      setDeletingColumn(null);
      await loadTableData(); // Reload data to refresh schema
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete column');
    } finally {
      setDeletingColumnInProgress(false);
    }
  };

  const handleExportCSV = () => {
    if (data.length === 0) {
      alert('No data to export');
      return;
    }

    try {
      // Get column names from schema
      const columns = schema.map(col => col.name);
      
      // Create CSV content
      const csvRows = [];
      
      // Add headers
      csvRows.push(columns.map(col => `"${col}"`).join(','));
      
      // Add data rows
      for (const row of data) {
        const values = columns.map(col => {
          const cell = row[col];
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
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.href = url;
      link.download = `${tableName}_${Date.now()}.csv`;
      
      document.body.appendChild(link);
      link.click();
      
      // Clean up after a small delay
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      console.error('[TableView] Export CSV failed:', err);
      alert('Failed to export CSV: ' + (err instanceof Error ? err.message : 'Unknown error'));
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
            <h2 className="text-3xl font-semibold">{tableName}</h2>
            <p className="text-sm text-muted-foreground">
              {databaseName} • {data.length} {data.length === 1 ? 'row' : 'rows'}
              {getActiveFilterCount(filters) > 0 && ' (filtered)'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadTableData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button 
            variant={showFilters ? "default" : "outline"} 
            onClick={() => setShowFilters(!showFilters)}
            className="relative"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {getActiveFilterCount(filters) > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                {getActiveFilterCount(filters)}
              </span>
            )}
          </Button>
          <Button variant="outline" onClick={handleExportCSV} disabled={data.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button onClick={handleOpenInsertDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Insert Row
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      {!loading && showFilters && schema.length > 0 && (
        <FilterBar
          columns={schema}
          filters={filters}
          onFiltersChange={handleFiltersChange}
        />
      )}

      {/* Schema Info */}
      {!loading && schema.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Schema</h3>
              <Button variant="outline" size="sm" onClick={handleOpenAddColumnDialog}>
                <Columns className="h-4 w-4 mr-2" />
                Add Column
              </Button>
            </div>
            <div className="space-y-2">
              {/* Column headers */}
              <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wider pb-2 border-b">
                <div className="min-w-[200px]">Column</div>
                <div className="min-w-[100px]">Type</div>
                <div className="min-w-[80px]">Nullable</div>
                <div className="flex-1">Default</div>
                <div className="w-[108px] text-right">Actions</div>
              </div>
              {schema.map((col) => (
                <div key={col.cid} className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2 min-w-[200px]">
                    <span className="font-medium">{col.name}</span>
                    {col.pk > 0 && (
                      <span className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded">
                        PK
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground min-w-[100px]">{col.type || 'ANY'}</div>
                  <div className="text-muted-foreground min-w-[80px]">
                    {col.notnull ? 'NOT NULL' : 'NULL'}
                  </div>
                  {col.dflt_value && (
                    <div className="text-muted-foreground flex-1">
                      Default: {col.dflt_value}
                    </div>
                  )}
                  {!col.dflt_value && <div className="flex-1"></div>}
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7"
                      onClick={() => {
                        setRenamingColumn(col);
                        setRenameColumnValue(col.name);
                        setShowRenameColumnDialog(true);
                      }}
                      title="Rename column"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7"
                      onClick={() => {
                        setModifyingColumn(col);
                        setModifyColumnValues({
                          type: col.type || 'TEXT',
                          notnull: col.notnull === 1,
                          defaultValue: col.dflt_value || ''
                        });
                        setShowModifyColumnDialog(true);
                      }}
                      title="Modify column type/constraints"
                    >
                      <Settings className="h-3.5 w-3.5" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7"
                      onClick={() => {
                        setDeletingColumn(col);
                        setShowDeleteColumnDialog(true);
                      }}
                      disabled={schema.length === 1}
                      title={schema.length === 1 ? "Cannot delete the only column" : "Delete column"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
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

      {/* Data Table */}
      {!loading && !error && (
        <Card>
          <CardContent className="p-0">
            {data.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <p className="text-sm text-muted-foreground mb-4">
                  {getActiveFilterCount(filters) > 0 ? 'No rows match your filters' : 'No rows in this table'}
                </p>
                {getActiveFilterCount(filters) > 0 ? (
                  <Button variant="outline" onClick={() => setFilters({})}>
                    Clear Filters
                  </Button>
                ) : (
                  <Button onClick={handleOpenInsertDialog}>
                    <Plus className="h-4 w-4 mr-2" />
                    Insert First Row
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      {schema.map((col) => (
                        <th
                          key={col.cid}
                          className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                        >
                          {col.name}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.map((row, rowIndex) => (
                      <tr key={rowIndex} className="hover:bg-muted/50">
                        {schema.map((col) => (
                          <td
                            key={`${rowIndex}-${col.cid}`}
                            className="px-4 py-3 text-sm whitespace-nowrap"
                          >
                            <span
                              className={
                                row[col.name] === null
                                  ? 'italic text-muted-foreground'
                                  : ''
                              }
                            >
                              {formatValue(row[col.name])}
                            </span>
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenEditDialog(row)} title="Edit row">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleOpenDeleteDialog(row)} title="Delete row">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {!loading && !error && data.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {(page - 1) * rowsPerPage + 1} to{' '}
            {Math.min(page * rowsPerPage, (page - 1) * rowsPerPage + data.length)} rows
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
            >
              Previous
            </Button>
            <div className="text-sm">Page {page}</div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={data.length < rowsPerPage}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Insert Row Dialog */}
      <Dialog open={showInsertDialog} onOpenChange={setShowInsertDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Insert Row into {tableName}</DialogTitle>
            <DialogDescription>
              Fill in the values for the new row. Leave fields empty for NULL values.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {schema.map((col) => (
              <div key={col.name} className="space-y-2">
                <Label htmlFor={`insert-${col.name}`}>
                  {col.name}
                  {col.pk > 0 && <span className="text-xs text-muted-foreground ml-2">(Primary Key)</span>}
                  {col.notnull && !col.pk ? <span className="text-destructive ml-1">*</span> : null}
                </Label>
                <div className="flex gap-2 items-center">
                  <Input
                    id={`insert-${col.name}`}
                    name={`insert-${col.name}`}
                    placeholder={col.dflt_value || (col.pk > 0 && col.type && col.type.toUpperCase().includes('INTEGER') ? 'Auto-increment (optional)' : 'NULL')}
                    value={insertValues[col.name] || ''}
                    onChange={(e) => setInsertValues({...insertValues, [col.name]: e.target.value})}
                  />
                  <span className="text-xs text-muted-foreground min-w-[60px]">
                    {col.type || 'ANY'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInsertDialog(false)} disabled={inserting}>
              Cancel
            </Button>
            <Button onClick={handleInsertRow} disabled={inserting}>
              {inserting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Inserting...
                </>
              ) : (
                'Insert Row'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Row Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Row in {tableName}</DialogTitle>
            <DialogDescription>
              Modify the values for this row. Leave fields empty for NULL values.
            </DialogDescription>
          </DialogHeader>
          {schema.some(col => col.pk > 0) && (
            <div className="flex items-start space-x-3 rounded-md border border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/30 p-4">
              <Checkbox
                id="allow-edit-pk"
                checked={allowEditPrimaryKey}
                onCheckedChange={(checked) => setAllowEditPrimaryKey(checked === true)}
              />
              <div className="space-y-1 leading-none">
                <Label
                  htmlFor="allow-edit-pk"
                  className="text-sm font-medium cursor-pointer"
                >
                  ⚠️ Allow editing primary key (advanced)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Changing primary keys can break relationships and cause data integrity issues. Only enable this if you know what you're doing.
                </p>
              </div>
            </div>
          )}
          <div className="grid gap-4 py-4">
            {schema.map((col) => (
              <div key={col.name} className="space-y-2">
                <Label htmlFor={`edit-${col.name}`}>
                  {col.name}
                  {col.pk > 0 && <span className="text-xs text-muted-foreground ml-2">(Primary Key)</span>}
                  {col.notnull && !col.pk ? <span className="text-destructive ml-1">*</span> : null}
                </Label>
                <div className="flex gap-2 items-center">
                  <Input
                    id={`edit-${col.name}`}
                    name={`edit-${col.name}`}
                    placeholder="NULL"
                    value={editValues[col.name] || ''}
                    onChange={(e) => setEditValues({...editValues, [col.name]: e.target.value})}
                    disabled={col.pk > 0 && !allowEditPrimaryKey} // Disable primary keys unless checkbox is checked
                  />
                  <span className="text-xs text-muted-foreground min-w-[60px]">
                    {col.type || 'ANY'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)} disabled={updating}>
              Cancel
            </Button>
            <Button onClick={handleUpdateRow} disabled={updating}>
              {updating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Row'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Row Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Row</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this row? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deletingRow && (
            <div className="py-4">
              <p className="text-sm font-medium mb-2">Row details:</p>
              <div className="bg-muted p-3 rounded-md space-y-1">
                {schema.filter(col => col.pk > 0).map((col) => (
                  <div key={col.name} className="text-sm">
                    <span className="font-medium">{col.name}:</span>{' '}
                    <span className="text-muted-foreground">{String(deletingRow[col.name])}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteRow} disabled={deleting}>
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Row'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Column Dialog */}
      <Dialog open={showAddColumnDialog} onOpenChange={setShowAddColumnDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Column to {tableName}</DialogTitle>
            <DialogDescription>
              Add a new column to the table. The column will be added with NULL values for existing rows unless you specify a default value.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="add-column-name">
                Column Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="add-column-name"
                placeholder="e.g., email, created_at"
                value={addColumnValues.name}
                onChange={(e) => setAddColumnValues({...addColumnValues, name: e.target.value})}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="add-column-type">Column Type</Label>
              <Select
                value={addColumnValues.type}
                onValueChange={(value) => setAddColumnValues({...addColumnValues, type: value})}
              >
                <SelectTrigger id="add-column-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEXT">TEXT</SelectItem>
                  <SelectItem value="INTEGER">INTEGER</SelectItem>
                  <SelectItem value="REAL">REAL</SelectItem>
                  <SelectItem value="BLOB">BLOB</SelectItem>
                  <SelectItem value="NUMERIC">NUMERIC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="add-column-default">Default Value (optional)</Label>
              <Input
                id="add-column-default"
                placeholder="e.g., 0, 'unknown', CURRENT_TIMESTAMP"
                value={addColumnValues.defaultValue}
                onChange={(e) => setAddColumnValues({...addColumnValues, defaultValue: e.target.value})}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty for NULL. Use quotes for text values.
              </p>
            </div>
            
            <div className="flex items-start space-x-3">
              <Checkbox
                id="add-column-notnull"
                checked={addColumnValues.notnull}
                onCheckedChange={(checked) => setAddColumnValues({...addColumnValues, notnull: checked === true})}
              />
              <div className="space-y-1 leading-none">
                <Label htmlFor="add-column-notnull" className="text-sm font-medium cursor-pointer">
                  NOT NULL constraint
                </Label>
                <p className="text-xs text-muted-foreground">
                  Requires a default value if table has existing rows
                </p>
              </div>
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddColumnDialog(false)} disabled={addingColumn}>
              Cancel
            </Button>
            <Button onClick={handleAddColumn} disabled={addingColumn}>
              {addingColumn ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Column'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Column Dialog */}
      <Dialog open={showRenameColumnDialog} onOpenChange={setShowRenameColumnDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Column</DialogTitle>
            <DialogDescription>
              Rename the column "{renamingColumn?.name}" to a new name.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rename-column-name">
                New Column Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="rename-column-name"
                placeholder="Enter new column name"
                value={renameColumnValue}
                onChange={(e) => setRenameColumnValue(e.target.value)}
              />
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameColumnDialog(false)} disabled={renamingColumnInProgress}>
              Cancel
            </Button>
            <Button onClick={handleRenameColumn} disabled={renamingColumnInProgress}>
              {renamingColumnInProgress ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Renaming...
                </>
              ) : (
                'Rename Column'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modify Column Dialog */}
      <Dialog open={showModifyColumnDialog} onOpenChange={setShowModifyColumnDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modify Column "{modifyingColumn?.name}"</DialogTitle>
            <DialogDescription>
              Change the column type or constraints. This operation requires recreating the table.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/30 p-4 mb-4">
            <p className="text-sm font-medium mb-2">⚠️ Important: Table Recreation Required</p>
            <p className="text-sm text-muted-foreground mb-2">
              SQLite does not support modifying column types or constraints directly. This operation will:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Create a temporary table with the new column definition</li>
              <li>Copy all data with appropriate type conversions</li>
              <li>Drop the original table</li>
              <li>Rename the temporary table</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-2 font-medium">
              It's strongly recommended to backup your database before proceeding.
            </p>
          </div>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="modify-column-type">Column Type</Label>
              <Select
                value={modifyColumnValues.type}
                onValueChange={(value) => setModifyColumnValues({...modifyColumnValues, type: value})}
              >
                <SelectTrigger id="modify-column-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEXT">TEXT</SelectItem>
                  <SelectItem value="INTEGER">INTEGER</SelectItem>
                  <SelectItem value="REAL">REAL</SelectItem>
                  <SelectItem value="BLOB">BLOB</SelectItem>
                  <SelectItem value="NUMERIC">NUMERIC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="modify-column-default">Default Value (optional)</Label>
              <Input
                id="modify-column-default"
                placeholder="e.g., 0, 'unknown', CURRENT_TIMESTAMP"
                value={modifyColumnValues.defaultValue}
                onChange={(e) => setModifyColumnValues({...modifyColumnValues, defaultValue: e.target.value})}
              />
            </div>
            
            <div className="flex items-start space-x-3">
              <Checkbox
                id="modify-column-notnull"
                checked={modifyColumnValues.notnull}
                onCheckedChange={(checked) => setModifyColumnValues({...modifyColumnValues, notnull: checked === true})}
              />
              <div className="space-y-1 leading-none">
                <Label htmlFor="modify-column-notnull" className="text-sm font-medium cursor-pointer">
                  NOT NULL constraint
                </Label>
                <p className="text-xs text-muted-foreground">
                  If enabled, all existing NULL values will be replaced with the default value
                </p>
              </div>
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModifyColumnDialog(false)} disabled={modifyingColumnInProgress}>
              Cancel
            </Button>
            <Button onClick={handleModifyColumn} disabled={modifyingColumnInProgress}>
              {modifyingColumnInProgress ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Modifying...
                </>
              ) : (
                'Modify Column'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Column Dialog */}
      <Dialog open={showDeleteColumnDialog} onOpenChange={setShowDeleteColumnDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Column</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the column "{deletingColumn?.name}"? This action cannot be undone and all data in this column will be permanently lost.
            </DialogDescription>
          </DialogHeader>
          {deletingColumn && (
            <div className="py-4">
              <div className="rounded-md border border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/30 p-4">
                <p className="text-sm font-medium mb-2">⚠️ Warning</p>
                <p className="text-sm text-muted-foreground">
                  This will permanently delete all data in the "{deletingColumn.name}" column. Make sure you have a backup before proceeding.
                </p>
              </div>
            </div>
          )}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteColumnDialog(false)} disabled={deletingColumnInProgress}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteColumn} disabled={deletingColumnInProgress}>
              {deletingColumnInProgress ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Column'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

