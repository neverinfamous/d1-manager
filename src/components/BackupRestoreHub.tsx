import { useState, useEffect, useCallback } from "react";
import {
  Undo,
  Loader2,
  Trash2,
  Clock,
  Table as TableIcon,
  Columns,
  Rows,
  ArrowLeft,
  AlertTriangle,
  Cloud,
  Download,
  Calendar,
  HardDrive,
  Tag,
  RefreshCw,
  Info,
  Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorMessage } from "@/components/ui/error-message";
import {
  getUndoHistory,
  restoreUndo,
  clearUndoHistory,
  listR2Backups,
  restoreFromR2,
  deleteR2Backup,
  downloadR2Backup,
  getR2BackupSourceLabel,
  getR2BackupStatus,
  getScheduledBackup,
  type UndoHistoryEntry,
  type R2BackupListItem,
  type ScheduledBackup as ScheduledBackupType,
} from "@/services/api";
import { ScheduledBackupManager } from "./ScheduledBackupManager";

// Tab types
type TabType = "quick-restore" | "r2-backups" | "scheduled";

interface BackupRestoreHubProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  databaseId: string;
  databaseName: string;
  fts5Count?: number | undefined;
  onRestoreSuccess?: () => void;
  onR2RestoreStarted?: (jobId: string) => void;
  onBack?: () => void;
  initialTab?: TabType;
}

