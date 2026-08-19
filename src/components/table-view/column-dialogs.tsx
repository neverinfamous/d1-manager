import { Loader2, Cloud, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorMessage } from "@/components/ui/error-message";
import { backupTableToR2, api } from "@/services/api";
import type { ColumnInfo, R2BackupStatus } from "./types";

interface ColumnDialogsProps {
  databaseId: string;
  databaseName: string;
  tableName: string;
  error: string | null;
  setError: (error: string | null) => void;
  r2BackupStatus: R2BackupStatus | null;
  setBackupProgressDialog: (
    dialog: { jobId: string; operationName: string; tableName: string } | null
  ) => void;

  showAddColumnDialog: boolean;
  setShowAddColumnDialog: (show: boolean) => void;
  addColumnValues: { name: string; type: string; notnull: boolean; unique: boolean; defaultValue: string };
  setAddColumnValues: (values: { name: string; type: string; notnull: boolean; unique: boolean; defaultValue: string }) => void;
  addingColumn: boolean;
  onAddColumn: () => void;

  showRenameColumnDialog: boolean;
  setShowRenameColumnDialog: (show: boolean) => void;
  renamingColumn: ColumnInfo | null;
  renameColumnValue: string;
  setRenameColumnValue: (val: string) => void;
  renamingColumnInProgress: boolean;
  onRenameColumn: () => void;

  showModifyColumnDialog: boolean;
  setShowModifyColumnDialog: (show: boolean) => void;
  modifyingColumn: ColumnInfo | null;
  modifyColumnValues: { type: string; notnull: boolean; defaultValue: string };
  setModifyColumnValues: (values: { type: string; notnull: boolean; defaultValue: string }) => void;
  modifyingColumnInProgress: boolean;
  modifyColumnBackup: { method: "r2" | "download"; format: "sql" | "csv" | "json"; completed: boolean; isBackingUp: boolean };
  setModifyColumnBackup: (val: { method: "r2" | "download"; format: "sql" | "csv" | "json"; completed: boolean; isBackingUp: boolean } | ((prev: { method: "r2" | "download"; format: "sql" | "csv" | "json"; completed: boolean; isBackingUp: boolean }) => { method: "r2" | "download"; format: "sql" | "csv" | "json"; completed: boolean; isBackingUp: boolean })) => void;
  onModifyColumn: () => void;

  showDeleteColumnDialog: boolean;
  setShowDeleteColumnDialog: (show: boolean) => void;
  deletingColumn: ColumnInfo | null;
  deletingColumnInProgress: boolean;
  onDeleteColumn: () => void;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function ColumnDialogs({
  databaseId,
  databaseName,
  tableName,
  error,
  setError,
  r2BackupStatus,
  setBackupProgressDialog,

  showAddColumnDialog,
  setShowAddColumnDialog,
  addColumnValues,
  setAddColumnValues,
  addingColumn,
  onAddColumn,

  showRenameColumnDialog,
  setShowRenameColumnDialog,
  renamingColumn,
  renameColumnValue,
  setRenameColumnValue,
  renamingColumnInProgress,
  onRenameColumn,

  showModifyColumnDialog,
  setShowModifyColumnDialog,
  modifyingColumn,
  modifyColumnValues,
  setModifyColumnValues,
  modifyingColumnInProgress,
  modifyColumnBackup,
  setModifyColumnBackup,
  onModifyColumn,

  showDeleteColumnDialog,
  setShowDeleteColumnDialog,
  deletingColumn,
  deletingColumnInProgress,
  onDeleteColumn,
}: ColumnDialogsProps) {
  return (
    <>
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
              onClick={onAddColumn}
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
              onClick={onRenameColumn}
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

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4 mb-4">
            <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">
              💾 Strongly Recommended: Create a backup first
            </h4>
            <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
              Before modifying this column, we highly recommend creating a
              backup of your table in case anything goes wrong.
            </p>

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
                  <RadioGroupItem value="sql" id="modify-backup-sql" className="h-3 w-3" />
                  <Label htmlFor="modify-backup-sql" className="text-xs text-blue-700 dark:text-blue-300">
                    SQL
                  </Label>
                </div>
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="csv" id="modify-backup-csv" className="h-3 w-3" />
                  <Label htmlFor="modify-backup-csv" className="text-xs text-blue-700 dark:text-blue-300">
                    CSV
                  </Label>
                </div>
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="json" id="modify-backup-json" className="h-3 w-3" />
                  <Label htmlFor="modify-backup-json" className="text-xs text-blue-700 dark:text-blue-300">
                    JSON
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="flex gap-2">
              {r2BackupStatus?.configured && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
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
                        "column_modify"
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
                  {modifyColumnBackup.isBackingUp && modifyColumnBackup.method === "r2" ? (
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
                  const formatToExport = modifyColumnBackup.format;
                  setModifyColumnBackup((prev) => ({
                    ...prev,
                    isBackingUp: true,
                    method: "download",
                  }));
                  try {
                    await api.exportTable(databaseId, tableName, formatToExport);
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
                {modifyColumnBackup.isBackingUp && modifyColumnBackup.method === "download" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Download Backup
              </Button>
            </div>

            {modifyColumnBackup.completed && !modifyColumnBackup.isBackingUp && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-2 flex items-center gap-1">
                ✓ Backup {modifyColumnBackup.method === "r2" ? "started" : "downloaded"}
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
              onClick={onModifyColumn}
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
              onClick={onDeleteColumn}
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
    </>
  );
}
