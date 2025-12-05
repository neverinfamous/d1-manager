import { useState, useCallback } from 'react';
import { Upload, Loader2, FileText, Table, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { executeQuery, listTables, getTableSchema } from '@/services/api';

interface ImportTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  databaseId: string;
  tableName: string | undefined; // If provided, import into existing table
  existingTables: string[];
  onSuccess: () => void;
}

type ImportFormat = 'sql' | 'csv' | 'json';
type ImportSource = 'file' | 'paste';

interface ImportPreview {
  columns: string[];
  rowCount: number;
  sampleRows: Record<string, unknown>[];
}

export function ImportTableDialog({
  open,
  onOpenChange,
  databaseId,
  tableName,
  existingTables,
  onSuccess
}: ImportTableDialogProps): React.JSX.Element {
  const [source, setSource] = useState<ImportSource>('file');
  const [format, setFormat] = useState<ImportFormat>('csv');
  const [file, setFile] = useState<File | null>(null);
  const [pastedContent, setPastedContent] = useState('');
  const [targetTable, setTargetTable] = useState(tableName ?? '');
  const [createNewTable, setCreateNewTable] = useState(!tableName);
  const [newTableName, setNewTableName] = useState('');
  const [csvHasHeader, setCsvHasHeader] = useState(true);
  const [duplicateHandling, setDuplicateHandling] = useState<'fail' | 'replace' | 'ignore'>('fail');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [columnMismatch, setColumnMismatch] = useState<{
    missingColumns: string[];
    tableColumns: string[];
    importColumns: string[];
  } | null>(null);

  const resetState = useCallback((): void => {
    setSource('file');
    setFormat('csv');
    setFile(null);
    setPastedContent('');
    setTargetTable(tableName ?? '');
    setCreateNewTable(!tableName);
    setNewTableName('');
    setCsvHasHeader(true);
    setDuplicateHandling('fail');
    setImporting(false);
    setError(null);
    setPreview(null);
    setImportProgress(null);
    setColumnMismatch(null);
  }, [tableName]);

  const handleOpenChange = (newOpen: boolean): void => {
    if (!importing) {
      if (!newOpen) {
        resetState();
      }
      onOpenChange(newOpen);
    }
  };

  const parseCSV = (content: string, hasHeader: boolean): { columns: string[]; rows: Record<string, unknown>[] } => {
    const lines = content.trim().split('\n').map(line => {
      // Handle quoted values with commas
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    });

    if (lines.length === 0) {
      return { columns: [], rows: [] };
    }

    let columns: string[];
    let dataLines: string[][];

    if (hasHeader) {
      columns = lines[0] ?? [];
      dataLines = lines.slice(1);
    } else {
      // Generate column names
      const firstLine = lines[0];
      columns = firstLine ? firstLine.map((_, i) => `column_${i + 1}`) : [];
      dataLines = lines;
    }

    const rows = dataLines.map(values => {
      const row: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        const value = values[i];
        // Try to parse numbers
        if (value !== undefined && value !== '') {
          const num = Number(value);
          row[col] = isNaN(num) ? value : num;
        } else {
          row[col] = null;
        }
      });
      return row;
    });

    return { columns, rows };
  };

  const parseJSON = (content: string): { columns: string[]; rows: Record<string, unknown>[] } => {
    const data = JSON.parse(content) as unknown;
    
    let rows: Record<string, unknown>[];
    if (Array.isArray(data)) {
      rows = data as Record<string, unknown>[];
    } else if (typeof data === 'object' && data !== null) {
      // Single object, wrap in array
      rows = [data as Record<string, unknown>];
    } else {
      throw new Error('JSON must be an array of objects or a single object');
    }

    if (rows.length === 0) {
      return { columns: [], rows: [] };
    }

    // Get all unique columns from all rows
    const columnSet = new Set<string>();
    rows.forEach(row => {
      Object.keys(row).forEach(key => columnSet.add(key));
    });
    const columns = Array.from(columnSet);

    return { columns, rows };
  };

  const generatePreview = async (): Promise<void> => {
    setError(null);
    
    let content: string;
    if (source === 'file' && file) {
      content = await file.text();
    } else {
      content = pastedContent;
    }

    if (!content.trim()) {
      setError('No content to preview');
      return;
    }

    try {
      let columns: string[];
      let rows: Record<string, unknown>[];

      if (format === 'csv') {
        const parsed = parseCSV(content, csvHasHeader);
        columns = parsed.columns;
        rows = parsed.rows;
      } else if (format === 'json') {
        const parsed = parseJSON(content);
        columns = parsed.columns;
        rows = parsed.rows;
      } else {
        // SQL - can't preview easily, just show info
        const insertCount = (content.match(/INSERT\s+INTO/gi) ?? []).length;
        setPreview({
          columns: ['SQL Statements'],
          rowCount: insertCount,
          sampleRows: []
        });
        return;
      }

      setPreview({
        columns,
        rowCount: rows.length,
        sampleRows: rows.slice(0, 3)
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse content');
    }
  };

  const handleAddColumnsAndImport = async (): Promise<void> => {
    if (!columnMismatch) return;
    
    setImporting(true);
    setError(null);
    setColumnMismatch(null);
    
    try {
      const finalTableName = createNewTable ? newTableName.trim() : targetTable;
      
      // Get content for type inference
      let content: string;
      if (source === 'file' && file) {
        content = await file.text();
      } else {
        content = pastedContent;
      }
      
      // Parse data to infer column types
      let rows: Record<string, unknown>[];
      if (format === 'csv') {
        const parsed = parseCSV(content, csvHasHeader);
        rows = parsed.rows;
      } else {
        const parsed = parseJSON(content);
        rows = parsed.rows;
      }
      
      // Add each missing column
      for (const colName of columnMismatch.missingColumns) {
        // Infer type from data
        let hasNumber = false;
        let hasString = false;
        
        for (const row of rows.slice(0, 10)) {
          const val = row[colName];
          if (val !== null && val !== undefined) {
            if (typeof val === 'number') hasNumber = true;
            else hasString = true;
          }
        }
        
        const colType = hasString ? 'TEXT' : (hasNumber ? 'REAL' : 'TEXT');
        
        // Add column using ALTER TABLE
        await executeQuery(
          databaseId, 
          `ALTER TABLE "${finalTableName}" ADD COLUMN "${colName}" ${colType}`, 
          undefined, 
          true
        );
      }
      
      // Now continue with the import - call handleImport which will now succeed
      setImporting(false);
      await handleImport();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add columns');
      setImporting(false);
    }
  };

  const handleImport = async (): Promise<void> => {
    setImporting(true);
    setError(null);
    setImportProgress(null);

    try {
      let content: string;
      if (source === 'file' && file) {
        content = await file.text();
      } else {
        content = pastedContent;
      }

      if (!content.trim()) {
        throw new Error('No content to import');
      }

      const finalTableName = createNewTable ? newTableName.trim() : targetTable;
      if (!finalTableName) {
        throw new Error('Table name is required');
      }

      // Fetch fresh table list to ensure we have current state
      const currentTables = await listTables(databaseId);
      const tableExists = currentTables.some(t => t.name.toLowerCase() === finalTableName.toLowerCase());

      // Validate table name for new tables
      if (createNewTable && tableExists) {
        throw new Error(`Table "${finalTableName}" already exists. Please choose a different name or uncheck "Create new table" to import into the existing table.`);
      }

      // Validate existing table exists when not creating new
      if (!createNewTable && format !== 'sql' && !tableExists) {
        throw new Error(`Table "${finalTableName}" does not exist. Check "Create new table" to create it first.`);
      }

      // For existing tables (non-SQL imports), validate columns match
      if (!createNewTable && format !== 'sql' && tableExists) {
        // Get actual table columns
        const tableColumns = await getTableSchema(databaseId, finalTableName);
        const actualColumns = tableColumns.map(c => c.name.toLowerCase());
        
        // Parse import data to get columns
        let importColumns: string[];
        if (format === 'csv') {
          const parsed = parseCSV(content, csvHasHeader);
          importColumns = parsed.columns;
        } else {
          const parsed = parseJSON(content);
          importColumns = parsed.columns;
        }
        
        // Check for missing columns
        const missingColumns = importColumns.filter(
          col => !actualColumns.includes(col.toLowerCase())
        );
        
        if (missingColumns.length > 0) {
          // Show column mismatch dialog instead of throwing error
          setColumnMismatch({
            missingColumns,
            tableColumns: tableColumns.map(c => c.name),
            importColumns
          });
          setImporting(false);
          return;
        }
      }

      if (format === 'sql') {
        // Execute SQL directly
        const statements = content
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0);
        
        setImportProgress({ current: 0, total: statements.length });
        
        for (let i = 0; i < statements.length; i++) {
          const stmt = statements[i];
          if (stmt) {
            await executeQuery(databaseId, stmt + ';', undefined, true);
            setImportProgress({ current: i + 1, total: statements.length });
          }
        }
      } else {
        // CSV or JSON
        let columns: string[];
        let rows: Record<string, unknown>[];

        if (format === 'csv') {
          const parsed = parseCSV(content, csvHasHeader);
          columns = parsed.columns;
          rows = parsed.rows;
        } else {
          const parsed = parseJSON(content);
          columns = parsed.columns;
          rows = parsed.rows;
        }

        if (columns.length === 0) {
          throw new Error('No columns found in data');
        }

        // Create table if needed
        if (createNewTable) {
          // Infer column types from data
          const columnDefs = columns.map(col => {
            // Check first few non-null values to infer type
            let hasNumber = false;
            let hasString = false;
            
            for (const row of rows.slice(0, 10)) {
              const val = row[col];
              if (val !== null && val !== undefined) {
                if (typeof val === 'number') hasNumber = true;
                else hasString = true;
              }
            }
            
            const type = hasString ? 'TEXT' : (hasNumber ? 'REAL' : 'TEXT');
            return `"${col}" ${type}`;
          });

          // We already validated the table doesn't exist, so CREATE TABLE will succeed
          const createTableSQL = `CREATE TABLE "${finalTableName}" (${columnDefs.join(', ')})`;
          await executeQuery(databaseId, createTableSQL, undefined, true);
        }

        // Insert data in batches
        setImportProgress({ current: 0, total: rows.length });
        const batchSize = 50;
        
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          
          for (const row of batch) {
            const values = columns.map(col => {
              const val = row[col];
              if (val === null || val === undefined) return 'NULL';
              if (typeof val === 'number') return String(val);
              if (typeof val === 'boolean') return val ? '1' : '0';
              const strVal = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val as string | number);
              return `'${strVal.replace(/'/g, "''")}'`;
            });

            const insertKeyword = duplicateHandling === 'replace' 
              ? 'INSERT OR REPLACE' 
              : duplicateHandling === 'ignore' 
                ? 'INSERT OR IGNORE' 
                : 'INSERT';
            const insertSQL = `${insertKeyword} INTO "${finalTableName}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${values.join(', ')})`;
            await executeQuery(databaseId, insertSQL, undefined, true);
          }
          
          setImportProgress({ current: Math.min(i + batchSize, rows.length), total: rows.length });
        }
      }

      onSuccess();
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const hasContent = (source === 'file' && file !== null) || (source === 'paste' && pastedContent.trim() !== '');
  const hasValidTarget = createNewTable ? newTableName.trim() !== '' : targetTable !== '';
  const canImport = hasContent && hasValidTarget && !importing;

  const getAcceptedFormats = (): string => {
    switch (format) {
      case 'csv': return '.csv,.txt';
      case 'json': return '.json';
      case 'sql': return '.sql';
      default: return '*';
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Table Data
          </DialogTitle>
          <DialogDescription>
            {tableName 
              ? `Import data into "${tableName}"` 
              : 'Import data from CSV, JSON, or SQL files'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Format Selection */}
          <fieldset className="grid gap-3">
            <legend className="text-sm font-medium leading-none mb-2">Data Format</legend>
            <RadioGroup value={format} onValueChange={(v) => { setFormat(v as ImportFormat); setPreview(null); }}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="csv" id="format-csv" />
                <Label htmlFor="format-csv" className="font-normal">CSV (Comma-separated values)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="json" id="format-json" />
                <Label htmlFor="format-json" className="font-normal">JSON (Array of objects)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="sql" id="format-sql" />
                <Label htmlFor="format-sql" className="font-normal">SQL (INSERT statements)</Label>
              </div>
            </RadioGroup>
          </fieldset>

          {/* CSV Header Option */}
          {format === 'csv' && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="csv-header"
                checked={csvHasHeader}
                onCheckedChange={(checked) => { setCsvHasHeader(checked === true); setPreview(null); }}
              />
              <Label htmlFor="csv-header" className="font-normal">First row contains column headers</Label>
            </div>
          )}

          {/* Duplicate Handling - only for existing tables */}
          {!createNewTable && format !== 'sql' && (
            <fieldset className="grid gap-3">
              <legend className="text-sm font-medium leading-none mb-2">If Duplicate Keys Exist</legend>
              <RadioGroup value={duplicateHandling} onValueChange={(v) => setDuplicateHandling(v as 'fail' | 'replace' | 'ignore')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="fail" id="dup-fail" />
                  <Label htmlFor="dup-fail" className="font-normal">Fail (stop on first duplicate)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="replace" id="dup-replace" />
                  <Label htmlFor="dup-replace" className="font-normal">Replace (update existing rows)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="ignore" id="dup-ignore" />
                  <Label htmlFor="dup-ignore" className="font-normal">Skip (ignore duplicate rows)</Label>
                </div>
              </RadioGroup>
            </fieldset>
          )}

          {/* Source Selection */}
          <fieldset className="grid gap-3">
            <legend className="text-sm font-medium leading-none mb-2">Data Source</legend>
            <RadioGroup value={source} onValueChange={(v) => { setSource(v as ImportSource); setPreview(null); }}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="file" id="source-file" />
                <Label htmlFor="source-file" className="font-normal">Upload file</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="paste" id="source-paste" />
                <Label htmlFor="source-paste" className="font-normal">Paste content</Label>
              </div>
            </RadioGroup>
          </fieldset>

          {/* File Input */}
          {source === 'file' && (
            <div className="grid gap-2">
              <Label htmlFor="import-file">File</Label>
              <Input
                id="import-file"
                type="file"
                accept={getAcceptedFormats()}
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }}
                disabled={importing}
                className="file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer cursor-pointer"
              />
            </div>
          )}

          {/* Paste Input */}
          {source === 'paste' && (
            <div className="grid gap-2">
              <Label htmlFor="import-content">Content</Label>
              <textarea
                id="import-content"
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                placeholder={format === 'csv' 
                  ? 'name,age,email\nJohn,30,john@example.com' 
                  : format === 'json' 
                    ? '[{"name": "John", "age": 30}]'
                    : 'INSERT INTO table_name VALUES (...)'}
                value={pastedContent}
                onChange={(e) => { setPastedContent(e.target.value); setPreview(null); }}
                disabled={importing}
              />
            </div>
          )}

          {/* Target Table */}
          {!tableName && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="create-new"
                  checked={createNewTable}
                  onCheckedChange={(checked) => setCreateNewTable(checked === true)}
                  disabled={format === 'sql'}
                />
                <Label htmlFor="create-new" className="font-normal">
                  {format === 'sql' ? 'Table creation handled by SQL' : 'Create new table'}
                </Label>
              </div>

              {createNewTable && format !== 'sql' && (
                <div className="grid gap-2">
                  <Label htmlFor="new-table-name">New Table Name</Label>
                  <Input
                    id="new-table-name"
                    placeholder="my_table"
                    value={newTableName}
                    onChange={(e) => setNewTableName(e.target.value)}
                    disabled={importing}
                  />
                </div>
              )}

              {!createNewTable && format !== 'sql' && (
                <div className="grid gap-2">
                  <Label htmlFor="target-table">Target Table</Label>
                  <select
                    id="target-table"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={targetTable}
                    onChange={(e) => setTargetTable(e.target.value)}
                    disabled={importing}
                  >
                    <option value="">Select a table...</option>
                    {existingTables.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Column names in your data must match the existing table columns exactly.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Preview Button */}
          {hasContent && format !== 'sql' && (
            <Button
              variant="outline"
              onClick={() => void generatePreview()}
              disabled={importing}
              className="w-full"
            >
              <FileText className="h-4 w-4 mr-2" />
              Preview Data
            </Button>
          )}

          {/* Preview */}
          {preview && (
            <div className="border rounded-lg p-3 bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <Table className="h-4 w-4" />
                <span className="text-sm font-medium">Preview</span>
              </div>
              <div className="text-sm text-muted-foreground mb-2">
                {preview.columns.length} columns, {preview.rowCount} rows
              </div>
              {preview.columns.length > 0 && format !== 'sql' && (
                <div className="text-xs font-mono bg-background p-2 rounded overflow-x-auto">
                  <div className="font-semibold mb-1">{preview.columns.join(', ')}</div>
                  {preview.sampleRows.map((row, i) => (
                    <div key={i} className="text-muted-foreground">
                      {preview.columns.map(col => {
                        const val = row[col];
                        if (val === null || val === undefined) return 'NULL';
                        if (typeof val === 'object') return JSON.stringify(val);
                        return String(val as string | number | boolean);
                      }).join(', ')}
                    </div>
                  ))}
                  {preview.rowCount > 3 && (
                    <div className="text-muted-foreground">... and {preview.rowCount - 3} more rows</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Progress */}
          {importProgress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Importing...</span>
                <span>{importProgress.current} / {importProgress.total}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Column Mismatch */}
          {columnMismatch && (
            <div className="space-y-3 p-4 border border-amber-500/50 bg-amber-500/10 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="space-y-2">
                  <p className="text-sm font-medium">Column Mismatch Detected</p>
                  <p className="text-sm text-muted-foreground">
                    The table is missing {columnMismatch.missingColumns.length} column{columnMismatch.missingColumns.length !== 1 ? 's' : ''} from your import data:
                  </p>
                  <div className="text-xs font-mono bg-background p-2 rounded">
                    <p><strong>Missing:</strong> {columnMismatch.missingColumns.join(', ')}</p>
                    <p className="mt-1 text-muted-foreground"><strong>Table has:</strong> {columnMismatch.tableColumns.join(', ')}</p>
                    <p className="text-muted-foreground"><strong>Import has:</strong> {columnMismatch.importColumns.join(', ')}</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setColumnMismatch(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleAddColumnsAndImport()}
                  disabled={importing}
                >
                  {importing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Adding columns...
                    </>
                  ) : (
                    <>Add Columns &amp; Import</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={importing}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleImport()}
            disabled={!canImport}
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Import
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

