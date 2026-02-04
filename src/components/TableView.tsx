import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ArrowLeft,
  RefreshCw,
  Download,
  Trash2,
  Edit,
  Plus,
  Loader2,
  Columns,
  Settings,
  AlertTriangle,
  Search,
  Cloud,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getTableSchema,
  getTableForeignKeys,
  executeQuery,
  backupTableToR2,
  getR2BackupStatus,
  type ColumnInfo,
  type R2BackupStatus,
  api,
} from "@/services/api";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { BackupProgressDialog } from "@/components/BackupProgressDialog";
import {
  validateIdentifier,
  validateNotNullConstraint,
  validateDefaultValue,
} from "@/lib/sqlValidator";
import { CascadeImpactSimulator } from "@/components/CascadeImpactSimulator";
import { BreadcrumbNavigation } from "@/components/BreadcrumbNavigation";
import { ForeignKeyBadge } from "@/components/ForeignKeyBadge";
import { ErrorMessage } from "@/components/ui/error-message";

interface TableViewProps {
  databaseId: string;
  databaseName: string;
  tableName: string;
  navigationHistory?: { tableName: string; fkFilter?: string }[];
  fkFilter?: string;
  onBack: () => void;
  onNavigateToRelatedTable?: (
    refTable: string,
    refColumn: string,
    value: unknown,
  ) => void;
  onNavigateToHistoryTable?: (index: number) => void;
  onUndoableOperation?: () => void;
}

