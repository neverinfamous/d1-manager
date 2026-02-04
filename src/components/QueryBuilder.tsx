import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Plus,
  Trash2,
  Play,
  Save,
  History,
  Loader2,
  RotateCcw,
  Pencil,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listTables,
  getTableSchema,
  executeQuery,
  getSavedQueries,
  createSavedQuery,
  deleteSavedQuery,
  type TableInfo,
  type ColumnInfo,
  type SavedQuery as APISavedQuery,
} from "@/services/api";
import { SqlEditor } from "@/components/SqlEditor";
import { validateSql } from "@/lib/sqlValidator";
import { handleSqlKeydown } from "@/lib/sqlAutocomplete";
import { useSchemaContext } from "@/hooks/useSchemaContext";
import { parseContext, filterSuggestions } from "@/lib/sqlContextParser";
import { ALL_SQL_KEYWORDS } from "@/lib/sqlKeywords";
import { getCaretCoordinates } from "@/lib/caretPosition";
import {
  AutocompletePopup,
  type Suggestion,
} from "@/components/AutocompletePopup";

interface QueryBuilderProps {
  databaseId: string;
  databaseName: string;
  /** Optional callback to send generated SQL to the parent SQL Editor */
  onSendToEditor?: (sql: string) => void;
}

interface QueryCondition {
  id: string;
  column: string;
  operator: string;
  value: string;
}

const OPERATORS = [
  { value: "=", label: "Equals (=)" },
  { value: "!=", label: "Not Equals (!=)" },
  { value: ">", label: "Greater Than (>)" },
  { value: "<", label: "Less Than (<)" },
  { value: ">=", label: "Greater or Equal (>=)" },
  { value: "<=", label: "Less or Equal (<=)" },
  { value: "LIKE", label: "Like (LIKE)" },
  { value: "IN", label: "In (IN)" },
  { value: "IS NULL", label: "Is Null" },
  { value: "IS NOT NULL", label: "Is Not Null" },
];

