import React, { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  RefreshCw,
  Loader2,
  AlertTriangle,
  Cloud,
  Trash2,
  Download,
  Calendar,
  HardDrive,
  Tag,
} from "lucide-react";
import {
  listR2Backups,
  restoreFromR2,
  deleteR2Backup,
  downloadR2Backup,
  getR2BackupSourceLabel,
  type R2BackupListItem,
} from "@/services/api";
import { ErrorMessage } from "@/components/ui/error-message";

interface R2RestoreDialogProps {
  open: boolean;
  databaseId: string;
  databaseName: string;
  onClose: () => void;
  onRestoreStarted: (jobId: string) => void;
}

export function R2RestoreDialog({
  open,
  databaseId,
  databaseName,
  onClose,
  onRestoreStarted,
}: R2RestoreDialogProps): React.JSX.Element {
  const [backups, setBackups] = useState<R2BackupListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBackup, setSelectedBackup] = useState<R2BackupListItem | null>(
    null,
  );
  const [isRestoring, setIsRestoring] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<R2BackupListItem | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState<number | null>(null);

  const loadBackups = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await listR2Backups(databaseId);
      setBackups(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load backups");
    } finally {
      setLoading(false);
    }
  }, [databaseId]);

  // Load backups on open
  useEffect(() => {
    if (open) {
      void loadBackups();
    }
  }, [open, loadBackups]);

  const handleRestore = async (): Promise<void> => {
    if (!selectedBackup) return;

    setIsRestoring(true);
    setError(null);

    try {
      const result = await restoreFromR2(databaseId, selectedBackup.path);
      onRestoreStarted(result.job_id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start restore");
    } finally {
      setIsRestoring(false);
      setShowConfirm(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      await deleteR2Backup(
        databaseId,
        deleteTarget.timestamp,
        deleteTarget.path,
      );
      setBackups((prev) => prev.filter((b) => b.path !== deleteTarget.path));
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete backup");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = async (backup: R2BackupListItem): Promise<void> => {
    setIsDownloading(backup.timestamp);
    setError(null);
    try {
      await downloadR2Backup(databaseId, backup.timestamp, databaseName);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to download backup",
      );
    } finally {
      setIsDownloading(null);
    }
  };

  const handleClose = (): void => {
    if (!isRestoring && !isDeleting) {
      setSelectedBackup(null);
      setShowConfirm(false);
      setDeleteTarget(null);
      setError(null);
      onClose();
    }
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getSourceColor = (source: string): string => {
    switch (source) {
      case "manual":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "rename_database":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "strict_mode":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
      case "fts5_convert":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-blue-500" />
            Restore from R2
          </DialogTitle>
          <DialogDescription>
            Select a backup to restore &quot;{databaseName}&quot;
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Warning Alert */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">
                  Warning: Destructive Operation
                </h4>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Restoring will <strong>overwrite all existing data</strong> in
                  the database with the backup contents. This cannot be undone.
                  Consider creating a backup before restoring.
                </p>
              </div>
            </div>
          </div>

          {/* Backups List */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8">
              <Cloud className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                No backups found for this database
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[250px] rounded-md border">
              <div className="p-2 space-y-2">
                {backups.map((backup) => (
                  <div
                    key={backup.path}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedBackup?.path === backup.path
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-border hover:bg-accent"
                    }`}
                    onClick={() => setSelectedBackup(backup)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && setSelectedBackup(backup)
                    }
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${getSourceColor(backup.source)}`}
                          >
                            <Tag className="h-3 w-3 inline mr-1" />
                            {getR2BackupSourceLabel(backup.source)}
                          </span>
                          {backup.tableName && (
                            <span className="text-xs text-muted-foreground">
                              Table: {backup.tableName}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(backup.timestamp)}
                          </span>
                          <span className="flex items-center gap-1">
                            <HardDrive className="h-3 w-3" />
                            {formatSize(backup.size)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-blue-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDownload(backup);
                          }}
                          disabled={isDownloading === backup.timestamp}
                          aria-label="Download backup"
                          title="Download backup to device"
                        >
                          {isDownloading === backup.timestamp ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(backup);
                          }}
                          aria-label="Delete backup"
                          title="Delete backup from R2"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {/* Error Message */}
          <ErrorMessage error={error} variant="inline" showTitle />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isRestoring}
          >
            Cancel
          </Button>
          <Button
            onClick={() => setShowConfirm(true)}
            disabled={!selectedBackup || isRestoring}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Restore Selected
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Confirm Restore Dialog */}
      <Dialog
        open={showConfirm}
        onOpenChange={(isOpen) => !isOpen && setShowConfirm(false)}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-amber-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Confirm Restore
            </DialogTitle>
            <DialogDescription>
              This will overwrite all data in &quot;{databaseName}&quot;
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to restore from the backup created on{" "}
              <strong>
                {selectedBackup ? formatDate(selectedBackup.timestamp) : ""}
              </strong>
              ?
            </p>
            <p className="text-sm text-destructive mt-2">
              This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirm(false)}
              disabled={isRestoring}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleRestore()}
              disabled={isRestoring}
            >
              {isRestoring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Restoring...
                </>
              ) : (
                "Yes, Restore"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(isOpen) => !isOpen && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Delete Backup
            </DialogTitle>
            <DialogDescription>
              This will permanently delete the backup
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Delete backup created on{" "}
              <strong>
                {deleteTarget ? formatDate(deleteTarget.timestamp) : ""}
              </strong>
              ?
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
