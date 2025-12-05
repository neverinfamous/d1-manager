import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { format as formatSql } from 'sql-formatter';
import { Play, Loader2, Download, History, Save, Trash2, Globe, Server, AlertCircle, CheckCircle2, Copy, FileCode, Wand2, Code, ArrowLeftRight, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { executeQuery, getSavedQueries, createSavedQuery, deleteSavedQuery, type SavedQuery } from '@/services/api';
import { handleSqlKeydown } from '@/lib/sqlAutocomplete';
import { validateSql } from '@/lib/sqlValidator';
import { sqlTemplateGroups, sqlTemplates } from '@/lib/sqlTemplates';
import { useSchemaContext } from '@/hooks/useSchemaContext';
import { parseContext, filterSuggestions } from '@/lib/sqlContextParser';
import { ALL_SQL_KEYWORDS } from '@/lib/sqlKeywords';
import { getCaretCoordinates } from '@/lib/caretPosition';
import { AutocompletePopup, type Suggestion } from '@/components/AutocompletePopup';
import { SqlEditor } from '@/components/SqlEditor';
import { QueryBuilder } from '@/components/QueryBuilder';
import { DiffEditor } from '@/components/DiffEditor';
import { DrizzleConsole } from '@/components/DrizzleConsole';
import { ErrorMessage } from '@/components/ui/error-message';

interface QueryConsoleProps {
  databaseId: string;
  databaseName: string;
  onSchemaChange?: (() => void) | undefined;
}

interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowsAffected?: number;
  executionTime: number;
  servedByRegion?: string;
  servedByPrimary?: boolean;
}

