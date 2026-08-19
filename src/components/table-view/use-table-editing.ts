import { useState } from "react";
import { executeQuery } from "@/services/api";
import type { ColumnInfo } from "./types";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useTableEditing({
  databaseId,
  tableName,
  schema,
  loadTableData,
  setError,
  onUndoableOperation,
  filteredData,
  selectedRows,
  setSelectedRows,
}: {
  databaseId: string;
  tableName: string;
  schema: ColumnInfo[];
  loadTableData: () => Promise<void>;
  setError: (error: string | null) => void;
  onUndoableOperation?: (() => void) | undefined;
  filteredData: Record<string, unknown>[];
  selectedRows: number[];
  setSelectedRows: (rows: number[]) => void;
}) {
  const [showInsertDialog, setShowInsertDialog] = useState(false);
  const [insertValues, setInsertValues] = useState<Record<string, string>>({});
  const [inserting, setInserting] = useState(false);

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [updating, setUpdating] = useState(false);
  const [allowEditPrimaryKey, setAllowEditPrimaryKey] = useState(false);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingRow, setDeletingRow] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const [showCascadeSimulator, setShowCascadeSimulator] = useState(false);
  const [cascadeSimulatorWhereClause, setCascadeSimulatorWhereClause] = useState<string | undefined>();

  const handleOpenInsertDialog = (): void => {
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
      const columnsWithValues = schema.filter((col) => {
        const value = insertValues[col.name];
        const hasValue = value !== "";

        if (hasValue) return true;
        if (col.pk > 0 && col.type?.toUpperCase().includes("INTEGER")) return false;
        if (col.notnull && col.dflt_value !== null) return false;
        return true;
      });

      let query: string;
      if (columnsWithValues.length === 0) {
        query = `INSERT INTO "${tableName}" DEFAULT VALUES`;
      } else {
        const columnNames = columnsWithValues.map((col) => col.name);
        const values = columnsWithValues.map((col) => {
          const value = insertValues[col.name] ?? "";
          if (value === "") return "NULL";
          if (!isNaN(Number(value)) && value.trim() !== "") return value;
          return `'${value.replace(/'/g, "''")}'`;
        });

        query = `INSERT INTO "${tableName}" (${columnNames.map((n) => `"${n}"`).join(", ")}) VALUES (${values.join(", ")})`;
      }

      await executeQuery(databaseId, query, [], true);

      setShowInsertDialog(false);
      setInsertValues({});
      await loadTableData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to insert row");
    } finally {
      setInserting(false);
    }
  };

  const handleOpenEditDialog = (row: Record<string, unknown>): void => {
    setEditingRow(row);
    const stringValues: Record<string, string> = {};
    schema.forEach((col) => {
      const value = row[col.name];
      stringValues[col.name] =
        value !== null && value !== undefined
          ? typeof value === "object"
            ? JSON.stringify(value)
            : `${value as string | number | boolean}`
          : "";
    });
    setEditValues(stringValues);
    setAllowEditPrimaryKey(false);
    setShowEditDialog(true);
  };

  const handleUpdateRow = async (): Promise<void> => {
    if (!editingRow) return;

    setUpdating(true);
    setError(null);

    try {
      const pkColumns = schema.filter((col) => col.pk > 0);
      if (pkColumns.length === 0) {
        throw new Error("Cannot update row: No primary key found");
      }

      const updateColumns = allowEditPrimaryKey
        ? schema
        : schema.filter((col) => col.pk === 0);

      const setClause = updateColumns
        .map((col) => {
          const value = editValues[col.name] ?? "";
          if (value === "") return `"${col.name}" = NULL`;
          if (!isNaN(Number(value)) && value.trim() !== "") return `"${col.name}" = ${value}`;
          return `"${col.name}" = '${value.replace(/'/g, "''")}'`;
        })
        .join(", ");

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
      await loadTableData();
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
      await loadTableData();

      if (onUndoableOperation) {
        onUndoableOperation();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete row");
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDeleteRows = async (): Promise<void> => {
    if (selectedRows.length === 0) return;

    setBulkDeleting(true);
    setError(null);

    try {
      const pkColumns = schema.filter((col) => col.pk > 0);
      if (pkColumns.length === 0) {
        throw new Error("Cannot delete rows: No primary key found");
      }

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

  return {
    showInsertDialog,
    setShowInsertDialog,
    insertValues,
    setInsertValues,
    inserting,
    handleOpenInsertDialog,
    handleInsertRow,

    showEditDialog,
    setShowEditDialog,
    editingRow,
    editValues,
    setEditValues,
    updating,
    allowEditPrimaryKey,
    setAllowEditPrimaryKey,
    handleOpenEditDialog,
    handleUpdateRow,

    showDeleteDialog,
    setShowDeleteDialog,
    deletingRow,
    deleting,
    handleOpenDeleteDialog,
    handleDeleteRow,
    handleSimulateCascadeImpact,

    showBulkDeleteDialog,
    setShowBulkDeleteDialog,
    bulkDeleting,
    handleBulkDeleteRows,

    showCascadeSimulator,
    setShowCascadeSimulator,
    cascadeSimulatorWhereClause,
  };
}