export function QueryBuilder({
  databaseId,
  databaseName,
  onSendToEditor,
}: QueryBuilderProps): React.JSX.Element {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(["*"]);
  const [conditions, setConditions] = useState<QueryCondition[]>([]);
  const [orderBy, setOrderBy] = useState<string>("");
  const [orderDirection, setOrderDirection] = useState<"ASC" | "DESC">("ASC");
  const [limit, setLimit] = useState<string>("100");
  const [generatedSQL, setGeneratedSQL] = useState<string>("");
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [resultColumns, setResultColumns] = useState<string[]>([]);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [queryName, setQueryName] = useState("");
  const [queryDescription, setQueryDescription] = useState("");
  const [savedQueries, setSavedQueries] = useState<APISavedQuery[]>([]);
  const [showSavedQueries, setShowSavedQueries] = useState(false);
  const [savingQuery, setSavingQuery] = useState(false);
  const [loadingQueries, setLoadingQueries] = useState(false);

  // Track manual SQL edits
  const [editedSQL, setEditedSQL] = useState<string>("");
  const [isManuallyEdited, setIsManuallyEdited] = useState(false);
  const lastGeneratedSQL = useRef<string>("");

  // Refs for editor
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  // Schema context for table/column suggestions
  const schema = useSchemaContext(databaseId);

  // Real-time SQL validation
  const validation = useMemo(() => validateSql(editedSQL), [editedSQL]);

  const loadTables = useCallback(async (): Promise<void> => {
    try {
      const tableList = await listTables(databaseId);
      // Include both regular tables and virtual tables (FTS5, etc.)
      // Exclude shadow tables which are internal FTS5 implementation tables
      setTables(
        tableList.filter((t) => t.type === "table" || t.type === "virtual"),
      );
    } catch {
      // Silently ignore failures
    }
  }, [databaseId]);

  const loadSavedQueries = useCallback(async (): Promise<void> => {
    setLoadingQueries(true);
    try {
      // First try to load from API
      const queries = await getSavedQueries(databaseId);
      setSavedQueries(queries);

      // Check if we have localStorage data to migrate
      const localStorageKey = `d1-saved-queries-${databaseId}`;
      const stored = localStorage.getItem(localStorageKey);
      if (stored) {
        try {
          const localQueries = JSON.parse(stored) as {
            id: string;
            name: string;
            query: string;
            createdAt: string;
          }[];

          // Migrate any localStorage queries that don't exist in the database
          const existingNames = new Set(queries.map((q) => q.name));
          for (const localQuery of localQueries) {
            if (!existingNames.has(localQuery.name)) {
              await createSavedQuery(
                localQuery.name,
                localQuery.query,
                "Migrated from local storage",
                databaseId,
              );
            }
          }

          // Reload queries after migration and clear localStorage
          const updatedQueries = await getSavedQueries(databaseId);
          setSavedQueries(updatedQueries);
          localStorage.removeItem(localStorageKey);
        } catch {
          // Silently ignore migration failures
        }
      }
    } catch {
      setError("Failed to load saved queries");
    } finally {
      setLoadingQueries(false);
    }
  }, [databaseId]);

  const loadTableSchema = useCallback(async (): Promise<void> => {
    try {
      const schemaData = await getTableSchema(databaseId, selectedTable);
      setColumns(schemaData);
      setSelectedColumns(["*"]);
      setConditions([]);
    } catch {
      // Silently ignore failures
    }
  }, [databaseId, selectedTable]);

  const generateSQL = useCallback((): void => {
    if (!selectedTable) {
      setGeneratedSQL("");
      return;
    }

    let sql = "SELECT ";
    sql += selectedColumns.join(", ");
    sql += ` FROM ${selectedTable}`;

    if (conditions.length > 0) {
      const whereClauses = conditions
        .filter((c) => c.column && c.operator)
        .map((c) => {
          if (c.operator === "IS NULL" || c.operator === "IS NOT NULL") {
            return `${c.column} ${c.operator}`;
          }
          if (c.operator === "IN") {
            return `${c.column} IN (${c.value})`;
          }
          return `${c.column} ${c.operator} '${c.value.replace(/'/g, "''")}'`;
        });

      if (whereClauses.length > 0) {
        sql += " WHERE " + whereClauses.join(" AND ");
      }
    }

    if (orderBy) {
      sql += ` ORDER BY ${orderBy} ${orderDirection}`;
    }

    if (limit) {
      sql += ` LIMIT ${limit}`;
    }

    sql += ";";
    setGeneratedSQL(sql);
  }, [
    selectedTable,
    selectedColumns,
    conditions,
    orderBy,
    orderDirection,
    limit,
  ]);

  useEffect(() => {
    void loadTables();
    void loadSavedQueries();
  }, [loadTables, loadSavedQueries]);

  useEffect(() => {
    if (selectedTable) {
      void loadTableSchema();
    }
  }, [selectedTable, loadTableSchema]);

  useEffect(() => {
    generateSQL();
  }, [generateSQL]);

  // Sync editedSQL with generatedSQL when it changes (unless manually edited)
  useEffect(() => {
    if (generatedSQL !== lastGeneratedSQL.current) {
      lastGeneratedSQL.current = generatedSQL;
      if (!isManuallyEdited) {
        setEditedSQL(generatedSQL);
      }
    }
  }, [generatedSQL, isManuallyEdited]);

  const addCondition = (): void => {
    setConditions([
      ...conditions,
      { id: String(Date.now()), column: "", operator: "=", value: "" },
    ]);
  };

  const removeCondition = (id: string): void => {
    setConditions(conditions.filter((c) => c.id !== id));
  };

  const updateCondition = (
    id: string,
    field: keyof QueryCondition,
    value: string,
  ): void => {
    setConditions(
      conditions.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    );
  };

  const handleSQLChange = useCallback(
    (newSQL: string) => {
      setEditedSQL(newSQL);
      // Mark as manually edited if it differs from generated SQL
      if (newSQL !== generatedSQL) {
        setIsManuallyEdited(true);
      }
    },
    [generatedSQL],
  );

  const resetToGeneratedSQL = (): void => {
    setEditedSQL(generatedSQL);
    setIsManuallyEdited(false);
    setShowAutocomplete(false);
  };

  // Get the current SQL to execute/save (edited version takes precedence)
  const currentSQL = editedSQL || generatedSQL;

  // Update suggestions based on current context
  const updateSuggestions = useCallback(
    async (text: string, cursorPos: number) => {
      const context = parseContext(text, cursorPos);

      if (!context.currentWord && context.type === "keyword") {
        setSuggestions([]);
        setShowAutocomplete(false);
        return;
      }

      let items: Suggestion[] = [];

      if (context.type === "keyword") {
        items = ALL_SQL_KEYWORDS.filter((kw) =>
          kw.toUpperCase().startsWith(context.currentWord.toUpperCase()),
        )
          .slice(0, 20)
          .map((kw) => ({ text: kw, type: "keyword" as const }));
      } else if (context.type === "table") {
        items = filterSuggestions(schema.tables, context.currentWord)
          .slice(0, 20)
          .map((t) => ({ text: t, type: "table" as const }));
      } else if (context.type === "column") {
        let columns: string[] = [];

        if (context.dotTable) {
          // Specific table after dot notation
          columns = await schema.fetchColumnsForTable(context.dotTable);
        } else if (context.tableNames.length > 0) {
          // Columns from tables in query
          columns = await schema.getColumnsForTables(context.tableNames);
        }

        items = filterSuggestions(columns, context.currentWord)
          .slice(0, 20)
          .map((c) => ({ text: c, type: "column" as const }));

        // Also add table names if no dot notation
        if (!context.dotTable && context.currentWord.length > 0) {
          const tableMatches = filterSuggestions(
            schema.tables,
            context.currentWord,
            3,
          );
          const tableSuggestions = tableMatches.map((t) => ({
            text: t,
            type: "table" as const,
          }));
          items = [...items, ...tableSuggestions].slice(0, 10);
        }
      }

      // Show popup if we have suggestions and user has typed something or used dot notation
      const shouldShow =
        items.length > 0 &&
        (context.currentWord.length > 0 || context.dotTable !== null);

      setSuggestions(items);
      setSelectedIndex(0);
      setShowAutocomplete(shouldShow);
    },
    [schema],
  );

  // Handle accepting a suggestion
  const acceptSuggestion = useCallback(
    (suggestion: Suggestion) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const cursorPos = textarea.selectionStart;
      const text = editedSQL;
      const context = parseContext(text, cursorPos);

      const beforeWord = text.slice(0, cursorPos - context.currentWord.length);
      const afterCursor = text.slice(cursorPos);

      const newText = beforeWord + suggestion.text + afterCursor;
      handleSQLChange(newText);

      setShowAutocomplete(false);

      const newCursorPos = beforeWord.length + suggestion.text.length;
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    },
    [editedSQL, handleSQLChange],
  );

  // Handle keydown for autocomplete navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Handle autocomplete navigation when popup is visible
      if (showAutocomplete && suggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % suggestions.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex(
            (prev) => (prev - 1 + suggestions.length) % suggestions.length,
          );
          return;
        }
        if (e.key === "Tab" || e.key === "Enter") {
          if (suggestions[selectedIndex]) {
            e.preventDefault();
            acceptSuggestion(suggestions[selectedIndex]);
            return;
          }
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setShowAutocomplete(false);
          return;
        }
      }

      // Handle SQL autocomplete features (auto-pairing, indentation, etc.)
      const textarea = e.currentTarget;
      const result = handleSqlKeydown(
        e.key,
        textarea.value,
        textarea.selectionStart,
        textarea.selectionEnd,
        e.shiftKey,
      );

      if (result.handled && result.newValue !== undefined) {
        e.preventDefault();
        handleSQLChange(result.newValue);
        if (result.newCursorPos !== undefined) {
          const cursorPos = result.newCursorPos;
          setTimeout(() => {
            textarea.setSelectionRange(cursorPos, cursorPos);
          }, 0);
        }
      }
    },
    [
      showAutocomplete,
      suggestions,
      selectedIndex,
      acceptSuggestion,
      handleSQLChange,
    ],
  );

  // Handle text change with autocomplete update
  const handleEditorChange = useCallback(
    (newValue: string) => {
      handleSQLChange(newValue);

      const textarea = textareaRef.current;
      if (textarea) {
        setTimeout(() => {
          void updateSuggestions(newValue, textarea.selectionStart);

          // Update popup position
          if (containerRef.current) {
            const coords = getCaretCoordinates(
              textarea,
              textarea.selectionStart,
            );
            const containerRect = containerRef.current.getBoundingClientRect();
            const textareaRect = textarea.getBoundingClientRect();

            setPopupPosition({
              top: textareaRect.top - containerRect.top + coords.top + 20,
              left: textareaRect.left - containerRect.left + coords.left,
            });
          }
        }, 0);
      }
    },
    [updateSuggestions, handleSQLChange],
  );

  // Handle selection change (for autocomplete positioning)
  const handleSelect = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea && containerRef.current) {
      void updateSuggestions(editedSQL, textarea.selectionStart);

      const coords = getCaretCoordinates(textarea, textarea.selectionStart);
      const containerRect = containerRef.current.getBoundingClientRect();
      const textareaRect = textarea.getBoundingClientRect();

      setPopupPosition({
        top: textareaRect.top - containerRect.top + coords.top + 20,
        left: textareaRect.left - containerRect.left + coords.left,
      });
    }
  }, [editedSQL, updateSuggestions]);

  // Close autocomplete when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowAutocomplete(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const executeGeneratedQuery = async (): Promise<void> => {
    if (!currentSQL) return;

    try {
      setExecuting(true);
      setError(null);
      const response = await executeQuery(databaseId, currentSQL);

      if (response.results.length > 0) {
        const rows = response.results;
        setResults(rows);
        const firstRow = rows[0];
        if (rows.length > 0 && firstRow) {
          setResultColumns(Object.keys(firstRow));
        } else {
          setResultColumns([]);
        }
      } else {
        setResults([]);
        setResultColumns([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query execution failed");
    } finally {
      setExecuting(false);
    }
  };

  const saveQuery = async (): Promise<void> => {
    if (!queryName.trim() || !currentSQL) return;

    setSavingQuery(true);
    setError(null);
    try {
      await createSavedQuery(
        queryName.trim(),
        currentSQL,
        queryDescription.trim() || undefined,
        databaseId,
      );

      // Reload saved queries
      await loadSavedQueries();

      setQueryName("");
      setQueryDescription("");
      setShowSaveDialog(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save query");
    } finally {
      setSavingQuery(false);
    }
  };

  const loadSavedQuery = (query: APISavedQuery): void => {
    setGeneratedSQL(query.query);
    setShowSavedQueries(false);
    // Optionally parse and populate the builder fields
  };

  const handleDeleteSavedQuery = async (id: number): Promise<void> => {
    try {
      await deleteSavedQuery(id);
      // Reload saved queries
      await loadSavedQueries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete query");
    }
  };

  const formatValue = (value: unknown): string => {
    if (value === null) return "NULL";
    if (value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value as string | number | boolean);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Visual Query Builder</h3>
          <p className="text-sm text-muted-foreground">{databaseName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSavedQueries(true)}
          >
            <History className="h-4 w-4 mr-2" />
            Saved Queries ({savedQueries.length})
          </Button>
        </div>
      </div>

      {/* Query Builder Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Build Your Query</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Table Selection */}
          <div className="space-y-2">
            <Label htmlFor="table-select">Select Table</Label>
            <select
              id="table-select"
              name="table-select"
              className="w-full h-10 px-3 rounded-md border border-input bg-background"
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
            >
              <option value="">Choose a table...</option>
              {tables.map((table) => (
                <option key={table.name} value={table.name}>
                  {table.name}
                </option>
              ))}
            </select>
          </div>

          {selectedTable && (
            <>
              {/* Column Selection */}
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium leading-none">
                  Select Columns
                </legend>
                <div className="flex flex-wrap gap-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="select-all-columns"
                      name="select-all-columns"
                      checked={selectedColumns.includes("*")}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedColumns(["*"]);
                        }
                      }}
                    />
                    <span className="text-sm">All columns (*)</span>
                  </label>
                  {columns.map((col) => (
                    <label key={col.name} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`select-col-${col.name}`}
                        name={`select-col-${col.name}`}
                        checked={
                          selectedColumns.includes(col.name) &&
                          !selectedColumns.includes("*")
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            const filtered = selectedColumns.filter(
                              (c) => c !== "*",
                            );
                            setSelectedColumns([...filtered, col.name]);
                          } else {
                            setSelectedColumns(
                              selectedColumns.filter((c) => c !== col.name),
                            );
                          }
                        }}
                        disabled={selectedColumns.includes("*")}
                      />
                      <span className="text-sm">{col.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* WHERE Conditions */}
              <fieldset className="space-y-2">
                <div className="flex items-center justify-between">
                  <legend className="text-sm font-medium leading-none">
                    WHERE Conditions
                  </legend>
                  <Button variant="outline" size="sm" onClick={addCondition}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Condition
                  </Button>
                </div>

                {conditions.length > 0 && (
                  <div className="space-y-2">
                    {conditions.map((condition, index) => (
                      <div
                        key={condition.id}
                        className="flex gap-2 items-start"
                      >
                        {index > 0 && (
                          <div className="text-sm font-semibold text-muted-foreground pt-2">
                            AND
                          </div>
                        )}
                        <label
                          htmlFor={`condition-col-${condition.id}`}
                          className="sr-only"
                        >
                          Column
                        </label>
                        <select
                          id={`condition-col-${condition.id}`}
                          name={`condition-col-${condition.id}`}
                          className="flex-1 h-10 px-3 rounded-md border border-input bg-background"
                          value={condition.column}
                          onChange={(e) =>
                            updateCondition(
                              condition.id,
                              "column",
                              e.target.value,
                            )
                          }
                        >
                          <option value="">Column...</option>
                          {columns.map((col) => (
                            <option key={col.name} value={col.name}>
                              {col.name}
                            </option>
                          ))}
                        </select>
                        <label
                          htmlFor={`condition-op-${condition.id}`}
                          className="sr-only"
                        >
                          Operator
                        </label>
                        <select
                          id={`condition-op-${condition.id}`}
                          name={`condition-op-${condition.id}`}
                          className="w-40 h-10 px-3 rounded-md border border-input bg-background"
                          value={condition.operator}
                          onChange={(e) =>
                            updateCondition(
                              condition.id,
                              "operator",
                              e.target.value,
                            )
                          }
                        >
                          {OPERATORS.map((op) => (
                            <option key={op.value} value={op.value}>
                              {op.label}
                            </option>
                          ))}
                        </select>
                        {!["IS NULL", "IS NOT NULL"].includes(
                          condition.operator,
                        ) && (
                          <>
                            <label
                              htmlFor={`condition-val-${condition.id}`}
                              className="sr-only"
                            >
                              Value
                            </label>
                            <Input
                              id={`condition-val-${condition.id}`}
                              name={`condition-val-${condition.id}`}
                              className="flex-1"
                              placeholder="Value..."
                              value={condition.value}
                              onChange={(e) =>
                                updateCondition(
                                  condition.id,
                                  "value",
                                  e.target.value,
                                )
                              }
                              autoComplete="off"
                            />
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeCondition(condition.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </fieldset>

              {/* ORDER BY and LIMIT */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="order-by-select">Order By</Label>
                  <select
                    id="order-by-select"
                    name="order-by-select"
                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                    value={orderBy}
                    onChange={(e) => setOrderBy(e.target.value)}
                  >
                    <option value="">None</option>
                    {columns.map((col) => (
                      <option key={col.name} value={col.name}>
                        {col.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="order-direction-select">Direction</Label>
                  <select
                    id="order-direction-select"
                    name="order-direction-select"
                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                    value={orderDirection}
                    onChange={(e) =>
                      setOrderDirection(e.target.value as "ASC" | "DESC")
                    }
                    disabled={!orderBy}
                  >
                    <option value="ASC">Ascending</option>
                    <option value="DESC">Descending</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="limit-input">Limit</Label>
                <Input
                  id="limit-input"
                  name="limit-input"
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  placeholder="100"
                  autoComplete="off"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Generated SQL */}
      {(generatedSQL || editedSQL) && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-base">
                  {isManuallyEdited ? "Custom SQL" : "Generated SQL"}
                </CardTitle>
                {isManuallyEdited && (
                  <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                    <Pencil className="h-3 w-3" />
                    Edited
                  </span>
                )}
                {editedSQL.trim() && (
                  <span
                    className={`text-xs flex items-center gap-1 ${
                      validation.isValid
                        ? "text-green-600 dark:text-green-400"
                        : "text-destructive"
                    }`}
                  >
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
              <div className="flex gap-2">
                {isManuallyEdited && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetToGeneratedSQL}
                    title="Reset to auto-generated SQL"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSaveDialog(true)}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save Query
                </Button>
                {onSendToEditor && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSendToEditor(editedSQL || generatedSQL)}
                    disabled={!editedSQL && !generatedSQL}
                  >
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Send to Editor
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => void executeGeneratedQuery()}
                  disabled={executing}
                >
                  {executing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Executing...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Execute
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div ref={containerRef} className="relative">
              <SqlEditor
                id="sql-editor-builder"
                name="sql-editor-builder"
                value={editedSQL}
                onChange={handleEditorChange}
                onKeyDown={handleKeyDown}
                onSelect={handleSelect}
                placeholder="SELECT * FROM table_name;"
                hasError={!validation.isValid}
                errorPosition={validation.errorPosition}
                textareaRef={textareaRef}
                ariaLabel="SQL Query Editor"
                ariaAutoComplete="list"
                ariaControls={
                  showAutocomplete ? "builder-autocomplete-popup" : undefined
                }
                ariaExpanded={showAutocomplete}
              />

              <AutocompletePopup
                suggestions={suggestions}
                selectedIndex={selectedIndex}
                position={popupPosition}
                onSelect={acceptSuggestion}
                visible={showAutocomplete}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {isManuallyEdited
                ? "You can edit the SQL directly. Click Reset to restore the auto-generated query."
                : "Tip: You can edit the SQL directly to customize your query."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive font-mono">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Results ({results.length} {results.length === 1 ? "row" : "rows"})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    {resultColumns.map((col, index) => (
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
                  {results.map((row, rowIndex) => (
                    <tr key={rowIndex} className="hover:bg-muted/50">
                      {resultColumns.map((col, cellIndex) => (
                        <td
                          key={cellIndex}
                          className="px-4 py-2 text-sm whitespace-nowrap"
                        >
                          <span
                            className={
                              row[col] === null
                                ? "italic text-muted-foreground"
                                : ""
                            }
                          >
                            {formatValue(row[col])}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save Query Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Query</DialogTitle>
            <DialogDescription>
              Give your query a name to save it for later use.
            </DialogDescription>
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
                autoComplete="off"
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
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSaveDialog(false)}
              disabled={savingQuery}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void saveQuery()}
              disabled={!queryName.trim() || !currentSQL || savingQuery}
            >
              {savingQuery ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
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
              {savedQueries.length} saved{" "}
              {savedQueries.length === 1 ? "query" : "queries"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {loadingQueries ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">
                  Loading saved queries...
                </p>
              </div>
            ) : savedQueries.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No saved queries yet
              </p>
            ) : (
              savedQueries.map((query) => (
                <Card key={query.id} className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold">{query.name}</h4>
                        {query.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {query.description}
                          </p>
                        )}
                        <pre className="text-xs font-mono mt-2 p-2 bg-background rounded overflow-x-auto">
                          {query.query}
                        </pre>
                        <p className="text-xs text-muted-foreground mt-2">
                          Saved {new Date(query.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => loadSavedQuery(query)}
                        >
                          Load
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDeleteSavedQuery(query.id)}
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
