import { useState, useEffect, lazy, Suspense } from "react";
import {
  api,
  type D1Database,
  type DatabaseColor,
  getUndoHistory,
  getR2BackupStatus,
  type R2BackupStatus,
  getMigrationStatus,
  applyMigrations,
  markLegacyMigrations,
  type MigrationStatus,
  listR2Backups,
  listOrphanedR2Backups,
  deleteAllR2Backups,
  type OrphanedBackupGroup,
} from "./services/api";
import { auth } from "./services/auth";
import { useTheme } from "./hooks/useTheme";
import {
  Database,
  Plus,
  Moon,
  Sun,
  Monitor,
  Loader2,
  Code,
  GitCompare,
  Upload,
  Download,
  Trash2,
  Pencil,
  Zap,
  Undo,
  History,
  AlertCircle,
  AlertTriangle,
  Globe,
  Sparkles,
  Copy,
  Bell,
  Search,
  Check,
  Cloud,
  RefreshCw,
  ArrowUpCircle,
  LayoutGrid,
  LayoutList,
  BarChart3,
  BookOpen,
  ExternalLink,
  Book,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { DatabaseView } from "./components/DatabaseView";
import { TableView } from "./components/TableView";
import { DatabaseSearchFilter } from "./components/DatabaseSearchFilter";
import { DatabaseColorPicker } from "./components/DatabaseColorPicker";
import { CloneDatabaseDialog } from "./components/CloneDatabaseDialog";
import { ExportDatabaseDialog } from "./components/ExportDatabaseDialog";
import { ImportDatabaseDialog } from "./components/ImportDatabaseDialog";
import {
  exportAndDownloadMultipleDatabases,
  type ExportFormat,
} from "./services/exportApi";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Lazy load heavy feature components for better code splitting
const QueryConsole = lazy(() =>
  import("./components/QueryConsole").then((m) => ({
    default: m.QueryConsole,
  })),
);
const CrossDatabaseSearch = lazy(() =>
  import("./components/CrossDatabaseSearch").then((m) => ({
    default: m.CrossDatabaseSearch,
  })),
);
const DatabaseComparison = lazy(() =>
  import("./components/DatabaseComparison").then((m) => ({
    default: m.DatabaseComparison,
  })),
);
const BackupRestoreHub = lazy(() =>
  import("./components/BackupRestoreHub").then((m) => ({
    default: m.BackupRestoreHub,
  })),
);
const WebhookManager = lazy(() =>
  import("./components/WebhookManager").then((m) => ({
    default: m.WebhookManager,
  })),
);
const MetricsDashboard = lazy(() =>
  import("./components/MetricsDashboard").then((m) => ({
    default: m.MetricsDashboard,
  })),
);
const JobHistory = lazy(() =>
  import("./components/JobHistory").then((m) => ({ default: m.JobHistory })),
);
const HealthDashboard = lazy(() =>
  import("./components/HealthDashboard").then((m) => ({
    default: m.HealthDashboard,
  })),
);
import { R2BackupDialog } from "./components/R2BackupDialog";
import { R2RestoreDialog } from "./components/R2RestoreDialog";
import { BackupProgressDialog } from "./components/BackupProgressDialog";
import { DatabaseListView } from "./components/DatabaseListView";
import { GridSortSelect, type SortOption } from "./components/GridSortSelect";
import { ErrorMessage } from "@/components/ui/error-message";
import type { DatabaseActionHandlers } from "./components/DatabaseActionButtons";
import { getColorConfig } from "./utils/databaseColors";

type View =
  | { type: "list" }
  | { type: "search" }
  | {
      type: "database";
      databaseId: string;
      databaseName: string;
      initialTab?: string | undefined;
    }
  | {
      type: "table";
      databaseId: string;
      databaseName: string;
      tableName: string;
      navigationHistory?: { tableName: string; fkFilter?: string }[];
      fkFilter?: string;
    }
  | { type: "query"; databaseId: string; databaseName: string }
  | { type: "job-history" }
  | { type: "webhooks" }
  | { type: "metrics" }
  | { type: "health" };

type DatabaseViewMode = "grid" | "list";

// Loading fallback for lazy-loaded components
const LazyLoadingFallback = (): React.JSX.Element => (
  <div className="flex items-center justify-center p-8">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
);

// Helper to get view mode from localStorage
const getStoredViewMode = (): DatabaseViewMode => {
  try {
    const stored = localStorage.getItem("d1-manager-database-view-mode");
    if (stored === "grid" || stored === "list") {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return "list"; // Default to list view for faster rendering
};

export default function App(): React.JSX.Element {
  const [databases, setDatabases] = useState<D1Database[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newDbName, setNewDbName] = useState("");
  const [createDbError, setCreateDbError] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [currentView, setCurrentView] = useState<View>({ type: "list" });
  const [showComparison, setShowComparison] = useState(false);
  const [databaseSearchQuery, setDatabaseSearchQuery] = useState("");
  const [databaseViewMode, setDatabaseViewMode] =
    useState<DatabaseViewMode>(getStoredViewMode);
  const [dbGridSortField, setDbGridSortField] = useState<string>("name");
  const [dbGridSortDirection, setDbGridSortDirection] = useState<
    "asc" | "desc"
  >("asc");
  const { theme, setTheme } = useTheme();

  // Undo state
  const [showUndoHistory, setShowUndoHistory] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [undoCounts, setUndoCounts] = useState<Record<string, number>>({});
  const [r2BackupCounts, setR2BackupCounts] = useState<Record<string, number>>(
    {},
  );
  const [r2BackupCountsLoading, setR2BackupCountsLoading] = useState(false);
  const [orphanedBackups, setOrphanedBackups] = useState<OrphanedBackupGroup[]>(
    [],
  );
  const [orphanedBackupsLoading, setOrphanedBackupsLoading] = useState(false);
  const [deletingOrphanedBackups, setDeletingOrphanedBackups] = useState<
    string | null
  >(null);
  const [undoSelectedDatabase, setUndoSelectedDatabase] = useState<{
    id: string;
    name: string;
    isOrphaned?: boolean;
    preferR2Tab?: boolean;
  } | null>(null);
  const [showUndoDatabasePicker, setShowUndoDatabasePicker] = useState(false);
  const [dataRefreshTrigger, setDataRefreshTrigger] = useState(0);

  // Bulk operations state
  const [selectedDatabases, setSelectedDatabases] = useState<string[]>([]);
  const [bulkDownloadProgress, setBulkDownloadProgress] = useState<{
    progress: number;
    status: "preparing" | "downloading" | "complete" | "error";
    error?: string;
    currentDatabase?: string;
    completed?: number;
    total?: number;
  } | null>(null);
  const [skippedExports, setSkippedExports] = useState<
    | {
        databaseId: string;
        name: string;
        reason: string;
        details?: string[];
      }[]
    | null
  >(null);
  const [batchExportFormat, setBatchExportFormat] =
    useState<ExportFormat>("sql");
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    databaseIds: string[];
    databaseNames: string[];
    isDeleting: boolean;
    currentProgress?: { current: number; total: number };
    backupConfirmed: boolean;
    isBackingUp: boolean;
  } | null>(null);

  // FTS5 export error state
  const [fts5ExportError, setFts5ExportError] = useState<{
    database: D1Database;
    fts5Tables: string[];
  } | null>(null);

  // Copy ID feedback
  const [copiedDbId, setCopiedDbId] = useState<string | null>(null);

  const copyDatabaseId = async (
    dbId: string,
    e: React.MouseEvent,
  ): Promise<void> => {
    e.stopPropagation();
    await navigator.clipboard.writeText(dbId);
    setCopiedDbId(dbId);
    setTimeout(() => setCopiedDbId(null), 2000);
  };

  // Rename operation state
  const [renameDialogState, setRenameDialogState] = useState<{
    database: D1Database;
    newName: string;
    backupConfirmed: boolean;
    isRenaming: boolean;
    currentStep?: string;
    progress?: number;
    error?: string;
  } | null>(null);

  // Optimize operation state
  const [optimizeDialogState, setOptimizeDialogState] = useState<{
    databaseIds: string[];
    databaseNames: string[];
    isOptimizing: boolean;
    currentProgress?: { current: number; total: number; operation: string };
    error?: string;
  } | null>(null);

  // Clone database state
  const [cloneDialogDatabase, setCloneDialogDatabase] =
    useState<D1Database | null>(null);

  // Export database state
  const [exportDialogDatabase, setExportDialogDatabase] =
    useState<D1Database | null>(null);

  // R2 Backup/Restore state
  const [r2BackupStatus, setR2BackupStatus] = useState<R2BackupStatus | null>(
    null,
  );
  const [r2BackupDialog, setR2BackupDialog] = useState<{
    databaseId: string;
    databaseName: string;
    hasFts5Tables: boolean;
    returnTo?: "delete" | "rename";
  } | null>(null);
  const [r2RestoreDialog, setR2RestoreDialog] = useState<{
    databaseId: string;
    databaseName: string;
  } | null>(null);
  const [backupProgressDialog, setBackupProgressDialog] = useState<{
    jobId: string;
    operationName: string;
    databaseName: string;
    returnTo?: "delete" | "rename";
  } | null>(null);

  // Database colors for visual organization
  const [databaseColors, setDatabaseColors] = useState<
    Record<string, DatabaseColor>
  >({});

  // Migration state for upgrade banner
  const [migrationStatus, setMigrationStatus] =
    useState<MigrationStatus | null>(null);
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [migrationSuccess, setMigrationSuccess] = useState(false);

  // Load databases on mount - run in parallel for faster initial load
  useEffect(() => {
    // Run both loads in parallel - colors are non-blocking
    void Promise.all([
      loadDatabases(),
      loadDatabaseColors(),
      loadR2BackupStatus(),
      checkMigrationStatus(),
    ]);
  }, []);

  const loadR2BackupStatus = async (): Promise<void> => {
    try {
      const status = await getR2BackupStatus();
      setR2BackupStatus(status);
    } catch {
      setR2BackupStatus({
        configured: false,
        bucketAvailable: false,
        doAvailable: false,
      });
    }
  };

  // Check migration status on load
  const checkMigrationStatus = async (): Promise<void> => {
    try {
      const status = await getMigrationStatus();
      setMigrationStatus(status);
      setMigrationError(null);
    } catch {
      // Silently handle migration check failures - don't block the app
    }
  };

  // Apply pending migrations
  const handleApplyMigrations = async (): Promise<void> => {
    if (!migrationStatus) return;

    setMigrationLoading(true);
    setMigrationError(null);
    setMigrationSuccess(false);

    try {
      // Check if this is a legacy installation that needs marking
      if (
        migrationStatus.legacy?.isLegacy &&
        migrationStatus.legacy.suggestedVersion > 0
      ) {
        // Mark existing migrations as applied first
        await markLegacyMigrations(migrationStatus.legacy.suggestedVersion);
      }

      // Apply any pending migrations
      const result = await applyMigrations();

      if (result.success) {
        setMigrationSuccess(true);
        // Refresh migration status
        await checkMigrationStatus();
        // Auto-hide success message after 5 seconds
        setTimeout(() => setMigrationSuccess(false), 5000);
      } else {
        setMigrationError(result.errors.join(", "));
      }
    } catch (err) {
      setMigrationError(
        err instanceof Error ? err.message : "Failed to apply migrations",
      );
    } finally {
      setMigrationLoading(false);
    }
  };

  const loadUndoCount = async (databaseId: string): Promise<void> => {
    try {
      const history = await getUndoHistory(databaseId);
      setUndoCount(history.length);
    } catch {
      setUndoCount(0);
    }
  };

  const loadAllUndoCounts = async (dbs: D1Database[]): Promise<void> => {
    if (dbs.length === 0) {
      setUndoCount(0);
      setUndoCounts({});
      return;
    }

    try {
      const counts: Record<string, number> = {};
      let total = 0;

      // Load undo history for each database in parallel
      const results = await Promise.allSettled(
        dbs.map(async (db) => {
          const history = await getUndoHistory(db.uuid);
          return { dbId: db.uuid, count: history.length };
        }),
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          counts[result.value.dbId] = result.value.count;
          total += result.value.count;
        }
      }

      setUndoCounts(counts);
      setUndoCount(total);
    } catch {
      setUndoCount(0);
      setUndoCounts({});
    }
  };

  const loadAllR2BackupCounts = async (dbs: D1Database[]): Promise<void> => {
    if (dbs.length === 0 || !r2BackupStatus?.configured) {
      setR2BackupCounts({});
      return;
    }

    setR2BackupCountsLoading(true);
    try {
      const counts: Record<string, number> = {};

      // Load R2 backups for each database in parallel
      const results = await Promise.allSettled(
        dbs.map(async (db) => {
          const backups = await listR2Backups(db.uuid);
          return { dbId: db.uuid, count: backups.length };
        }),
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          counts[result.value.dbId] = result.value.count;
        }
      }

      setR2BackupCounts(counts);
    } catch {
      setR2BackupCounts({});
    } finally {
      setR2BackupCountsLoading(false);
    }
  };

  const loadOrphanedBackups = async (): Promise<void> => {
    if (!r2BackupStatus?.configured) {
      setOrphanedBackups([]);
      return;
    }

    setOrphanedBackupsLoading(true);
    try {
      const orphaned = await listOrphanedR2Backups();
      setOrphanedBackups(orphaned);
    } catch {
      setOrphanedBackups([]);
    } finally {
      setOrphanedBackupsLoading(false);
    }
  };

  const handleDeleteOrphanedBackups = async (
    databaseId: string,
  ): Promise<void> => {
    setDeletingOrphanedBackups(databaseId);
    try {
      await deleteAllR2Backups(databaseId);
      // Remove from local state
      setOrphanedBackups((prev) =>
        prev.filter((g) => g.databaseId !== databaseId),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete backups");
    } finally {
      setDeletingOrphanedBackups(null);
    }
  };

  // Load undo count when viewing a specific database or globally
  useEffect(() => {
    if (currentView.type !== "list" && "databaseId" in currentView) {
      void loadUndoCount(currentView.databaseId);
    } else {
      // On list view, load undo counts for all databases
      void loadAllUndoCounts(databases);
    }
  }, [currentView, databases]);

  const refreshUndoCount = (): void => {
    if (currentView.type !== "list" && "databaseId" in currentView) {
      void loadUndoCount(currentView.databaseId);
    } else {
      void loadAllUndoCounts(databases);
    }
  };

  // Load R2 backup counts and orphaned backups when database picker opens
  useEffect(() => {
    if (showUndoDatabasePicker && r2BackupStatus?.configured) {
      if (databases.length > 0) {
        void loadAllR2BackupCounts(databases);
      }
      void loadOrphanedBackups();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUndoDatabasePicker, r2BackupStatus?.configured]);

  const loadDatabases = async (): Promise<void> => {
    try {
      setLoading(true);
      setError("");
      // The API now returns fts5_count directly in the database list response
      // This eliminates N+1 API calls (previously made one call per database for FTS5 counts)
      const dbs = await api.listDatabases();
      setDatabases(dbs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load databases");
    } finally {
      setLoading(false);
    }
  };

  const loadDatabaseColors = async (): Promise<void> => {
    try {
      const colors = await api.getDatabaseColors();
      setDatabaseColors(colors);
    } catch {
      // Colors are optional, silently ignore failures
    }
  };

  const handleColorChange = async (
    databaseId: string,
    color: DatabaseColor,
  ): Promise<void> => {
    try {
      await api.updateDatabaseColor(databaseId, color);
      setDatabaseColors((prev) => ({
        ...prev,
        [databaseId]: color,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update color");
    }
  };

  // Toggle database view mode (grid/list) with localStorage persistence
  const toggleDatabaseViewMode = (): void => {
    setDatabaseViewMode((prev) => {
      const newMode = prev === "grid" ? "list" : "grid";
      try {
        localStorage.setItem("d1-manager-database-view-mode", newMode);
      } catch {
        // localStorage not available
      }
      return newMode;
    });
  };

  // Filter databases by search query
  const filteredDatabasesUnsorted = databases.filter((db) =>
    db.name.toLowerCase().includes(databaseSearchQuery.toLowerCase()),
  );

  // Sort options for database grid view
  const databaseSortOptions: SortOption[] = [
    { value: "name", label: "Name" },
    { value: "created_at", label: "Created" },
    { value: "file_size", label: "Size" },
    { value: "num_tables", label: "Tables" },
  ];

  // Sort filtered databases (used by grid view, list view has its own sorting)
  const filteredDatabases = [...filteredDatabasesUnsorted].sort((a, b) => {
    let comparison = 0;
    switch (dbGridSortField) {
      case "name":
        comparison = (a.name ?? "").localeCompare(b.name ?? "");
        break;
      case "created_at":
        comparison =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      case "file_size":
        comparison = (a.file_size ?? 0) - (b.file_size ?? 0);
        break;
      case "num_tables":
        comparison = (a.num_tables ?? 0) - (b.num_tables ?? 0);
        break;
    }
    return dbGridSortDirection === "asc" ? comparison : -comparison;
  });

  const handleCreateDatabase = async (): Promise<void> => {
    const trimmedName = newDbName.trim();
    if (!trimmedName) return;

    // Validate the database name
    const validationError = validateDatabaseName(trimmedName);
    if (validationError) {
      setCreateDbError(validationError);
      return;
    }

    try {
      setCreating(true);
      setCreateDbError("");
      await api.createDatabase(trimmedName);
      setShowCreateDialog(false);
      setNewDbName("");
      await loadDatabases();
    } catch (err) {
      setCreateDbError(
        err instanceof Error ? err.message : "Failed to create database",
      );
    } finally {
      setCreating(false);
    }
  };

  const cycleTheme = (): void => {
    const modes: (typeof theme)[] = ["system", "light", "dark"];
    const currentIndex = modes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % modes.length;
    const nextMode = modes[nextIndex];
    if (nextMode !== undefined) {
      setTheme(nextMode);
    }
  };

  const getThemeIcon = (): React.JSX.Element => {
    if (theme === "system") return <Monitor className="h-5 w-5" />;
    if (theme === "light") return <Sun className="h-5 w-5" />;
    return <Moon className="h-5 w-5" />;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatSize = (bytes?: number): string => {
    if (!bytes) return "Unknown";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex] ?? ""}`;
  };

  const handleDatabaseClick = (db: D1Database): void => {
    setCurrentView({
      type: "database",
      databaseId: db.uuid,
      databaseName: db.name,
    });
  };

  const handleFts5Click = (db: D1Database): void => {
    setCurrentView({
      type: "database",
      databaseId: db.uuid,
      databaseName: db.name,
      initialTab: "fts5",
    });
  };

  const handleOpenQueryConsole = (db: D1Database): void => {
    setCurrentView({
      type: "query",
      databaseId: db.uuid,
      databaseName: db.name,
    });
  };

  // Bulk operation handlers
  const toggleDatabaseSelection = (uuid: string): void => {
    setSelectedDatabases((prev) => {
      if (prev.includes(uuid)) {
        return prev.filter((id) => id !== uuid);
      } else {
        return [...prev, uuid];
      }
    });
  };

  const selectAllDatabases = (): void => {
    setSelectedDatabases(filteredDatabases.map((db) => db.uuid));
  };

  const clearSelection = (): void => {
    setSelectedDatabases([]);
  };

  const handleBulkDownload = async (): Promise<void> => {
    if (selectedDatabases.length === 0) return;

    setError("");
    setSkippedExports(null);
    setBulkDownloadProgress({ progress: 0, status: "preparing" });

    try {
      const selectedDbData = databases.filter((db) =>
        selectedDatabases.includes(db.uuid),
      );

      const result = await exportAndDownloadMultipleDatabases(
        selectedDbData.map((db) => ({ uuid: db.uuid, name: db.name })),
        batchExportFormat,
        (progress) => {
          setBulkDownloadProgress({
            progress: progress.overallProgress,
            status: progress.overallProgress < 100 ? "downloading" : "complete",
            currentDatabase: progress.currentDatabase,
            completed: progress.databasesCompleted,
            total: progress.totalDatabases,
          });
        },
      );

      // Show skipped databases notice if any
      if (result.skipped.length > 0) {
        setSkippedExports(
          result.skipped.map((s) => ({
            databaseId: "",
            name: s.name,
            reason: s.reason,
          })),
        );
      }

      // Clear selection after successful download
      setSelectedDatabases([]);

      setTimeout(() => {
        setBulkDownloadProgress(null);
      }, 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to download databases",
      );
      setBulkDownloadProgress({
        progress: 0,
        status: "error",
        error: err instanceof Error ? err.message : "Download failed",
      });
    }
  };

  const handleBulkDelete = (): void => {
    if (selectedDatabases.length === 0) return;

    const selectedDbData = databases.filter((db) =>
      selectedDatabases.includes(db.uuid),
    );

    setDeleteConfirmState({
      databaseIds: selectedDatabases,
      databaseNames: selectedDbData.map((db) => db.name),
      isDeleting: false,
      backupConfirmed: false,
      isBackingUp: false,
    });
  };

  // Single database operations for card buttons
  const handleSingleDelete = (db: D1Database): void => {
    setDeleteConfirmState({
      databaseIds: [db.uuid],
      databaseNames: [db.name],
      isDeleting: false,
      backupConfirmed: false,
      isBackingUp: false,
    });
  };

  const handleSingleDownload = async (db: D1Database): Promise<void> => {
    setError("");
    try {
      const result = await api.exportDatabases([
        { uuid: db.uuid, name: db.name },
      ]);

      // Check if export was skipped due to FTS5 tables
      const skippedDb = result.skipped?.[0];
      if (skippedDb) {
        if (skippedDb.reason === "fts5" && skippedDb.details) {
          setFts5ExportError({
            database: db,
            fts5Tables: skippedDb.details,
          });
        } else {
          setError(`Export skipped: ${skippedDb.reason}`);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to download database",
      );
    }
  };

  const handleSingleOptimize = (db: D1Database): void => {
    setOptimizeDialogState({
      databaseIds: [db.uuid],
      databaseNames: [db.name],
      isOptimizing: false,
    });
  };

  const handleSingleImport = (_db: D1Database): void => {
    // New ImportDatabaseDialog handles target database selection internally
    setShowUploadDialog(true);
  };

  const confirmBulkDelete = async (): Promise<void> => {
    if (!deleteConfirmState) return;

    // Require backup confirmation
    if (!deleteConfirmState.backupConfirmed) {
      setError("Please confirm you have backed up your database(s)");
      return;
    }

    setDeleteConfirmState((prev) =>
      prev ? { ...prev, isDeleting: true } : null,
    );
    setError("");

    try {
      const result = await api.deleteDatabases(
        deleteConfirmState.databaseIds,
        (current, total) => {
          setDeleteConfirmState((prev) =>
            prev
              ? {
                  ...prev,
                  currentProgress: { current, total },
                }
              : null,
          );
        },
      );

      // Show errors if any
      if (result.failed.length > 0) {
        setError(
          `Some databases failed to delete:\n${result.failed.map((f) => `${f.id}: ${f.error}`).join("\n")}`,
        );
      }

      // Reload databases
      await loadDatabases();

      // Clear selection
      setSelectedDatabases([]);
      setDeleteConfirmState(null);
    } catch {
      setError("Failed to delete databases");
      setDeleteConfirmState((prev) =>
        prev ? { ...prev, isDeleting: false } : null,
      );
    }
  };

  const handleDeleteBackupDownload = async (): Promise<void> => {
    if (!deleteConfirmState) return;

    setDeleteConfirmState((prev) =>
      prev ? { ...prev, isBackingUp: true } : null,
    );

    try {
      const dbsToBackup = databases.filter((db) =>
        deleteConfirmState.databaseIds.includes(db.uuid),
      );
      await api.exportDatabases(
        dbsToBackup.map((db) => ({ uuid: db.uuid, name: db.name })),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to download backup",
      );
    } finally {
      setDeleteConfirmState((prev) =>
        prev ? { ...prev, isBackingUp: false } : null,
      );
    }
  };

  const handleRenameClick = (db: D1Database): void => {
    setRenameDialogState({
      database: db,
      newName: db.name,
      backupConfirmed: false,
      isRenaming: false,
    });
  };

  const validateDatabaseName = (name: string): string | null => {
    if (!name.trim()) {
      return "Database name is required";
    }
    if (name.length < 3 || name.length > 63) {
      return "Database name must be between 3 and 63 characters";
    }
    if (!/^[a-z0-9-]+$/.test(name)) {
      return "Database name can only contain lowercase letters, numbers, and hyphens";
    }
    if (name.startsWith("-") || name.endsWith("-")) {
      return "Database name cannot start or end with a hyphen";
    }
    if (
      databases.some(
        (db) =>
          db.name === name && db.uuid !== renameDialogState?.database.uuid,
      )
    ) {
      return "A database with this name already exists";
    }
    return null;
  };

  const handleRenameDatabase = async (): Promise<void> => {
    if (!renameDialogState) return;

    const validationError = validateDatabaseName(renameDialogState.newName);
    if (validationError) {
      setRenameDialogState((prev) =>
        prev ? { ...prev, error: validationError } : null,
      );
      return;
    }

    if (!renameDialogState.backupConfirmed) {
      setRenameDialogState((prev) =>
        prev
          ? {
              ...prev,
              error: "Please confirm you have backed up your database",
            }
          : null,
      );
      return;
    }

    setRenameDialogState((prev) => {
      if (!prev) return null;
      const { error: _error, ...rest } = prev;
      void _error;
      return { ...rest, isRenaming: true };
    });
    setError("");

    try {
      await api.renameDatabase(
        renameDialogState.database.uuid,
        renameDialogState.newName,
        (step, progress) => {
          setRenameDialogState((prev) =>
            prev
              ? {
                  ...prev,
                  currentStep: step,
                  progress,
                }
              : null,
          );
        },
      );

      // Reload databases
      await loadDatabases();

      // Close dialog
      setRenameDialogState(null);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to rename database";
      setRenameDialogState((prev) =>
        prev
          ? {
              ...prev,
              isRenaming: false,
              error: errorMessage,
            }
          : null,
      );
    }
  };

  const handleDownloadBackup = async (): Promise<void> => {
    if (!renameDialogState) return;

    try {
      // Use the existing export functionality for a single database
      await api.exportDatabases([
        {
          uuid: renameDialogState.database.uuid,
          name: renameDialogState.database.name,
        },
      ]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to download backup",
      );
    }
  };

  const handleOptimizeClick = (): void => {
    if (selectedDatabases.length === 0) return;

    const selectedDbData = databases.filter((db) =>
      selectedDatabases.includes(db.uuid),
    );

    setOptimizeDialogState({
      databaseIds: selectedDatabases,
      databaseNames: selectedDbData.map((db) => db.name),
      isOptimizing: false,
    });
  };

  const confirmOptimize = async (): Promise<void> => {
    if (!optimizeDialogState) return;

    setOptimizeDialogState((prev) => {
      if (!prev) return null;
      const { error: _error, ...rest } = prev;
      void _error;
      return { ...rest, isOptimizing: true };
    });
    setError("");

    try {
      const result = await api.optimizeDatabases(
        optimizeDialogState.databaseIds,
        (current, total, operation) => {
          setOptimizeDialogState((prev) =>
            prev
              ? {
                  ...prev,
                  currentProgress: { current, total, operation },
                }
              : null,
          );
        },
      );

      // Show errors if any
      if (result.failed.length > 0) {
        setError(
          `Some databases failed to optimize:\n${result.failed.map((f) => `${f.name}: ${f.error}`).join("\n")}`,
        );
      }

      // Clear selection and close dialog
      setSelectedDatabases([]);
      setOptimizeDialogState(null);
    } catch {
      setError("Failed to optimize databases");
      setOptimizeDialogState((prev) =>
        prev ? { ...prev, isOptimizing: false } : null,
      );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Sticky Navigation */}
      <header className="border-b sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <a
            href="https://d1.adamic.tech/"
            className="flex items-center gap-3 group transition-opacity hover:opacity-80 no-underline"
          >
            <Database className="h-8 w-8 text-primary transition-transform group-hover:scale-110" />
            <div>
              <h1 className="text-2xl font-bold group-hover:text-primary transition-colors">
                D1 Database Manager
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage your Cloudflare D1 databases
              </p>
            </div>
          </a>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (
                  currentView.type !== "list" &&
                  "databaseId" in currentView
                ) {
                  // When viewing a database/table, show that database's undo history
                  setShowUndoHistory(true);
                } else {
                  // On list view, show database picker dialog
                  setShowUndoDatabasePicker(true);
                }
              }}
              title="Backup & Restore"
              className="relative"
              aria-label="View backup and restore options"
            >
              <Undo className="h-5 w-5" />
              {undoCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 text-xs flex items-center justify-center bg-primary text-primary-foreground rounded-full">
                  {undoCount > 99 ? "99+" : undoCount}
                </span>
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={cycleTheme}
              title={`Theme: ${theme}`}
            >
              {getThemeIcon()}
            </Button>
            {/* External Links */}
            <a
              href="https://dash.cloudflare.com/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open Cloudflare Dashboard"
            >
              <Button variant="ghost" size="icon" title="Cloudflare Dashboard">
                <Cloud className="h-5 w-5" />
              </Button>
            </a>
            <a
              href="https://developers.cloudflare.com/d1/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open Cloudflare D1 Documentation"
            >
              <Button variant="ghost" size="icon" title="Cloudflare D1 Docs">
                <BookOpen className="h-5 w-5" />
              </Button>
            </a>
            <a
              href="https://github.com/neverinfamous/d1-manager/wiki"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open D1 Manager Wiki"
            >
              <Button variant="ghost" size="icon" title="D1 Manager Wiki">
                <Book className="h-5 w-5" />
              </Button>
            </a>
            <a
              href="https://sqlite.org/docs.html"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open SQLite Documentation"
            >
              <Button variant="ghost" size="icon" title="SQLite Docs">
                <ExternalLink className="h-5 w-5" />
              </Button>
            </a>
            <Button variant="outline" onClick={() => auth.logout()}>
              Logout
            </Button>
          </div>
        </div>
        {/* Navigation Tabs - Always visible */}
        <div className="container mx-auto px-4 pb-4 flex gap-2">
          <Button
            variant={currentView.type === "list" ? "default" : "ghost"}
            onClick={() => setCurrentView({ type: "list" })}
          >
            <Database className="h-4 w-4 mr-2" />
            Databases
          </Button>
          <Button
            variant={currentView.type === "search" ? "default" : "ghost"}
            onClick={() => setCurrentView({ type: "search" })}
          >
            <Search className="h-4 w-4 mr-2" />
            Search
          </Button>
          <Button
            variant={currentView.type === "job-history" ? "default" : "ghost"}
            onClick={() => setCurrentView({ type: "job-history" })}
          >
            <History className="h-4 w-4 mr-2" />
            Job History
          </Button>
          <Button
            variant={currentView.type === "metrics" ? "default" : "ghost"}
            onClick={() => setCurrentView({ type: "metrics" })}
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Metrics
          </Button>
          <Button
            variant={currentView.type === "health" ? "default" : "ghost"}
            onClick={() => setCurrentView({ type: "health" })}
          >
            <Activity className="h-4 w-4 mr-2" />
            Health
          </Button>
          <Button
            variant={currentView.type === "webhooks" ? "default" : "ghost"}
            onClick={() => setCurrentView({ type: "webhooks" })}
          >
            <Bell className="h-4 w-4 mr-2" />
            Webhooks
          </Button>
        </div>
      </header>

      {/* Migration Upgrade Banner */}
      {migrationStatus && !migrationStatus.isUpToDate && (
        <div className="bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <ArrowUpCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Database upgrade available
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {migrationStatus.pendingMigrations.length} migration
                    {migrationStatus.pendingMigrations.length !== 1 ? "s" : ""}{" "}
                    pending
                    {migrationStatus.legacy?.isLegacy &&
                      " (legacy installation detected)"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {migrationError && (
                  <span
                    className="text-xs text-red-600 dark:text-red-400 max-w-xs truncate"
                    title={migrationError}
                  >
                    {migrationError}
                  </span>
                )}
                <Button
                  size="sm"
                  onClick={() => void handleApplyMigrations()}
                  disabled={migrationLoading}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {migrationLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Upgrading...
                    </>
                  ) : (
                    <>
                      <ArrowUpCircle className="h-4 w-4 mr-2" />
                      Upgrade Now
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Migration Success Banner */}
      {migrationSuccess && (
        <div className="bg-green-50 dark:bg-green-950 border-b border-green-200 dark:border-green-800">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center gap-3">
              <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Database upgraded successfully! All migrations have been
                applied.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {currentView.type === "list" && (
          <>
            {/* Actions Bar */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-3xl font-bold">Databases</h2>
              </div>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Database
              </Button>
            </div>

            {/* Database Comparison (shown when triggered from toolbar) */}
            {showComparison && selectedDatabases.length === 2 && (
              <Card>
                <CardContent className="pt-6">
                  <Suspense fallback={<LazyLoadingFallback />}>
                    <DatabaseComparison
                      databases={databases}
                      preSelectedDatabases={[
                        selectedDatabases[0] ?? "",
                        selectedDatabases[1] ?? "",
                      ]}
                      onClose={() => setShowComparison(false)}
                    />
                  </Suspense>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setShowComparison(false)}
                  >
                    Close Comparison
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Database Search Filter and View Toggle */}
            {databases.length > 0 && (
              <div className="flex items-center justify-between gap-4 mb-6">
                <DatabaseSearchFilter
                  searchQuery={databaseSearchQuery}
                  onSearchChange={setDatabaseSearchQuery}
                  filteredCount={filteredDatabases.length}
                  totalCount={databases.length}
                />
                <div className="flex items-center gap-2">
                  {databaseViewMode === "grid" && (
                    <GridSortSelect
                      options={databaseSortOptions}
                      value={dbGridSortField}
                      direction={dbGridSortDirection}
                      onValueChange={setDbGridSortField}
                      onDirectionToggle={() =>
                        setDbGridSortDirection((d) =>
                          d === "asc" ? "desc" : "asc",
                        )
                      }
                    />
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleDatabaseViewMode}
                    aria-label={
                      databaseViewMode === "grid"
                        ? "Switch to list view"
                        : "Switch to grid view"
                    }
                    title={
                      databaseViewMode === "grid"
                        ? "Switch to list view"
                        : "Switch to grid view"
                    }
                    className="flex items-center gap-2"
                  >
                    {databaseViewMode === "grid" ? (
                      <>
                        <LayoutList className="h-4 w-4" />
                        <span className="hidden sm:inline">List</span>
                      </>
                    ) : (
                      <>
                        <LayoutGrid className="h-4 w-4" />
                        <span className="hidden sm:inline">Grid</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Bulk Operations Toolbar */}
            {(selectedDatabases.length > 0 || filteredDatabases.length > 0) && (
              <div className="flex items-center justify-between mb-6 p-4 border rounded-lg bg-card">
                <div className="flex items-center gap-4">
                  <Button
                    variant="outline"
                    onClick={() => setShowUploadDialog(true)}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Import Database
                  </Button>
                  <Button variant="outline" onClick={selectAllDatabases}>
                    Select All
                  </Button>
                  {selectedDatabases.length > 0 && (
                    <>
                      <Button variant="outline" onClick={clearSelection}>
                        Clear Selection
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        {selectedDatabases.length} database
                        {selectedDatabases.length !== 1 ? "s" : ""} selected
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {selectedDatabases.length > 0 && (
                    <>
                      {selectedDatabases.length === 2 && (
                        <Button
                          variant="outline"
                          onClick={() => setShowComparison(true)}
                        >
                          <GitCompare className="h-4 w-4 mr-2" />
                          Compare
                        </Button>
                      )}
                      <Button variant="outline" onClick={handleOptimizeClick}>
                        <Zap className="h-4 w-4 mr-2" />
                        Optimize Selected
                      </Button>
                      <div className="flex items-center gap-1">
                        <Select
                          value={batchExportFormat}
                          onValueChange={(v: ExportFormat) =>
                            setBatchExportFormat(v)
                          }
                        >
                          <SelectTrigger className="w-[80px] h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sql">SQL</SelectItem>
                            <SelectItem value="json">JSON</SelectItem>
                            <SelectItem value="csv">CSV</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          onClick={() => void handleBulkDownload()}
                          disabled={bulkDownloadProgress !== null}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {bulkDownloadProgress
                            ? bulkDownloadProgress.status === "error"
                              ? "Download Failed"
                              : bulkDownloadProgress.status === "complete"
                                ? "Download Complete"
                                : bulkDownloadProgress.status === "preparing"
                                  ? "Preparing..."
                                  : `Downloading (${String(Math.round(bulkDownloadProgress.progress))}%)`
                            : "Download Selected"}
                        </Button>
                      </div>
                      <Button variant="destructive" onClick={handleBulkDelete}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Selected
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Batch Download Progress Indicator */}
            {bulkDownloadProgress?.status === "downloading" && (
              <div className="bg-muted/50 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm font-medium">
                      Exporting {bulkDownloadProgress.currentDatabase || "..."}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {bulkDownloadProgress.completed ?? 0} /{" "}
                    {bulkDownloadProgress.total ?? 0} databases
                  </span>
                </div>
                <Progress
                  value={bulkDownloadProgress.progress}
                  className="h-2"
                />
              </div>
            )}

            {/* Error Message */}
            <ErrorMessage error={error} className="mb-6" />

            {/* Loading State */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Database Grid */}
            {!loading && databases.length === 0 && (
              <div className="text-center py-12">
                <Database className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No databases yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first D1 database to get started
                </p>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Database
                </Button>
              </div>
            )}

            {!loading &&
              databases.length > 0 &&
              filteredDatabases.length === 0 && (
                <div className="text-center py-12">
                  <Database className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-xl font-semibold mb-2">
                    No databases found
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    No databases match your search query
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setDatabaseSearchQuery("")}
                  >
                    Clear Search
                  </Button>
                </div>
              )}

            {!loading && filteredDatabases.length > 0 && (
              <>
                {/* Action handlers for both grid and list views */}
                {(() => {
                  const actionHandlers: DatabaseActionHandlers = {
                    onBrowse: handleDatabaseClick,
                    onQuery: handleOpenQueryConsole,
                    onRename: handleRenameClick,
                    onClone: (db) => setCloneDialogDatabase(db),
                    onImport: handleSingleImport,
                    onDownload: handleSingleDownload,
                    onExport: (db) => setExportDialogDatabase(db),
                    onOptimize: handleSingleOptimize,
                    onFts5: handleFts5Click,
                    onBackup: (db) =>
                      setR2BackupDialog({
                        databaseId: db.uuid,
                        databaseName: db.name,
                        hasFts5Tables: (db.fts5_count ?? 0) > 0,
                      }),
                    onRestore: (db) =>
                      setR2RestoreDialog({
                        databaseId: db.uuid,
                        databaseName: db.name,
                      }),
                    onDelete: handleSingleDelete,
                  };

                  return databaseViewMode === "list" ? (
                    <DatabaseListView
                      databases={filteredDatabases}
                      selectedDatabases={selectedDatabases}
                      databaseColors={databaseColors}
                      onToggleSelection={toggleDatabaseSelection}
                      onSelectAll={selectAllDatabases}
                      onClearSelection={clearSelection}
                      onColorChange={handleColorChange}
                      actionHandlers={actionHandlers}
                      copiedDbId={copiedDbId}
                      onCopyId={(dbId, e) => void copyDatabaseId(dbId, e)}
                    />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredDatabases.map((db) => {
                        const isSelected = selectedDatabases.includes(db.uuid);
                        const colorConfig = getColorConfig(
                          databaseColors[db.uuid] ?? null,
                        );
                        return (
                          <Card
                            key={db.uuid}
                            className={`hover:shadow-lg transition-shadow relative overflow-hidden ${
                              isSelected ? "ring-2 ring-primary" : ""
                            }`}
                          >
                            {/* Color indicator bar */}
                            {colorConfig && (
                              <div
                                className={`absolute left-0 top-0 bottom-0 w-1 ${colorConfig.bgClass}`}
                                aria-hidden="true"
                              />
                            )}
                            <div
                              className={`absolute top-4 z-10 ${colorConfig ? "left-5" : "left-4"}`}
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() =>
                                  toggleDatabaseSelection(db.uuid)
                                }
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            <CardHeader
                              className={colorConfig ? "pl-14" : "pl-12"}
                            >
                              <div className="flex items-start justify-between">
                                <Database className="h-8 w-8 text-primary" />
                                <div className="flex items-center gap-1.5">
                                  <DatabaseColorPicker
                                    value={databaseColors[db.uuid] ?? null}
                                    onChange={(color) =>
                                      handleColorChange(db.uuid, color)
                                    }
                                  />
                                  {db.fts5_count !== undefined &&
                                    db.fts5_count > 0 && (
                                      <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 flex items-center gap-1">
                                        <Sparkles className="h-3 w-3" />
                                        FTS5
                                      </span>
                                    )}
                                  {db.read_replication?.mode === "auto" && (
                                    <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 flex items-center gap-1">
                                      <Globe className="h-3 w-3" />
                                      Replicated
                                    </span>
                                  )}
                                  {/* Production badge removed - D1 always returns "production" so it provides no useful information */}
                                </div>
                              </div>
                              <CardTitle className="mt-4">{db.name}</CardTitle>
                              <CardDescription>
                                <button
                                  onClick={(e) =>
                                    void copyDatabaseId(db.uuid, e)
                                  }
                                  className="flex items-center gap-1.5 hover:text-foreground transition-colors group text-left"
                                  title="Click to copy database ID"
                                >
                                  <span className="text-muted-foreground/70">
                                    ID:
                                  </span>
                                  <span className="font-mono">{db.uuid}</span>
                                  {copiedDbId === db.uuid ? (
                                    <>
                                      <Check className="h-3 w-3 text-green-500 flex-shrink-0" />
                                      <span className="text-green-500 text-xs">
                                        Copied!
                                      </span>
                                    </>
                                  ) : (
                                    <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                  )}
                                </button>
                              </CardDescription>
                            </CardHeader>
                            <CardContent className={colorConfig ? "pl-5" : ""}>
                              <div className="space-y-2 text-sm mb-4">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    Created:
                                  </span>
                                  <span className="font-medium">
                                    {formatDate(db.created_at)}
                                  </span>
                                </div>
                                {db.file_size !== undefined && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">
                                      Size:
                                    </span>
                                    <span className="font-medium">
                                      {formatSize(db.file_size)}
                                    </span>
                                  </div>
                                )}
                                {db.num_tables !== undefined && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">
                                      Tables:
                                    </span>
                                    <span className="font-medium">
                                      {db.num_tables}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="grid grid-cols-4 gap-1.5">
                                {/* Row 1: Browse, Query, Rename, Clone */}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDatabaseClick(db)}
                                  aria-label="Browse database"
                                  title="Browse"
                                >
                                  <Database className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenQueryConsole(db)}
                                  aria-label="Open query console"
                                  title="Query"
                                >
                                  <Code className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRenameClick(db);
                                  }}
                                  aria-label="Rename database"
                                  title="Rename"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCloneDialogDatabase(db);
                                  }}
                                  aria-label="Clone database"
                                  title="Clone"
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                                {/* Row 2: Import, Download, Optimize, FTS5 */}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSingleImport(db);
                                  }}
                                  aria-label="Import into database"
                                  title="Import"
                                >
                                  <Upload className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleSingleDownload(db);
                                  }}
                                  aria-label="Download database"
                                  title="Download"
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSingleOptimize(db);
                                  }}
                                  aria-label="Optimize database"
                                  title="Optimize"
                                >
                                  <Zap className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFts5Click(db);
                                  }}
                                  aria-label="FTS5 search"
                                  title="FTS5 Search"
                                  className="hover:bg-purple-100 hover:text-purple-700 hover:border-purple-300 dark:hover:bg-purple-900/30 dark:hover:text-purple-300 dark:hover:border-purple-700"
                                >
                                  <Sparkles className="h-4 w-4" />
                                </Button>
                                {/* Row 3: R2 Backup, R2 Restore, Delete (spanning) */}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setR2BackupDialog({
                                      databaseId: db.uuid,
                                      databaseName: db.name,
                                      hasFts5Tables: (db.fts5_count ?? 0) > 0,
                                    });
                                  }}
                                  aria-label="Backup to R2"
                                  title="Backup to R2"
                                  className="hover:bg-blue-100 hover:text-blue-700 hover:border-blue-300 dark:hover:bg-blue-900/30 dark:hover:text-blue-300 dark:hover:border-blue-700"
                                >
                                  <Cloud className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setR2RestoreDialog({
                                      databaseId: db.uuid,
                                      databaseName: db.name,
                                    });
                                  }}
                                  aria-label="Restore from R2"
                                  title="Restore from R2"
                                  className="hover:bg-green-100 hover:text-green-700 hover:border-green-300 dark:hover:bg-green-900/30 dark:hover:text-green-300 dark:hover:border-green-700"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSingleDelete(db);
                                  }}
                                  aria-label="Delete database"
                                  title="Delete"
                                  className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive col-span-2"
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Delete
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  );
                })()}
              </>
            )}
          </>
        )}

        {currentView.type === "database" && (
          <DatabaseView
            databaseId={currentView.databaseId}
            databaseName={currentView.databaseName}
            onBack={() => setCurrentView({ type: "list" })}
            onSelectTable={(tableName) => {
              setCurrentView({
                type: "table",
                databaseId: currentView.databaseId,
                databaseName: currentView.databaseName,
                tableName,
              });
            }}
            onUndoableOperation={refreshUndoCount}
            initialTab={currentView.initialTab}
            refreshTrigger={dataRefreshTrigger}
          />
        )}

        {currentView.type === "table" && (
          <TableView
            databaseId={currentView.databaseId}
            databaseName={currentView.databaseName}
            tableName={currentView.tableName}
            navigationHistory={currentView.navigationHistory ?? []}
            {...(currentView.fkFilter && { fkFilter: currentView.fkFilter })}
            onBack={() => {
              setCurrentView({
                type: "database",
                databaseId: currentView.databaseId,
                databaseName: currentView.databaseName,
              });
            }}
            onNavigateToRelatedTable={(refTable, refColumn, value) => {
              // Add current table to navigation history
              const history = currentView.navigationHistory ?? [];
              const currentFkFilter = currentView.fkFilter;
              const newHistoryEntry = currentFkFilter
                ? {
                    tableName: currentView.tableName,
                    fkFilter: currentFkFilter,
                  }
                : { tableName: currentView.tableName };
              const newHistory = [...history, newHistoryEntry];

              // Navigate to the referenced table with FK filter
              setCurrentView({
                type: "table",
                databaseId: currentView.databaseId,
                databaseName: currentView.databaseName,
                tableName: refTable,
                navigationHistory: newHistory,
                fkFilter: `${refColumn}:${String(value)}`,
              });
            }}
            onNavigateToHistoryTable={(index) => {
              // Navigate back to a table in the history
              const history = currentView.navigationHistory ?? [];
              const targetEntry = history[index];
              if (index < history.length && targetEntry) {
                const newHistory = history.slice(0, index);

                setCurrentView({
                  type: "table",
                  databaseId: currentView.databaseId,
                  databaseName: currentView.databaseName,
                  tableName: targetEntry.tableName,
                  navigationHistory: newHistory,
                  ...(targetEntry.fkFilter && {
                    fkFilter: targetEntry.fkFilter,
                  }),
                });
              }
            }}
            onUndoableOperation={refreshUndoCount}
          />
        )}

        {currentView.type === "query" && (
          <div className="space-y-6">
            <Button
              variant="outline"
              onClick={() => setCurrentView({ type: "list" })}
            >
              ← Back to Databases
            </Button>
            <Suspense fallback={<LazyLoadingFallback />}>
              <QueryConsole
                databaseId={currentView.databaseId}
                databaseName={currentView.databaseName}
                onSchemaChange={() => void loadDatabases()}
              />
            </Suspense>
          </div>
        )}

        {currentView.type === "search" && (
          <Suspense fallback={<LazyLoadingFallback />}>
            <CrossDatabaseSearch
              databases={databases}
              onNavigateToDatabase={(
                databaseId: string,
                databaseName: string,
                initialTab?: string,
              ) => {
                setCurrentView({
                  type: "database",
                  databaseId,
                  databaseName,
                  initialTab,
                });
              }}
            />
          </Suspense>
        )}

        {currentView.type === "job-history" && (
          <JobHistory databases={databases} />
        )}

        {currentView.type === "webhooks" && (
          <Suspense fallback={<LazyLoadingFallback />}>
            <WebhookManager />
          </Suspense>
        )}

        {currentView.type === "metrics" && (
          <Suspense fallback={<LazyLoadingFallback />}>
            <MetricsDashboard />
          </Suspense>
        )}

        {currentView.type === "health" && (
          <Suspense fallback={<LazyLoadingFallback />}>
            <HealthDashboard />
          </Suspense>
        )}
      </main>

      {/* Create Database Dialog */}
      <Dialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) {
            setCreateDbError("");
            setNewDbName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Database</DialogTitle>
            <DialogDescription>
              Enter a name for your new D1 database. The name must be unique.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Database Name</Label>
              <Input
                id="name"
                name="database-name"
                autoComplete="off"
                placeholder="my-database"
                value={newDbName}
                maxLength={63}
                onChange={(e) => {
                  setNewDbName(e.target.value);
                  setCreateDbError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !creating) {
                    void handleCreateDatabase();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                3-63 characters. Lowercase letters, numbers, and hyphens only.
                Cannot start or end with a hyphen.
              </p>
              {newDbName.length > 0 && (
                <p
                  className={`text-xs ${newDbName.length > 60 ? "text-amber-500" : "text-muted-foreground"}`}
                >
                  {newDbName.length}/63 characters
                </p>
              )}
            </div>
            <ErrorMessage error={createDbError} variant="inline" />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreateDatabase()}
              disabled={creating || !newDbName.trim()}
            >
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Database Dialog */}
      <ImportDatabaseDialog
        open={showUploadDialog}
        databases={databases}
        onClose={() => setShowUploadDialog(false)}
        onImport={async (options) => {
          await api.importDatabase(options.sqlContent, {
            createNew: options.createNew,
            ...(options.databaseName
              ? { databaseName: options.databaseName }
              : {}),
            ...(options.targetDatabaseId
              ? { targetDatabaseId: options.targetDatabaseId }
              : {}),
          });
          await loadDatabases();
        }}
      />

      {/* Delete Confirmation Dialog */}
      {/* Delete Confirmation Dialog - hidden when R2 backup dialog or progress dialog is open from here */}
      {deleteConfirmState && (
        <Dialog
          open={
            !r2BackupDialog?.returnTo &&
            backupProgressDialog?.returnTo !== "delete"
          }
          onOpenChange={(isOpen) => {
            if (
              !isOpen &&
              !deleteConfirmState.isDeleting &&
              !deleteConfirmState.isBackingUp
            ) {
              setDeleteConfirmState(null);
            }
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                {deleteConfirmState.databaseNames.length === 1
                  ? "Delete Database?"
                  : `Delete ${String(deleteConfirmState.databaseNames.length)} Databases?`}
              </DialogTitle>
              <DialogDescription>
                This action cannot be undone. This will permanently delete the
                database(s) and all their data.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              {/* Database list */}
              {deleteConfirmState.databaseNames.length === 1 ? (
                <p className="text-sm">
                  Database:{" "}
                  <strong>{deleteConfirmState.databaseNames[0]}</strong>
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Databases to delete:</p>
                  <ul className="text-sm list-disc list-inside max-h-32 overflow-y-auto bg-muted/30 rounded-md p-2">
                    {deleteConfirmState.databaseNames.map((name, index) => (
                      <li key={index}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Backup Recommendation */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">
                  💾 Strongly Recommended: Create a backup first
                </h4>
                <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
                  Database deletion is permanent. Create a backup before
                  proceeding so you can recover if needed.
                </p>
                <div className="flex gap-2">
                  {r2BackupStatus?.configured &&
                    deleteConfirmState.databaseNames.length === 1 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const dbId = deleteConfirmState.databaseIds[0];
                          const dbName = deleteConfirmState.databaseNames[0];
                          if (dbId && dbName) {
                            const db = databases.find((d) => d.uuid === dbId);
                            // Don't close delete dialog - it will be hidden while R2 backup is open
                            setR2BackupDialog({
                              databaseId: dbId,
                              databaseName: dbName,
                              hasFts5Tables: (db?.fts5_count ?? 0) > 0,
                              returnTo: "delete",
                            });
                          }
                        }}
                        disabled={
                          deleteConfirmState.isDeleting ||
                          deleteConfirmState.isBackingUp
                        }
                        className="flex-1 bg-blue-600 text-white hover:bg-blue-700 border-blue-600"
                      >
                        <Cloud className="h-4 w-4 mr-2" />
                        Backup to R2
                      </Button>
                    )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleDeleteBackupDownload()}
                    disabled={
                      deleteConfirmState.isDeleting ||
                      deleteConfirmState.isBackingUp
                    }
                    className={
                      r2BackupStatus?.configured &&
                      deleteConfirmState.databaseNames.length === 1
                        ? "flex-1"
                        : "w-full"
                    }
                  >
                    {deleteConfirmState.isBackingUp ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    {deleteConfirmState.isBackingUp
                      ? "Downloading..."
                      : "Download Backup"}
                  </Button>
                </div>
              </div>

              {/* Backup Confirmation Checkbox */}
              <div className="flex items-start space-x-3 p-3 border rounded-lg">
                <Checkbox
                  id="delete-backup-confirmed"
                  checked={deleteConfirmState.backupConfirmed}
                  onCheckedChange={(checked) =>
                    setDeleteConfirmState((prev) =>
                      prev
                        ? {
                            ...prev,
                            backupConfirmed: checked === true,
                          }
                        : null,
                    )
                  }
                  disabled={
                    deleteConfirmState.isDeleting ||
                    deleteConfirmState.isBackingUp
                  }
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="delete-backup-confirmed"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    I have backed up this database or don&apos;t need a backup
                  </label>
                  <p className="text-xs text-muted-foreground">
                    I understand this action is permanent and cannot be undone
                  </p>
                </div>
              </div>

              {/* Progress indicator */}
              {deleteConfirmState.isDeleting &&
                deleteConfirmState.currentProgress && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Deleting database{" "}
                      {deleteConfirmState.currentProgress.current} of{" "}
                      {deleteConfirmState.currentProgress.total}...
                    </p>
                    <Progress
                      value={
                        (deleteConfirmState.currentProgress.current /
                          deleteConfirmState.currentProgress.total) *
                        100
                      }
                    />
                  </div>
                )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteConfirmState(null)}
                disabled={
                  deleteConfirmState.isDeleting ||
                  deleteConfirmState.isBackingUp
                }
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void confirmBulkDelete()}
                disabled={
                  deleteConfirmState.isDeleting ||
                  deleteConfirmState.isBackingUp ||
                  !deleteConfirmState.backupConfirmed
                }
              >
                {deleteConfirmState.isDeleting && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {deleteConfirmState.isDeleting
                  ? "Deleting..."
                  : deleteConfirmState.databaseNames.length === 1
                    ? "Delete Database"
                    : `Delete ${String(deleteConfirmState.databaseNames.length)} Databases`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Optimize Databases Dialog */}
      {optimizeDialogState && (
        <Dialog
          open={true}
          onOpenChange={() =>
            !optimizeDialogState.isOptimizing && setOptimizeDialogState(null)
          }
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {optimizeDialogState.databaseNames.length === 1
                  ? "Optimize Database?"
                  : `Optimize ${String(optimizeDialogState.databaseNames.length)} Databases?`}
              </DialogTitle>
              <DialogDescription>
                Run ANALYZE to update query statistics and improve query
                performance
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              {/* Database list */}
              {optimizeDialogState.databaseNames.length === 1 ? (
                <p className="text-sm">
                  Database:{" "}
                  <strong>{optimizeDialogState.databaseNames[0]}</strong>
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Databases to optimize:</p>
                  <ul className="text-sm list-disc list-inside max-h-32 overflow-y-auto">
                    {optimizeDialogState.databaseNames.map((name, index) => (
                      <li key={index}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Info box */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Operation:</strong> ANALYZE (PRAGMA optimize)
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  Updates query statistics for the SQLite query planner to
                  improve query performance.
                </p>
              </div>

              {/* Note about VACUUM */}
              <div className="bg-muted/50 border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">
                  <strong>Note:</strong> VACUUM is not available via D1 REST
                  API. D1 automatically manages space reclamation. For manual
                  VACUUM, use:{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">
                    wrangler d1 execute &lt;database-name&gt; --remote
                    --command="VACUUM"
                  </code>
                </p>
              </div>

              {/* Progress indicator */}
              {optimizeDialogState.isOptimizing &&
                optimizeDialogState.currentProgress && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {optimizeDialogState.currentProgress.operation} (Database{" "}
                      {optimizeDialogState.currentProgress.current} of{" "}
                      {optimizeDialogState.currentProgress.total})
                    </p>
                    <Progress
                      value={
                        (optimizeDialogState.currentProgress.current /
                          optimizeDialogState.currentProgress.total) *
                        100
                      }
                    />
                  </div>
                )}

              {/* Error message */}
              <ErrorMessage
                error={optimizeDialogState.error}
                variant="inline"
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setOptimizeDialogState(null)}
                disabled={optimizeDialogState.isOptimizing}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void confirmOptimize()}
                disabled={optimizeDialogState.isOptimizing}
              >
                {optimizeDialogState.isOptimizing && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {optimizeDialogState.isOptimizing
                  ? "Optimizing..."
                  : optimizeDialogState.databaseNames.length === 1
                    ? "Optimize Database"
                    : `Optimize ${String(optimizeDialogState.databaseNames.length)} Databases`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Rename Database Dialog - hidden when R2 backup dialog or progress dialog is open from here */}
      {renameDialogState && (
        <Dialog
          open={
            !r2BackupDialog?.returnTo &&
            backupProgressDialog?.returnTo !== "rename"
          }
          onOpenChange={(isOpen) => {
            if (!isOpen && !renameDialogState.isRenaming) {
              setRenameDialogState(null);
            }
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Rename Database</DialogTitle>
              <DialogDescription>
                Rename "{renameDialogState.database.name}" by creating a new
                database and migrating all data
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              {/* Warning Alert */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                  ⚠️ Important: This operation involves data migration
                </h4>
                <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1 list-disc list-inside">
                  <li>A new database will be created with the desired name</li>
                  <li>
                    All data will be exported and imported into the new database
                  </li>
                  <li>
                    The original database will be deleted after successful
                    migration
                  </li>
                  <li>
                    This process may take several minutes for large databases
                  </li>
                </ul>
              </div>

              {/* FTS5 Limitation Warning */}
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-2">
                  🚫 FTS5 Tables Not Supported
                </h4>
                <p className="text-xs text-red-700 dark:text-red-300">
                  Databases containing{" "}
                  <strong>FTS5 (Full-Text Search) virtual tables</strong> cannot
                  be renamed or backed up via the D1 export API. If your
                  database has FTS5 tables, this operation will fail. You must
                  drop FTS5 tables before renaming, then recreate them
                  afterward.
                </p>
              </div>

              {/* Backup Recommendation */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">
                  💾 Strongly Recommended: Create a backup first
                </h4>
                <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
                  Before renaming, we highly recommend creating a backup of your
                  database in case anything goes wrong during the migration
                  process.
                </p>
                <div className="flex gap-2">
                  {r2BackupStatus?.configured && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Don't close rename dialog - it will be hidden while R2 backup is open
                        setR2BackupDialog({
                          databaseId: renameDialogState.database.uuid,
                          databaseName: renameDialogState.database.name,
                          hasFts5Tables:
                            (renameDialogState.database.fts5_count ?? 0) > 0,
                          returnTo: "rename",
                        });
                      }}
                      disabled={renameDialogState.isRenaming}
                      className="flex-1 bg-blue-600 text-white hover:bg-blue-700 border-blue-600"
                    >
                      <Cloud className="h-4 w-4 mr-2" />
                      Backup to R2
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleDownloadBackup()}
                    disabled={renameDialogState.isRenaming}
                    className={r2BackupStatus?.configured ? "flex-1" : "w-full"}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Backup
                  </Button>
                </div>
              </div>

              {/* New Name Input */}
              <div className="grid gap-2">
                <Label htmlFor="rename-db-name">New Database Name</Label>
                <Input
                  id="rename-db-name"
                  placeholder="my-database"
                  value={renameDialogState.newName}
                  onChange={(e) =>
                    setRenameDialogState((prev) => {
                      if (!prev) return null;
                      const { error: _error, ...rest } = prev;
                      void _error;
                      return { ...rest, newName: e.target.value.toLowerCase() };
                    })
                  }
                  disabled={renameDialogState.isRenaming}
                />
                <p className="text-xs text-muted-foreground">
                  Must be 3-63 characters, lowercase letters, numbers, and
                  hyphens only
                </p>
              </div>

              {/* Backup Confirmation Checkbox */}
              <div className="flex items-start space-x-3 p-3 border rounded-lg">
                <Checkbox
                  id="backup-confirmed"
                  checked={renameDialogState.backupConfirmed}
                  onCheckedChange={(checked) =>
                    setRenameDialogState((prev) => {
                      if (!prev) return null;
                      const { error: _error, ...rest } = prev;
                      void _error;
                      return { ...rest, backupConfirmed: checked === true };
                    })
                  }
                  disabled={renameDialogState.isRenaming}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="backup-confirmed"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    I have backed up this database
                  </label>
                  <p className="text-xs text-muted-foreground">
                    I understand the risks and have downloaded a backup
                  </p>
                </div>
              </div>

              {/* Progress Indicator */}
              {renameDialogState.isRenaming && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {renameDialogState.currentStep === "validating" &&
                        "Validating and preparing..."}
                      {renameDialogState.currentStep === "creating" &&
                        "Creating new database..."}
                      {renameDialogState.currentStep === "exporting" &&
                        "Exporting data..."}
                      {renameDialogState.currentStep === "importing" &&
                        "Importing data..."}
                      {renameDialogState.currentStep === "verifying" &&
                        "Verifying data integrity..."}
                      {renameDialogState.currentStep === "deleting" &&
                        "Cleaning up..."}
                      {renameDialogState.currentStep === "completed" &&
                        "Rename complete!"}
                      {!renameDialogState.currentStep && "Processing..."}
                    </span>
                    {renameDialogState.progress !== undefined && (
                      <span className="font-medium">
                        {Math.round(renameDialogState.progress)}%
                      </span>
                    )}
                  </div>
                  {renameDialogState.progress !== undefined && (
                    <Progress value={renameDialogState.progress} />
                  )}
                </div>
              )}

              {/* Error Message */}
              <ErrorMessage
                error={renameDialogState.error}
                variant="inline"
                showTitle
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRenameDialogState(null)}
                disabled={renameDialogState.isRenaming}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleRenameDatabase()}
                disabled={
                  renameDialogState.isRenaming ||
                  !renameDialogState.backupConfirmed ||
                  renameDialogState.newName ===
                    renameDialogState.database.name ||
                  !renameDialogState.newName.trim()
                }
              >
                {renameDialogState.isRenaming && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {renameDialogState.isRenaming
                  ? "Renaming..."
                  : "Rename Database"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Backup & Restore Hub - for database/table view */}
      {currentView.type !== "list" &&
        currentView.type !== "job-history" &&
        "databaseId" in currentView && (
          <Suspense fallback={<LazyLoadingFallback />}>
            <BackupRestoreHub
              open={showUndoHistory}
              onOpenChange={setShowUndoHistory}
              databaseId={currentView.databaseId}
              databaseName={currentView.databaseName}
              fts5Count={
                databases.find((db) => db.uuid === currentView.databaseId)
                  ?.fts5_count
              }
              onRestoreSuccess={() => {
                refreshUndoCount();
                // Trigger reload of table list by incrementing refresh trigger
                setDataRefreshTrigger((prev) => prev + 1);
              }}
              onR2RestoreStarted={() => {
                // Job tracking is handled by job history
              }}
              onBack={() => {
                setShowUndoHistory(false);
                setShowUndoDatabasePicker(true);
              }}
            />
          </Suspense>
        )}

      {/* Backup & Restore Hub - for selected database from picker */}
      {undoSelectedDatabase && (
        <Suspense fallback={<LazyLoadingFallback />}>
          <BackupRestoreHub
            open={showUndoHistory}
            onOpenChange={(open) => {
              setShowUndoHistory(open);
              if (!open) {
                setUndoSelectedDatabase(null);
              }
            }}
            databaseId={undoSelectedDatabase.id}
            databaseName={undoSelectedDatabase.name}
            fts5Count={
              databases.find((db) => db.uuid === undoSelectedDatabase.id)
                ?.fts5_count
            }
            initialTab={
              undoSelectedDatabase.isOrphaned === true ||
              undoSelectedDatabase.preferR2Tab === true
                ? "r2-backups"
                : "quick-restore"
            }
            onRestoreSuccess={() => {
              refreshUndoCount();
              // Trigger reload of table list by incrementing refresh trigger
              setDataRefreshTrigger((prev) => prev + 1);
            }}
            onR2RestoreStarted={() => {
              // Job tracking is handled by job history
            }}
            onBack={() => {
              setShowUndoHistory(false);
              setUndoSelectedDatabase(null);
              setShowUndoDatabasePicker(true);
            }}
          />
        </Suspense>
      )}

      {/* Backup & Restore Database Picker Dialog - for list view */}
      <Dialog
        open={showUndoDatabasePicker}
        onOpenChange={setShowUndoDatabasePicker}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              Backup & Restore
            </DialogTitle>
            <DialogDescription>
              Select a database to manage undo history and R2 backups
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-muted/50 border rounded-lg p-3 mb-4 text-xs text-muted-foreground">
              <p className="flex items-center gap-2 mb-1">
                <Undo className="h-3 w-3" />
                <strong className="text-foreground">Quick Restore:</strong> Undo
                dropped tables, columns, deleted rows
              </p>
              <p className="flex items-center gap-2">
                <Cloud className="h-3 w-3" />
                <strong className="text-foreground">R2 Backups:</strong> Full
                database snapshots in cloud storage
              </p>
            </div>
            {databases.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No databases available
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2">
                {databases.map((db) => {
                  const undoCountValue = undoCounts[db.uuid] ?? 0;
                  const r2CountValue = r2BackupCounts[db.uuid] ?? 0;
                  return (
                    <div
                      key={db.uuid}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{db.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {r2BackupStatus?.configured && (
                          <button
                            className={`text-xs px-2 py-1 rounded-md transition-colors ${
                              r2CountValue > 0
                                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                                : "text-muted-foreground hover:bg-muted"
                            }`}
                            onClick={() => {
                              setUndoSelectedDatabase({
                                id: db.uuid,
                                name: db.name,
                                preferR2Tab: true,
                              });
                              setShowUndoDatabasePicker(false);
                              setShowUndoHistory(true);
                            }}
                            title="View R2 Backups"
                          >
                            {r2BackupCountsLoading ? (
                              <Loader2 className="h-3 w-3 animate-spin inline" />
                            ) : (
                              <span className="flex items-center gap-1">
                                <Cloud className="h-3 w-3" />
                                {r2CountValue} R2
                              </span>
                            )}
                          </button>
                        )}
                        <button
                          className={`text-xs px-2 py-1 rounded-md transition-colors ${
                            undoCountValue > 0
                              ? "bg-primary/10 text-primary hover:bg-primary/20"
                              : "text-muted-foreground hover:bg-muted"
                          }`}
                          onClick={() => {
                            setUndoSelectedDatabase({
                              id: db.uuid,
                              name: db.name,
                            });
                            setShowUndoDatabasePicker(false);
                            setShowUndoHistory(true);
                          }}
                          title="View Quick Restore"
                        >
                          <span className="flex items-center gap-1">
                            <Undo className="h-3 w-3" />
                            {undoCountValue} undo
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Orphaned Backups Section */}
            {r2BackupStatus?.configured && (
              <div className="mt-4 pt-4 border-t">
                <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Backups from Deleted Databases
                </h4>
                {orphanedBackupsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : orphanedBackups.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    No orphaned backups found
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {orphanedBackups.map((group) => {
                      // Get the most recent and oldest backup timestamps
                      const newestBackup = group.backups[0];
                      const oldestBackup =
                        group.backups[group.backups.length - 1];
                      const newestDate = newestBackup
                        ? new Date(newestBackup.timestamp).toLocaleDateString()
                        : "";
                      const oldestDate = oldestBackup
                        ? new Date(oldestBackup.timestamp).toLocaleDateString()
                        : "";
                      const dateLabel =
                        group.backups.length === 1
                          ? `Created: ${newestDate}`
                          : `Created: ${oldestDate} → ${newestDate}`;

                      // Count database vs table backups and get unique table names
                      const databaseBackups = group.backups.filter(
                        (b) => b.backupType === "database",
                      );
                      const tableBackups = group.backups.filter(
                        (b) => b.backupType === "table",
                      );
                      const uniqueTableNames = [
                        ...new Set(
                          tableBackups.map((b) => b.tableName).filter(Boolean),
                        ),
                      ];

                      // Determine display name - backend now provides looked-up name in group.databaseName
                      // Priority: group.databaseName (from METADATA lookup) > table names > generic label
                      const hasValidGroupName =
                        group.databaseName !== "Deleted Database" &&
                        group.databaseName !== "Unknown Name" &&
                        group.databaseName !== "";

                      let displayName: string;
                      if (hasValidGroupName) {
                        displayName = group.databaseName;
                      } else if (uniqueTableNames.length > 0) {
                        displayName =
                          uniqueTableNames.length === 1
                            ? `Table: ${uniqueTableNames[0]}`
                            : `Tables: ${uniqueTableNames.slice(0, 2).join(", ")}${uniqueTableNames.length > 2 ? ` +${uniqueTableNames.length - 2} more` : ""}`;
                      } else if (databaseBackups.length > 0) {
                        displayName = "Database Backup";
                      } else {
                        displayName = "Unknown";
                      }

                      // Build backup type summary
                      const backupTypeParts: string[] = [];
                      if (databaseBackups.length > 0) {
                        backupTypeParts.push(`${databaseBackups.length} db`);
                      }
                      if (tableBackups.length > 0) {
                        backupTypeParts.push(`${tableBackups.length} table`);
                      }
                      const backupTypeSummary = backupTypeParts.join(", ");

                      return (
                        <div
                          key={group.databaseId}
                          className="flex items-center gap-2 p-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20"
                        >
                          <button
                            className="flex-1 flex flex-col gap-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors text-left text-sm rounded px-2 py-1"
                            onClick={() => {
                              setUndoSelectedDatabase({
                                id: group.databaseId,
                                name: group.databaseName,
                                isOrphaned: true,
                              });
                              setShowUndoDatabasePicker(false);
                              setShowUndoHistory(true);
                            }}
                          >
                            <div className="flex items-center justify-between w-full">
                              <div className="flex items-center gap-2">
                                <Database className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                <span className="font-medium text-amber-800 dark:text-amber-200">
                                  {displayName}
                                </span>
                              </div>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                                {group.backups.length} backup
                                {group.backups.length !== 1 ? "s" : ""}
                                {backupTypeSummary && ` (${backupTypeSummary})`}
                              </span>
                            </div>
                            <div className="flex flex-col gap-0.5 text-xs text-amber-600/70 dark:text-amber-400/70 pl-5">
                              <span>ID: {group.databaseId}</span>
                              <span>{dateLabel}</span>
                            </div>
                          </button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteOrphanedBackups(
                                group.databaseId,
                              );
                            }}
                            disabled={
                              deletingOrphanedBackups === group.databaseId
                            }
                            title="Delete all backups for this database"
                          >
                            {deletingOrphanedBackups === group.databaseId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowUndoDatabasePicker(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Skipped Exports Notice Dialog */}
      <Dialog
        open={skippedExports !== null}
        onOpenChange={() => setSkippedExports(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-5 w-5" />
              Some Databases Were Not Exported
            </DialogTitle>
            <DialogDescription>
              The following databases could not be exported due to limitations
              in the D1 export API.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {skippedExports?.map((item) => (
              <div
                key={item.databaseId}
                className="rounded-lg border p-3 bg-amber-50 dark:bg-amber-950/20"
              >
                <div className="font-medium">{item.name}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  {item.reason === "fts5" ? (
                    <>
                      <span className="text-amber-600 dark:text-amber-400">
                        Contains FTS5 virtual tables
                      </span>
                      {item.details && item.details.length > 0 && (
                        <span className="text-xs block mt-1">
                          Tables: {item.details.join(", ")}
                        </span>
                      )}
                      <p className="text-xs mt-2 text-muted-foreground">
                        D1's export API does not support databases with FTS5
                        full-text search tables. To export this database, first
                        drop the FTS5 tables, export, then recreate them.
                      </p>
                    </>
                  ) : item.reason === "protected" ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      Protected system database
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">
                      {item.reason}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setSkippedExports(null)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clone Database Dialog */}
      {cloneDialogDatabase && (
        <CloneDatabaseDialog
          open={true}
          onOpenChange={(open) => !open && setCloneDialogDatabase(null)}
          database={cloneDialogDatabase}
          allDatabases={databases}
          existingDatabaseNames={databases.map((db) => db.name)}
          onClone={api.cloneDatabase.bind(api)}
          onSuccess={() => void loadDatabases()}
        />
      )}

      {/* Export Database Dialog */}
      {exportDialogDatabase && (
        <ExportDatabaseDialog
          open={true}
          database={exportDialogDatabase}
          onClose={() => setExportDialogDatabase(null)}
        />
      )}

      {/* FTS5 Export Error Dialog */}
      {fts5ExportError && (
        <Dialog open={true} onOpenChange={() => setFts5ExportError(null)}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-5 w-5" />
                Cannot Export Database
              </DialogTitle>
              <DialogDescription>
                The database "{fts5ExportError.database.name}" contains FTS5
                (Full-Text Search) virtual tables which cannot be exported using
                D1's export API.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">FTS5 Tables Found:</p>
                <div className="bg-muted rounded-lg p-3 space-y-1">
                  {fts5ExportError.fts5Tables.map((table) => (
                    <div
                      key={table}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                      <code className="font-mono">{table}</code>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Options:</strong>
                </p>
                <ul className="mt-2 text-sm text-blue-700 dark:text-blue-300 list-disc list-inside space-y-1">
                  <li>Convert FTS5 tables to regular tables, then export</li>
                  <li>
                    Export individual non-FTS5 tables using the Tables view
                  </li>
                </ul>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => setFts5ExportError(null)}
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  const db = fts5ExportError.database;
                  setFts5ExportError(null);
                  setCurrentView({
                    type: "database",
                    databaseId: db.uuid,
                    databaseName: db.name,
                    initialTab: "fts5",
                  });
                }}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Go to FTS5 Manager
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* R2 Backup Dialog */}
      {r2BackupDialog && (
        <R2BackupDialog
          open={true}
          databaseId={r2BackupDialog.databaseId}
          databaseName={r2BackupDialog.databaseName}
          hasFts5Tables={r2BackupDialog.hasFts5Tables}
          onClose={() => setR2BackupDialog(null)}
          onBackupStarted={(jobId) => {
            // Don't clear the original dialog - just close R2 backup dialog
            // The original dialog (delete/rename) will reappear after backup progress completes
            const returnTo = r2BackupDialog.returnTo;
            setR2BackupDialog(null);
            setBackupProgressDialog({
              jobId,
              operationName: "Backup to R2",
              databaseName: r2BackupDialog.databaseName,
              ...(returnTo ? { returnTo } : {}),
            });
          }}
        />
      )}

      {/* R2 Restore Dialog */}
      {r2RestoreDialog && (
        <R2RestoreDialog
          open={true}
          databaseId={r2RestoreDialog.databaseId}
          databaseName={r2RestoreDialog.databaseName}
          onClose={() => setR2RestoreDialog(null)}
          onRestoreStarted={(jobId) => {
            setR2RestoreDialog(null);
            setBackupProgressDialog({
              jobId,
              operationName: "Restore from R2",
              databaseName: r2RestoreDialog.databaseName,
            });
          }}
        />
      )}

      {/* Backup Progress Dialog */}
      {backupProgressDialog && (
        <BackupProgressDialog
          open={true}
          jobId={backupProgressDialog.jobId}
          operationName={backupProgressDialog.operationName}
          databaseName={backupProgressDialog.databaseName}
          onClose={() => setBackupProgressDialog(null)}
          onComplete={(success) => {
            if (success) {
              // Refresh databases list on successful restore
              void loadDatabases();
            }
          }}
        />
      )}
    </div>
  );
}
