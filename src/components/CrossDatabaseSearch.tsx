import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  Search,
  Database,
  Table,
  X,
  Sparkles,
  Loader2,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ChevronUpIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, listFTS5Tables, searchFTS5 } from "@/services/api";
import type { FTS5TableInfo, FTS5SearchResult } from "@/services/fts5-types";
import { ErrorMessage } from "@/components/ui/error-message";

interface SearchResult {
  databaseId: string;
  databaseName: string;
  tableName: string;
  columnName: string;
  value: unknown;
  rowData: Record<string, unknown>;
  rowId: string; // Unique identifier for deduplication
}

interface CrossDatabaseSearchProps {
  databases: {
    uuid: string;
    name: string;
    num_tables?: number;
    created_at?: string;
    file_size?: number;
  }[];
  onNavigateToDatabase?: (
    databaseId: string,
    databaseName: string,
    initialTab?: string,
  ) => void;
}

interface SearchProgress {
  currentDatabase: string;
  currentTable: string;
  databasesSearched: number;
  totalDatabases: number;
  tablesSearched: number;
  resultsFound: number;
}

// Schema cache to avoid re-fetching unchanged schemas
const schemaCache = new Map<
  string,
  { columns: { name: string; type: string | null }[]; timestamp: number }
>();
const SCHEMA_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached schema or fetch fresh
 */
async function getCachedSchema(
  databaseId: string,
  tableName: string,
): Promise<{ name: string; type: string | null }[]> {
  const cacheKey = `${databaseId}:${tableName}`;
  const cached = schemaCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < SCHEMA_CACHE_TTL) {
    return cached.columns;
  }

  const schema = await api.getTableSchema(databaseId, tableName);
  schemaCache.set(cacheKey, { columns: schema, timestamp: Date.now() });
  return schema;
}

/**
 * Delay helper
 */
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Execute searches sequentially with rate limiting to avoid Cloudflare 429 errors
 * D1 API has strict rate limits - we process one at a time with delays
 */
async function executeSequentially<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  signal?: AbortSignal,
  delayBetweenMs = 300, // Default 300ms between calls
): Promise<R[]> {
  const results: R[] = [];
  let rateLimitDelay = 0;
  let consecutiveSuccesses = 0;

  for (let i = 0; i < items.length; i++) {
    if (signal?.aborted) break;

    const item = items[i];
    if (item === undefined) continue;

    // Apply rate limit backoff if needed
    if (rateLimitDelay > 0) {
      await delay(rateLimitDelay);
    } else if (i > 0) {
      // Normal delay between requests
      await delay(delayBetweenMs);
    }

    try {
      const result = await fn(item);
      results.push(result);
      consecutiveSuccesses++;

      // Gradually reduce rate limit delay after 3 consecutive successes
      if (rateLimitDelay > 0 && consecutiveSuccesses >= 3) {
        rateLimitDelay = Math.max(0, rateLimitDelay - 1000);
        consecutiveSuccesses = 0;
      }
    } catch (err) {
      // Check for rate limit error (429)
      const errMsg = err instanceof Error ? err.message : String(err);
      if (
        errMsg.includes("429") ||
        errMsg.toLowerCase().includes("rate limit")
      ) {
        // Aggressive exponential backoff: 2s, 4s, 8s, 16s, max 30s
        rateLimitDelay = Math.min(
          30000,
          Math.max(2000, (rateLimitDelay || 1000) * 2),
        );
        consecutiveSuccesses = 0;

        // Retry this item after waiting
        await delay(rateLimitDelay);
        try {
          const result = await fn(item);
          results.push(result);
        } catch {
          // Skip on second failure
        }
      }
    }
  }

  return results;
}

