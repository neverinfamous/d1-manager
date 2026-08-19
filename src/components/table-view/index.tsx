import { useState, useCallback, useMemo, useEffect } from "react";
import { getR2BackupStatus, type R2BackupStatus } from "@/services/api";
import { BackupProgressDialog } from "@/components/BackupProgressDialog";
import { CascadeImpactSimulator } from "@/components/CascadeImpactSimulator";
import { BreadcrumbNavigation } from "@/components/BreadcrumbNavigation";
import { ErrorMessage } from "@/components/ui/error-message";

import type { TableViewProps } from "./types";
import { useTableData } from "./use-table-data";
import { useTableEditing } from "./use-table-editing";
import { useColumnManagement } from "./use-column-management";
import { SchemaPanel } from "./schema-panel";
import { DataGrid } from "./data-grid";
import { TableHeaderToolbar, RowSearchToolbar } from "./toolbar";
import { Pagination } from "./pagination";
import { RowDialogs } from "./row-dialogs";
import { ColumnDialogs } from "./column-dialogs";
import { Loader2 } from "lucide-react";


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
  const rowsPerPage = 50;
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const [rowSearchQuery, setRowSearchQuery] = useState("");
  const [selectedRows, setSelectedRows] = useState<number[]>([]);

  const [dataSortColumn, setDataSortColumn] = useState<string | null>(null);
  const [dataSortDirection, setDataSortDirection] = useState<"asc" | "desc">("asc");

  const [schemaSortField, setSchemaSortField] = useState<"name" | "type" | "nullable">("name");
  const [schemaSortDirection, setSchemaSortDirection] = useState<"asc" | "desc">("asc");

  const [r2BackupStatus, setR2BackupStatus] = useState<R2BackupStatus | null>(null);
  const [backupProgressDialog, setBackupProgressDialog] = useState<{
    jobId: string;
    operationName: string;
    tableName: string;
  } | null>(null);

  useEffect(() => {
    const loadR2Status = async (): Promise<void> => {
      try {
        const status = await getR2BackupStatus();
        setR2BackupStatus(status);
      } catch {
        setR2BackupStatus(null);
      }
    };
    void loadR2Status();
  }, []);

  const {
    schema,
    data,
    totalCount,
    loading,
    loadingRows,
    foreignKeys,
    loadTableData,
    paginationInfo,
  } = useTableData({
    databaseId,
    tableName,
    fkFilter,
    page,
    rowsPerPage,
    setError,
  });

  const filteredData = useMemo(() => {
    let result = data;

    if (rowSearchQuery.trim()) {
      const query = rowSearchQuery.toLowerCase().trim();
      result = result.filter((row) => {
        return schema.some((col) => {
          const value = row[col.name];
          if (value === null || value === undefined) return false;
          let strValue: string;
          if (typeof value === "object") {
            strValue = JSON.stringify(value);
          } else if (typeof value === "string") {
            strValue = value;
          } else {
            strValue = `${value as string | number | boolean}`;
          }
          return strValue.toLowerCase().includes(query);
        });
      });
    }

    if (dataSortColumn) {
      result = [...result].sort((a, b) => {
        const aVal = a[dataSortColumn];
        const bVal = b[dataSortColumn];

        if (aVal === null || aVal === undefined) return dataSortDirection === "asc" ? -1 : 1;
        if (bVal === null || bVal === undefined) return dataSortDirection === "asc" ? 1 : -1;

        let comparison: number;
        if (typeof aVal === "number" && typeof bVal === "number") {
          comparison = aVal - bVal;
        } else {
          const aStr = typeof aVal === "object" ? JSON.stringify(aVal) : `${aVal as string | number | boolean}`;
          const bStr = typeof bVal === "object" ? JSON.stringify(bVal) : `${bVal as string | number | boolean}`;
          comparison = aStr.localeCompare(bStr);
        }

        return dataSortDirection === "asc" ? comparison : -comparison;
      });
    }

    return result;
  }, [data, rowSearchQuery, schema, dataSortColumn, dataSortDirection]);

  useEffect(() => {
    void Promise.resolve().then(() => setSelectedRows([]));
  }, [data]);

  const tableEditing = useTableEditing({
    databaseId,
    tableName,
    schema,
    loadTableData,
    setError,
    onUndoableOperation,
    filteredData,
    selectedRows,
    setSelectedRows,
  });

  const columnManagement = useColumnManagement({
    databaseId,
    tableName,
    schema,
    hasData: data.length > 0 || (totalCount !== null && totalCount > 0),
    loadTableData,
    setError,
    onUndoableOperation,
  });

  const formatValue = useCallback((value: unknown): string => {
    if (value === null) return "NULL";
    if (value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return `${value as string | number | boolean}`;
  }, []);

  const handleExportCSV = (): void => {
    if (data.length === 0) {
      alert("No data to export");
      return;
    }

    try {
      const columns = schema.map((col) => col.name);
      const csvRows = [];
      csvRows.push(columns.map((col) => `"${col}"`).join(","));

      for (const row of data) {
        const values = columns.map((col) => {
          const cell = row[col];
          if (cell === null) return "NULL";
          if (cell === undefined) return "";
          const str = typeof cell === "object" ? JSON.stringify(cell) : `${cell as string | number | boolean}`;
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        });
        csvRows.push(values.join(","));
      }

      const csvContent = csvRows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);

      link.href = url;
      link.download = `${tableName}_${String(Date.now())}.csv`;
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      alert("Failed to export CSV: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  return (
    <div className="space-y-6">
      {navigationHistory && navigationHistory.length > 0 && (
        <BreadcrumbNavigation
          databaseName={databaseName}
          navigationHistory={[...navigationHistory, { tableName }]}
          onNavigateToDatabase={onBack}
          onNavigateToTable={(index) => {
            if (onNavigateToHistoryTable) onNavigateToHistoryTable(index);
          }}
          onGoBack={() => {
            if (navigationHistory.length > 0 && onNavigateToHistoryTable) {
              onNavigateToHistoryTable(navigationHistory.length - 1);
            }
          }}
        />
      )}

      <TableHeaderToolbar
        tableName={tableName}
        databaseName={databaseName}
        rowCount={data.length}
        fkFilter={fkFilter}
        loadingRows={loadingRows}
        onBack={onBack}
        onRefresh={() => void loadTableData(true)}
        onExportCSV={handleExportCSV}
        onAddColumn={columnManagement.handleOpenAddColumnDialog}
        onInsertRow={tableEditing.handleOpenInsertDialog}
      />

      {!loading && schema.length > 0 && (
        <SchemaPanel
          schema={schema}
          schemaSortField={schemaSortField}
          schemaSortDirection={schemaSortDirection}
          onSchemaSort={(field) => {
            if (schemaSortField === field) {
              setSchemaSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
            } else {
              setSchemaSortField(field);
              setSchemaSortDirection("asc");
            }
          }}
          r2BackupStatus={r2BackupStatus}
          onRenameColumn={(col) => {
            columnManagement.setRenamingColumn(col);
            columnManagement.setRenameColumnValue(col.name);
            columnManagement.setShowRenameColumnDialog(true);
          }}
          onModifyColumn={(col) => {
            columnManagement.setModifyingColumn(col);
            columnManagement.setModifyColumnValues({
              type: col.type || "TEXT",
              notnull: col.notnull === 1,
              defaultValue: col.dflt_value || "",
            });
            columnManagement.setModifyColumnBackup({
              method: r2BackupStatus?.configured ? "r2" : "download",
              format: "sql",
              completed: false,
              isBackingUp: false,
            });
            columnManagement.setShowModifyColumnDialog(true);
          }}
          onDeleteColumn={(col) => {
            columnManagement.setDeletingColumn(col);
            columnManagement.setShowDeleteColumnDialog(true);
          }}
        />
      )}

      {!loading && data.length > 0 && (
        <RowSearchToolbar
          rowSearchQuery={rowSearchQuery}
          onSearchChange={setRowSearchQuery}
          filteredCount={filteredData.length}
          totalCount={data.length}
          selectedCount={selectedRows.length}
          onSelectAll={() => setSelectedRows(filteredData.map((_, index) => index))}
          onClearSelection={() => setSelectedRows([])}
          onBulkDelete={() => tableEditing.setShowBulkDeleteDialog(true)}
          bulkDeleting={tableEditing.bulkDeleting}
        />
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      <ErrorMessage error={error} variant="card" />

      {!loading && !error && (
        <DataGrid
          schema={schema}
          data={data}
          filteredData={filteredData}
          loadingRows={loadingRows}
          selectedRows={selectedRows}
          onToggleRowSelection={(index) =>
            setSelectedRows((prev) =>
              prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
            )
          }
          onSelectAllRows={() => setSelectedRows(filteredData.map((_, index) => index))}
          onClearRowSelection={() => setSelectedRows([])}
          dataSortColumn={dataSortColumn}
          dataSortDirection={dataSortDirection}
          onDataSort={(column) => {
            if (dataSortColumn === column) {
              setDataSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
            } else {
              setDataSortColumn(column);
              setDataSortDirection("asc");
            }
          }}
          foreignKeys={foreignKeys}
          onNavigateToRelatedTable={onNavigateToRelatedTable}
          onEditRow={tableEditing.handleOpenEditDialog}
          onDeleteRow={tableEditing.handleOpenDeleteDialog}
          onInsertFirstRow={tableEditing.handleOpenInsertDialog}
          onClearSearch={() => setRowSearchQuery("")}
          formatValue={formatValue}
        />
      )}

      {!loading && !error && data.length > 0 && (
        <Pagination
          page={page}
          onPageChange={setPage}
          start={paginationInfo.start}
          end={paginationInfo.end}
          totalCount={totalCount}
          totalPages={paginationInfo.totalPages}
          hasMore={paginationInfo.hasMore}
        />
      )}

      <RowDialogs
        tableName={tableName}
        schema={schema}
        error={error}
        showInsertDialog={tableEditing.showInsertDialog}
        setShowInsertDialog={tableEditing.setShowInsertDialog}
        insertValues={tableEditing.insertValues}
        setInsertValues={tableEditing.setInsertValues}
        inserting={tableEditing.inserting}
        onInsertRow={() => void tableEditing.handleInsertRow()}
        showEditDialog={tableEditing.showEditDialog}
        setShowEditDialog={tableEditing.setShowEditDialog}
        editValues={tableEditing.editValues}
        setEditValues={tableEditing.setEditValues}
        allowEditPrimaryKey={tableEditing.allowEditPrimaryKey}
        setAllowEditPrimaryKey={tableEditing.setAllowEditPrimaryKey}
        updating={tableEditing.updating}
        onUpdateRow={() => void tableEditing.handleUpdateRow()}
        showDeleteDialog={tableEditing.showDeleteDialog}
        setShowDeleteDialog={tableEditing.setShowDeleteDialog}
        deletingRow={tableEditing.deletingRow}
        deleting={tableEditing.deleting}
        onDeleteRow={() => void tableEditing.handleDeleteRow()}
        onSimulateCascadeImpact={tableEditing.handleSimulateCascadeImpact}
        showBulkDeleteDialog={tableEditing.showBulkDeleteDialog}
        setShowBulkDeleteDialog={tableEditing.setShowBulkDeleteDialog}
        selectedRows={selectedRows}
        bulkDeleting={tableEditing.bulkDeleting}
        onBulkDeleteRows={() => void tableEditing.handleBulkDeleteRows()}
      />

      <ColumnDialogs
        databaseId={databaseId}
        databaseName={databaseName}
        tableName={tableName}
        error={error}
        setError={setError}
        r2BackupStatus={r2BackupStatus}
        setBackupProgressDialog={setBackupProgressDialog}
        showAddColumnDialog={columnManagement.showAddColumnDialog}
        setShowAddColumnDialog={columnManagement.setShowAddColumnDialog}
        addColumnValues={columnManagement.addColumnValues}
        setAddColumnValues={columnManagement.setAddColumnValues}
        addingColumn={columnManagement.addingColumn}
        onAddColumn={() => void columnManagement.handleAddColumn()}
        showRenameColumnDialog={columnManagement.showRenameColumnDialog}
        setShowRenameColumnDialog={columnManagement.setShowRenameColumnDialog}
        renamingColumn={columnManagement.renamingColumn}
        renameColumnValue={columnManagement.renameColumnValue}
        setRenameColumnValue={columnManagement.setRenameColumnValue}
        renamingColumnInProgress={columnManagement.renamingColumnInProgress}
        onRenameColumn={() => void columnManagement.handleRenameColumn()}
        showModifyColumnDialog={columnManagement.showModifyColumnDialog}
        setShowModifyColumnDialog={columnManagement.setShowModifyColumnDialog}
        modifyingColumn={columnManagement.modifyingColumn}
        modifyColumnValues={columnManagement.modifyColumnValues}
        setModifyColumnValues={columnManagement.setModifyColumnValues}
        modifyingColumnInProgress={columnManagement.modifyingColumnInProgress}
        modifyColumnBackup={columnManagement.modifyColumnBackup}
        setModifyColumnBackup={columnManagement.setModifyColumnBackup}
        onModifyColumn={() => void columnManagement.handleModifyColumn()}
        showDeleteColumnDialog={columnManagement.showDeleteColumnDialog}
        setShowDeleteColumnDialog={columnManagement.setShowDeleteColumnDialog}
        deletingColumn={columnManagement.deletingColumn}
        deletingColumnInProgress={columnManagement.deletingColumnInProgress}
        onDeleteColumn={() => void columnManagement.handleDeleteColumn()}
      />

      <CascadeImpactSimulator
        databaseId={databaseId}
        targetTable={tableName}
        {...(tableEditing.cascadeSimulatorWhereClause && {
          whereClause: tableEditing.cascadeSimulatorWhereClause,
        })}
        open={tableEditing.showCascadeSimulator}
        onClose={() => tableEditing.setShowCascadeSimulator(false)}
      />

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