export function TableView({
  databaseId,
  databaseName,
  tableName,
  navigationHistory,
  fkFilter,
  onBack,
  onNavigateToRelatedTable,
  onNavigateToHistoryTable,
  onUndoableOperation,
}: TableViewProps): React.JSX.Element {
  const [schema, setSchema] = useState<ColumnInfo[]>([]);
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false); // For row-only refresh (schema cached)
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const rowsPerPage = 50;
  const [showInsertDialog, setShowInsertDialog] = useState(false);
  const [insertValues, setInsertValues] = useState<Record<string, string>>({});
  const [inserting, setInserting] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(
    null,
  );
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [updating, setUpdating] = useState(false);
  const [allowEditPrimaryKey, setAllowEditPrimaryKey] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingRow, setDeletingRow] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Row search state (client-side text search across all visible columns)
  const [rowSearchQuery, setRowSearchQuery] = useState("");

  // Row selection state (for bulk operations)
  const [selectedRows, setSelectedRows] = useState<number[]>([]);

  // Data sorting state (for column header sorting)
  const [dataSortColumn, setDataSortColumn] = useState<string | null>(null);
  const [dataSortDirection, setDataSortDirection] = useState<"asc" | "desc">(
    "asc",
  );

  // Schema sorting state
  const [schemaSortField, setSchemaSortField] = useState<
    "name" | "type" | "nullable"
  >("name");
  const [schemaSortDirection, setSchemaSortDirection] = useState<
    "asc" | "desc"
  >("asc");

  // Foreign key state
  const [foreignKeys, setForeignKeys] = useState<
    Record<string, { refTable: string; refColumn: string }>
  >({});

  // Column management state
  const [showAddColumnDialog, setShowAddColumnDialog] = useState(false);
  const [addColumnValues, setAddColumnValues] = useState({
    name: "",
    type: "TEXT",
    notnull: false,
    unique: false,
    defaultValue: "",
  });
  const [addingColumn, setAddingColumn] = useState(false);
  const [showRenameColumnDialog, setShowRenameColumnDialog] = useState(false);
  const [renamingColumn, setRenamingColumn] = useState<ColumnInfo | null>(null);
  const [renameColumnValue, setRenameColumnValue] = useState("");
  const [renamingColumnInProgress, setRenamingColumnInProgress] =
    useState(false);
  const [showModifyColumnDialog, setShowModifyColumnDialog] = useState(false);
  const [modifyingColumn, setModifyingColumn] = useState<ColumnInfo | null>(
    null,
  );
  const [modifyColumnValues, setModifyColumnValues] = useState({
    type: "TEXT",
    notnull: false,
    defaultValue: "",
  });
  const [modifyingColumnInProgress, setModifyingColumnInProgress] =
    useState(false);
  const [modifyColumnBackup, setModifyColumnBackup] = useState({
    method: "download" as "r2" | "download",
    format: "sql" as "sql" | "csv" | "json",
    completed: false,
    isBackingUp: false,
  });

  // R2 Backup state
  const [r2BackupStatus, setR2BackupStatus] = useState<R2BackupStatus | null>(
    null,
  );
  const [backupProgressDialog, setBackupProgressDialog] = useState<{
    jobId: string;
    operationName: string;
    tableName: string;
  } | null>(null);

  const [showDeleteColumnDialog, setShowDeleteColumnDialog] = useState(false);
  const [deletingColumn, setDeletingColumn] = useState<ColumnInfo | null>(null);
  const [deletingColumnInProgress, setDeletingColumnInProgress] =
    useState(false);

  // Cascade simulator state
  const [showCascadeSimulator, setShowCascadeSimulator] = useState(false);
  const [cascadeSimulatorWhereClause, setCascadeSimulatorWhereClause] =
    useState<string | undefined>();

  // Load R2 backup status on mount
  useEffect(() => {
    const loadR2Status = async (): Promise<void> => {
      try {
        const status = await getR2BackupStatus();
        setR2BackupStatus(status);
      } catch {
        // R2 backup not available
        setR2BackupStatus(null);
      }
    };
    void loadR2Status();
  }, []);

  // Load foreign keys on mount
  useEffect(() => {
    const loadForeignKeys = async (): Promise<void> => {
      try {
        const fks = await getTableForeignKeys(databaseId, tableName);
        const fkMap: Record<string, { refTable: string; refColumn: string }> =
          {};
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

        // Parse FK filter if present (format: "column:value")
        let fkColumn: string | null = null;
        let fkValue: string | null = null;
        if (fkFilter) {
          const colonIndex = fkFilter.indexOf(":");
          if (colonIndex > 0) {
            fkColumn = fkFilter.substring(0, colonIndex);
            fkValue = fkFilter.substring(colonIndex + 1);
          }
        }

        // Build WHERE clause for FK filter
        const buildWhereClause = (): string => {
          if (fkColumn && fkValue !== null) {
            const escapedValue = fkValue.replace(/'/g, "''");
            return ` WHERE "${fkColumn}" = '${escapedValue}'`;
          }
          return "";
        };

        // Build count query with FK filter
        const buildCountQuery = (): string => {
          return `SELECT COUNT(*) as count FROM "${tableName}"${buildWhereClause()}`;
        };

        // Build data query with FK filter
        const buildDataQuery = (): string => {
          const offset = (page - 1) * rowsPerPage;
          return `SELECT * FROM "${tableName}"${buildWhereClause()} LIMIT ${rowsPerPage} OFFSET ${offset}`;
        };

        // Phase 1: Load schema first (instant if cached)
        // This allows us to show the table structure immediately
        const schemaResult = await getTableSchema(
          databaseId,
          tableName,
          skipSchemaCache,
        );
        setSchema(schemaResult);

        // If this is the first load, hide the full loading state now that we have schema
        setLoading((prev) => {
          if (prev) {
            setLoadingRows(true);
            return false;
          }
          setLoadingRows(true);
          return prev;
        });

        // Phase 2: Load rows and count (always fresh)
        const [dataResult, countResult] = await Promise.all([
          executeQuery(databaseId, buildDataQuery(), [], true),
          executeQuery(databaseId, buildCountQuery(), [], true).catch(
            () => null,
          ), // Non-critical
        ]);

        setData(dataResult.results);

        // Extract count from result
        if (countResult?.results[0]) {
          const countRow = countResult.results[0];
          setTotalCount(Number(countRow["count"]) || null);
        } else {
          setTotalCount(null);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load table data",
        );
      } finally {
        setLoading(false);
        setLoadingRows(false);
      }
    },
    [databaseId, tableName, page, fkFilter],
  );

  useEffect(() => {
    void loadTableData();
  }, [loadTableData]);

  // Memoize formatValue to prevent recreation on each render
  const formatValue = useCallback((value: unknown): string => {
    if (value === null) return "NULL";
    if (value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value as string | number | boolean);
  }, []);

  // Calculate pagination info
  const paginationInfo = useMemo(() => {
    const start = (page - 1) * rowsPerPage + 1;
    const end = start + data.length - 1;
    const totalPages = totalCount ? Math.ceil(totalCount / rowsPerPage) : null;
    const hasMore = data.length === rowsPerPage;

    return { start, end, totalPages, hasMore };
  }, [page, rowsPerPage, data.length, totalCount]);

  // Sort schema columns
  const sortedSchema = useMemo(() => {
    return [...schema].sort((a, b) => {
      let comparison = 0;
      switch (schemaSortField) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "type":
          comparison = (a.type ?? "").localeCompare(b.type ?? "");
          break;
        case "nullable":
          comparison = (a.notnull ?? 0) - (b.notnull ?? 0);
          break;
      }
      return schemaSortDirection === "asc" ? comparison : -comparison;
    });
  }, [schema, schemaSortField, schemaSortDirection]);

  // Filter displayed rows by search query (client-side)
  const filteredData = useMemo(() => {
    let result = data;

    // Apply text search filter
    if (rowSearchQuery.trim()) {
      const query = rowSearchQuery.toLowerCase().trim();
      result = result.filter((row) => {
        // Check if any column value contains the search query
        return schema.some((col) => {
          const value = row[col.name];
          if (value === null || value === undefined) return false;
          // Convert value to string for searching - handle objects specially
          let strValue: string;
          if (typeof value === "object") {
            strValue = JSON.stringify(value);
          } else if (typeof value === "string") {
            strValue = value;
          } else {
            strValue = String(value as string | number | boolean);
          }
          return strValue.toLowerCase().includes(query);
        });
      });
    }

    // Apply column sorting
    if (dataSortColumn) {
      result = [...result].sort((a, b) => {
        const aVal = a[dataSortColumn];
        const bVal = b[dataSortColumn];

        // Handle null/undefined
        if (aVal === null || aVal === undefined)
          return dataSortDirection === "asc" ? -1 : 1;
        if (bVal === null || bVal === undefined)
          return dataSortDirection === "asc" ? 1 : -1;

        // Compare based on type
        let comparison = 0;
        if (typeof aVal === "number" && typeof bVal === "number") {
          comparison = aVal - bVal;
        } else {
          // Convert to string safely, handling objects
          const aStr =
            typeof aVal === "object"
              ? JSON.stringify(aVal)
              : String(aVal as string | number | boolean);
          const bStr =
            typeof bVal === "object"
              ? JSON.stringify(bVal)
              : String(bVal as string | number | boolean);
          comparison = aStr.localeCompare(bStr);
        }

        return dataSortDirection === "asc" ? comparison : -comparison;
      });
    }

    return result;
  }, [data, rowSearchQuery, schema, dataSortColumn, dataSortDirection]);

  // Clear row selection when data changes
  useEffect(() => {
    setSelectedRows([]);
  }, [data]);

  // Row selection handlers
  const toggleRowSelection = useCallback((rowIndex: number) => {
    setSelectedRows((prev) =>
      prev.includes(rowIndex)
        ? prev.filter((i) => i !== rowIndex)
        : [...prev, rowIndex],
    );
  }, []);

  const selectAllRows = useCallback(() => {
    setSelectedRows(filteredData.map((_, index) => index));
  }, [filteredData]);

  const clearRowSelection = useCallback(() => {
    setSelectedRows([]);
  }, []);

  // Handle column header click for sorting
  const handleDataSort = useCallback(
    (columnName: string) => {
      if (dataSortColumn === columnName) {
        setDataSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setDataSortColumn(columnName);
        setDataSortDirection("asc");
      }
    },
    [dataSortColumn],
  );

  // Handle schema sort
  const handleSchemaSort = useCallback(
    (field: "name" | "type" | "nullable") => {
      if (schemaSortField === field) {
        setSchemaSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSchemaSortField(field);
        setSchemaSortDirection("asc");
      }
    },
    [schemaSortField],
  );

  const handleOpenInsertDialog = (): void => {
    // Initialize insert values with empty strings for all columns
    const initialValues: Record<string, string> = {};
    schema.forEach((col) => {
      initialValues[col.name] = "";
    });
    setInsertValues(initialValues);
    setShowInsertDialog(true);
  };

  const handleInsertRow = async (): Promise<void> => {
    setInserting(true);
    setError(null);

    try {
      // Build INSERT query
      // Filter columns to include based on whether they have values or need explicit insertion
      const columnsWithValues = schema.filter((col) => {
        const value = insertValues[col.name];
        const hasValue = value !== "";

        // If column has a value, always include it
        if (hasValue) return true;

        // If it's a primary key with INTEGER type (auto-increment), skip it when empty
        if (col.pk > 0 && col.type?.toUpperCase().includes("INTEGER")) {
          return false;
        }

        // If it's a NOT NULL column with a default value, skip it when empty
        // so SQLite will use the default value (SQLite only applies defaults when column is omitted)
        if (col.notnull && col.dflt_value !== null) {
          return false;
        }

        // Otherwise include it (will be set to NULL)
        return true;
      });

      // If no columns need explicit values (e.g., only auto-increment PK), use DEFAULT VALUES
      let query: string;
      if (columnsWithValues.length === 0) {
        query = `INSERT INTO "${tableName}" DEFAULT VALUES`;
      } else {
        const columnNames = columnsWithValues.map((col) => col.name);
        const values = columnsWithValues.map((col) => {
          const value = insertValues[col.name] ?? "";
          if (value === "") return "NULL";
          // Try to determine if it's a number
          if (!isNaN(Number(value)) && value.trim() !== "") return value;
          // Otherwise treat as string
          return `'${value.replace(/'/g, "''")}'`; // Escape single quotes
        });

        query = `INSERT INTO "${tableName}" (${columnNames.map((n) => `"${n}"`).join(", ")}) VALUES (${values.join(", ")})`;
      }

      await executeQuery(databaseId, query, [], true); // Skip validation for INSERT

      setShowInsertDialog(false);
      setInsertValues({});
      await loadTableData(); // Reload data
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to insert row");
    } finally {
      setInserting(false);
    }
  };

  const handleOpenEditDialog = (row: Record<string, unknown>): void => {
    setEditingRow(row);
    // Convert all values to strings for the form
    const stringValues: Record<string, string> = {};
    schema.forEach((col) => {
      const value = row[col.name];
      stringValues[col.name] =
        value !== null && value !== undefined
          ? typeof value === "object"
            ? JSON.stringify(value)
            : String(value as string | number | boolean)
          : "";
    });
    setEditValues(stringValues);
    setAllowEditPrimaryKey(false); // Reset checkbox when opening dialog
    setShowEditDialog(true);
  };

  const handleUpdateRow = async (): Promise<void> => {
    if (!editingRow) return;

    setUpdating(true);
    setError(null);

    try {
      // Build UPDATE query with WHERE clause based on primary keys
      const pkColumns = schema.filter((col) => col.pk > 0);
      if (pkColumns.length === 0) {
        throw new Error("Cannot update row: No primary key found");
      }

      // Build SET clause - include PKs if editing is allowed
      const updateColumns = allowEditPrimaryKey
        ? schema // Include all columns when PK editing is enabled
        : schema.filter((col) => col.pk === 0); // Only non-PK columns otherwise

      const setClause = updateColumns
        .map((col) => {
          const value = editValues[col.name] ?? "";
          if (value === "") return `"${col.name}" = NULL`;
          if (!isNaN(Number(value)) && value.trim() !== "")
            return `"${col.name}" = ${value}`;
          return `"${col.name}" = '${value.replace(/'/g, "''")}'`;
        })
        .join(", ");

      // Build WHERE clause based on ORIGINAL primary key values (from editingRow, not editValues)
      const whereClause = pkColumns
        .map((col) => {
          const value = editingRow[col.name];
          return `"${col.name}" = ${typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`}`;
        })
        .join(" AND ");

      const query = `UPDATE "${tableName}" SET ${setClause} WHERE ${whereClause}`;

      await executeQuery(databaseId, query, [], true);

      setShowEditDialog(false);
      setEditingRow(null);
      setEditValues({});
      await loadTableData(); // Reload data
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update row");
    } finally {
      setUpdating(false);
    }
  };

  const handleOpenDeleteDialog = (row: Record<string, unknown>): void => {
    setDeletingRow(row);
    setShowDeleteDialog(true);
  };

  const handleSimulateCascadeImpact = (): void => {
    // Build WHERE clause from primary keys of the row being deleted
    if (!deletingRow) return;

    const pkColumns = schema.filter((col) => col.pk > 0);
    if (pkColumns.length === 0) return;

    const whereClause = pkColumns
      .map((col) => {
        const value = deletingRow[col.name];
        return `"${col.name}" = ${typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`}`;
      })
      .join(" AND ");

    setCascadeSimulatorWhereClause(whereClause);
    setShowCascadeSimulator(true);
  };

  const handleDeleteRow = async (): Promise<void> => {
    if (!deletingRow) return;

    setDeleting(true);
    setError(null);

    try {
      // Build DELETE query with WHERE clause based on primary keys
      const pkColumns = schema.filter((col) => col.pk > 0);
      if (pkColumns.length === 0) {
        throw new Error("Cannot delete row: No primary key found");
      }

      const whereClause = pkColumns
        .map((col) => {
          const value = deletingRow[col.name];
          return `"${col.name}" = ${typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`}`;
        })
        .join(" AND ");

      const query = `DELETE FROM "${tableName}" WHERE ${whereClause}`;

      await executeQuery(databaseId, query, [], true);

      setShowDeleteDialog(false);
      setDeletingRow(null);
      await loadTableData(); // Reload data

      // Notify parent of undoable operation
      if (onUndoableOperation) {
        onUndoableOperation();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete row");
    } finally {
      setDeleting(false);
    }
  };

  // Bulk delete selected rows
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const handleBulkDeleteRows = async (): Promise<void> => {
    if (selectedRows.length === 0) return;

    setBulkDeleting(true);
    setError(null);

    try {
      const pkColumns = schema.filter((col) => col.pk > 0);
      if (pkColumns.length === 0) {
        throw new Error("Cannot delete rows: No primary key found");
      }

      // Build individual DELETE statements for each selected row
      const selectedRowData = selectedRows
        .map((index) => filteredData[index])
        .filter((row): row is Record<string, unknown> => row !== undefined);

      for (const row of selectedRowData) {
        const whereClause = pkColumns
          .map((col) => {
            const value = row[col.name];
            return `"${col.name}" = ${typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`}`;
          })
          .join(" AND ");

        const query = `DELETE FROM "${tableName}" WHERE ${whereClause}`;
        await executeQuery(databaseId, query, [], true);
      }

      setShowBulkDeleteDialog(false);
      setSelectedRows([]);
      await loadTableData();

      if (onUndoableOperation) {
        onUndoableOperation();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete rows");
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleOpenAddColumnDialog = (): void => {
    setAddColumnValues({
      name: "",
      type: "TEXT",
      notnull: false,
      unique: false,
      defaultValue: "",
    });
    setShowAddColumnDialog(true);
  };

  const handleAddColumn = async (): Promise<void> => {
    setAddingColumn(true);
    setError(null);

    try {
      // Validate column name using comprehensive validator
      const nameValidation = validateIdentifier(addColumnValues.name, "column");
      if (!nameValidation.isValid) {
        const errorMsg = nameValidation.suggestion
          ? `${nameValidation.error}. ${nameValidation.suggestion}`
          : (nameValidation.error ?? "Invalid column name");
        throw new Error(errorMsg);
      }

      // Check for duplicate column name
      if (
        schema.some(
          (col) =>
            col.name.toLowerCase() === addColumnValues.name.toLowerCase(),
        )
      ) {
        throw new Error(
          `Column "${addColumnValues.name}" already exists in this table`,
        );
      }

      // Validate NOT NULL constraint with default value
      const hasExistingRows =
        data.length > 0 || (totalCount !== null && totalCount > 0);
      const notNullValidation = validateNotNullConstraint(
        addColumnValues.notnull,
        addColumnValues.defaultValue,
        hasExistingRows,
        false, // Not a generated column
      );
      if (!notNullValidation.isValid) {
        const errorMsg = notNullValidation.suggestion
          ? `${notNullValidation.error}. ${notNullValidation.suggestion}`
          : (notNullValidation.error ?? "Invalid constraint");
        throw new Error(errorMsg);
      }

      // Validate default value type compatibility
      if (addColumnValues.defaultValue) {
        const defaultValidation = validateDefaultValue(
          addColumnValues.defaultValue,
          addColumnValues.type,
        );
        if (!defaultValidation.isValid) {
          const errorMsg = defaultValidation.suggestion
            ? `${defaultValidation.error}. ${defaultValidation.suggestion}`
            : (defaultValidation.error ?? "Invalid default value");
          throw new Error(errorMsg);
        }
      }

      // Call API to add column
      await api.addColumn(databaseId, tableName, {
        name: addColumnValues.name,
        type: addColumnValues.type,
        notnull: addColumnValues.notnull,
        unique: addColumnValues.unique,
        ...(addColumnValues.defaultValue && {
          defaultValue: addColumnValues.defaultValue,
        }),
      });

      setShowAddColumnDialog(false);
      setAddColumnValues({
        name: "",
        type: "TEXT",
        notnull: false,
        unique: false,
        defaultValue: "",
      });
      await loadTableData(true); // Reload with fresh schema
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add column");
    } finally {
      setAddingColumn(false);
    }
  };

  const handleRenameColumn = async (): Promise<void> => {
    if (!renamingColumn) return;

    setRenamingColumnInProgress(true);
    setError(null);

    try {
      // Validate column name using comprehensive validator
      const nameValidation = validateIdentifier(renameColumnValue, "column");
      if (!nameValidation.isValid) {
        const errorMsg = nameValidation.suggestion
          ? `${nameValidation.error}. ${nameValidation.suggestion}`
          : (nameValidation.error ?? "Invalid column name");
        throw new Error(errorMsg);
      }

      // Check if name is different
      if (renameColumnValue === renamingColumn.name) {
        throw new Error("New name must be different from current name");
      }

      // Check for duplicate column name
      if (
        schema.some(
          (col) => col.name.toLowerCase() === renameColumnValue.toLowerCase(),
        )
      ) {
        throw new Error(
          `Column "${renameColumnValue}" already exists in this table`,
        );
      }

      // Call API to rename column
      await api.renameColumn(
        databaseId,
        tableName,
        renamingColumn.name,
        renameColumnValue,
      );

      setShowRenameColumnDialog(false);
      setRenamingColumn(null);
      setRenameColumnValue("");
      await loadTableData(true); // Reload with fresh schema
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename column");
    } finally {
      setRenamingColumnInProgress(false);
    }
  };

  const handleModifyColumn = async (): Promise<void> => {
    if (!modifyingColumn) return;

    setModifyingColumnInProgress(true);
    setError(null);

    try {
      // Call API to modify column (will use table recreation)
      await api.modifyColumn(databaseId, tableName, modifyingColumn.name, {
        type: modifyColumnValues.type,
        notnull: modifyColumnValues.notnull,
        ...(modifyColumnValues.defaultValue && {
          defaultValue: modifyColumnValues.defaultValue,
        }),
      });

      setShowModifyColumnDialog(false);
      setModifyingColumn(null);
      setModifyColumnValues({
        type: "TEXT",
        notnull: false,
        defaultValue: "",
      });
      setModifyColumnBackup({
        method: "download",
        format: "sql",
        completed: false,
        isBackingUp: false,
      });
      onUndoableOperation?.();
      await loadTableData(true); // Reload with fresh schema
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to modify column");
    } finally {
      setModifyingColumnInProgress(false);
    }
  };

  const handleDeleteColumn = async (): Promise<void> => {
    if (!deletingColumn) return;

    setDeletingColumnInProgress(true);
    setError(null);

    try {
      // Call API to delete column
      await api.deleteColumn(databaseId, tableName, deletingColumn.name);

      setShowDeleteColumnDialog(false);
      setDeletingColumn(null);
      await loadTableData(true); // Reload with fresh schema

      // Notify parent of undoable operation
      if (onUndoableOperation) {
        onUndoableOperation();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete column");
    } finally {
      setDeletingColumnInProgress(false);
    }
  };

  const handleExportCSV = (): void => {
    if (data.length === 0) {
      alert("No data to export");
      return;
    }

    try {
      // Get column names from schema
      const columns = schema.map((col) => col.name);

      // Create CSV content
      const csvRows = [];

      // Add headers
      csvRows.push(columns.map((col) => `"${col}"`).join(","));

      // Add data rows
      for (const row of data) {
        const values = columns.map((col) => {
          const cell = row[col];
          if (cell === null) return "NULL";
          if (cell === undefined) return "";
          const str =
            typeof cell === "object"
              ? JSON.stringify(cell)
              : String(cell as string | number | boolean);
          // Escape quotes and wrap in quotes if contains comma, quote, or newline
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        });
        csvRows.push(values.join(","));
      }

      // Create blob and download
      const csvContent = csvRows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);

      link.href = url;
      link.download = `${tableName}_${String(Date.now())}.csv`;

      document.body.appendChild(link);
      link.click();

      // Clean up after a small delay
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      alert(
        "Failed to export CSV: " +
          (err instanceof Error ? err.message : "Unknown error"),
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      {navigationHistory && navigationHistory.length > 0 && (
        <BreadcrumbNavigation
          databaseName={databaseName}
          navigationHistory={[...navigationHistory, { tableName }]}
          onNavigateToDatabase={onBack}
          onNavigateToTable={(index) => {
            if (onNavigateToHistoryTable) {
              onNavigateToHistoryTable(index);
            }
          }}
          onGoBack={() => {
            if (navigationHistory.length > 0 && onNavigateToHistoryTable) {
              onNavigateToHistoryTable(navigationHistory.length - 1);
            }
          }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-3xl font-semibold">{tableName}</h2>
            <p className="text-sm text-muted-foreground">
              {databaseName} • {data.length}{" "}
              {data.length === 1 ? "row" : "rows"}
              {fkFilter && ` • Filtered: ${fkFilter.replace(":", " = ")}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => void loadTableData(true)}
            disabled={loadingRows}
          >
            <RefreshCw
              className={`h-4 w-4 ${loadingRows ? "animate-spin" : ""}`}
            />
          </Button>
          <Button
            variant="outline"
            onClick={handleExportCSV}
            disabled={data.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={handleOpenAddColumnDialog}>
            <Columns className="h-4 w-4 mr-2" />
            Add Column
          </Button>
          <Button onClick={handleOpenInsertDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Insert Row
          </Button>
        </div>
      </div>

      {/* Schema Info */}
      {!loading && schema.length > 0 && (
        <div className="overflow-x-auto border rounded-lg bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th scope="col" className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSchemaSort("name")}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                  >
                    Column
                    {schemaSortField === "name" ? (
                      schemaSortDirection === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-50" />
                    )}
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSchemaSort("type")}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                  >
                    Type
                    {schemaSortField === "type" ? (
                      schemaSortDirection === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-50" />
                    )}
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSchemaSort("nullable")}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                  >
                    Nullable
                    {schemaSortField === "nullable" ? (
                      schemaSortDirection === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-50" />
                    )}
                  </button>
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                >
                  Default
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedSchema.map((col) => {
                // Detect generated columns: hidden=2 (virtual) or hidden=3 (stored)
                const isGenerated = col.hidden === 2 || col.hidden === 3;
                const generatedType =
                  col.hidden === 2
                    ? "VIRTUAL"
                    : col.hidden === 3
                      ? "STORED"
                      : null;

                return (
                  <tr key={col.cid} className="hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{col.name}</span>
                        {col.pk > 0 && (
                          <span
                            className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded"
                            title="Primary Key"
                          >
                            PK
                          </span>
                        )}
                        {col.unique && (
                          <span
                            className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 rounded"
                            title="Unique constraint"
                          >
                            UNIQUE
                          </span>
                        )}
                        {isGenerated && (
                          <span
                            className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200 rounded"
                            title={`Generated column (${generatedType})`}
                          >
                            {generatedType}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {col.type || "ANY"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {col.notnull ? "NOT NULL" : "NULL"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {isGenerated && col.generatedExpression ? (
                        <span className="text-xs font-mono">
                          = {col.generatedExpression}
                        </span>
                      ) : col.dflt_value ? (
                        <span>{col.dflt_value}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            setRenamingColumn(col);
                            setRenameColumnValue(col.name);
                            setShowRenameColumnDialog(true);
                          }}
                          title="Rename column"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            setModifyingColumn(col);
                            setModifyColumnValues({
                              type: col.type || "TEXT",
                              notnull: col.notnull === 1,
                              defaultValue: col.dflt_value || "",
                            });
                            setModifyColumnBackup({
                              method: r2BackupStatus?.configured
                                ? "r2"
                                : "download",
                              format: "sql",
                              completed: false,
                              isBackingUp: false,
                            });
                            setShowModifyColumnDialog(true);
                          }}
                          title="Modify column type/constraints"
                        >
                          <Settings className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            setDeletingColumn(col);
                            setShowDeleteColumnDialog(true);
                          }}
                          disabled={schema.length === 1 || isGenerated}
                          title={
                            schema.length === 1
                              ? "Cannot delete the only column"
                              : isGenerated
                                ? "Cannot delete generated column directly"
                                : "Delete column"
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Row Search Filter and Bulk Operations Toolbar */}
      {!loading && data.length > 0 && (
        <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
          <div className="flex items-center gap-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="row-search"
                name="row-search"
                autoComplete="off"
                placeholder="Filter rows..."
                value={rowSearchQuery}
                onChange={(e) => setRowSearchQuery(e.target.value)}
                className="pl-10 w-64"
                aria-label="Search rows"
              />
            </div>
            <Button variant="outline" onClick={selectAllRows}>
              Select All
            </Button>
            {selectedRows.length > 0 && (
              <>
                <Button variant="outline" onClick={clearRowSelection}>
                  Clear Selection
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedRows.length} row
                  {selectedRows.length !== 1 ? "s" : ""} selected
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="text-sm text-muted-foreground mr-2">
              {rowSearchQuery.trim() ? (
                <>
                  {filteredData.length} of {data.length}{" "}
                  {data.length === 1 ? "row" : "rows"}
                </>
              ) : (
                <>
                  {data.length} {data.length === 1 ? "row" : "rows"}
                </>
              )}
            </div>
            {selectedRows.length > 0 && (
              <Button
                variant="destructive"
                onClick={() => setShowBulkDeleteDialog(true)}
                disabled={bulkDeleting}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error State */}
      <ErrorMessage error={error} variant="card" />

      {/* Data Table */}
      {!loading && !error && (
        <div className="overflow-x-auto border rounded-lg bg-card relative">
          {/* Row loading overlay */}
          {loadingRows && (
            <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-muted-foreground mb-4">
                No rows in this table
              </p>
              <Button onClick={handleOpenInsertDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Insert First Row
              </Button>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-muted-foreground mb-4">
                No rows match your search
              </p>
              <Button variant="outline" onClick={() => setRowSearchQuery("")}>
                Clear Search
              </Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th scope="col" className="px-3 py-3 w-10">
                    <Checkbox
                      checked={
                        selectedRows.length === filteredData.length &&
                        filteredData.length > 0
                      }
                      onCheckedChange={(checked) => {
                        if (checked === true) {
                          selectAllRows();
                        } else {
                          clearRowSelection();
                        }
                      }}
                      aria-label={
                        selectedRows.length === filteredData.length
                          ? "Deselect all rows"
                          : "Select all rows"
                      }
                    />
                  </th>
                  {schema.map((col) => (
                    <th
                      key={col.cid}
                      scope="col"
                      className="px-4 py-3 text-left"
                    >
                      <button
                        onClick={() => handleDataSort(col.name)}
                        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors whitespace-nowrap"
                      >
                        {col.name}
                        {dataSortColumn === col.name ? (
                          dataSortDirection === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-50" />
                        )}
                      </button>
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredData.map((row, rowIndex) => {
                  const isRowSelected = selectedRows.includes(rowIndex);
                  return (
                    <tr
                      key={rowIndex}
                      className={`hover:bg-muted/50 ${isRowSelected ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-3 py-3">
                        <Checkbox
                          checked={isRowSelected}
                          onCheckedChange={() => toggleRowSelection(rowIndex)}
                          aria-label={`Select row ${String(rowIndex + 1)}`}
                        />
                      </td>
                      {schema.map((col) => {
                        const isFK = foreignKeys[col.name];
                        const cellValue = row[col.name];

                        return (
                          <td
                            key={`${String(rowIndex)}-${String(col.cid)}`}
                            className="px-4 py-3 whitespace-nowrap"
                          >
                            {isFK && onNavigateToRelatedTable ? (
                              <ForeignKeyBadge
                                value={cellValue}
                                refTable={isFK.refTable}
                                refColumn={isFK.refColumn}
                                onClick={() => {
                                  if (
                                    cellValue !== null &&
                                    cellValue !== undefined
                                  ) {
                                    onNavigateToRelatedTable(
                                      isFK.refTable,
                                      isFK.refColumn,
                                      cellValue,
                                    );
                                  }
                                }}
                              />
                            ) : (
                              <span
                                className={
                                  cellValue === null
                                    ? "italic text-muted-foreground"
                                    : ""
                                }
                              >
                                {formatValue(cellValue)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleOpenEditDialog(row)}
                            title="Edit row"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleOpenDeleteDialog(row)}
                            title="Delete row"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && data.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {paginationInfo.start} to {paginationInfo.end}
            {totalCount !== null && ` of ${totalCount.toLocaleString()}`} rows
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
            >
              Previous
            </Button>
            <div className="text-sm">
              Page {page}
              {paginationInfo.totalPages &&
                ` of ${String(paginationInfo.totalPages)}`}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={!paginationInfo.hasMore}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Insert Row Dialog */}
      <Dialog open={showInsertDialog} onOpenChange={setShowInsertDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Insert Row into {tableName}</DialogTitle>
            <DialogDescription>
              Fill in the values for the new row. Leave fields empty for NULL
              values.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {schema.map((col) => (
              <div key={col.name} className="space-y-2">
                <Label htmlFor={`insert-${col.name}`}>
                  {col.name}
                  {col.pk > 0 && (
                    <span className="text-xs text-muted-foreground ml-2">
                      (Primary Key)
                    </span>
                  )}
                  {col.notnull && !col.pk ? (
                    <span className="text-destructive ml-1">*</span>
                  ) : null}
                </Label>
                <div className="flex gap-2 items-center">
                  <Input
                    id={`insert-${col.name}`}
                    name={`insert-${col.name}`}
                    placeholder={
                      col.dflt_value ??
                      (col.pk > 0 && col.type?.toUpperCase().includes("INTEGER")
                        ? "Auto-increment (optional)"
                        : "NULL")
                    }
                    value={insertValues[col.name] || ""}
                    onChange={(e) =>
                      setInsertValues({
                        ...insertValues,
                        [col.name]: e.target.value,
                      })
                    }
                  />
                  <span className="text-xs text-muted-foreground min-w-[60px]">
                    {col.type || "ANY"}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <ErrorMessage error={error} variant="inline" />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowInsertDialog(false)}
              disabled={inserting}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleInsertRow()} disabled={inserting}>
              {inserting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Inserting...
                </>
              ) : (
                "Insert Row"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Row Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Row in {tableName}</DialogTitle>
            <DialogDescription>
              Modify the values for this row. Leave fields empty for NULL
              values.
            </DialogDescription>
          </DialogHeader>
          {schema.some((col) => col.pk > 0) && (
            <div className="flex items-start space-x-3 rounded-md border border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/30 p-4">
              <Checkbox
                id="allow-edit-pk"
                checked={allowEditPrimaryKey}
                onCheckedChange={(checked) =>
                  setAllowEditPrimaryKey(checked === true)
                }
              />
              <div className="space-y-1 leading-none">
                <Label
                  htmlFor="allow-edit-pk"
                  className="text-sm font-medium cursor-pointer"
                >
                  ⚠️ Allow editing primary key (advanced)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Changing primary keys can break relationships and cause data
                  integrity issues. Only enable this if you know what you're
                  doing.
                </p>
              </div>
            </div>
          )}
          <div className="grid gap-4 py-4">
            {schema.map((col) => (
              <div key={col.name} className="space-y-2">
                <Label htmlFor={`edit-${col.name}`}>
                  {col.name}
                  {col.pk > 0 && (
                    <span className="text-xs text-muted-foreground ml-2">
                      (Primary Key)
                    </span>
                  )}
                  {col.notnull && !col.pk ? (
                    <span className="text-destructive ml-1">*</span>
                  ) : null}
                </Label>
                <div className="flex gap-2 items-center">
                  <Input
                    id={`edit-${col.name}`}
                    name={`edit-${col.name}`}
                    placeholder="NULL"
                    value={editValues[col.name] || ""}
                    onChange={(e) =>
                      setEditValues({
                        ...editValues,
                        [col.name]: e.target.value,
                      })
                    }
                    disabled={col.pk > 0 && !allowEditPrimaryKey} // Disable primary keys unless checkbox is checked
                  />
                  <span className="text-xs text-muted-foreground min-w-[60px]">
                    {col.type || "ANY"}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <ErrorMessage error={error} variant="inline" />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
              disabled={updating}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleUpdateRow()} disabled={updating}>
              {updating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Row"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Row Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Row</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this row? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          {deletingRow && (
            <div className="py-4">
              <p className="text-sm font-medium mb-2">Row details:</p>
              <div className="bg-muted p-3 rounded-md space-y-1">
                {schema
                  .filter((col) => col.pk > 0)
                  .map((col) => (
                    <div key={col.name} className="text-sm">
                      <span className="font-medium">{col.name}:</span>{" "}
                      <span className="text-muted-foreground">
                        {String(deletingRow[col.name])}
                      </span>
                    </div>
                  ))}
              </div>
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSimulateCascadeImpact}
                  className="w-full"
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Simulate Cascade Impact
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Preview which tables and rows will be affected by this
                  deletion
                </p>
              </div>
            </div>
          )}
          <ErrorMessage error={error} variant="inline" />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeleteRow()}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Row"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Rows Dialog */}
      <Dialog
        open={showBulkDeleteDialog}
        onOpenChange={setShowBulkDeleteDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selectedRows.length} Row
              {selectedRows.length !== 1 ? "s" : ""}
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the selected rows? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              {selectedRows.length} row{selectedRows.length !== 1 ? "s" : ""}{" "}
              will be permanently deleted from the table.
            </p>
          </div>
          <ErrorMessage error={error} variant="inline" />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBulkDeleteDialog(false)}
              disabled={bulkDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleBulkDeleteRows()}
              disabled={bulkDeleting}
            >
              {bulkDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                `Delete ${selectedRows.length} Row${selectedRows.length !== 1 ? "s" : ""}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Column Dialog */}
      <Dialog open={showAddColumnDialog} onOpenChange={setShowAddColumnDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Column to {tableName}</DialogTitle>
            <DialogDescription>
              Add a new column to the table. The column will be added with NULL
              values for existing rows unless you specify a default value.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="add-column-name">
                Column Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="add-column-name"
                placeholder="e.g., email, created_at"
                value={addColumnValues.name}
                onChange={(e) =>
                  setAddColumnValues({
                    ...addColumnValues,
                    name: e.target.value,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-column-type">Column Type</Label>
              <Select
                value={addColumnValues.type}
                onValueChange={(value) =>
                  setAddColumnValues({ ...addColumnValues, type: value })
                }
              >
                <SelectTrigger id="add-column-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEXT">TEXT</SelectItem>
                  <SelectItem value="INTEGER">INTEGER</SelectItem>
                  <SelectItem value="REAL">REAL</SelectItem>
                  <SelectItem value="BLOB">BLOB</SelectItem>
                  <SelectItem value="NUMERIC">NUMERIC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-column-default">
                Default Value (optional)
              </Label>
              <Input
                id="add-column-default"
                placeholder="e.g., 0, 'unknown', CURRENT_TIMESTAMP"
                value={addColumnValues.defaultValue}
                onChange={(e) =>
                  setAddColumnValues({
                    ...addColumnValues,
                    defaultValue: e.target.value,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Leave empty for NULL. Use quotes for text values.
              </p>
            </div>

            <div
              className="flex items-start space-x-3"
              title="Prevents NULL values. Ensures this column always has a value."
            >
              <Checkbox
                id="add-column-notnull"
                checked={addColumnValues.notnull}
                onCheckedChange={(checked) =>
                  setAddColumnValues({
                    ...addColumnValues,
                    notnull: checked === true,
                  })
                }
              />
              <div className="space-y-1 leading-none">
                <Label
                  htmlFor="add-column-notnull"
                  className="text-sm font-medium cursor-pointer"
                >
                  NOT NULL constraint
                </Label>
                <p className="text-xs text-muted-foreground">
                  Requires a default value if table has existing rows
                </p>
              </div>
            </div>

            <div
              className="flex items-start space-x-3"
              title="Ensures all values in this column are distinct. Creates a unique index."
            >
              <Checkbox
                id="add-column-unique"
                checked={addColumnValues.unique}
                onCheckedChange={(checked) =>
                  setAddColumnValues({
                    ...addColumnValues,
                    unique: checked === true,
                  })
                }
              />
              <div className="space-y-1 leading-none">
                <Label
                  htmlFor="add-column-unique"
                  className="text-sm font-medium cursor-pointer"
                >
                  UNIQUE constraint
                </Label>
                <p className="text-xs text-muted-foreground">
                  Ensures all values in this column are distinct
                </p>
              </div>
            </div>

            {/* Info note about generated columns */}
            <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
              <strong>Note:</strong> Generated (computed) columns can only be
              defined when creating a new table using the Schema Designer.
              SQLite does not support adding generated columns to existing
              tables.
            </div>
          </div>
          <ErrorMessage error={error} variant="inline" />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddColumnDialog(false)}
              disabled={addingColumn}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleAddColumn()}
              disabled={addingColumn}
            >
              {addingColumn ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Column"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Column Dialog */}
      <Dialog
        open={showRenameColumnDialog}
        onOpenChange={setShowRenameColumnDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Column</DialogTitle>
            <DialogDescription>
              Rename the column "{renamingColumn?.name}" to a new name.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rename-column-name">
                New Column Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="rename-column-name"
                placeholder="Enter new column name"
                value={renameColumnValue}
                onChange={(e) => setRenameColumnValue(e.target.value)}
              />
            </div>
          </div>
          <ErrorMessage error={error} variant="inline" />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRenameColumnDialog(false)}
              disabled={renamingColumnInProgress}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleRenameColumn()}
              disabled={renamingColumnInProgress}
            >
              {renamingColumnInProgress ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Renaming...
                </>
              ) : (
                "Rename Column"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modify Column Dialog */}
      <Dialog
        open={showModifyColumnDialog}
        onOpenChange={setShowModifyColumnDialog}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modify Column "{modifyingColumn?.name}"</DialogTitle>
            <DialogDescription>
              Change the column type or constraints. This operation requires
              recreating the table.
            </DialogDescription>
          </DialogHeader>
          {/* Warning Box */}
          <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4 mb-4">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
              ⚠️ Important: Table Recreation Required
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
              SQLite does not support modifying column types or constraints
              directly. This operation will:
            </p>
            <ul className="text-sm text-amber-700 dark:text-amber-300 list-disc list-inside space-y-1">
              <li>Create a temporary table with the new column definition</li>
              <li>Copy all data with appropriate type conversions</li>
              <li>Drop the original table</li>
              <li>Rename the temporary table</li>
            </ul>
          </div>

          {/* Backup Recommendation */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4 mb-4">
            <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">
              💾 Strongly Recommended: Create a backup first
            </h4>
            <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
              Before modifying this column, we highly recommend creating a
              backup of your table in case anything goes wrong.
            </p>

            {/* Backup Format Selection */}
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-medium text-blue-800 dark:text-blue-200">
                Format:
              </span>
              <RadioGroup
                value={modifyColumnBackup.format}
                onValueChange={(value: "sql" | "csv" | "json") =>
                  setModifyColumnBackup((prev) => ({ ...prev, format: value }))
                }
                disabled={
                  modifyingColumnInProgress || modifyColumnBackup.isBackingUp
                }
                className="flex gap-3"
              >
                <div className="flex items-center space-x-1">
                  <RadioGroupItem
                    value="sql"
                    id="modify-backup-sql"
                    className="h-3 w-3"
                  />
                  <Label
                    htmlFor="modify-backup-sql"
                    className="text-xs text-blue-700 dark:text-blue-300"
                  >
                    SQL
                  </Label>
                </div>
                <div className="flex items-center space-x-1">
                  <RadioGroupItem
                    value="csv"
                    id="modify-backup-csv"
                    className="h-3 w-3"
                  />
                  <Label
                    htmlFor="modify-backup-csv"
                    className="text-xs text-blue-700 dark:text-blue-300"
                  >
                    CSV
                  </Label>
                </div>
                <div className="flex items-center space-x-1">
                  <RadioGroupItem
                    value="json"
                    id="modify-backup-json"
                    className="h-3 w-3"
                  />
                  <Label
                    htmlFor="modify-backup-json"
                    className="text-xs text-blue-700 dark:text-blue-300"
                  >
                    JSON
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Backup Buttons */}
            <div className="flex gap-2">
              {r2BackupStatus?.configured && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    // Capture format value before state update to avoid closure issues
                    const formatToExport = modifyColumnBackup.format;
                    setModifyColumnBackup((prev) => ({
                      ...prev,
                      isBackingUp: true,
                      method: "r2",
                    }));
                    try {
                      const result = await backupTableToR2(
                        databaseId,
                        databaseName,
                        tableName,
                        formatToExport,
                        "column_modify",
                      );
                      setModifyColumnBackup((prev) => ({
                        ...prev,
                        isBackingUp: false,
                        completed: true,
                      }));
                      setBackupProgressDialog({
                        jobId: result.job_id,
                        operationName: "Table Backup to R2",
                        tableName: tableName,
                      });
                    } catch {
                      setModifyColumnBackup((prev) => ({
                        ...prev,
                        isBackingUp: false,
                      }));
                      setError("Failed to start R2 backup");
                    }
                  }}
                  disabled={
                    modifyingColumnInProgress || modifyColumnBackup.isBackingUp
                  }
                  className="flex-1 bg-blue-600 text-white hover:bg-blue-700 border-blue-600"
                >
                  {modifyColumnBackup.isBackingUp &&
                  modifyColumnBackup.method === "r2" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Cloud className="h-4 w-4 mr-2" />
                  )}
                  Backup to R2
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  // Capture format value before state update to avoid closure issues
                  const formatToExport = modifyColumnBackup.format;
                  setModifyColumnBackup((prev) => ({
                    ...prev,
                    isBackingUp: true,
                    method: "download",
                  }));
                  try {
                    await api.exportTable(
                      databaseId,
                      tableName,
                      formatToExport,
                    );
                    setModifyColumnBackup((prev) => ({
                      ...prev,
                      isBackingUp: false,
                      completed: true,
                    }));
                  } catch {
                    setModifyColumnBackup((prev) => ({
                      ...prev,
                      isBackingUp: false,
                    }));
                    setError("Failed to download backup");
                  }
                }}
                disabled={
                  modifyingColumnInProgress || modifyColumnBackup.isBackingUp
                }
                className={r2BackupStatus?.configured ? "flex-1" : "w-full"}
              >
                {modifyColumnBackup.isBackingUp &&
                modifyColumnBackup.method === "download" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Download Backup
              </Button>
            </div>

            {/* Backup completed indicator */}
            {modifyColumnBackup.completed &&
              !modifyColumnBackup.isBackingUp && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-2 flex items-center gap-1">
                  ✓ Backup{" "}
                  {modifyColumnBackup.method === "r2"
                    ? "started"
                    : "downloaded"}
                </p>
              )}
          </div>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="modify-column-type">Column Type</Label>
              <Select
                value={modifyColumnValues.type}
                onValueChange={(value) =>
                  setModifyColumnValues({ ...modifyColumnValues, type: value })
                }
              >
                <SelectTrigger id="modify-column-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEXT">TEXT</SelectItem>
                  <SelectItem value="INTEGER">INTEGER</SelectItem>
                  <SelectItem value="REAL">REAL</SelectItem>
                  <SelectItem value="BLOB">BLOB</SelectItem>
                  <SelectItem value="NUMERIC">NUMERIC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="modify-column-default">
                Default Value (optional)
              </Label>
              <Input
                id="modify-column-default"
                placeholder="e.g., 0, 'unknown', CURRENT_TIMESTAMP"
                value={modifyColumnValues.defaultValue}
                onChange={(e) =>
                  setModifyColumnValues({
                    ...modifyColumnValues,
                    defaultValue: e.target.value,
                  })
                }
              />
            </div>

            <div
              className="flex items-start space-x-3"
              title="Prevents NULL values. Existing NULL values will be replaced with the default value."
            >
              <Checkbox
                id="modify-column-notnull"
                checked={modifyColumnValues.notnull}
                onCheckedChange={(checked) =>
                  setModifyColumnValues({
                    ...modifyColumnValues,
                    notnull: checked === true,
                  })
                }
              />
              <div className="space-y-1 leading-none">
                <Label
                  htmlFor="modify-column-notnull"
                  className="text-sm font-medium cursor-pointer"
                >
                  NOT NULL constraint
                </Label>
                <p className="text-xs text-muted-foreground">
                  If enabled, all existing NULL values will be replaced with the
                  default value
                </p>
              </div>
            </div>
          </div>
          <ErrorMessage error={error} variant="inline" />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowModifyColumnDialog(false)}
              disabled={modifyingColumnInProgress}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleModifyColumn()}
              disabled={modifyingColumnInProgress}
            >
              {modifyingColumnInProgress ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Modifying...
                </>
              ) : (
                "Modify Column"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Column Dialog */}
      <Dialog
        open={showDeleteColumnDialog}
        onOpenChange={setShowDeleteColumnDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Column</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the column "{deletingColumn?.name}
              "? This action cannot be undone and all data in this column will
              be permanently lost.
            </DialogDescription>
          </DialogHeader>
          {deletingColumn && (
            <div className="py-4">
              <div className="rounded-md border border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/30 p-4">
                <p className="text-sm font-medium mb-2">⚠️ Warning</p>
                <p className="text-sm text-muted-foreground">
                  This will permanently delete all data in the "
                  {deletingColumn.name}" column. Make sure you have a backup
                  before proceeding.
                </p>
              </div>
            </div>
          )}
          <ErrorMessage error={error} variant="inline" />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteColumnDialog(false)}
              disabled={deletingColumnInProgress}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeleteColumn()}
              disabled={deletingColumnInProgress}
            >
              {deletingColumnInProgress ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Column"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cascade Impact Simulator */}
      <CascadeImpactSimulator
        databaseId={databaseId}
        targetTable={tableName}
        {...(cascadeSimulatorWhereClause && {
          whereClause: cascadeSimulatorWhereClause,
        })}
        open={showCascadeSimulator}
        onClose={() => setShowCascadeSimulator(false)}
      />

      {/* Backup Progress Dialog */}
      {backupProgressDialog && (
        <BackupProgressDialog
          open={true}
          jobId={backupProgressDialog.jobId}
          operationName={backupProgressDialog.operationName}
          databaseName={`${databaseName} - ${backupProgressDialog.tableName}`}
          onClose={() => setBackupProgressDialog(null)}
        />
      )}
    </div>
  );
}
