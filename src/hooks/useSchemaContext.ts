import { useState, useEffect, useCallback, useRef } from "react";
import { listTables, getTableSchema, type ColumnInfo } from "@/services/api";

/**
 * Schema context for SQL autocomplete
 * Provides table and column information for the current database
 */
export interface SchemaContext {
  /** List of table names in the database */
  tables: string[];
  /** Map of table name to column names */
  columns: Map<string, string[]>;
  /** Whether schema is currently loading */
  loading: boolean;
  /** Error message if loading failed */
  error: string | null;
  /** Fetch columns for a specific table (lazy loading) */
  fetchColumnsForTable: (tableName: string) => Promise<string[]>;
  /** Get columns for tables, fetching if needed */
  getColumnsForTables: (tableNames: string[]) => Promise<string[]>;
}

/**
 * Hook to fetch and cache database schema for SQL autocomplete
 * @param databaseId - The database ID to fetch schema for
 */
export function useSchemaContext(databaseId: string): SchemaContext {
  const [tables, setTables] = useState<string[]>([]);
  const [columns, setColumns] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track in-flight column fetch requests to avoid duplicates
  const pendingFetches = useRef<Map<string, Promise<string[]>>>(new Map());

  // Fetch table list on mount or when databaseId changes
  useEffect(() => {
    let cancelled = false;

    const fetchTables = async (): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const tableList = await listTables(databaseId);
        if (!cancelled) {
          // Filter to only include regular tables and views, exclude shadow tables
          const tableNames = tableList
            .filter((t) => t.type === "table" || t.type === "view")
            .map((t) => t.name)
            .filter(
              (name) => !name.startsWith("sqlite_") && !name.startsWith("_cf_"),
            );
          setTables(tableNames);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load tables",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchTables();

    return () => {
      cancelled = true;
    };
  }, [databaseId]);

  // Fetch columns for a specific table
  const fetchColumnsForTable = useCallback(
    async (tableName: string): Promise<string[]> => {
      // Return cached columns if available
      const cached = columns.get(tableName);
      if (cached) {
        return cached;
      }

      // Check if there's already a pending fetch for this table
      const pending = pendingFetches.current.get(tableName);
      if (pending) {
        return pending;
      }

      // Create new fetch promise
      const fetchPromise = (async () => {
        try {
          const schema: ColumnInfo[] = await getTableSchema(
            databaseId,
            tableName,
          );
          const columnNames = schema.map((col) => col.name);

          // Update the columns map
          setColumns((prev) => {
            const next = new Map(prev);
            next.set(tableName, columnNames);
            return next;
          });

          return columnNames;
        } catch {
          return [];
        } finally {
          // Clean up pending fetch
          pendingFetches.current.delete(tableName);
        }
      })();

      pendingFetches.current.set(tableName, fetchPromise);
      return fetchPromise;
    },
    [databaseId, columns],
  );

  // Get columns for multiple tables (used when query references multiple tables)
  const getColumnsForTables = useCallback(
    async (tableNames: string[]): Promise<string[]> => {
      const allColumns: string[] = [];

      await Promise.all(
        tableNames.map(async (tableName) => {
          const cols = await fetchColumnsForTable(tableName);
          allColumns.push(...cols);
        }),
      );

      // Return unique column names
      return [...new Set(allColumns)];
    },
    [fetchColumnsForTable],
  );

  return {
    tables,
    columns,
    loading,
    error,
    fetchColumnsForTable,
    getColumnsForTables,
  };
}
