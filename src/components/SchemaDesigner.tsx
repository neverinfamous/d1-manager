import { useState } from 'react';
import { Plus, Trash2, Key, Lock, Sparkles, Link, Shield, Info } from 'lucide-react';
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
import { Card, CardContent } from '@/components/ui/card';
import { validateIdentifier, validateGeneratedExpression } from '@/lib/sqlValidator';
import { ErrorMessage } from '@/components/ui/error-message';

interface Column {
  id: string;
  name: string;
  type: string;
  primaryKey: boolean;
  notNull: boolean;
  unique: boolean;
  defaultValue: string;
  isGenerated: boolean;
  generatedExpression: string;
  generatedType: 'STORED' | 'VIRTUAL';
}

interface SchemaDesignerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateTable: (tableName: string, columns: Column[], strictMode?: boolean) => Promise<void>;
}

// Standard SQLite column types
const COLUMN_TYPES = [
  'TEXT',
  'INTEGER',
  'REAL',
  'BLOB',
  'NUMERIC',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'JSON'
];

// STRICT mode only allows these types
const STRICT_COLUMN_TYPES = [
  'INTEGER',
  'INT',
  'REAL',
  'TEXT',
  'BLOB',
  'ANY'
];

export function SchemaDesigner({ open, onOpenChange, onCreateTable }: SchemaDesignerProps): React.JSX.Element {
  const [tableName, setTableName] = useState('');
  const [columns, setColumns] = useState<Column[]>([
    { id: '1', name: 'id', type: 'INTEGER', primaryKey: true, notNull: true, unique: false, defaultValue: '', isGenerated: false, generatedExpression: '', generatedType: 'STORED' }
  ]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [strictMode, setStrictMode] = useState(false);

  const addColumn = (): void => {
    const newId = String(Date.now());
    setColumns([
      ...columns,
      { id: newId, name: '', type: 'TEXT', primaryKey: false, notNull: false, unique: false, defaultValue: '', isGenerated: false, generatedExpression: '', generatedType: 'STORED' }
    ]);
  };

  const removeColumn = (id: string): void => {
    if (columns.length <= 1) {
      setError('Table must have at least one column');
      return;
    }
    setColumns(columns.filter(col => col.id !== id));
    setError('');
  };

  const updateColumn = (id: string, field: keyof Column, value: string | boolean): void => {
    setColumns(columns.map(col => 
      col.id === id ? { ...col, [field]: value } : col
    ));
    setError('');
  };
  
  // Batch update multiple column fields at once
  const updateColumnBatch = (id: string, updates: Partial<Column>): void => {
    setColumns(columns.map(col => 
      col.id === id ? { ...col, ...updates } : col
    ));
    setError('');
  };

  const validateAndCreate = async (): Promise<void> => {
    setError('');

    // Validate table name using comprehensive validator
    const tableNameValidation = validateIdentifier(tableName, 'table');
    if (!tableNameValidation.isValid) {
      const errorMsg = tableNameValidation.suggestion 
        ? `${tableNameValidation.error}. ${tableNameValidation.suggestion}`
        : tableNameValidation.error ?? 'Invalid table name';
      setError(errorMsg);
      return;
    }

    // Validate columns
    for (const col of columns) {
      // Validate column name
      const colNameValidation = validateIdentifier(col.name, 'column');
      if (!colNameValidation.isValid) {
        const errorMsg = colNameValidation.suggestion 
          ? `Column "${col.name}": ${colNameValidation.error}. ${colNameValidation.suggestion}`
          : colNameValidation.error ?? 'Invalid column name';
        setError(errorMsg);
        return;
      }
      
      // Validate generated columns
      if (col.isGenerated) {
        const exprValidation = validateGeneratedExpression(col.generatedExpression);
        if (!exprValidation.isValid) {
          setError(`Column "${col.name}": ${exprValidation.error ?? 'Invalid expression'}`);
          return;
        }
      }
      
      // Generated columns cannot be primary keys
      if (col.isGenerated && col.primaryKey) {
        setError(`Generated column "${col.name}" cannot be a primary key. Generated columns are computed values.`);
        return;
      }
      
      // STRICT mode validation
      if (strictMode) {
        // Generated columns not allowed in STRICT mode (would be complex to recreate)
        if (col.isGenerated) {
          setError(`STRICT mode tables cannot have generated columns. Disable STRICT mode or remove the generated column "${col.name}".`);
          return;
        }
        
        // Validate column type is STRICT-compatible
        if (!STRICT_COLUMN_TYPES.includes(col.type)) {
          setError(`Column "${col.name}" has type "${col.type}" which is not valid for STRICT mode. Use one of: ${STRICT_COLUMN_TYPES.join(', ')}.`);
          return;
        }
      }
    }

    // Check for duplicate column names
    const columnNames = columns.map(c => c.name.toLowerCase());
    const duplicates = columnNames.filter((name, index) => columnNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
      setError(`Duplicate column name: "${duplicates[0] ?? ''}". Each column must have a unique name.`);
      return;
    }

    // Check for at least one primary key
    const hasPrimaryKey = columns.some(col => col.primaryKey);
    if (!hasPrimaryKey) {
      setError('Table must have at least one primary key column. Select a column to be the primary key.');
      return;
    }

    try {
      setCreating(true);
      await onCreateTable(tableName, columns, strictMode);
      
      // Reset form
      setTableName('');
      setStrictMode(false);
      setColumns([
        { id: '1', name: 'id', type: 'INTEGER', primaryKey: true, notNull: true, unique: false, defaultValue: '', isGenerated: false, generatedExpression: '', generatedType: 'STORED' }
      ]);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create table');
    } finally {
      setCreating(false);
    }
  };

  const generateSQL = (): string => {
    // Quote identifiers for reserved keyword safety
    const columnDefs = columns.map(col => {
      let def = `  "${col.name}" ${col.type}`;
      if (col.primaryKey) def += ' PRIMARY KEY';
      if (col.notNull && !col.primaryKey) def += ' NOT NULL';
      if (col.unique && !col.primaryKey) def += ' UNIQUE';
      if (col.isGenerated) {
        def += ` GENERATED ALWAYS AS (${col.generatedExpression}) ${col.generatedType}`;
      } else if (col.defaultValue) {
        def += ` DEFAULT ${col.defaultValue}`;
      }
      return def;
    }).join(',\n');

    const strictSuffix = strictMode ? ' STRICT' : '';
    return `CREATE TABLE "${tableName}" (\n${columnDefs}\n)${strictSuffix};`;
  };
  
  // Get available types based on STRICT mode
  const availableTypes = strictMode ? STRICT_COLUMN_TYPES : COLUMN_TYPES;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Table</DialogTitle>
          <DialogDescription>
            Define your table structure with columns and constraints
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Table Name */}
          <div className="space-y-2">
            <Label htmlFor="table-name">Table Name</Label>
            <Input
              id="table-name"
              placeholder="users"
              value={tableName}
              onChange={(e) => {
                setTableName(e.target.value);
                setError('');
              }}
            />
          </div>
          
          {/* STRICT Mode Option */}
          <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="strict-mode"
                checked={strictMode}
                onChange={(e) => {
                  setStrictMode(e.target.checked);
                  // When enabling strict mode, reset any non-strict column types and disable generated columns
                  if (e.target.checked) {
                    setColumns(cols => cols.map(col => ({
                      ...col,
                      // Map common types to STRICT-compatible ones
                      type: STRICT_COLUMN_TYPES.includes(col.type) ? col.type : 
                            col.type === 'BOOLEAN' || col.type === 'NUMERIC' ? 'INTEGER' :
                            col.type === 'DATE' || col.type === 'DATETIME' || col.type === 'JSON' ? 'TEXT' : 'TEXT',
                      // Disable generated columns in strict mode
                      isGenerated: false,
                      generatedExpression: ''
                    })));
                  }
                  setError('');
                }}
                className="mt-1 rounded"
              />
              <div className="flex-1">
                <label htmlFor="strict-mode" className="flex items-center gap-2 font-medium text-blue-900 dark:text-blue-100 cursor-pointer">
                  <Shield className="h-4 w-4" />
                  Enable STRICT Mode
                </label>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  Enforces type checking - values must match declared column types. Only allows INTEGER, INT, REAL, TEXT, BLOB, ANY types.
                </p>
              </div>
            </div>
            
            {/* FTS5 Note */}
            <div className="flex items-start gap-2 pt-2 border-t border-blue-200 dark:border-blue-700">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                <strong>Need full-text search?</strong> Use the <strong>FTS5 Manager</strong> tab to create FTS5 virtual tables for powerful text search capabilities.
              </p>
            </div>
          </div>

          {/* Columns */}
          <fieldset className="space-y-4">
            <div className="flex items-center justify-between">
              <legend className="text-sm font-medium leading-none">Columns</legend>
              <Button type="button" variant="outline" size="sm" onClick={addColumn}>
                <Plus className="h-4 w-4 mr-2" />
                Add Column
              </Button>
            </div>

            <div className="space-y-3">
              {columns.map((column) => (
                <Card key={column.id} className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="space-y-3">
                      {/* Row 1: Name, Type, Delete */}
                      <div className="grid grid-cols-12 gap-3 items-start">
                        {/* Column Name */}
                        <div className="col-span-4">
                          <label htmlFor={`col-name-${column.id}`} className="sr-only">Column name</label>
                          <Input
                            id={`col-name-${column.id}`}
                            name={`col-name-${column.id}`}
                            placeholder="Column name"
                            value={column.name}
                            onChange={(e) => updateColumn(column.id, 'name', e.target.value)}
                          />
                        </div>

                        {/* Column Type */}
                        <div className="col-span-3">
                          <label htmlFor={`col-type-${column.id}`} className="sr-only">Column type</label>
                          <select
                            id={`col-type-${column.id}`}
                            name={`col-type-${column.id}`}
                            className="w-full h-10 px-3 rounded-md border border-input bg-background"
                            value={column.type}
                            onChange={(e) => updateColumn(column.id, 'type', e.target.value)}
                          >
                            {availableTypes.map(type => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </div>

                        {/* Default Value or Generated Expression */}
                        <div className="col-span-4">
                          {column.isGenerated ? (
                            <>
                              <label htmlFor={`col-expr-${column.id}`} className="sr-only">Generated expression</label>
                              <Input
                                id={`col-expr-${column.id}`}
                                name={`col-expr-${column.id}`}
                                placeholder="Expression, e.g. price * quantity"
                                value={column.generatedExpression}
                                onChange={(e) => updateColumn(column.id, 'generatedExpression', e.target.value)}
                              />
                            </>
                          ) : (
                            <>
                              <label htmlFor={`col-default-${column.id}`} className="sr-only">Default value</label>
                              <Input
                                id={`col-default-${column.id}`}
                                name={`col-default-${column.id}`}
                                placeholder="Default value"
                                value={column.defaultValue}
                                onChange={(e) => updateColumn(column.id, 'defaultValue', e.target.value)}
                              />
                            </>
                          )}
                        </div>

                        {/* Delete Button */}
                        <div className="col-span-1 flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeColumn(column.id)}
                            disabled={columns.length <= 1}
                            aria-label="Delete column"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Row 2: Constraints */}
                      <div className="flex flex-wrap items-center gap-4">
                        {/* Primary Key */}
                        <div 
                          className="flex items-center gap-2"
                          title={column.isGenerated 
                            ? "✗ Generated columns cannot be primary keys" 
                            : "Uniquely identifies each row. Enables fast lookups and relationships."}
                        >
                          <input
                            type="checkbox"
                            id={`pk-${column.id}`}
                            name={`pk-${column.id}`}
                            checked={column.primaryKey}
                            onChange={(e) => {
                              // When enabling PK, also enable NOT NULL and disable UNIQUE (PK implies both)
                              if (e.target.checked) {
                                updateColumnBatch(column.id, { primaryKey: true, notNull: true, unique: false });
                              } else {
                                updateColumn(column.id, 'primaryKey', false);
                              }
                            }}
                            disabled={column.isGenerated}
                            className="rounded disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          <label 
                            htmlFor={`pk-${column.id}`} 
                            className={`text-sm flex items-center gap-1 ${column.isGenerated ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <Key className="h-3 w-3" />
                            Primary Key
                          </label>
                        </div>

                        {/* Not Null */}
                        <div 
                          className="flex items-center gap-2"
                          title={column.primaryKey 
                            ? "✓ Primary keys are always NOT NULL" 
                            : "Prevents NULL values. Ensures this column always has a value."}
                        >
                          <input
                            type="checkbox"
                            id={`nn-${column.id}`}
                            name={`nn-${column.id}`}
                            checked={column.notNull}
                            onChange={(e) => updateColumn(column.id, 'notNull', e.target.checked)}
                            disabled={column.primaryKey}
                            className="rounded disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          <label 
                            htmlFor={`nn-${column.id}`} 
                            className={`text-sm flex items-center gap-1 ${column.primaryKey ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <Lock className="h-3 w-3" />
                            Not Null
                          </label>
                        </div>

                        {/* Unique */}
                        <div 
                          className="flex items-center gap-2"
                          title={column.primaryKey 
                            ? "✓ Primary keys are already unique" 
                            : "Ensures all values in this column are distinct."}
                        >
                          <input
                            type="checkbox"
                            id={`uq-${column.id}`}
                            name={`uq-${column.id}`}
                            checked={column.unique}
                            onChange={(e) => updateColumn(column.id, 'unique', e.target.checked)}
                            disabled={column.primaryKey}
                            className="rounded disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          <label 
                            htmlFor={`uq-${column.id}`} 
                            className={`text-sm flex items-center gap-1 ${column.primaryKey ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <Link className="h-3 w-3" />
                            Unique
                          </label>
                        </div>

                        {/* Generated Column */}
                        <div 
                          className="flex items-center gap-2"
                          title={strictMode
                            ? "✗ Generated columns are not available in STRICT mode"
                            : column.primaryKey 
                            ? "✗ Primary key columns cannot be generated" 
                            : "Value is computed from an expression using other columns."}
                        >
                          <input
                            type="checkbox"
                            id={`gen-${column.id}`}
                            name={`gen-${column.id}`}
                            checked={column.isGenerated}
                            onChange={(e) => {
                              if (e.target.checked) {
                                // Enable generated and clear incompatible options in one update
                                updateColumnBatch(column.id, { 
                                  isGenerated: true, 
                                  defaultValue: '', 
                                  primaryKey: false 
                                });
                              } else {
                                updateColumn(column.id, 'isGenerated', false);
                              }
                            }}
                            disabled={column.primaryKey || strictMode}
                            className="rounded disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          <label 
                            htmlFor={`gen-${column.id}`} 
                            className={`text-sm flex items-center gap-1 ${column.primaryKey || strictMode ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <Sparkles className="h-3 w-3" />
                            Generated
                          </label>
                        </div>

                        {/* Generated Type (STORED/VIRTUAL) */}
                        {column.isGenerated && (
                          <div className="flex items-center gap-2 ml-2 pl-2 border-l">
                            <label htmlFor={`gen-type-${column.id}`} className="sr-only">Generated column storage type</label>
                            <select
                              id={`gen-type-${column.id}`}
                              name={`gen-type-${column.id}`}
                              className="h-8 px-2 text-sm rounded-md border border-input bg-background"
                              value={column.generatedType}
                              onChange={(e) => updateColumn(column.id, 'generatedType', e.target.value as 'STORED' | 'VIRTUAL')}
                            >
                              <option value="STORED">STORED</option>
                              <option value="VIRTUAL">VIRTUAL</option>
                            </select>
                            <span className="text-xs text-muted-foreground">
                              {column.generatedType === 'STORED' ? '(saved to disk)' : '(computed on read)'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </fieldset>

          {/* SQL Preview */}
          {tableName && columns.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">SQL Preview</h4>
              <pre className="p-4 bg-muted rounded-md text-sm font-mono overflow-x-auto" aria-label="SQL Preview">
                {generateSQL()}
              </pre>
            </div>
          )}

          {/* Error Message */}
          <ErrorMessage error={error} variant="inline" />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button onClick={() => void validateAndCreate()} disabled={creating}>
            {creating ? 'Creating...' : 'Create Table'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