export function CrossDatabaseSearch({
  databases,
  onNavigateToDatabase,
}: CrossDatabaseSearchProps): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SearchProgress | null>(null);

  // Database selection state
  const [selectedDatabases, setSelectedDatabases] = useState<Set<string>>(
    new Set(),
  );
  const [showDatabaseSelector, setShowDatabaseSelector] = useState(true);
  const [databaseFilter, setDatabaseFilter] = useState("");
  const [copiedDbId, setCopiedDbId] = useState<string | null>(null);

  // Scroll to top state
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Scroll-to-top button visibility
  useEffect(() => {
    const handleScroll = (): void => {
      setShowScrollTop(window.scrollY > 300);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = useCallback((): void => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Abort controller for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Search mode state
  const [searchMode, setSearchMode] = useState<"all" | "fts5">("all");

  // FTS5 Search state
  const [fts5DatabaseId, setFts5DatabaseId] = useState<string>("");
  const [fts5Tables, setFts5Tables] = useState<FTS5TableInfo[]>([]);
  const [fts5TableName, setFts5TableName] = useState<string>("");
  const [fts5Query, setFts5Query] = useState("");
  const [fts5Results, setFts5Results] = useState<FTS5SearchResult[]>([]);
  const [fts5Searching, setFts5Searching] = useState(false);
  const [fts5Error, setFts5Error] = useState<string | null>(null);
  const [loadingFts5Tables, setLoadingFts5Tables] = useState(false);

  // Copy database ID helper
  const copyDatabaseId = useCallback(async (dbId: string) => {
    await navigator.clipboard.writeText(dbId);
    setCopiedDbId(dbId);
    setTimeout(() => setCopiedDbId(null), 2000);
  }, []);

  // Load FTS5 tables when database changes
  useEffect(() => {
    if (!fts5DatabaseId) {
      setFts5Tables([]);
      setFts5TableName("");
      return;
    }

    const loadTables = async (): Promise<void> => {
      setLoadingFts5Tables(true);
      try {
        const tables = await listFTS5Tables(fts5DatabaseId);
        setFts5Tables(tables);
        if (tables.length > 0 && tables[0]) {
          setFts5TableName(tables[0].name);
        }
      } catch {
        setFts5Tables([]);
      } finally {
        setLoadingFts5Tables(false);
      }
    };

    void loadTables();
  }, [fts5DatabaseId]);

  const handleFts5Search = useCallback(async () => {
    if (!fts5DatabaseId || !fts5TableName || !fts5Query.trim()) {
      setFts5Error("Please select a database, table, and enter a search query");
      return;
    }

    try {
      setFts5Searching(true);
      setFts5Error(null);
      setFts5Results([]);

      const searchResults = await searchFTS5(fts5DatabaseId, fts5TableName, {
        query: fts5Query,
        limit: 100,
      });

      setFts5Results(searchResults.results);

      if (searchResults.results.length === 0) {
        setFts5Error("No results found");
      }
    } catch (err) {
      setFts5Error(err instanceof Error ? err.message : "FTS5 search failed");
    } finally {
      setFts5Searching(false);
    }
  }, [fts5DatabaseId, fts5TableName, fts5Query]);

  const handleClearFts5 = useCallback(() => {
    setFts5Query("");
    setFts5Results([]);
    setFts5Error(null);
  }, []);

  // Get databases to search (filtered or all)
  const databasesToSearch = useMemo(() => {
    if (selectedDatabases.size === 0) return databases;
    return databases.filter((db) => selectedDatabases.has(db.uuid));
  }, [databases, selectedDatabases]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setError("Please enter a search query");
      return;
    }

    // Cancel any existing search
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      setSearching(true);
      setError(null);
      setResults([]);

      const searchResults: SearchResult[] = [];
      const seenRows = new Set<string>(); // For deduplication
      let databasesSearched = 0;
      let tablesSearched = 0;

      const totalDatabases = databasesToSearch.length;

      setProgress({
        currentDatabase: "",
        currentTable: "",
        databasesSearched: 0,
        totalDatabases,
        tablesSearched: 0,
        resultsFound: 0,
      });

      // Process databases sequentially with delays to avoid rate limits
      for (const db of databasesToSearch) {
        if (abortController.signal.aborted) break;

        // Add delay between databases to avoid rate limits (500ms)
        if (databasesSearched > 0) {
          await delay(500);
        }

        setProgress((prev) =>
          prev
            ? {
                ...prev,
                currentDatabase: db.name,
                currentTable: "Loading tables...",
                databasesSearched,
              }
            : null,
        );

        try {
          // Get all tables in the database
          const tables = await api.listTables(db.uuid);

          if (abortController.signal.aborted) continue;

          // Search tables with concurrency (3 tables at a time per database)
          const tableSearchTasks = tables.map((table) => async () => {
            if (abortController.signal.aborted) return;

            setProgress((prev) =>
              prev
                ? {
                    ...prev,
                    currentTable: table.name,
                    tablesSearched,
                  }
                : null,
            );

            try {
              // Get cached schema
              const schema = await getCachedSchema(db.uuid, table.name);

              // Build WHERE clause for text columns
              const textColumns = schema.filter((col) => {
                if (!col.type) return true;
                const typeUpper = col.type.toUpperCase();
                return (
                  typeUpper.includes("TEXT") ||
                  typeUpper.includes("VARCHAR") ||
                  typeUpper.includes("CHAR") ||
                  col.type === ""
                );
              });

              if (textColumns.length === 0) {
                tablesSearched++;
                return;
              }

              // Escape search query for SQL
              const escapedQuery = searchQuery
                .replace(/'/g, "''")
                .replace(/\\/g, "\\\\");

              // Create search query with OR conditions
              const whereConditions = textColumns
                .map((col) => `"${col.name}" LIKE '%${escapedQuery}%'`)
                .join(" OR ");

              // Use LIMIT to prevent overwhelming results
              const sql = `SELECT * FROM "${table.name}" WHERE ${whereConditions} LIMIT 50`;

              // Execute search
              const response = await api.executeQuery(db.uuid, sql);

              if (response.results.length > 0) {
                const rows = response.results;

                // Process results with deduplication
                rows.forEach((row: Record<string, unknown>) => {
                  // Create unique row identifier
                  const rowId = `${db.uuid}:${table.name}:${JSON.stringify(row)}`;

                  if (seenRows.has(rowId)) return;
                  seenRows.add(rowId);

                  // Find which columns matched
                  const matchedColumns = textColumns.filter((col) => {
                    const value = row[col.name];
                    if (value === null || value === undefined) return false;
                    let stringValue: string;
                    if (typeof value === "object") {
                      stringValue = JSON.stringify(value);
                    } else if (typeof value === "string") {
                      stringValue = value;
                    } else {
                      stringValue = String(value as string | number | boolean);
                    }
                    return stringValue
                      .toLowerCase()
                      .includes(searchQuery.toLowerCase());
                  });

                  // Add one result per row (showing first matched column)
                  const firstMatch = matchedColumns[0];
                  if (firstMatch) {
                    searchResults.push({
                      databaseId: db.uuid,
                      databaseName: db.name,
                      tableName: table.name,
                      columnName: matchedColumns.map((c) => c.name).join(", "),
                      value: row[firstMatch.name],
                      rowData: row,
                      rowId,
                    });

                    // Update results in real-time
                    setResults([...searchResults]);
                    setProgress((prev) =>
                      prev
                        ? {
                            ...prev,
                            resultsFound: searchResults.length,
                          }
                        : null,
                    );
                  }
                });
              }

              tablesSearched++;
            } catch {
              tablesSearched++;
            }
          });

          // Execute table searches sequentially with 300ms delay between each
          await executeSequentially(
            tableSearchTasks,
            (fn) => fn(),
            abortController.signal,
            300, // 300ms delay between requests
          );
        } catch {
          // Continue to next database
        }

        databasesSearched++;
        setProgress((prev) =>
          prev
            ? {
                ...prev,
                databasesSearched,
              }
            : null,
        );
      }

      if (!abortController.signal.aborted) {
        setResults(searchResults);

        if (searchResults.length === 0) {
          setError("No results found");
        }
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        setError(err instanceof Error ? err.message : "Search failed");
      }
    } finally {
      if (!abortController.signal.aborted) {
        setSearching(false);
        setProgress(null);
      }
    }
  }, [searchQuery, databasesToSearch]);

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setSearching(false);
    setProgress(null);
  }, []);

  const handleClear = useCallback(() => {
    handleCancel();
    setSearchQuery("");
    setResults([]);
    setError(null);
  }, [handleCancel]);

  const toggleDatabaseSelection = useCallback((uuid: string) => {
    setSelectedDatabases((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  }, []);

  // Filter databases by search term
  const filteredDatabases = useMemo(() => {
    if (!databaseFilter.trim()) return databases;
    const filter = databaseFilter.toLowerCase();
    return databases.filter(
      (db) =>
        db.name.toLowerCase().includes(filter) ||
        db.uuid.toLowerCase().includes(filter),
    );
  }, [databases, databaseFilter]);

  const selectAllFiltered = useCallback(() => {
    setSelectedDatabases((prev) => {
      const next = new Set(prev);
      for (const db of filteredDatabases) {
        next.add(db.uuid);
      }
      return next;
    });
  }, [filteredDatabases]);

  const selectNoneFiltered = useCallback(() => {
    setSelectedDatabases((prev) => {
      const next = new Set(prev);
      for (const db of filteredDatabases) {
        next.delete(db.uuid);
      }
      return next;
    });
  }, [filteredDatabases]);

  const formatValue = (value: unknown): string => {
    if (value === null) return "NULL";
    if (value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean")
      return String(value);
    return JSON.stringify(value);
  };

  const progressPercent = progress
    ? Math.round((progress.databasesSearched / progress.totalDatabases) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Search</h2>
          <p className="text-sm text-muted-foreground">
            Search across databases and FTS5 indexes
          </p>
        </div>
      </div>

      {/* Mode Selector */}
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={searchMode === "all" ? "default" : "ghost"}
          onClick={() => setSearchMode("all")}
          className="gap-2"
        >
          <Database className="h-4 w-4" />
          Database Search
        </Button>
        <Button
          variant={searchMode === "fts5" ? "default" : "ghost"}
          onClick={() => setSearchMode("fts5")}
          className={
            searchMode === "fts5"
              ? "bg-purple-600 hover:bg-purple-700 gap-2"
              : "gap-2"
          }
        >
          <Sparkles className="h-4 w-4" />
          FTS5 Full-Text
        </Button>
      </div>

      {/* All Databases Search */}
      {searchMode === "all" && (
        <>
          {/* Filter databases input - at top */}
          <div className="flex gap-2 items-center flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Database className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="database-filter"
                name="database-filter"
                placeholder="Filter databases by name or ID..."
                value={databaseFilter}
                onChange={(e) => setDatabaseFilter(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={selectAllFiltered}>
                Select {databaseFilter ? "Filtered" : "All"}
              </Button>
              <Button variant="outline" size="sm" onClick={selectNoneFiltered}>
                Clear {databaseFilter ? "Filtered" : "All"}
              </Button>
            </div>
          </div>

          {/* Search Input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="cross-database-search"
                name="search"
                placeholder="Search for text across selected databases..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !searching) {
                    void handleSearch();
                  }
                }}
                className="pl-10"
                disabled={searching}
              />
            </div>

            {searching ? (
              <Button variant="destructive" onClick={handleCancel}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            ) : (
              <Button
                onClick={() => void handleSearch()}
                disabled={searching || databasesToSearch.length === 0}
              >
                Search
              </Button>
            )}
          </div>

          {/* Database Selector */}
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-4">
                {/* Selector Header */}
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setShowDatabaseSelector(!showDatabaseSelector)}
                >
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    <span className="font-medium">
                      {selectedDatabases.size === 0
                        ? `All ${databases.length} Databases`
                        : `${selectedDatabases.size} of ${databases.length} Databases Selected`}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm">
                    {showDatabaseSelector ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {/* Selector Content */}
                {showDatabaseSelector && (
                  <>
                    {/* Database List */}
                    <div className="border rounded-lg overflow-hidden">
                      {/* Header Row */}
                      <div className="grid grid-cols-[auto_1fr_100px_80px_80px_70px] gap-2 px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
                        <div className="w-5"></div>
                        <div>Name</div>
                        <div>ID</div>
                        <div className="text-right">Size</div>
                        <div className="text-right">Created</div>
                        <div className="text-right">Tables</div>
                      </div>

                      {/* Database Rows */}
                      <div className="max-h-64 overflow-y-auto divide-y">
                        {filteredDatabases.map((db) => {
                          // Format file size
                          const formatSize = (bytes?: number): string => {
                            if (bytes === undefined || bytes === null)
                              return "—";
                            if (bytes < 1024) return `${bytes} B`;
                            if (bytes < 1024 * 1024)
                              return `${(bytes / 1024).toFixed(1)} KB`;
                            return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
                          };
                          // Format date
                          const formatDate = (dateStr?: string): string => {
                            if (!dateStr) return "—";
                            const date = new Date(dateStr);
                            return date.toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            });
                          };
                          return (
                            <div
                              key={db.uuid}
                              className={`grid grid-cols-[auto_1fr_100px_80px_80px_70px] gap-2 px-3 py-2 items-center hover:bg-muted/30 transition-colors text-sm ${
                                selectedDatabases.has(db.uuid)
                                  ? "bg-primary/5"
                                  : ""
                              }`}
                            >
                              <Checkbox
                                id={`db-sel-${db.uuid}`}
                                checked={selectedDatabases.has(db.uuid)}
                                onCheckedChange={() =>
                                  toggleDatabaseSelection(db.uuid)
                                }
                              />
                              <Label
                                htmlFor={`db-sel-${db.uuid}`}
                                className="font-medium truncate cursor-pointer"
                              >
                                {db.name}
                              </Label>
                              <button
                                onClick={() => void copyDatabaseId(db.uuid)}
                                className="text-xs font-mono text-muted-foreground truncate hover:text-foreground flex items-center gap-1 text-left"
                                title={db.uuid}
                              >
                                {copiedDbId === db.uuid ? (
                                  <span className="text-green-500 text-xs">
                                    Copied!
                                  </span>
                                ) : (
                                  <span className="truncate">
                                    {db.uuid.slice(0, 8)}...
                                  </span>
                                )}
                              </button>
                              <div className="text-right text-xs text-muted-foreground">
                                {formatSize(db.file_size)}
                              </div>
                              <div
                                className="text-right text-xs text-muted-foreground"
                                title={db.created_at}
                              >
                                {formatDate(db.created_at)}
                              </div>
                              <div className="text-right text-xs">
                                {db.num_tables !== undefined ? (
                                  <span className="text-muted-foreground">
                                    {db.num_tables}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/50">
                                    —
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {filteredDatabases.length === 0 && (
                          <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                            No databases match your filter
                          </div>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {selectedDatabases.size === 0
                        ? "All databases will be searched. Select specific databases to reduce search time."
                        : `${selectedDatabases.size} database${selectedDatabases.size !== 1 ? "s" : ""} will be searched.`}
                    </p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Progress Indicator */}
          {progress && (
            <div className="mb-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Searching {progress.currentDatabase}
                  {progress.currentTable && ` / ${progress.currentTable}`}
                </span>
                <span className="text-muted-foreground">
                  {progress.databasesSearched} / {progress.totalDatabases}{" "}
                  databases
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{progress.tablesSearched} tables searched</span>
                <span>{progress.resultsFound} results found</span>
              </div>
            </div>
          )}

          {/* Error Message */}
          {!searching && (
            <ErrorMessage error={error} variant="inline" className="mb-4" />
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">
                  Found {results.length}{" "}
                  {results.length === 1 ? "result" : "results"}
                  {searching && " so far..."}
                </h4>
                <Button variant="outline" size="sm" onClick={handleClear}>
                  <X className="h-4 w-4 mr-1" />
                  Clear Results
                </Button>
              </div>

              <div className="space-y-2 max-h-[calc(100vh-350px)] overflow-y-auto">
                {results.map((result) => (
                  <Card key={result.rowId} className="bg-muted/50">
                    <CardContent className="pt-4">
                      <div className="space-y-2">
                        {/* Database and Table Info */}
                        <div className="flex items-center gap-2 text-sm flex-wrap">
                          <Database className="h-4 w-4 text-primary flex-shrink-0" />
                          <span className="font-medium">
                            {result.databaseName}
                          </span>
                          <span className="text-muted-foreground">/</span>
                          <Table className="h-4 w-4 text-primary flex-shrink-0" />
                          <span className="font-medium">
                            {result.tableName}
                          </span>
                          <span className="text-muted-foreground">/</span>
                          <span className="text-muted-foreground">
                            {result.columnName}
                          </span>
                        </div>

                        {/* Matched Value */}
                        <div className="p-2 bg-background rounded border">
                          <p className="text-sm font-mono break-all">
                            {formatValue(result.value)}
                          </p>
                        </div>

                        {/* Full Row Data */}
                        <details className="text-sm">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            View full row
                          </summary>
                          <div className="mt-2 p-2 bg-background rounded border">
                            <pre className="text-xs overflow-x-auto">
                              {JSON.stringify(result.rowData, null, 2)}
                            </pre>
                          </div>
                        </details>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {results.length === 0 && !error && !searching && (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">
                Enter a search query to find data across all databases
              </p>
              {selectedDatabases.size > 0 && (
                <p className="mt-2 text-sm">
                  Filtering to {selectedDatabases.size} selected database
                  {selectedDatabases.size !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* FTS5 Search */}
      {searchMode === "fts5" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Use FTS5 full-text search for faster and more powerful searching
              with ranking and highlighting.
            </p>
            {onNavigateToDatabase && (
              <Button
                variant="link"
                size="sm"
                className="text-purple-600 dark:text-purple-400 gap-1"
                onClick={() => {
                  if (fts5DatabaseId) {
                    const db = databases.find((d) => d.uuid === fts5DatabaseId);
                    if (db) {
                      onNavigateToDatabase(db.uuid, db.name, "fts5");
                    }
                  } else if (databases.length > 0 && databases[0]) {
                    // Navigate to first database's FTS5 tab if none selected
                    onNavigateToDatabase(
                      databases[0].uuid,
                      databases[0].name,
                      "fts5",
                    );
                  }
                }}
                disabled={databases.length === 0}
              >
                <Sparkles className="h-3 w-3" />
                {fts5DatabaseId
                  ? `Manage FTS5 in ${databases.find((d) => d.uuid === fts5DatabaseId)?.name ?? "database"}`
                  : "Manage FTS5 Tables"}
                <ArrowRight className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Database and Table Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fts5-database">Database</Label>
              <Select value={fts5DatabaseId} onValueChange={setFts5DatabaseId}>
                <SelectTrigger id="fts5-database">
                  <SelectValue placeholder="Select database..." />
                </SelectTrigger>
                <SelectContent>
                  {databases.map((db) => (
                    <SelectItem key={db.uuid} value={db.uuid}>
                      {db.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fts5-table">FTS5 Table</Label>
              <Select
                value={fts5TableName}
                onValueChange={setFts5TableName}
                disabled={!fts5DatabaseId || loadingFts5Tables}
              >
                <SelectTrigger id="fts5-table">
                  {loadingFts5Tables ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    <SelectValue
                      placeholder={
                        fts5Tables.length === 0
                          ? "No FTS5 tables"
                          : "Select table..."
                      }
                    />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {fts5Tables.map((table) => (
                    <SelectItem key={table.name} value={table.name}>
                      <span className="flex items-center gap-2">
                        <Sparkles className="h-3 w-3 text-purple-500" />
                        {table.name}
                        <span className="text-xs text-muted-foreground">
                          ({table.columns.join(", ")})
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Search Input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-500" />
              <Input
                id="fts5-search-query"
                name="fts5-search-query"
                placeholder='FTS5 query (e.g., "hello world" or hello AND world)'
                value={fts5Query}
                onChange={(e) => setFts5Query(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !fts5Searching) {
                    void handleFts5Search();
                  }
                }}
                className="pl-10"
                disabled={fts5Searching || !fts5TableName}
              />
            </div>
            {fts5Searching ? (
              <Button
                variant="destructive"
                onClick={() => setFts5Searching(false)}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            ) : (
              <Button
                onClick={() => void handleFts5Search()}
                disabled={fts5Searching || !fts5TableName}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Search
              </Button>
            )}
            {fts5Results.length > 0 && (
              <Button variant="outline" onClick={handleClearFts5}>
                Clear
              </Button>
            )}
          </div>

          {/* FTS5 Error */}
          {!fts5Searching && (
            <ErrorMessage error={fts5Error} variant="inline" />
          )}

          {/* FTS5 Results */}
          {fts5Results.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold">
                Found {fts5Results.length}{" "}
                {fts5Results.length === 1 ? "result" : "results"}
              </h4>

              <div className="space-y-2 max-h-[calc(100vh-450px)] overflow-y-auto">
                {fts5Results.map((result, idx) => (
                  <Card
                    key={idx}
                    className="bg-purple-50/50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-900"
                  >
                    <CardContent className="pt-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Sparkles className="h-4 w-4 text-purple-500" />
                          <span className="font-medium text-purple-700 dark:text-purple-300">
                            {databases.find((d) => d.uuid === fts5DatabaseId)
                              ?.name ?? "Unknown"}
                          </span>
                          <span className="text-muted-foreground">/</span>
                          <span className="font-medium">{fts5TableName}</span>
                        </div>
                        <div className="p-2 bg-background rounded border">
                          <pre className="text-sm font-mono whitespace-pre-wrap break-all">
                            {JSON.stringify(result, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* FTS5 Empty State */}
          {fts5Results.length === 0 && !fts5Error && !fts5Searching && (
            <div className="text-center py-12 text-muted-foreground">
              <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50 text-purple-500" />
              <p className="text-lg">
                Select a database and FTS5 table to search
              </p>
              <p className="mt-2 text-sm">
                FTS5 provides fast full-text search with ranking, prefix
                matching, and boolean operators
              </p>
              {fts5DatabaseId &&
                fts5Tables.length === 0 &&
                onNavigateToDatabase && (
                  <Button
                    variant="outline"
                    className="mt-4 gap-2 border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-900/30"
                    onClick={() => {
                      const db = databases.find(
                        (d) => d.uuid === fts5DatabaseId,
                      );
                      if (db) {
                        onNavigateToDatabase(db.uuid, db.name, "fts5");
                      }
                    }}
                  >
                    <Sparkles className="h-4 w-4" />
                    Create FTS5 Table in{" "}
                    {databases.find((d) => d.uuid === fts5DatabaseId)?.name ??
                      "this database"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
            </div>
          )}
        </div>
      )}

      {/* Scroll to Top Button */}
      {showScrollTop && (
        <Button
          variant="default"
          size="sm"
          onClick={scrollToTop}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 h-10 px-4 rounded-full shadow-xl bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
          aria-label="Scroll to top"
          title="Scroll to top"
        >
          <ChevronUpIcon className="h-5 w-5" />
          <span className="text-sm font-medium">Back to Top</span>
        </Button>
      )}
    </div>
  );
}
