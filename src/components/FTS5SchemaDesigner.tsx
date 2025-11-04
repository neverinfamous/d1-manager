import { useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { TokenizerPresetSelector } from './TokenizerPresetSelector';
import { TokenizerAdvancedConfig } from './TokenizerAdvancedConfig';
import type { FTS5TableConfig, TokenizerConfig } from '@/services/fts5-types';

interface Column {
  id: string;
  name: string;
  unindexed: boolean;
}

interface FTS5SchemaDesignerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateTable: (config: FTS5TableConfig) => Promise<void>;
}

export function FTS5SchemaDesigner({ open, onOpenChange, onCreateTable }: FTS5SchemaDesignerProps) {
  const [tableName, setTableName] = useState('');
  const [columns, setColumns] = useState<Column[]>([
    { id: '1', name: 'content', unindexed: false }
  ]);
  const [tokenizer, setTokenizer] = useState<TokenizerConfig>({
    type: 'unicode61',
    parameters: { remove_diacritics: 1 },
  });
  const [prefixIndexEnabled, setPrefixIndexEnabled] = useState(false);
  const [prefixLengths, setPrefixLengths] = useState('2,3');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const addColumn = () => {
    const newId = String(Date.now());
    setColumns([
      ...columns,
      { id: newId, name: '', unindexed: false }
    ]);
  };

  const removeColumn = (id: string) => {
    if (columns.length <= 1) {
      setError('FTS5 table must have at least one column');
      return;
    }
    setColumns(columns.filter(col => col.id !== id));
    setError('');
  };

  const updateColumn = (id: string, field: keyof Column, value: string | boolean) => {
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

    // FTS5 table name convention
    if (!tableName.endsWith('_fts') && !tableName.includes('fts')) {
      const shouldContinue = confirm(
        'FTS5 table names typically end with "_fts" for clarity. Continue anyway?'
      );
      if (!shouldContinue) return;
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

    // Parse prefix lengths
    let parsedPrefixLengths: number[] | undefined;
    if (prefixIndexEnabled) {
      const lengths = prefixLengths.split(',').map(l => parseInt(l.trim(), 10)).filter(l => !isNaN(l) && l > 0);
      if (lengths.length === 0) {
        setError('Invalid prefix lengths. Use comma-separated numbers (e.g., 2,3,4)');
        return;
      }
      parsedPrefixLengths = lengths;
    }

    try {
      setCreating(true);

      const config: FTS5TableConfig = {
        tableName,
        columns: columns.map(c => c.name),
        tokenizer,
        unindexed: columns.filter(c => c.unindexed).map(c => c.name),
      };

      if (prefixIndexEnabled && parsedPrefixLengths) {
        config.prefixIndex = {
          enabled: true,
          lengths: parsedPrefixLengths,
        };
      }

      await onCreateTable(config);
      
      // Reset form
      setTableName('');
      setColumns([{ id: '1', name: 'content', unindexed: false }]);
      setTokenizer({ type: 'unicode61', parameters: { remove_diacritics: 1 } });
      setPrefixIndexEnabled(false);
      setPrefixLengths('2,3');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create FTS5 table');
    } finally {
      setCreating(false);
    }
  };

  const generateSQL = () => {
    const columnDefs = columns.map(col => {
      return col.unindexed ? `${col.name} UNINDEXED` : col.name;
    }).join(', ');

    let tokenizerStr = tokenizer.type;
    if (tokenizer.parameters) {
      const params: string[] = [];
      if (tokenizer.parameters.remove_diacritics !== undefined) {
        params.push(`remove_diacritics ${tokenizer.parameters.remove_diacritics}`);
      }
      if (tokenizer.parameters.case_sensitive !== undefined) {
        params.push(`case_sensitive ${tokenizer.parameters.case_sensitive}`);
      }
      if (tokenizer.parameters.separators) {
        params.push(`separators '${tokenizer.parameters.separators}'`);
      }
      if (tokenizer.parameters.tokenchars) {
        params.push(`tokenchars '${tokenizer.parameters.tokenchars}'`);
      }
      if (params.length > 0) {
        tokenizerStr += ' ' + params.join(' ');
      }
    }

    let options = `tokenize='${tokenizerStr}'`;
    
    if (prefixIndexEnabled && prefixLengths) {
      const lengths = prefixLengths.split(',').map(l => l.trim()).filter(l => l).join(' ');
      if (lengths) {
        options += `, prefix='${lengths}'`;
      }
    }

    return `CREATE VIRTUAL TABLE ${tableName} USING fts5(${columnDefs}, ${options});`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create FTS5 Full-Text Search Table</DialogTitle>
          <DialogDescription>
            Design a virtual table optimized for full-text search using SQLite's FTS5 extension
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Table Name */}
          <div className="space-y-2">
            <Label htmlFor="fts5-table-name">Table Name</Label>
            <Input
              id="fts5-table-name"
              placeholder="articles_fts"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              disabled={creating}
            />
            <p className="text-xs text-muted-foreground">
              Convention: End with "_fts" to indicate it's a full-text search table
            </p>
          </div>

          {/* Columns */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Indexed Columns</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addColumn}
                disabled={creating}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Column
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Define which columns will be searchable
            </p>

            <div className="space-y-2">
              {columns.map((column) => (
                <Card key={column.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 space-y-2">
                        <Input
                          placeholder="Column name"
                          value={column.name}
                          onChange={(e) => updateColumn(column.id, 'name', e.target.value)}
                          disabled={creating}
                        />
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`unindexed-${column.id}`}
                            checked={column.unindexed}
                            onCheckedChange={(checked) => updateColumn(column.id, 'unindexed', checked === true)}
                            disabled={creating}
                          />
                          <Label htmlFor={`unindexed-${column.id}`} className="text-sm font-normal cursor-pointer">
                            Store but don't index (for retrieval only)
                          </Label>
                        </div>
                      </div>
                      {columns.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeColumn(column.id)}
                          disabled={creating}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Tokenizer */}
          <TokenizerPresetSelector
            value={tokenizer}
            onChange={setTokenizer}
            disabled={creating}
          />

          {/* Advanced Tokenizer Config */}
          <TokenizerAdvancedConfig
            value={tokenizer}
            onChange={setTokenizer}
            disabled={creating}
          />

          {/* Prefix Index */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="prefix-index"
                checked={prefixIndexEnabled}
                onCheckedChange={(checked) => setPrefixIndexEnabled(checked === true)}
                disabled={creating}
              />
              <Label htmlFor="prefix-index" className="font-medium cursor-pointer">
                Enable prefix index (for autocomplete)
              </Label>
            </div>
            {prefixIndexEnabled && (
              <div className="ml-6 space-y-2">
                <Label htmlFor="prefix-lengths">Prefix Lengths</Label>
                <Input
                  id="prefix-lengths"
                  placeholder="2,3,4"
                  value={prefixLengths}
                  onChange={(e) => setPrefixLengths(e.target.value)}
                  disabled={creating}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated list of prefix lengths to index (e.g., 2,3 enables matching "ap", "app")
                </p>
              </div>
            )}
          </div>

          {/* SQL Preview */}
          <div className="space-y-2">
            <Label className="text-base font-semibold">SQL Preview</Label>
            <pre className="p-4 bg-muted rounded-lg text-sm overflow-x-auto">
              <code>{tableName ? generateSQL() : '-- Enter table name and columns to see SQL'}</code>
            </pre>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-destructive/10 border border-destructive text-destructive px-3 py-2 rounded-lg text-sm">
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
          <Button
            onClick={validateAndCreate}
            disabled={creating || !tableName.trim()}
          >
            {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {creating ? 'Creating...' : 'Create FTS5 Table'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

