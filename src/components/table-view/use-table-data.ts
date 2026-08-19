import { useState, useEffect, useCallback, useMemo } from "react";
import { getTableSchema, getTableForeignKeys, executeQuery } from "@/services/api";
import type { ColumnInfo } from "./types";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useTableData({
  databaseId,
  tableName,
  fkFilter,
  page,
  rowsPerPage,
  setError,
}: {
  databaseId: string;
  tableName: string;
  fkFilter?: string | undefined;
  page: number;
  rowsPerPage: number;
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

        let fkColumn: string | null = null;
        let fkValue: string | null = null;
        if (fkFilter) {
          const colonIndex = fkFilter.indexOf(":");
          if (colonIndex > 0) {
            fkColumn = fkFilter.substring(0, colonIndex);
            fkValue = fkFilter.substring(colonIndex + 1);
          }
        }

        const buildWhereClause = (): string => {
          if (fkColumn && fkValue !== null) {
            const escapedValue = fkValue.replace(/'/g, "''");
            return ` WHERE "${fkColumn}" = '${escapedValue}'`;
          }
          return "";
        };

        const buildCountQuery = (): string => {
          return `SELECT COUNT(*) as count FROM "${tableName}"${buildWhereClause()}`;
        };

        const buildDataQuery = (): string => {
          const offset = (page - 1) * rowsPerPage;
          return `SELECT * FROM "${tableName}"${buildWhereClause()} LIMIT ${rowsPerPage} OFFSET ${offset}`;
        };

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

        const [dataResult, countResult] = await Promise.all([
          executeQuery(databaseId, buildDataQuery(), [], true),
          executeQuery(databaseId, buildCountQuery(), [], true).catch(() => null),
        ]);

        setData(dataResult.results);

        if (countResult?.results[0]) {
          const countRow = countResult.results[0];
          setTotalCount(Number(countRow["count"]) || null);
        } else {
          setTotalCount(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load table data");
      } finally {
        setLoading(false);
        setLoadingRows(false);
      }
    },
    [databaseId, tableName, page, fkFilter, rowsPerPage, setError],
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
    loadTableData,
    paginationInfo,
  };
}
