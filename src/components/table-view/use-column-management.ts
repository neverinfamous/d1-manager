import { useState } from "react";
import { api } from "@/services/api";
import type { ColumnInfo } from "./types";
import { validateIdentifier, validateNotNullConstraint, validateDefaultValue } from "@/lib/sqlValidator";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useColumnManagement({
  databaseId,
  tableName,
  schema,
  hasData,
  loadTableData,
  setError,
  onUndoableOperation,
}: {
  databaseId: string;
  tableName: string;
  schema: ColumnInfo[];
  hasData: boolean;
  loadTableData: (skipSchemaCache?: boolean) => Promise<void>;
  setError: (error: string | null) => void;
  onUndoableOperation?: (() => void) | undefined;
}) {
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
  const [renamingColumnInProgress, setRenamingColumnInProgress] = useState(false);

  const [showModifyColumnDialog, setShowModifyColumnDialog] = useState(false);
  const [modifyingColumn, setModifyingColumn] = useState<ColumnInfo | null>(null);
  const [modifyColumnValues, setModifyColumnValues] = useState({
    type: "TEXT",
    notnull: false,
    defaultValue: "",
  });
  const [modifyingColumnInProgress, setModifyingColumnInProgress] = useState(false);
  const [modifyColumnBackup, setModifyColumnBackup] = useState({
    method: "download" as "r2" | "download",
    format: "sql" as "sql" | "csv" | "json",
    completed: false,
    isBackingUp: false,
  });

  const [showDeleteColumnDialog, setShowDeleteColumnDialog] = useState(false);
  const [deletingColumn, setDeletingColumn] = useState<ColumnInfo | null>(null);
  const [deletingColumnInProgress, setDeletingColumnInProgress] = useState(false);

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
      const nameValidation = validateIdentifier(addColumnValues.name, "column");
      if (!nameValidation.isValid) {
        const errorMsg = nameValidation.suggestion
          ? `${nameValidation.error}. ${nameValidation.suggestion}`
          : (nameValidation.error ?? "Invalid column name");
        throw new Error(errorMsg);
      }

      if (
        schema.some(
          (col) => col.name.toLowerCase() === addColumnValues.name.toLowerCase()
        )
      ) {
        throw new Error(`Column "${addColumnValues.name}" already exists in this table`);
      }

      const notNullValidation = validateNotNullConstraint(
        addColumnValues.notnull,
        addColumnValues.defaultValue,
        hasData,
        false
      );
      if (!notNullValidation.isValid) {
        const errorMsg = notNullValidation.suggestion
          ? `${notNullValidation.error}. ${notNullValidation.suggestion}`
          : (notNullValidation.error ?? "Invalid constraint");
        throw new Error(errorMsg);
      }

      if (addColumnValues.defaultValue) {
        const defaultValidation = validateDefaultValue(
          addColumnValues.defaultValue,
          addColumnValues.type
        );
        if (!defaultValidation.isValid) {
          const errorMsg = defaultValidation.suggestion
            ? `${defaultValidation.error}. ${defaultValidation.suggestion}`
            : (defaultValidation.error ?? "Invalid default value");
          throw new Error(errorMsg);
        }
      }

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
      await loadTableData(true);
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
      const nameValidation = validateIdentifier(renameColumnValue, "column");
      if (!nameValidation.isValid) {
        const errorMsg = nameValidation.suggestion
          ? `${nameValidation.error}. ${nameValidation.suggestion}`
          : (nameValidation.error ?? "Invalid column name");
        throw new Error(errorMsg);
      }

      if (renameColumnValue === renamingColumn.name) {
        throw new Error("New name must be different from current name");
      }

      if (
        schema.some(
          (col) => col.name.toLowerCase() === renameColumnValue.toLowerCase()
        )
      ) {
        throw new Error(`Column "${renameColumnValue}" already exists in this table`);
      }

      await api.renameColumn(
        databaseId,
        tableName,
        renamingColumn.name,
        renameColumnValue
      );

      setShowRenameColumnDialog(false);
      setRenamingColumn(null);
      setRenameColumnValue("");
      await loadTableData(true);
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
      await loadTableData(true);
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
      await api.deleteColumn(databaseId, tableName, deletingColumn.name);

      setShowDeleteColumnDialog(false);
      setDeletingColumn(null);
      await loadTableData(true);

      if (onUndoableOperation) {
        onUndoableOperation();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete column");
    } finally {
      setDeletingColumnInProgress(false);
    }
  };

  return {
    showAddColumnDialog,
    setShowAddColumnDialog,
    addColumnValues,
    setAddColumnValues,
    addingColumn,
    handleOpenAddColumnDialog,
    handleAddColumn,

    showRenameColumnDialog,
    setShowRenameColumnDialog,
    renamingColumn,
    setRenamingColumn,
    renameColumnValue,
    setRenameColumnValue,
    renamingColumnInProgress,
    handleRenameColumn,

    showModifyColumnDialog,
    setShowModifyColumnDialog,
    modifyingColumn,
    setModifyingColumn,
    modifyColumnValues,
    setModifyColumnValues,
    modifyingColumnInProgress,
    modifyColumnBackup,
    setModifyColumnBackup,
    handleModifyColumn,

    showDeleteColumnDialog,
    setShowDeleteColumnDialog,
    deletingColumn,
    setDeletingColumn,
    deletingColumnInProgress,
    handleDeleteColumn,
  };
}
