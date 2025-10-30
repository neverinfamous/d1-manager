import { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, Download, Trash2, Edit, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { getTableSchema, getTableData, executeQuery, type ColumnInfo } from '@/services/api';

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

  useEffect(() => {
    loadTableData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseId, tableName, page]);

  const loadTableData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Load schema and data in parallel
      const [schemaResult, dataResult] = await Promise.all([
        getTableSchema(databaseId, tableName),
        getTableData(databaseId, tableName, rowsPerPage, (page - 1) * rowsPerPage)
      ]);
      
      setSchema(schemaResult);
      setData(dataResult.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load table data');
    } finally {
      setLoading(false);
    }
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
      const columns = schema.filter(col => col.pk === 0 || insertValues[col.name]); // Skip auto-increment PKs if empty
      const columnNames = columns.map(col => col.name);
      const values = columns.map(col => {
        const value = insertValues[col.name];
        if (value === '' || value === null) return 'NULL';
        // Try to determine if it's a number
        if (!isNaN(Number(value)) && value.trim() !== '') return value;
        // Otherwise treat as string
        return `'${value.replace(/'/g, "''")}'`; // Escape single quotes
      });
      
      const query = `INSERT INTO "${tableName}" (${columnNames.map(n => `"${n}"`).join(', ')}) VALUES (${values.join(', ')})`;
      
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
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadTableData}>
            <RefreshCw className="h-4 w-4" />
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

      {/* Schema Info */}
      {!loading && schema.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold mb-4">Schema</h3>
            <div className="space-y-2">
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
                  <div className="text-muted-foreground">
                    {col.notnull ? 'NOT NULL' : 'NULL'}
                  </div>
                  {col.dflt_value && (
                    <div className="text-muted-foreground">
                      Default: {col.dflt_value}
                    </div>
                  )}
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
                <p className="text-sm text-muted-foreground mb-4">No rows in this table</p>
                <Button onClick={handleOpenInsertDialog}>
                  <Plus className="h-4 w-4 mr-2" />
                  Insert First Row
                </Button>
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
                            <Button variant="ghost" size="icon">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon">
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
                    placeholder={col.dflt_value || (col.pk > 0 ? 'Auto-increment' : 'NULL')}
                    value={insertValues[col.name] || ''}
                    onChange={(e) => setInsertValues({...insertValues, [col.name]: e.target.value})}
                    disabled={col.pk > 0 && col.type.includes('INTEGER')} // Disable auto-increment PKs
                  />
                  <span className="text-xs text-muted-foreground min-w-[60px]">
                    {col.type}
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
    </div>
  );
}