export function QueryConsole({ databaseId, databaseName, onSchemaChange }: QueryConsoleProps): React.JSX.Element {
  // Tab state
  const [activeTab, setActiveTab] = useState<'editor' | 'builder' | 'compare' | 'drizzle'>('editor');
  
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [skipValidation, setSkipValidation] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showSavedQueries, setShowSavedQueries] = useState(false);
  const [queryName, setQueryName] = useState('');
  const [queryDescription, setQueryDescription] = useState('');
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [savingQuery, setSavingQuery] = useState(false);
  const [loadingQueries, setLoadingQueries] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Autocomplete toggle - persisted in localStorage
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(() => {
    const stored = localStorage.getItem('sql-autocomplete-enabled');
    return stored !== null ? stored === 'true' : true; // Default to enabled
  });
  
  // Persist autocomplete preference
  useEffect(() => {
    localStorage.setItem('sql-autocomplete-enabled', String(autocompleteEnabled));
  }, [autocompleteEnabled]);
  
  // Handler to receive SQL from Query Builder
  const handleSendToEditor = useCallback((sql: string) => {
    setQuery(sql);
    setActiveTab('editor');
    // Focus the editor after switching
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  }, []);

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  // Schema context for table/column suggestions
  const schema = useSchemaContext(databaseId);

  // Real-time SQL validation
  const validation = useMemo(() => validateSql(query), [query]);

  // Update suggestions based on current context
  const updateSuggestions = useCallback(async (text: string, cursorPos: number) => {
    // Skip if autocomplete is disabled
    if (!autocompleteEnabled) {
      setShowAutocomplete(false);
      setSuggestions([]);
      return;
    }
    
    if (!textareaRef.current) return;

    const context = parseContext(text, cursorPos);
    let suggestionItems: Suggestion[] = [];

    // Get suggestions based on context type
    if (context.type === 'table') {
      // Suggest table names
      const filtered = filterSuggestions(schema.tables, context.currentWord);
      suggestionItems = filtered.map(t => ({ text: t, type: 'table' as const }));
    } else if (context.type === 'column') {
      // Suggest column names
      let columns: string[] = [];
      
      if (context.dotTable) {
        // Specific table after dot notation
        columns = await schema.fetchColumnsForTable(context.dotTable);
      } else if (context.tableNames.length > 0) {
        // Columns from tables in query
        columns = await schema.getColumnsForTables(context.tableNames);
      }
      
      const filtered = filterSuggestions(columns, context.currentWord);
      suggestionItems = filtered.map(c => ({ text: c, type: 'column' as const }));
      
      // Also add table names if no dot notation (user might want to type table.column)
      if (!context.dotTable && context.currentWord.length > 0) {
        const tableMatches = filterSuggestions(schema.tables, context.currentWord, 3);
        const tableSuggestions = tableMatches.map(t => ({ text: t, type: 'table' as const }));
        suggestionItems = [...suggestionItems, ...tableSuggestions].slice(0, 10);
      }
    } else {
      // Suggest SQL keywords
      const filtered = filterSuggestions([...ALL_SQL_KEYWORDS], context.currentWord);
      suggestionItems = filtered.map(k => ({ text: k, type: 'keyword' as const }));
    }

    // Show if we have suggestions and:
    // - User is typing something, OR
    // - User just typed a dot (for table.column completion)
    const shouldShow = suggestionItems.length > 0 && 
      (context.currentWord.length > 0 || context.dotTable !== null);
    
    if (shouldShow) {
      // Calculate popup position
      const coords = getCaretCoordinates(textareaRef.current, cursorPos);
      setPopupPosition({
        top: coords.top + coords.height + 4,
        left: coords.left,
      });
      setSuggestions(suggestionItems);
      setSelectedIndex(0);
      setShowAutocomplete(true);
    } else {
      setShowAutocomplete(false);
      setSuggestions([]);
    }
  }, [schema, autocompleteEnabled]);

  // Handle accepting a suggestion
  const acceptSuggestion = useCallback((suggestion: Suggestion) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const cursorPos = textarea.selectionStart;
    const context = parseContext(query, cursorPos);

    // Replace the current word with the suggestion
    const before = query.slice(0, context.wordStart);
    const after = query.slice(cursorPos);
    const newQuery = before + suggestion.text + after;
    const newCursorPos = context.wordStart + suggestion.text.length;

    setQuery(newQuery);
    setShowAutocomplete(false);
    setSuggestions([]);

    // Restore focus and cursor position
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = newCursorPos;
      textarea.selectionEnd = newCursorPos;
    });
  }, [query]);

  // Close autocomplete when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowAutocomplete(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExecute = async (): Promise<void> => {
    if (!query.trim()) {
      setError('Please enter a query');
      return;
    }

    // Close autocomplete when executing
    setShowAutocomplete(false);

    try {
      setExecuting(true);
      setError(null);
      
      const startTime = performance.now();
      const response = await executeQuery(databaseId, query, [], skipValidation);
      const endTime = performance.now();

      // Response is already unwrapped by api.ts: { results: [], meta: {}, success: boolean }
      if (response.results.length > 0) {
        const resultsArray = response.results;
        const firstRow = resultsArray[0];
        
        // Extract columns from first row
        const columns = firstRow ? Object.keys(firstRow) : [];
        
        // Convert results to rows array
        const rows = resultsArray.map((row: Record<string, unknown>) =>
          columns.map(col => row[col])
        );

        setResult({
          columns,
          rows,
          executionTime: endTime - startTime,
          ...(response.meta?.rows_written !== undefined && { rowsAffected: response.meta.rows_written }),
          ...(response.meta?.rows_read !== undefined && !response.meta.rows_written && { rowsAffected: response.meta.rows_read }),
          ...(response.meta?.served_by_region && { servedByRegion: response.meta.served_by_region }),
          ...(response.meta?.served_by_primary !== undefined && { servedByPrimary: response.meta.served_by_primary })
        });
      } else {
        setResult({
          columns: [],
          rows: [],
          executionTime: endTime - startTime,
          ...(response.meta?.served_by_region && { servedByRegion: response.meta.served_by_region }),
          ...(response.meta?.served_by_primary !== undefined && { servedByPrimary: response.meta.served_by_primary })
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query execution failed');
      setResult(null);
    } finally {
      setExecuting(false);
    }
  };

  const formatValue = (value: unknown): string => {
    if (value === null) return 'NULL';
    if (value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value as string | number | boolean);
  };

  // Handle keyboard events for autocomplete and execution
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // Handle autocomplete navigation when popup is visible
    if (showAutocomplete && suggestions.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % suggestions.length);
          return;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
          return;
        case 'Tab':
        case 'Enter':
          // Accept suggestion (but not Ctrl+Enter which executes)
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            const selected = suggestions[selectedIndex];
            if (selected) {
              acceptSuggestion(selected);
            }
            return;
          }
          break;
        case 'Escape':
          e.preventDefault();
          setShowAutocomplete(false);
          return;
      }
    }

    // Ctrl/Cmd+Enter to execute
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleExecute();
      return;
    }

    // SQL autocomplete handling (bracket pairing, indentation, etc.)
    const textarea = e.currentTarget;
    const result = handleSqlKeydown(
      e.key,
      textarea.value,
      textarea.selectionStart,
      textarea.selectionEnd,
      e.shiftKey
    );

    if (result.handled) {
      e.preventDefault();
      if (result.newValue !== undefined) {
        setQuery(result.newValue);
        // Set cursor position after React updates the value
        if (result.newCursorPos !== undefined) {
          const cursorPos = result.newCursorPos;
          requestAnimationFrame(() => {
            textarea.selectionStart = cursorPos;
            textarea.selectionEnd = cursorPos;
            // Update suggestions after the state is updated
            if (result.newValue !== undefined) {
              void updateSuggestions(result.newValue, cursorPos);
            }
          });
        }
      }
    }
  };

  // Handle text changes from SqlEditor
  const handleEditorChange = (newValue: string): void => {
    setQuery(newValue);
    // Get cursor position from the textarea ref after state update
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const cursorPos = textareaRef.current.selectionStart;
        void updateSuggestions(newValue, cursorPos);
      }
    });
  };

  // Handle click - close autocomplete when clicking in textarea
  const handleTextareaClick = (): void => {
    if (showAutocomplete) {
      setShowAutocomplete(false);
    }
  };

  // Handle cursor position changes (not used for closing autocomplete)
  const handleSelect = (): void => {
    // Selection changes from typing are handled elsewhere
  };

  const loadSavedQueries = async (): Promise<void> => {
    setLoadingQueries(true);
    try {
      const queries = await getSavedQueries(databaseId);
      setSavedQueries(queries);
    } catch {
      setError('Failed to load saved queries');
    } finally {
      setLoadingQueries(false);
    }
  };

  const handleSaveQuery = async (): Promise<void> => {
    if (!queryName.trim() || !query.trim()) return;

    setSavingQuery(true);
    setError(null);
    try {
      await createSavedQuery(
        queryName.trim(),
        query,
        queryDescription.trim() || undefined,
        databaseId
      );
      
      setQueryName('');
      setQueryDescription('');
      setShowSaveDialog(false);
      alert('Query saved successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save query');
    } finally {
      setSavingQuery(false);
    }
  };

  const handleShowSavedQueries = async (): Promise<void> => {
    await loadSavedQueries();
    setShowSavedQueries(true);
  };

  const handleLoadSavedQuery = (savedQuery: SavedQuery): void => {
    setQuery(savedQuery.query);
    setShowSavedQueries(false);
    setShowAutocomplete(false);
  };

  const handleDeleteSavedQuery = async (id: number): Promise<void> => {
    try {
      await deleteSavedQuery(id);
      await loadSavedQueries();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete query');
    }
  };

  const handleExportCSV = (): void => {
    if (!result || result.rows.length === 0) return;

    try {
      // Create CSV content
      const csvRows = [];
      
      // Add headers
      csvRows.push(result.columns.map(col => `"${col}"`).join(','));
      
      // Add data rows
      for (const row of result.rows) {
        const values = row.map(cell => {
          if (cell === null) return 'NULL';
          if (cell === undefined) return '';
          const str = typeof cell === 'object' ? JSON.stringify(cell) : String(cell as string | number | boolean);
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
      link.download = `query_results_${String(Date.now())}.csv`;
      
      document.body.appendChild(link);
      link.click();
      
      // Clean up after a small delay
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      alert('Failed to export CSV: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Query Console</h3>
          <p className="text-base text-muted-foreground">
            <span className="font-medium">Database:</span> {databaseName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab buttons */}
          <div className="flex gap-1 mr-2">
            <Button
              variant={activeTab === 'editor' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('editor')}
            >
              <Code className="h-4 w-4 mr-2" />
              SQL Editor
            </Button>
            <Button
              variant={activeTab === 'drizzle' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('drizzle')}
            >
              <Database className="h-4 w-4 mr-2" />
              Drizzle
            </Button>
            <Button
              variant={activeTab === 'builder' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('builder')}
            >
              <Wand2 className="h-4 w-4 mr-2" />
              Query Builder
            </Button>
            <Button
              variant={activeTab === 'compare' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('compare')}
            >
              <ArrowLeftRight className="h-4 w-4 mr-2" />
              SQL Diff
            </Button>
          </div>
          
          {activeTab === 'editor' && (
            <>
              <div className="flex items-center gap-2">
                <Label htmlFor="quick-queries-select" className="sr-only">
                  Quick Queries
                </Label>
                <Select
                  value=""
                  onValueChange={(templateId) => {
                    const template = sqlTemplates.find(t => t.id === templateId);
                    if (template) {
                      setQuery(template.query);
                      setShowAutocomplete(false);
                    }
                  }}
                >
                  <SelectTrigger id="quick-queries-select" className="w-[180px] h-9">
                    <FileCode className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Quick Queries" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {sqlTemplateGroups.map((group, groupIndex) => (
                      <SelectGroup key={group.id} className={groupIndex % 2 === 1 ? 'bg-muted/50' : ''}>
                        <SelectLabel className="text-xs font-semibold text-primary">
                          {group.label}
                        </SelectLabel>
                        {group.templates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            <div className="flex flex-col">
                              <span>{template.name}</span>
                              <span className="text-xs text-muted-foreground">{template.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" onClick={() => void handleShowSavedQueries()}>
                <History className="h-4 w-4 mr-2" />
                Saved Queries
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowSaveDialog(true)}>
                <Save className="h-4 w-4 mr-2" />
                Save Query
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Query Builder Tab */}
      {activeTab === 'builder' && (
        <QueryBuilder 
          databaseId={databaseId} 
          databaseName={databaseName}
          onSendToEditor={handleSendToEditor}
        />
      )}

      {/* Compare Tab */}
      {activeTab === 'compare' && (
        <DiffEditor
          currentQuery={query}
          savedQueries={savedQueries}
          databaseName={databaseName}
          onLoadToEditor={handleSendToEditor}
        />
      )}

      {/* Drizzle Tab */}
      {activeTab === 'drizzle' && (
        <DrizzleConsole
          databaseId={databaseId}
          databaseName={databaseName}
          onSchemaChange={onSchemaChange}
        />
      )}

      {/* SQL Editor Tab */}
      {activeTab === 'editor' && (
      <>
      {/* Query Editor */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery('');
                  setError(null);
                  setResult(null);
                  setShowAutocomplete(false);
                }}
                disabled={!query.trim()}
                title="Clear query"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Clear
              </Button>
              {query.trim() && (
                <span className={`text-xs flex items-center gap-1 ${
                  validation.isValid ? 'text-green-600 dark:text-green-400' : 'text-destructive'
                }`}>
                  {validation.isValid ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" />
                      Valid SQL
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3 w-3" />
                      {validation.error}
                    </>
                  )}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  try {
                    const formatted = formatSql(query, { language: 'sqlite' });
                    setQuery(formatted);
                  } catch {
                    // If formatting fails, leave query unchanged
                  }
                }}
                disabled={!query.trim()}
                title="Format SQL query"
              >
                <Wand2 className="h-4 w-4 mr-1" />
                Format
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(query);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                disabled={!query.trim()}
                title="Copy query to clipboard"
              >
                <Copy className="h-4 w-4 mr-1" />
                {copied ? 'Copied!' : 'Copy'}
              </Button>
              <Button
                size="sm"
                onClick={() => void handleExecute()}
                disabled={executing || !query.trim()}
              >
                {executing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Execute (Ctrl+Enter)
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div ref={containerRef} className="relative">
            <SqlEditor
              textareaRef={textareaRef}
              id="sql-query-input"
              name="sql-query"
              value={query}
              onChange={handleEditorChange}
              onKeyDown={handleKeyDown}
              onSelect={handleSelect}
              onClick={handleTextareaClick}
              placeholder={autocompleteEnabled ? "Enter your SQL query here... (type to see suggestions)" : "Enter your SQL query here..."}
              hasError={query.trim().length > 0 && !validation.isValid}
              errorPosition={!validation.isValid ? validation.errorPosition : undefined}
              ariaLabel="SQL Query Input"
              ariaAutoComplete="list"
              ariaControls={showAutocomplete ? 'sql-autocomplete-popup' : undefined}
              ariaExpanded={showAutocomplete}
            />
            <AutocompletePopup
              suggestions={suggestions}
              selectedIndex={selectedIndex}
              position={popupPosition}
              visible={showAutocomplete}
              onSelect={acceptSuggestion}
              onSelectionChange={setSelectedIndex}
            />
          </div>
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-6">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="skip-validation"
                  checked={skipValidation}
                  onCheckedChange={(checked) => setSkipValidation(checked === true)}
                />
                <Label
                  htmlFor="skip-validation"
                  className="text-sm font-normal cursor-pointer text-muted-foreground"
                >
                  Allow destructive queries (DROP, DELETE, TRUNCATE)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="autocomplete-enabled"
                  checked={autocompleteEnabled}
                  onCheckedChange={(checked) => setAutocompleteEnabled(checked === true)}
                />
                <Label
                  htmlFor="autocomplete-enabled"
                  className="text-sm font-normal cursor-pointer text-muted-foreground"
                >
                  Enable SQL suggestions
                </Label>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {autocompleteEnabled ? 'Tab to accept suggestion • ' : ''}Ctrl+Enter to execute
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Error Message */}
      <ErrorMessage error={error} variant="card" className="font-mono" />

      {/* Results */}
      {result && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                Results ({result.rows.length} {result.rows.length === 1 ? 'row' : 'rows'})
              </CardTitle>
              <div className="flex items-center gap-4">
                <span className="text-xs text-muted-foreground">
                  Executed in {result.executionTime.toFixed(2)}ms
                </span>
                {result.servedByRegion && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1" title={result.servedByPrimary ? 'Served by primary database' : 'Served by read replica'}>
                    {result.servedByPrimary ? (
                      <Server className="h-3 w-3" />
                    ) : (
                      <Globe className="h-3 w-3 text-blue-500" />
                    )}
                    {result.servedByRegion}
                    {!result.servedByPrimary && <span className="text-blue-500">(replica)</span>}
                  </span>
                )}
                {result.rows.length > 0 && (
                  <Button variant="outline" size="sm" onClick={handleExportCSV}>
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {result.rows.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {result.rowsAffected !== undefined
                  ? `Query executed successfully. ${String(result.rowsAffected)} row(s) affected.`
                  : 'Query returned no results'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      {result.columns.map((col, index) => (
                        <th
                          key={index}
                          className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="hover:bg-muted/50">
                        {row.map((cell, cellIndex) => (
                          <td
                            key={cellIndex}
                            className="px-4 py-2 text-sm whitespace-nowrap"
                          >
                            <span
                              className={
                                cell === null
                                  ? 'italic text-muted-foreground'
                                  : ''
                              }
                            >
                              {formatValue(cell)}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      </>
      )}

      {/* Save Query Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Query</DialogTitle>
            <DialogDescription>Give your query a name to save it for later use.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="query-name">Query Name</Label>
              <Input
                id="query-name"
                name="query-name"
                placeholder="My saved query"
                value={queryName}
                onChange={(e) => setQueryName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="query-description">Description (Optional)</Label>
              <Input
                id="query-description"
                name="query-description"
                placeholder="What does this query do?"
                value={queryDescription}
                onChange={(e) => setQueryDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)} disabled={savingQuery}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveQuery()} disabled={!queryName.trim() || savingQuery}>
              {savingQuery ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Saved Queries Dialog */}
      <Dialog open={showSavedQueries} onOpenChange={setShowSavedQueries}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Saved Queries</DialogTitle>
            <DialogDescription>
              {savedQueries.length} saved {savedQueries.length === 1 ? 'query' : 'queries'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {loadingQueries ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">Loading saved queries...</p>
              </div>
            ) : savedQueries.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No saved queries yet</p>
            ) : (
              savedQueries.map(savedQuery => (
                <Card key={savedQuery.id} className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold">{savedQuery.name}</h4>
                        {savedQuery.description && (
                          <p className="text-sm text-muted-foreground mt-1">{savedQuery.description}</p>
                        )}
                        <pre className="text-xs font-mono mt-2 p-2 bg-background rounded overflow-x-auto">
                          {savedQuery.query}
                        </pre>
                        <p className="text-xs text-muted-foreground mt-2">
                          Saved {new Date(savedQuery.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleLoadSavedQuery(savedQuery)}
                        >
                          Load
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDeleteSavedQuery(savedQuery.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
