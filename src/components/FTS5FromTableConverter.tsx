import { useState, useEffect } from 'react';
import { Loader2, FileText } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TokenizerPresetSelector } from './TokenizerPresetSelector';
import { TokenizerAdvancedConfig } from './TokenizerAdvancedConfig';
import { listTables, getTableSchema } from '@/services/api';
import type { FTS5CreateFromTableParams, TokenizerConfig } from '@/services/fts5-types';
import type { TableInfo, ColumnInfo } from '@/services/api';
import { ErrorMessage } from '@/components/ui/error-message';

interface FTS5FromTableConverterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  databaseId: string;
  onConvert: (params: FTS5CreateFromTableParams) => Promise<void>;
}

export function FTS5FromTableConverter({
  open,
  onOpenChange,
  databaseId,
  onConvert,
}: FTS5FromTableConverterProps): React.JSX.Element {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [sourceTable, setSourceTable] = useState('');
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [ftsTableName, setFtsTableName] = useState('');
  const [tokenizer, setTokenizer] = useState<TokenizerConfig>({
    type: 'unicode61',
    parameters: { remove_diacritics: 1 },
  });
  const [prefixIndexEnabled, setPrefixIndexEnabled] = useState(false);
  const [prefixLengths, setPrefixLengths] = useState('2,3');
  const [externalContent, setExternalContent] = useState(false);
  const [createTriggers, setCreateTriggers] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      void loadTables();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, databaseId]);

  useEffect(() => {
    if (sourceTable) {
      void loadColumns(sourceTable);
      // Auto-generate FTS table name
      const ftsName = sourceTable.endsWith('_fts') ? sourceTable : `${sourceTable}_fts`;
      setFtsTableName(ftsName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceTable]);

  const loadTables = async (): Promise<void> => {
    try {
      setLoadingTables(true);
      const result = await listTables(databaseId);
      // Filter out FTS5 tables and virtual tables
      const regularTables = result.filter(t => t.type === 'table');
      setTables(regularTables);
    } catch {
      // Silently ignore failures
    } finally {
      setLoadingTables(false);
    }
  };

  const loadColumns = async (tableName: string): Promise<void> => {
    try {
      const schema = await getTableSchema(databaseId, tableName);
      setColumns(schema);
      // Auto-select text columns
      const textColumns = schema
        .filter(col => col.type.toUpperCase().includes('TEXT') || col.type.toUpperCase().includes('VARCHAR'))
        .map(col => col.name);
      const fallbackColumn = schema[0]?.name;
      setSelectedColumns(textColumns.length > 0 ? textColumns : fallbackColumn ? [fallbackColumn] : []);
    } catch {
      setColumns([]);
      setSelectedColumns([]);
    }
  };

  const toggleColumn = (columnName: string): void => {
    setSelectedColumns(prev =>
      prev.includes(columnName)
        ? prev.filter(c => c !== columnName)
        : [...prev, columnName]
    );
  };

  const validateAndConvert = async (): Promise<void> => {
    setError('');

    if (!sourceTable) {
      setError('Please select a source table');
      return;
    }

    if (!ftsTableName.trim()) {
      setError('FTS table name is required');
      return;
    }

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(ftsTableName)) {
      setError('FTS table name must start with a letter or underscore');
      return;
    }

    if (selectedColumns.length === 0) {
      setError('Please select at least one column to index');
      return;
    }

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
      setConverting(true);

      const params: FTS5CreateFromTableParams = {
        sourceTable,
        ftsTableName,
        columns: selectedColumns,
        tokenizer,
        externalContent,
        createTriggers: externalContent && createTriggers,
      };

      if (prefixIndexEnabled && parsedPrefixLengths) {
        params.prefixIndex = {
          enabled: true,
          lengths: parsedPrefixLengths,
        };
      }

      await onConvert(params);
      
      // Reset form
      setSourceTable('');
      setColumns([]);
      setSelectedColumns([]);
      setFtsTableName('');
      setTokenizer({ type: 'unicode61', parameters: { remove_diacritics: 1 } });
      setPrefixIndexEnabled(false);
      setPrefixLengths('2,3');
      setExternalContent(false);
      setCreateTriggers(false);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to convert table to FTS5');
    } finally {
      setConverting(false);
    }
  };

  const generateSQL = (): string => {
    if (!sourceTable || !ftsTableName || selectedColumns.length === 0) {
      return '-- Select source table and columns to see SQL';
    }

    const lines: string[] = [];
    
    // CREATE VIRTUAL TABLE
    const columnNames = selectedColumns.join(', ');
    let tokenizerStr = tokenizer.type;
    if (tokenizer.parameters) {
      const params: string[] = [];
      if (tokenizer.parameters.remove_diacritics !== undefined) {
        params.push(`remove_diacritics ${String(tokenizer.parameters.remove_diacritics)}`);
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
    if (externalContent) {
      options += `, content='${sourceTable}', content_rowid='rowid'`;
    }

    lines.push(`CREATE VIRTUAL TABLE ${ftsTableName} USING fts5(${columnNames}, ${options});`);
    lines.push('');

    // POPULATE
    if (externalContent) {
      lines.push(`INSERT INTO ${ftsTableName}(rowid, ${columnNames}) SELECT rowid, ${columnNames} FROM ${sourceTable};`);
    } else {
      lines.push(`INSERT INTO ${ftsTableName}(${columnNames}) SELECT ${columnNames} FROM ${sourceTable};`);
    }

    // TRIGGERS
    if (externalContent && createTriggers) {
      lines.push('');
      lines.push('-- Triggers to keep FTS5 in sync with source table');
      lines.push(`CREATE TRIGGER ${ftsTableName}_ai AFTER INSERT ON ${sourceTable} BEGIN`);
      lines.push(`  INSERT INTO ${ftsTableName}(rowid, ${columnNames}) VALUES (NEW.rowid, ${selectedColumns.map(c => `NEW.${c}`).join(', ')});`);
      lines.push('END;');
    }

    return lines.join('\n');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden w-[95vw] max-w-[1100px]">
        <DialogHeader>
          <DialogTitle>Convert Table to FTS5</DialogTitle>
          <DialogDescription>
            Create a full-text search index from an existing table
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4 overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* Source Table Selection */}
          <div className="space-y-2">
            <Label htmlFor="source-table">Source Table</Label>
            <Select value={sourceTable} onValueChange={setSourceTable} disabled={converting || loadingTables}>
              <SelectTrigger id="source-table">
                <SelectValue placeholder={loadingTables ? 'Loading tables...' : 'Select a table'} />
              </SelectTrigger>
              <SelectContent>
                {tables.map(table => (
                  <SelectItem key={table.name} value={table.name}>
                    {table.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* FTS Table Name */}
          <div className="space-y-2">
            <Label htmlFor="fts-table-name">FTS5 Table Name</Label>
            <Input
              id="fts-table-name"
              value={ftsTableName}
              onChange={(e) => setFtsTableName(e.target.value)}
              disabled={converting || !sourceTable}
              placeholder="table_name_fts"
            />
          </div>

          {/* Column Selection */}
          {columns.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-base font-semibold">Columns to Index</legend>
              <p className="text-sm text-muted-foreground">
                Select which columns to include in the full-text search
              </p>
              <div className="border rounded-lg p-4 space-y-2 max-h-48 overflow-y-auto">
                {columns.map(col => (
                  <div key={col.name} className="flex items-center space-x-2">
                    <Checkbox
                      id={`col-${col.name}`}
                      checked={selectedColumns.includes(col.name)}
                      onCheckedChange={() => toggleColumn(col.name)}
                      disabled={converting}
                    />
                    <Label htmlFor={`col-${col.name}`} className="font-normal cursor-pointer flex-1">
                      {col.name} <span className="text-muted-foreground text-sm">({col.type})</span>
                    </Label>
                  </div>
                ))}
              </div>
            </fieldset>
          )}

          {/* External Content Option */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-start space-x-2">
              <Checkbox
                id="external-content"
                checked={externalContent}
                onCheckedChange={(checked) => setExternalContent(checked === true)}
                disabled={converting}
              />
              <div className="flex-1">
                <Label htmlFor="external-content" className="font-medium cursor-pointer">
                  Use external content table
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Store data in original table to save space. FTS5 will reference the source table.
                </p>
              </div>
            </div>

            {externalContent && (
              <div className="ml-6 flex items-start space-x-2">
                <Checkbox
                  id="create-triggers"
                  checked={createTriggers}
                  onCheckedChange={(checked) => setCreateTriggers(checked === true)}
                  disabled={converting}
                />
                <div className="flex-1">
                  <Label htmlFor="create-triggers" className="font-normal cursor-pointer">
                    Create sync triggers
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Automatically update FTS5 when source table changes (INSERT/UPDATE/DELETE)
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Tokenizer */}
          <div className="border-t pt-4">
            <TokenizerPresetSelector
              value={tokenizer}
              onChange={setTokenizer}
              disabled={converting}
            />
          </div>

          {/* Advanced Tokenizer Config */}
          <TokenizerAdvancedConfig
            value={tokenizer}
            onChange={setTokenizer}
            disabled={converting}
          />

          {/* Prefix Index */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="prefix-index-convert"
                checked={prefixIndexEnabled}
                onCheckedChange={(checked) => setPrefixIndexEnabled(checked === true)}
                disabled={converting}
              />
              <Label htmlFor="prefix-index-convert" className="font-medium cursor-pointer">
                Enable prefix index (for autocomplete)
              </Label>
            </div>
            {prefixIndexEnabled && (
              <div className="ml-6 space-y-2">
                <Label htmlFor="prefix-lengths-convert">Prefix Lengths</Label>
                <Input
                  id="prefix-lengths-convert"
                  placeholder="2,3,4"
                  value={prefixLengths}
                  onChange={(e) => setPrefixLengths(e.target.value)}
                  disabled={converting}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated list of prefix lengths
                </p>
              </div>
            )}
          </div>

          {/* SQL Preview */}
          <div className="space-y-2">
            <h4 className="text-base font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" aria-hidden="true" />
              SQL Preview
            </h4>
            <div className="bg-muted rounded-lg p-4 overflow-hidden">
              <pre className="text-xs overflow-x-auto max-h-64 whitespace-pre-wrap break-words" aria-label="SQL Preview">
                <code>{generateSQL()}</code>
              </pre>
            </div>
          </div>

          {/* Error Display */}
          <ErrorMessage error={error} variant="inline" />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={converting}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void validateAndConvert()}
            disabled={converting || !sourceTable || selectedColumns.length === 0}
          >
            {converting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {converting ? 'Converting...' : 'Create FTS5 Table'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