export function BackupRestoreHub({
  open,
  onOpenChange,
  databaseId,
  databaseName,
  fts5Count,
  onRestoreSuccess,
  onR2RestoreStarted,
  onBack,
  initialTab = "quick-restore",
}: BackupRestoreHubProps): React.JSX.Element {
  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  // Reset tab to initialTab when dialog opens
  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  // Undo history state
  const [undoHistory, setUndoHistory] = useState<UndoHistoryEntry[]>([]);
  const [undoLoading, setUndoLoading] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [showUndoConfirm, setShowUndoConfirm] =
    useState<UndoHistoryEntry | null>(null);
  const [clearing, setClearing] = useState(false);

  // R2 backups state
  const [r2Backups, setR2Backups] = useState<R2BackupListItem[]>([]);
  const [r2Loading, setR2Loading] = useState(false);
  const [r2Error, setR2Error] = useState<string | null>(null);
  const [r2Configured, setR2Configured] = useState<boolean | null>(null);
  const [selectedBackups, setSelectedBackups] = useState<Set<string>>(
    new Set(),
  );
  const [selectedBackupForRestore, setSelectedBackupForRestore] =
    useState<R2BackupListItem | null>(null);
  const [showR2RestoreConfirm, setShowR2RestoreConfirm] = useState(false);
  const [isR2Restoring, setIsR2Restoring] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<R2BackupListItem[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [downloadingTimestamps, setDownloadingTimestamps] = useState<
    Set<number>
  >(new Set());

  // Info panel state
  const [showInfoPanel, setShowInfoPanel] = useState(false);

  // Scheduled backup state
  const [scheduledBackup, setScheduledBackup] =
    useState<ScheduledBackupType | null>(null);

  // Load data when dialog opens
  useEffect(() => {
    if (open) {
      void loadUndoHistory();
      void checkR2Status();
      void loadScheduledBackup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, databaseId]);

  // Load R2 backups when dialog opens (regardless of tab) so count shows in tab label
  useEffect(() => {
    if (open && r2Configured) {
      void loadR2Backups();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, databaseId, r2Configured]);

  // Check if R2 is configured
  const checkR2Status = async (): Promise<void> => {
    try {
      const status = await getR2BackupStatus();
      setR2Configured(status.configured);
    } catch {
      setR2Configured(false);
    }
  };

  // Load scheduled backup for this database
  const loadScheduledBackup = async (): Promise<void> => {
    try {
      const schedule = await getScheduledBackup(databaseId);
      setScheduledBackup(schedule);
    } catch {
      // Ignore errors - scheduled backup is optional
    }
  };

  // Load undo history
  const loadUndoHistory = async (): Promise<void> => {
    try {
      setUndoLoading(true);
      setUndoError(null);
      const data = await getUndoHistory(databaseId);
      setUndoHistory(data);
    } catch (err) {
      setUndoError(
        err instanceof Error ? err.message : "Failed to load undo history",
      );
    } finally {
      setUndoLoading(false);
    }
  };

  // Load R2 backups
  const loadR2Backups = async (): Promise<void> => {
    try {
      setR2Loading(true);
      setR2Error(null);
      const result = await listR2Backups(databaseId);
      setR2Backups(result);
    } catch (err) {
      setR2Error(
        err instanceof Error ? err.message : "Failed to load R2 backups",
      );
    } finally {
      setR2Loading(false);
    }
  };

  // Handle undo restore
  const handleUndoRestore = async (entry: UndoHistoryEntry): Promise<void> => {
    try {
      setRestoring(entry.id);
      setUndoError(null);
      await restoreUndo(databaseId, entry.id);
      await loadUndoHistory();
      if (onRestoreSuccess) {
        onRestoreSuccess();
      }
      setShowUndoConfirm(null);
    } catch (err) {
      setUndoError(err instanceof Error ? err.message : "Failed to restore");
    } finally {
      setRestoring(null);
    }
  };

  // Handle clear undo history
  const handleClearUndoHistory = async (): Promise<void> => {
    try {
      setClearing(true);
      setUndoError(null);
      await clearUndoHistory(databaseId);
      setUndoHistory([]);
      // Notify parent to update undo count badge
      if (onRestoreSuccess) {
        onRestoreSuccess();
      }
    } catch (err) {
      setUndoError(
        err instanceof Error ? err.message : "Failed to clear history",
      );
    } finally {
      setClearing(false);
    }
  };

  // Handle R2 restore
  const handleR2Restore = async (): Promise<void> => {
    if (!selectedBackupForRestore) return;

    setIsR2Restoring(true);
    setR2Error(null);

    try {
      const result = await restoreFromR2(
        databaseId,
        selectedBackupForRestore.path,
      );
      if (onR2RestoreStarted) {
        onR2RestoreStarted(result.job_id);
      }
      setShowR2RestoreConfirm(false);
      setSelectedBackupForRestore(null);
      onOpenChange(false);
    } catch (err) {
      setR2Error(
        err instanceof Error ? err.message : "Failed to start restore",
      );
    } finally {
      setIsR2Restoring(false);
    }
  };

  // Handle R2 delete (single or bulk)
  const handleR2Delete = async (): Promise<void> => {
    if (deleteTargets.length === 0) return;

    setIsDeleting(true);
    setR2Error(null);

    try {
      // Delete one by one (can be optimized with bulk endpoint later)
      for (const backup of deleteTargets) {
        await deleteR2Backup(databaseId, backup.timestamp, backup.path);
      }

      // Remove deleted backups from state
      const deletedPaths = new Set(deleteTargets.map((b) => b.path));
      setR2Backups((prev) => prev.filter((b) => !deletedPaths.has(b.path)));
      setSelectedBackups((prev) => {
        const newSet = new Set(prev);
        deleteTargets.forEach((b) => newSet.delete(b.path));
        return newSet;
      });
      setDeleteTargets([]);
    } catch (err) {
      setR2Error(
        err instanceof Error ? err.message : "Failed to delete backup(s)",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle R2 download (single)
  const handleR2Download = async (backup: R2BackupListItem): Promise<void> => {
    setDownloadingTimestamps((prev) => new Set(prev).add(backup.timestamp));
    setR2Error(null);
    try {
      await downloadR2Backup(databaseId, backup.timestamp, databaseName);
    } catch (err) {
      setR2Error(
        err instanceof Error ? err.message : "Failed to download backup",
      );
    } finally {
      setDownloadingTimestamps((prev) => {
        const newSet = new Set(prev);
        newSet.delete(backup.timestamp);
        return newSet;
      });
    }
  };

  // Handle bulk download
  const handleBulkDownload = async (): Promise<void> => {
    const selectedItems = r2Backups.filter((b) => selectedBackups.has(b.path));
    for (const backup of selectedItems) {
      await handleR2Download(backup);
    }
  };

  // Toggle selection
  const toggleSelection = useCallback((path: string) => {
    setSelectedBackups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  }, []);

  // Select all / deselect all
  const toggleSelectAll = useCallback(() => {
    if (selectedBackups.size === r2Backups.length) {
      setSelectedBackups(new Set());
    } else {
      setSelectedBackups(new Set(r2Backups.map((b) => b.path)));
    }
  }, [r2Backups, selectedBackups.size]);

  // Format date for undo history
  const formatUndoDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60)
      return `${String(diffMins)} minute${diffMins !== 1 ? "s" : ""} ago`;
    if (diffHours < 24)
      return `${String(diffHours)} hour${diffHours !== 1 ? "s" : ""} ago`;
    if (diffDays < 7)
      return `${String(diffDays)} day${diffDays !== 1 ? "s" : ""} ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };

  // Format timestamp for R2 backups
  const formatR2Date = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${String(bytes)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Get operation icon
  const getOperationIcon = (type: string): React.JSX.Element => {
    switch (type) {
      case "DROP_TABLE":
        return <TableIcon className="h-4 w-4" />;
      case "DROP_COLUMN":
        return <Columns className="h-4 w-4" />;
      case "DELETE_ROW":
        return <Rows className="h-4 w-4" />;
      default:
        return <Undo className="h-4 w-4" />;
    }
  };

  // Get operation color
  const getOperationColor = (type: string): string => {
    switch (type) {
      case "DROP_TABLE":
        return "text-red-600 dark:text-red-400";
      case "DROP_COLUMN":
        return "text-orange-600 dark:text-orange-400";
      case "DELETE_ROW":
        return "text-yellow-600 dark:text-yellow-400";
      default:
        return "text-gray-600 dark:text-gray-400";
    }
  };

  // Get source color for R2 backups
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
      case "column_modify":
        return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    }
  };

  // Handle dialog close
  const handleOpenChange = (newOpen: boolean): void => {
    if (!newOpen) {
      setShowUndoConfirm(null);
      setShowR2RestoreConfirm(false);
      setSelectedBackupForRestore(null);
      setDeleteTargets([]);
      setSelectedBackups(new Set());
    }
    onOpenChange(newOpen);
  };

  // Check if any operation is in progress
  const isOperationInProgress =
    restoring !== null ||
    clearing ||
    isR2Restoring ||
    isDeleting ||
    downloadingTimestamps.size > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        {/* Undo Confirm Dialog */}
        {showUndoConfirm ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                Confirm Restore
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to restore this operation?
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <div className="bg-muted/50 border rounded-lg p-4 space-y-2">
                <p className="font-medium">{showUndoConfirm.description}</p>
                <p className="text-sm text-muted-foreground">
                  Table:{" "}
                  <span className="font-mono">
                    {showUndoConfirm.target_table}
                  </span>
                </p>
                {showUndoConfirm.target_column && (
                  <p className="text-sm text-muted-foreground">
                    Column:{" "}
                    <span className="font-mono">
                      {showUndoConfirm.target_column}
                    </span>
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  {formatUndoDate(showUndoConfirm.executed_at)}
                </p>
              </div>

              <ErrorMessage error={undoError} className="mt-4" />

              <div className="mt-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900 rounded-lg p-3">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>Note:</strong> If a table with the same name exists,
                  it will be replaced with the restored version.
                </p>
              </div>
            </div>

            <DialogFooter className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  setShowUndoConfirm(null);
                  setUndoError(null);
                }}
                disabled={restoring !== null}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={() => void handleUndoRestore(showUndoConfirm)}
                disabled={restoring !== null}
              >
                {restoring === showUndoConfirm.id ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Restoring...
                  </>
                ) : (
                  <>
                    <Undo className="h-4 w-4 mr-2" />
                    Restore
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : showR2RestoreConfirm ? (
          /* R2 Restore Confirm */
          <>
            <DialogHeader>
              <DialogTitle className="text-amber-600 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Confirm Restore from R2
              </DialogTitle>
              <DialogDescription>
                This will overwrite all data in &quot;{databaseName}&quot;
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to restore from the backup created on{" "}
                <strong>
                  {selectedBackupForRestore
                    ? formatR2Date(selectedBackupForRestore.timestamp)
                    : ""}
                </strong>
                ?
              </p>
              <p className="text-sm text-destructive mt-2">
                This action cannot be undone. All current data will be replaced.
              </p>
              <ErrorMessage error={r2Error} className="mt-4" />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowR2RestoreConfirm(false);
                  setR2Error(null);
                }}
                disabled={isR2Restoring}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleR2Restore()}
                disabled={isR2Restoring}
              >
                {isR2Restoring ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Restoring...
                  </>
                ) : (
                  "Yes, Restore"
                )}
              </Button>
            </DialogFooter>
          </>
        ) : deleteTargets.length > 0 ? (
          /* Delete Confirm */
          <>
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Delete Backup{deleteTargets.length > 1 ? "s" : ""}
              </DialogTitle>
              <DialogDescription>
                This will permanently delete {deleteTargets.length} backup
                {deleteTargets.length > 1 ? "s" : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {deleteTargets.length === 1 ? (
                <p className="text-sm text-muted-foreground">
                  Delete backup created on{" "}
                  <strong>
                    {formatR2Date(deleteTargets[0]?.timestamp ?? 0)}
                  </strong>
                  ?
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    The following backups will be permanently deleted:
                  </p>
                  <ul className="text-sm text-muted-foreground list-disc pl-5 max-h-32 overflow-y-auto">
                    {deleteTargets.map((b) => (
                      <li key={b.path}>
                        {formatR2Date(b.timestamp)} ({formatSize(b.size)})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <ErrorMessage error={r2Error} className="mt-4" />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteTargets([]);
                  setR2Error(null);
                }}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleR2Delete()}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  `Delete ${deleteTargets.length > 1 ? `${String(deleteTargets.length)} Backups` : "Backup"}`
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          /* Main Hub View */
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {onBack && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 -ml-2"
                    onClick={onBack}
                    title="Back to database list"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                <Archive className="h-5 w-5" />
                Backup & Restore - {databaseName}
              </DialogTitle>
              <DialogDescription className="flex items-center justify-between">
                <span>Restore data from undo history or R2 backups</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setShowInfoPanel(!showInfoPanel)}
                >
                  <Info className="h-3 w-3 mr-1" />
                  {showInfoPanel ? "Hide" : "Show"} Info
                </Button>
              </DialogDescription>
            </DialogHeader>

            {/* Info Panel */}
            {showInfoPanel && (
              <div className="bg-muted/50 border rounded-lg p-3 text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <Undo className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="text-foreground">Quick Restore:</strong>
                    <span className="text-muted-foreground ml-1">
                      Undo recent destructive operations (dropped tables,
                      columns, deleted rows). Keeps last 10 operations. Best for
                      recovering from accidental deletions.
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Cloud className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="text-foreground">R2 Backups:</strong>
                    <span className="text-muted-foreground ml-1">
                      Full database snapshots stored in R2 cloud storage.
                      Created manually or before rename/STRICT/FTS5 operations.
                      Best for disaster recovery and point-in-time restores.
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="text-foreground">
                      Scheduled Backups:
                    </strong>
                    <span className="text-muted-foreground ml-1">
                      Automatic R2 backups on a daily, weekly, or monthly
                      schedule. Configure once and backups happen automatically.
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Tab Navigation */}
            <div className="flex border-b">
              <button
                type="button"
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "quick-restore"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
                }`}
                onClick={() => setActiveTab("quick-restore")}
              >
                <Undo className="h-4 w-4" />
                Quick Restore
                {undoHistory.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-muted rounded-full">
                    {undoHistory.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "r2-backups"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
                }`}
                onClick={() => setActiveTab("r2-backups")}
              >
                <Cloud className="h-4 w-4" />
                R2 Backups
                {r2Backups.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-muted rounded-full">
                    {r2Backups.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "scheduled"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
                }`}
                onClick={() => setActiveTab("scheduled")}
              >
                <Clock className="h-4 w-4" />
                Schedule
                {scheduledBackup && (
                  <span
                    className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                      scheduledBackup.enabled === 1
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : "bg-muted"
                    }`}
                  >
                    {scheduledBackup.enabled === 1 ? "On" : "Off"}
                  </span>
                )}
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden">
              {activeTab === "quick-restore" ? (
                /* Quick Restore Tab */
                <div className="h-full flex flex-col py-4">
                  {undoLoading && (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  )}

                  <ErrorMessage error={undoError} className="mb-4" />

                  {!undoLoading && !undoError && undoHistory.length === 0 && (
                    <div className="text-center py-12">
                      <Undo className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">
                        No undo history
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Destructive operations like dropping tables or deleting
                        rows will appear here
                      </p>
                    </div>
                  )}

                  {!undoLoading && undoHistory.length > 0 && (
                    <ScrollArea className="flex-1">
                      <div className="space-y-2 pr-4">
                        {undoHistory.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-start gap-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                          >
                            <div
                              className={`mt-1 ${getOperationColor(entry.operation_type)}`}
                            >
                              {getOperationIcon(entry.operation_type)}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <p className="font-medium text-sm">
                                    {entry.description}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    <span>
                                      {formatUndoDate(entry.executed_at)}
                                    </span>
                                    {entry.target_column && (
                                      <>
                                        <span>•</span>
                                        <span>
                                          Column: {entry.target_column}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setShowUndoConfirm(entry)}
                                  disabled={isOperationInProgress}
                                >
                                  <Undo className="h-3.5 w-3.5 mr-1.5" />
                                  Restore
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              ) : activeTab === "r2-backups" ? (
                /* R2 Backups Tab */
                <div className="h-full flex flex-col py-4">
                  {r2Configured === false ? (
                    <div className="text-center py-12">
                      <Cloud className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">
                        R2 Backups Not Configured
                      </h3>
                      <p className="text-sm text-muted-foreground max-w-md mx-auto">
                        R2 backup requires configuring BACKUP_BUCKET and
                        BACKUP_DO bindings in wrangler.toml. See the
                        documentation for setup instructions.
                      </p>
                    </div>
                  ) : r2Loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : r2Error && r2Backups.length === 0 ? (
                    <ErrorMessage error={r2Error} className="mb-4" />
                  ) : r2Backups.length === 0 ? (
                    <div className="text-center py-12">
                      <Cloud className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">
                        No R2 backups
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Create backups from database cards or before destructive
                        operations
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Selection Toolbar */}
                      {selectedBackups.size > 0 && (
                        <div className="flex items-center justify-between bg-muted/50 border rounded-lg px-3 py-2 mb-3">
                          <span className="text-sm font-medium">
                            {selectedBackups.size} selected
                          </span>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void handleBulkDownload()}
                              disabled={isOperationInProgress}
                            >
                              <Download className="h-3.5 w-3.5 mr-1.5" />
                              Download
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                const items = r2Backups.filter((b) =>
                                  selectedBackups.has(b.path),
                                );
                                setDeleteTargets(items);
                              }}
                              disabled={isOperationInProgress}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      )}

                      <ErrorMessage error={r2Error} className="mb-3" />

                      {/* Backups List with Select All */}
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <Checkbox
                          checked={
                            selectedBackups.size === r2Backups.length &&
                            r2Backups.length > 0
                          }
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all backups"
                        />
                        <span className="text-xs text-muted-foreground">
                          {selectedBackups.size === r2Backups.length
                            ? "Deselect all"
                            : "Select all"}
                        </span>
                      </div>

                      <ScrollArea className="flex-1">
                        <div className="space-y-2 pr-4">
                          {r2Backups.map((backup) => (
                            <div
                              key={backup.path}
                              className={`flex items-start gap-3 p-3 border rounded-lg transition-colors ${
                                selectedBackups.has(backup.path)
                                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                                  : "hover:bg-accent/50"
                              }`}
                            >
                              <Checkbox
                                checked={selectedBackups.has(backup.path)}
                                onCheckedChange={() =>
                                  toggleSelection(backup.path)
                                }
                                aria-label={`Select backup from ${formatR2Date(backup.timestamp)}`}
                                className="mt-1"
                              />

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  {/* Backup Type Badge */}
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                      backup.backupType === "table"
                                        ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                                        : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                                    }`}
                                  >
                                    {backup.backupType === "table"
                                      ? "📄 Table"
                                      : "💾 Database"}
                                  </span>
                                  {/* Source Badge */}
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded-full ${getSourceColor(backup.source)}`}
                                  >
                                    <Tag className="h-3 w-3 inline mr-1" />
                                    {getR2BackupSourceLabel(backup.source)}
                                  </span>
                                  {backup.tableName && (
                                    <span className="text-xs font-medium text-foreground">
                                      {backup.tableName}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {formatR2Date(backup.timestamp)}
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
                                  onClick={() => void handleR2Download(backup)}
                                  disabled={
                                    downloadingTimestamps.has(
                                      backup.timestamp,
                                    ) || isOperationInProgress
                                  }
                                  aria-label="Download backup"
                                  title="Download backup to device"
                                >
                                  {downloadingTimestamps.has(
                                    backup.timestamp,
                                  ) ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Download className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => setDeleteTargets([backup])}
                                  disabled={isOperationInProgress}
                                  aria-label="Delete backup"
                                  title="Delete backup from R2"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedBackupForRestore(backup);
                                    setShowR2RestoreConfirm(true);
                                  }}
                                  disabled={isOperationInProgress}
                                >
                                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                  Restore
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </>
                  )}
                </div>
              ) : (
                /* Scheduled Backups Tab */
                <div className="h-full flex flex-col -mx-6 -mb-4">
                  <ScheduledBackupManager
                    singleDatabaseId={databaseId}
                    singleDatabaseName={databaseName}
                    {...(fts5Count !== undefined && {
                      singleDatabaseFts5Count: fts5Count,
                    })}
                  />
                </div>
              )}
            </div>

            <DialogFooter className="flex items-center justify-between border-t pt-4">
              {activeTab === "quick-restore" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleClearUndoHistory()}
                  disabled={undoHistory.length === 0 || isOperationInProgress}
                >
                  {clearing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Clearing...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Clear History
                    </>
                  )}
                </Button>
              ) : activeTab === "r2-backups" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadR2Backups()}
                  disabled={r2Loading || isOperationInProgress}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 mr-1.5 ${r2Loading ? "animate-spin" : ""}`}
                  />
                  Refresh
                </Button>
              ) : (
                <div /> // Empty div to maintain layout for scheduled tab
              )}
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
