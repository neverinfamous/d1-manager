import { useState } from 'react';
import { Plus, Trash2, Key, Lock } from 'lucide-react';
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

interface Column {
  id: string;
  name: string;
  type: string;
  primaryKey: boolean;
  notNull: boolean;
  defaultValue: string;
}

interface SchemaDesignerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateTable: (tableName: string, columns: Column[]) => Promise<void>;
}

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

export function SchemaDesigner({ open, onOpenChange, onCreateTable }: SchemaDesignerProps) {
  const [tableName, setTableName] = useState('');
  const [columns, setColumns] = useState<Column[]>([
    { id: '1', name: 'id', type: 'INTEGER', primaryKey: true, notNull: true, defaultValue: '' }
  ]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const addColumn = () => {
    const newId = String(Date.now());
    setColumns([
      ...columns,
      { id: newId, name: '', type: 'TEXT', primaryKey: false, notNull: false, defaultValue: '' }
    ]);
  };

  const removeColumn = (id: string) => {
    if (columns.length <= 1) {
      setError('Table must have at least one column');
      return;
    }
    setColumns(columns.filter(col => col.id !== id));
    setError('');
  };

  const updateColumn = (id: string, field: keyof Column, value: any) => {
    setColumns(columns.map(col => 
      col.id === id ? { ...col, [field]: value } : col
    ));
    setError('');
  };

  const validateAndCreate = async () => {
    setError('');

    // Validate table name
    if (!tableName.trim()) {
      setError('Table name is required');
      return;
    }

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      setError('Table name must start with a letter or underscore and contain only letters, numbers, and underscores');
      return;
    }

    // Validate columns
    for (const col of columns) {
      if (!col.name.trim()) {
        setError('All columns must have a name');
        return;
      }
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col.name)) {
        setError(`Column name "${col.name}" is invalid. Must start with a letter or underscore`);
        return;
      }
    }

    // Check for duplicate column names
    const columnNames = columns.map(c => c.name.toLowerCase());
    const duplicates = columnNames.filter((name, index) => columnNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
      setError(`Duplicate column name: ${duplicates[0]}`);
      return;
    }

    // Check for at least one primary key
    const hasPrimaryKey = columns.some(col => col.primaryKey);
    if (!hasPrimaryKey) {
      setError('Table must have at least one primary key column');
      return;
    }

    try {
      setCreating(true);
      await onCreateTable(tableName, columns);
      
      // Reset form
      setTableName('');
      setColumns([
        { id: '1', name: 'id', type: 'INTEGER', primaryKey: true, notNull: true, defaultValue: '' }
      ]);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create table');
    } finally {
      setCreating(false);
    }
  };

  const generateSQL = () => {
    const columnDefs = columns.map(col => {
      let def = `  ${col.name} ${col.type}`;
      if (col.primaryKey) def += ' PRIMARY KEY';
      if (col.notNull && !col.primaryKey) def += ' NOT NULL';
      if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
      return def;
    }).join(',\n');

    return `CREATE TABLE ${tableName} (\n${columnDefs}\n);`;
  };

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

          {/* Columns */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Columns</Label>
              <Button type="button" variant="outline" size="sm" onClick={addColumn}>
                <Plus className="h-4 w-4 mr-2" />
                Add Column
              </Button>
            </div>

            <div className="space-y-3">
              {columns.map((column, index) => (
                <Card key={column.id} className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-12 gap-3 items-start">
                      {/* Column Name */}
                      <div className="col-span-3">
                        <Input
                          placeholder="Column name"
                          value={column.name}
                          onChange={(e) => updateColumn(column.id, 'name', e.target.value)}
                        />
                      </div>

                      {/* Column Type */}
                      <div className="col-span-2">
                        <select
                          className="w-full h-10 px-3 rounded-md border border-input bg-background"
                          value={column.type}
                          onChange={(e) => updateColumn(column.id, 'type', e.target.value)}
                        >
                          {COLUMN_TYPES.map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </div>

                      {/* Primary Key */}
                      <div className="col-span-2 flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`pk-${column.id}`}
                          checked={column.primaryKey}
                          onChange={(e) => updateColumn(column.id, 'primaryKey', e.target.checked)}
                          className="rounded"
                        />
                        <label htmlFor={`pk-${column.id}`} className="text-sm flex items-center gap-1">
                          <Key className="h-3 w-3" />
                          Primary Key
                        </label>
                      </div>

                      {/* Not Null */}
                      <div className="col-span-2 flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`nn-${column.id}`}
                          checked={column.notNull}
                          onChange={(e) => updateColumn(column.id, 'notNull', e.target.checked)}
                          className="rounded"
                        />
                        <label htmlFor={`nn-${column.id}`} className="text-sm flex items-center gap-1">
                          <Lock className="h-3 w-3" />
                          Not Null
                        </label>
                      </div>

                      {/* Default Value */}
                      <div className="col-span-2">
                        <Input
                          placeholder="Default"
                          value={column.defaultValue}
                          onChange={(e) => updateColumn(column.id, 'defaultValue', e.target.value)}
                        />
                      </div>

                      {/* Delete Button */}
                      <div className="col-span-1 flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeColumn(column.id)}
                          disabled={columns.length <= 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* SQL Preview */}
          {tableName && columns.length > 0 && (
            <div className="space-y-2">
              <Label>SQL Preview</Label>
              <pre className="p-4 bg-muted rounded-md text-sm font-mono overflow-x-auto">
                {generateSQL()}
              </pre>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive text-destructive rounded-md text-sm">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button onClick={validateAndCreate} disabled={creating}>
            {creating ? 'Creating...' : 'Create Table'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

