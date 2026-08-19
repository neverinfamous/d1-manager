import { useState, useEffect, useCallback, useMemo } from "react";
import { getTableSchema, getTableForeignKeys, getTableData } from "@/services/api";
import type { FilterCondition } from "@/services/api";
import type { ColumnInfo } from "./types";

interface ColumnFilterState {
  id: string;
  value: string;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useTableData({
  databaseId,
  tableName,
  fkFilter,
  page,
  rowsPerPage,
  dataSortColumn,
  dataSortDirection,
  setError,
}: {
  databaseId: string;
  tableName: string;
  fkFilter?: string | undefined;
  page: number;
  rowsPerPage: number;
  dataSortColumn: string | null;
  dataSortDirection: "asc" | "desc";
  setError: (error: string | null) => void;
}) {
  const [schema, setSchema] = useState<ColumnInfo[]>([]);
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [foreignKeys, setForeignKeys] = useState<
    Record<string, { refTable: string; refColumn: string }>
  >({});

  // Column Filters stored in state and localStorage
  const filtersStorageKey = `d1-manager-filters-${databaseId}-${tableName}`;
  const [columnFilters, setColumnFilters] = useState<ColumnFilterState[]>(() => {
    try {
      const stored = localStorage.getItem(filtersStorageKey);
      if (stored) {
        return JSON.parse(stored) as ColumnFilterState[];
      }
    } catch {
      // Ignore parse errors
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem(filtersStorageKey, JSON.stringify(columnFilters));
  }, [columnFilters, filtersStorageKey]);

  // Debounce column filters to prevent spamming API on every keystroke
  const [debouncedFilters, setDebouncedFilters] = useState<ColumnFilterState[]>(columnFilters);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilters(columnFilters);
    }, 400);
    return () => clearTimeout(timer);
  }, [columnFilters]);

  // Load foreign keys on mount
  useEffect(() => {
    const loadForeignKeys = async (): Promise<void> => {
      try {
        const fks = await getTableForeignKeys(databaseId, tableName);
        const fkMap: Record<string, { refTable: string; refColumn: string }> = {};
        for (const fk of fks) {
          fkMap[fk.column] = {
            refTable: fk.refTable,
            refColumn: fk.refColumn,
          };
        }
        setForeignKeys(fkMap);
      } catch {
        // Non-fatal error, silently ignore
      }
    };

    void loadForeignKeys();
  }, [databaseId, tableName]);

  const loadTableData = useCallback(
    async (skipSchemaCache = false): Promise<void> => {
      try {
        setError(null);

        const schemaResult = await getTableSchema(databaseId, tableName, skipSchemaCache);
        setSchema(schemaResult);

        setLoading((prev) => {
          if (prev) {
            setLoadingRows(true);
            return false;
          }
          setLoadingRows(true);
          return prev;
        });

        const offset = (page - 1) * rowsPerPage;
        
        // Build API filters from column filters and fkFilter
        const apiFilters: Record<string, FilterCondition> = {};
        
        // If there's an fkFilter, add it as an equals condition
        if (fkFilter) {
          const colonIndex = fkFilter.indexOf(":");
          if (colonIndex > 0) {
            const fkColumn = fkFilter.substring(0, colonIndex);
            const fkValue = fkFilter.substring(colonIndex + 1);
            apiFilters[fkColumn] = {
              type: "equals",
              value: fkValue,
            };
          }
        }

        // Add predicate column filters
        for (const f of debouncedFilters) {
          if (f.value.trim() !== "") {
            apiFilters[f.id] = {
              type: "contains",
              value: f.value,
            };
          }
        }

        const dataResult = await getTableData(
          databaseId,
          tableName,
          rowsPerPage,
          offset,
          apiFilters,
          dataSortColumn || undefined,
          dataSortColumn ? dataSortDirection : undefined
        );

        setData(dataResult.results);
        setTotalCount(dataResult.totalCount ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load table data");
      } finally {
        setLoading(false);
        setLoadingRows(false);
      }
    },
    [
      databaseId,
      tableName,
      page,
      fkFilter,
      rowsPerPage,
      dataSortColumn,
      dataSortDirection,
      debouncedFilters,
      setError,
    ],
  );

  useEffect(() => {
    void Promise.resolve().then(() => loadTableData());
  }, [loadTableData]);

  const paginationInfo = useMemo(() => {
    const start = (page - 1) * rowsPerPage + 1;
    const end = start + data.length - 1;
    const totalPages = totalCount ? Math.ceil(totalCount / rowsPerPage) : null;
    const hasMore = data.length === rowsPerPage;

    return { start, end, totalPages, hasMore };
  }, [page, rowsPerPage, data.length, totalCount]);

  return {
    schema,
    data,
    totalCount,
    loading,
    loadingRows,
    foreignKeys,
    columnFilters,
    setColumnFilters,
    loadTableData,
    paginationInfo,
  };
}
