import { Loader2, AlertTriangle } from "lucide-react";
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
import { ErrorMessage } from "@/components/ui/error-message";
import type { ColumnInfo } from "./types";

interface RowDialogsProps {
  tableName: string;
  schema: ColumnInfo[];
  error: string | null;
  showInsertDialog: boolean;
  setShowInsertDialog: (show: boolean) => void;
  insertValues: Record<string, string>;
  setInsertValues: (values: Record<string, string>) => void;
  inserting: boolean;
  onInsertRow: () => void;
  showEditDialog: boolean;
  setShowEditDialog: (show: boolean) => void;
  editValues: Record<string, string>;
  setEditValues: (values: Record<string, string>) => void;
  allowEditPrimaryKey: boolean;
  setAllowEditPrimaryKey: (allow: boolean) => void;
  updating: boolean;
  onUpdateRow: () => void;
  showDeleteDialog: boolean;
  setShowDeleteDialog: (show: boolean) => void;
  deletingRow: Record<string, unknown> | null;
  deleting: boolean;
  onDeleteRow: () => void;
  onSimulateCascadeImpact: () => void;
  showBulkDeleteDialog: boolean;
  setShowBulkDeleteDialog: (show: boolean) => void;
  selectedRows: number[];
  bulkDeleting: boolean;
  onBulkDeleteRows: () => void;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function RowDialogs({
  tableName,
  schema,
  error,
  showInsertDialog,
  setShowInsertDialog,
  insertValues,
  setInsertValues,
  inserting,
  onInsertRow,
  showEditDialog,
  setShowEditDialog,
  editValues,
  setEditValues,
  allowEditPrimaryKey,
  setAllowEditPrimaryKey,
  updating,
  onUpdateRow,
  showDeleteDialog,
  setShowDeleteDialog,
  deletingRow,
  deleting,
  onDeleteRow,
  onSimulateCascadeImpact,
  showBulkDeleteDialog,
  setShowBulkDeleteDialog,
  selectedRows,
  bulkDeleting,
  onBulkDeleteRows,
}: RowDialogsProps) {
  return (
    <>
      <Dialog open={showInsertDialog} onOpenChange={setShowInsertDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Insert Row into {tableName}</DialogTitle>
            <DialogDescription>
              Fill in the values for the new row. Leave fields empty for NULL values.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {schema.map((col) => (
              <div key={col.name} className="space-y-2">
                <Label htmlFor={`insert-${col.name}`}>
                  {col.name}
                  {col.pk > 0 && (
                    <span className="text-xs text-muted-foreground ml-2">(Primary Key)</span>
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
            <Button onClick={onInsertRow} disabled={inserting}>
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

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Row in {tableName}</DialogTitle>
            <DialogDescription>
              Modify the values for this row. Leave fields empty for NULL values.
            </DialogDescription>
          </DialogHeader>
          {schema.some((col) => col.pk > 0) && (
            <div className="flex items-start space-x-3 rounded-md border border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/30 p-4">
              <Checkbox
                id="allow-edit-pk"
                checked={allowEditPrimaryKey}
                onCheckedChange={(checked) => setAllowEditPrimaryKey(checked === true)}
              />
              <div className="space-y-1 leading-none">
                <Label htmlFor="allow-edit-pk" className="text-sm font-medium cursor-pointer">
                  ⚠️ Allow editing primary key (advanced)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Changing primary keys can break relationships and cause data integrity issues. Only
                  enable this if you know what you're doing.
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
                    <span className="text-xs text-muted-foreground ml-2">(Primary Key)</span>
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
                    disabled={col.pk > 0 && !allowEditPrimaryKey}
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
            <Button onClick={onUpdateRow} disabled={updating}>
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

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Row</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this row? This action cannot be undone.
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
                      <span className="text-muted-foreground">{String(deletingRow[col.name])}</span>
                    </div>
                  ))}
              </div>
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSimulateCascadeImpact}
                  className="w-full"
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Simulate Cascade Impact
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Preview which tables and rows will be affected by this deletion
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
            <Button variant="destructive" onClick={onDeleteRow} disabled={deleting}>
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

      <Dialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selectedRows.length} Row{selectedRows.length !== 1 ? "s" : ""}
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the selected rows? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              {selectedRows.length} row{selectedRows.length !== 1 ? "s" : ""} will be permanently
              deleted from the table.
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
            <Button variant="destructive" onClick={onBulkDeleteRows} disabled={bulkDeleting}>
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
    </>
  );
}
