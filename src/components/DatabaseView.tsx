import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Table,
  RefreshCw,
  Plus,
  Search,
  Loader2,
  Copy,
  Download,
  Trash2,
  Pencil,
  AlertTriangle,
  Network,
  Sparkles,
  Zap,
  Clock,
  Globe,
  Upload,
  Check,
  Shield,
  Cloud,
  LayoutGrid,
  LayoutList,
  RotateCcw,
  BrainCircuit,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listTables,
  listFTS5Tables,
  executeQuery,
  convertFTS5ToTable,
  backupTableToR2,
  getR2BackupStatus,
  listR2Backups,
  restoreFromR2,
  deleteR2Backup,
  downloadR2Backup,
  getR2BackupSourceLabel,
  type TableInfo,
  type TableDependenciesResponse,
  type DatabaseColor,
  type R2BackupStatus,
  type R2BackupListItem,
} from "@/services/api";
import { api } from "@/services/api";
import { DatabaseColorPicker } from "./DatabaseColorPicker";
import { getColorConfig } from "@/utils/databaseColors";
import { SchemaDesigner } from "./SchemaDesigner";
import { TableDependenciesView } from "./TableDependenciesView";
import { CascadeImpactSimulator } from "./CascadeImpactSimulator";
import { ForeignKeyVisualizer } from "./ForeignKeyVisualizer";
import { ERDiagram } from "./ERDiagram";
import { FTS5Manager } from "./FTS5Manager";
import { IndexAnalyzer } from "./IndexAnalyzer";
import { CircularDependencyDetector } from "./CircularDependencyDetector";
import { TimeTravelInfo } from "./TimeTravelInfo";
import { ReadReplicationInfo } from "./ReadReplicationInfo";
import { ImportTableDialog } from "./ImportTableDialog";
import { BackupProgressDialog } from "./BackupProgressDialog";
import { TableListView, type TableActionHandlers } from "./TableListView";
import { AISearchPanel } from "./AISearchPanel";
import { GridSortSelect, type SortOption } from "./GridSortSelect";
import { ErrorMessage } from "@/components/ui/error-message";
import { validateIdentifier } from "@/lib/sqlValidator";

type TableViewMode = "grid" | "list";

// Helper to get view mode from localStorage
const getStoredTableViewMode = (): TableViewMode => {
  try {
    const stored = localStorage.getItem("d1-manager-table-view-mode");
    if (stored === "grid" || stored === "list") {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return "list"; // Default to list for faster rendering
};

interface DatabaseViewProps {
  databaseId: string;
  databaseName: string;
  onBack: () => void;
  onSelectTable: (tableName: string) => void;
  onUndoableOperation?: () => void;
  initialTab?: string | undefined;
  refreshTrigger?: number;
}

export function DatabaseView({
  databaseId,
  databaseName,
  onBack,
  onSelectTable,
  onUndoableOperation,
  initialTab,
  refreshTrigger,
}: DatabaseViewProps): React.JSX.Element {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSchemaDesigner, setShowSchemaDesigner] = useState(false);
  const [activeTab, setActiveTab] = useState<
    | "tables"
    | "relationships"
    | "circular"
    | "fts5"
    | "performance"
    | "time-travel"
    | "replication"
    | "ai-search"
  >(
    initialTab === "fts5"
      ? "fts5"
      : initialTab === "ai-search"
        ? "ai-search"
        : "tables",
  );
  const [relationshipsView, setRelationshipsView] = useState<
    "editor" | "diagram"
  >("editor");

  // Table view mode (grid/list)
  const [tableViewMode, setTableViewMode] = useState<TableViewMode>(
    getStoredTableViewMode,
  );

  // Table grid sort state
  const [tableGridSortField, setTableGridSortField] = useState<string>("name");
  const [tableGridSortDirection, setTableGridSortDirection] = useState<
    "asc" | "desc"
  >("asc");

  // Selection state
  const [selectedTables, setSelectedTables] = useState<string[]>([]);

  // Rename dialog state
  const [renameDialogState, setRenameDialogState] = useState<{
    tableName: string;
    newName: string;
    isRenaming: boolean;
    error?: string;
  } | null>(null);

  // Clone dialog state
  const [cloneDialogState, setCloneDialogState] = useState<{
    tableNames: string[];
    cloneNames: Record<string, string>;
    isCloning: boolean;
    progress?: { current: number; total: number };
    error?: string;
  } | null>(null);

  // Export dialog state
  const [exportDialogState, setExportDialogState] = useState<{
    tableNames: string[];
    format: "sql" | "csv" | "json";
    isExporting: boolean;
    progress?: number;
    error?: string;
  } | null>(null);

  // Delete dialog state
  const [deleteDialogState, setDeleteDialogState] = useState<{
    tableNames: string[];
    isDeleting: boolean;
    progress?: { current: number; total: number };
    error?: string;
    dependencies?: TableDependenciesResponse;
    loadingDependencies?: boolean;
    confirmDependencies?: boolean;
    backupConfirmed?: boolean;
    isExporting?: boolean;
    isR2Backing?: boolean;
  } | null>(null);

  // R2 table backup progress dialog state
  const [r2TableBackupProgress, setR2TableBackupProgress] = useState<{
    jobId: string;
    tableName: string;
  } | null>(null);

  // R2 backup confirmation dialog for table cards
  const [r2BackupDialogTable, setR2BackupDialogTable] = useState<string | null>(
    null,
  );
  const [r2BackupDialogLoading, setR2BackupDialogLoading] = useState(false);

  // R2 restore dialog for table cards
  const [r2RestoreDialogTable, setR2RestoreDialogTable] = useState<
    string | null
  >(null);
  const [r2RestoreBackups, setR2RestoreBackups] = useState<R2BackupListItem[]>(
    [],
  );
  const [r2RestoreLoading, setR2RestoreLoading] = useState(false);
  const [r2RestoreError, setR2RestoreError] = useState<string | null>(null);
  const [r2RestoreSelected, setR2RestoreSelected] =
    useState<R2BackupListItem | null>(null);
  const [r2RestoreIsRestoring, setR2RestoreIsRestoring] = useState(false);
  const [r2RestoreProgressDialog, setR2RestoreProgressDialog] = useState<{
    jobId: string;
    tableName: string;
  } | null>(null);

  // Import dialog state
  const [importDialogState, setImportDialogState] = useState<{
    tableName?: string; // If set, import into this specific table
  } | null>(null);

  // STRICT mode dialog state
  const [strictDialogState, setStrictDialogState] = useState<{
    tableName: string;
    isStrict: boolean;
    isConverting: boolean;
    confirmed: boolean;
    backupFirst: boolean;
    backupMethod: "r2" | "download";
    backupFormat: "sql" | "csv" | "json";
    isBackingUp: boolean;
    error?: string;
    // Validation state
    isValidating: boolean;
    validation?: {
      compatible: boolean;
      isAlreadyStrict: boolean;
      isVirtualTable: boolean;
      hasGeneratedColumns: boolean;
      hasForeignKeys: boolean;
      generatedColumns: { name: string; type: string; generatedType: string }[];
      foreignKeys: {
        fromColumns: string[];
        toTable: string;
        toColumns: string[];
        onUpdate: string;
        onDelete: string;
      }[];
      warnings: string[];
      blockers: string[];
    };
  } | null>(null);

  // Convert FTS5 to regular table dialog state
  const [convertFts5Dialog, setConvertFts5Dialog] = useState<{
    tableName: string;
    newTableName: string;
    deleteOriginal: boolean;
    backupFirst: boolean;
    backupMethod: "r2" | "download";
    backupFormat: "sql" | "csv" | "json";
    isBackingUp: boolean;
    isConverting: boolean;
    error?: string;
  } | null>(null);

  // Cascade simulator state
  const [showCascadeSimulator, setShowCascadeSimulator] = useState(false);
  const [cascadeSimulatorTable, setCascadeSimulatorTable] =
    useState<string>("");

  // Table colors for visual organization
  const [tableColors, setTableColors] = useState<Record<string, DatabaseColor>>(
    {},
  );

  // FTS5 table names for badge display
  const [fts5TableNames, setFts5TableNames] = useState<Set<string>>(new Set());

  // R2 backup state
  const [r2BackupStatus, setR2BackupStatus] = useState<R2BackupStatus | null>(
    null,
  );
  const [backupProgressDialog, setBackupProgressDialog] = useState<{
    jobId: string;
    operationName: string;
    tableName?: string;
  } | null>(null);

  // Copy ID feedback
  const [idCopied, setIdCopied] = useState(false);

  const copyDatabaseId = async (): Promise<void> => {
    await navigator.clipboard.writeText(databaseId);
    setIdCopied(true);
    setTimeout(() => setIdCopied(false), 2000);
  };

  const loadR2BackupStatus = useCallback(async (): Promise<void> => {
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
  }, []);

  const loadTables = useCallback(
    async (skipCache = false): Promise<void> => {
      try {
        setLoading(true);
        setError(null);
        const result = await listTables(databaseId, skipCache);
        setTables(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load tables");
      } finally {
        setLoading(false);
      }
    },
    [databaseId],
  );

  const loadTableColors = useCallback(async (): Promise<void> => {
    try {
      const colors = await api.getTableColors(databaseId);
      setTableColors(colors);
    } catch {
      // Colors are optional, silently ignore failures
    }
  }, [databaseId]);

  const loadFTS5TableNames = useCallback(async (): Promise<void> => {
    try {
      const fts5Tables = await listFTS5Tables(databaseId);
      setFts5TableNames(new Set(fts5Tables.map((t) => t.name)));
    } catch {
      // Badges are optional, silently ignore failures
    }
  }, [databaseId]);

  useEffect(() => {
    void loadTables(false); // Use cache on initial load for instant switching
    void loadTableColors();
    void loadFTS5TableNames();
    void loadR2BackupStatus();
  }, [loadTables, loadTableColors, loadFTS5TableNames, loadR2BackupStatus]);

  // Reload tables when refreshTrigger changes (e.g., after undo restore)
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      void loadTables(true); // Skip cache to get fresh data
    }
  }, [refreshTrigger, loadTables]);

  const handleTableColorChange = async (
    tableName: string,
    color: DatabaseColor,
  ): Promise<void> => {
    try {
      await api.updateTableColor(databaseId, tableName, color);
      setTableColors((prev) => ({
        ...prev,
        [tableName]: color,
      }));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update table color",
      );
    }
  };

  const filteredTablesUnsorted = tables.filter((table) =>
    table.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Sort options for table grid view
  const tableSortOptions: SortOption[] = [
    { value: "name", label: "Name" },
    { value: "type", label: "Type" },
    { value: "ncol", label: "Columns" },
    { value: "row_count", label: "Rows" },
  ];

  // Sort filtered tables (used by grid view, list view has its own sorting)
  const filteredTables = [...filteredTablesUnsorted].sort((a, b) => {
    let comparison = 0;
    switch (tableGridSortField) {
      case "name":
        comparison = (a.name ?? "").localeCompare(b.name ?? "");
        break;
      case "type":
        comparison = (a.type ?? "").localeCompare(b.type ?? "");
        break;
      case "ncol":
        comparison = (a.ncol ?? 0) - (b.ncol ?? 0);
        break;
      case "row_count":
        comparison = (a.row_count ?? 0) - (b.row_count ?? 0);
        break;
    }
    return tableGridSortDirection === "asc" ? comparison : -comparison;
  });

  const handleCreateTable = async (
    tableName: string,
    columns: {
      name: string;
      type: string;
      primaryKey: boolean;
      notNull: boolean;
      defaultValue: string;
    }[],
    strictMode?: boolean,
  ): Promise<void> => {
    // Generate CREATE TABLE SQL with quoted identifiers for reserved keyword safety
    const columnDefs = columns
      .map((col) => {
        let def = `"${col.name}" ${col.type}`;
        if (col.primaryKey) def += " PRIMARY KEY";
        if (col.notNull && !col.primaryKey) def += " NOT NULL";
        if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
        return def;
      })
      .join(", ");

    const strictSuffix = strictMode ? " STRICT" : "";
    const sql = `CREATE TABLE "${tableName}" (${columnDefs})${strictSuffix};`;

    // Execute the query
    await executeQuery(databaseId, sql);

    // Reload tables (skip cache to get fresh data after creation)
    await loadTables(true);
  };

  // Selection handlers
  const toggleTableSelection = (tableName: string): void => {
    setSelectedTables((prev) => {
      if (prev.includes(tableName)) {
        return prev.filter((name) => name !== tableName);
      } else {
        return [...prev, tableName];
      }
    });
  };

  const selectAllTables = (): void => {
    setSelectedTables(filteredTables.map((table) => table.name));
  };

  const clearSelection = (): void => {
    setSelectedTables([]);
  };

  // Toggle table view mode (grid/list) with localStorage persistence
  const toggleTableViewMode = (): void => {
    setTableViewMode((prev) => {
      const newMode = prev === "grid" ? "list" : "grid";
      try {
        localStorage.setItem("d1-manager-table-view-mode", newMode);
      } catch {
        // localStorage not available
      }
      return newMode;
    });
  };

  // Rename handler
  const handleRenameClick = (tableName: string): void => {
    setRenameDialogState({
      tableName,
      newName: tableName,
      isRenaming: false,
    });
  };

  const handleRenameTable = async (): Promise<void> => {
    if (!renameDialogState) return;

    const newName = renameDialogState.newName.trim();

    if (!newName) {
      setRenameDialogState((prev) =>
        prev ? { ...prev, error: "Table name is required" } : null,
      );
      return;
    }

    if (newName === renameDialogState.tableName) {
      setRenameDialogState((prev) =>
        prev
          ? {
              ...prev,
              error: "New name must be different from the current name",
            }
          : null,
      );
      return;
    }

    // Validate table name format
    const nameValidation = validateIdentifier(newName, "table");
    if (!nameValidation.isValid) {
      const errorMsg = nameValidation.suggestion
        ? `${nameValidation.error}. ${nameValidation.suggestion}`
        : (nameValidation.error ?? "Invalid table name");
      setRenameDialogState((prev) =>
        prev ? { ...prev, error: errorMsg } : null,
      );
      return;
    }

    // Check if a table with this name already exists
    if (tables.some((t) => t.name.toLowerCase() === newName.toLowerCase())) {
      setRenameDialogState((prev) =>
        prev
          ? {
              ...prev,
              error: `A table named "${newName}" already exists in this database. Please choose a different name.`,
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
    setError(null);

    try {
      await api.renameTable(databaseId, renameDialogState.tableName, newName);
      await loadTables(true); // Skip cache after rename
      setRenameDialogState(null);
    } catch (err) {
      setRenameDialogState((prev) =>
        prev
          ? {
              ...prev,
              isRenaming: false,
              error:
                err instanceof Error ? err.message : "Failed to rename table",
            }
          : null,
      );
    }
  };

  // Clone handlers
  const handleCloneClick = (): void => {
    if (selectedTables.length === 0) return;

    const cloneNames: Record<string, string> = {};
    selectedTables.forEach((name) => {
      cloneNames[name] = `${name}_copy`;
    });

    setCloneDialogState({
      tableNames: selectedTables,
      cloneNames,
      isCloning: false,
    });
  };

  const handleCloneTables = async (): Promise<void> => {
    if (!cloneDialogState) return;

    // Validate all names
    for (const oldName of cloneDialogState.tableNames) {
      const newName = cloneDialogState.cloneNames[oldName];
      if (!newName?.trim()) {
        setCloneDialogState((prev) =>
          prev
            ? { ...prev, error: `Clone name required for ${oldName}` }
            : null,
        );
        return;
      }
      if (newName === oldName) {
        setCloneDialogState((prev) =>
          prev
            ? { ...prev, error: `Clone name for ${oldName} must be different` }
            : null,
        );
        return;
      }
    }

    setCloneDialogState((prev) => {
      if (!prev) return null;
      const { error: _error, ...rest } = prev;
      void _error;
      return { ...rest, isCloning: true };
    });
    setError(null);

    try {
      const tablesToClone = cloneDialogState.tableNames
        .filter((name) => cloneDialogState.cloneNames[name])
        .map((name) => ({
          name,
          newName: cloneDialogState.cloneNames[name] ?? name,
        }));

      const result = await api.cloneTables(
        databaseId,
        tablesToClone,
        (current, total) => {
          setCloneDialogState((prev) =>
            prev
              ? {
                  ...prev,
                  progress: { current, total },
                }
              : null,
          );
        },
      );

      if (result.failed.length > 0) {
        setError(
          `Some tables failed to clone:\n${result.failed.map((f) => `${f.name}: ${f.error}`).join("\n")}`,
        );
      }

      await loadTables(true); // Skip cache after clone
      clearSelection();
      setCloneDialogState(null);
    } catch (err) {
      setCloneDialogState((prev) =>
        prev
          ? {
              ...prev,
              isCloning: false,
              error:
                err instanceof Error ? err.message : "Failed to clone tables",
            }
          : null,
      );
    }
  };

  // Export handlers
  const handleExportClick = (): void => {
    if (selectedTables.length === 0) return;

    setExportDialogState({
      tableNames: selectedTables,
      format: "sql",
      isExporting: false,
    });
  };

  const handleExportTables = async (): Promise<void> => {
    if (!exportDialogState) return;

    setExportDialogState((prev) => {
      if (!prev) return null;
      const { error: _error, ...rest } = prev;
      void _error;
      return { ...rest, isExporting: true };
    });
    setError(null);

    try {
      const firstTableName = exportDialogState.tableNames[0];
      if (exportDialogState.tableNames.length === 1 && firstTableName) {
        await api.exportTable(
          databaseId,
          firstTableName,
          exportDialogState.format,
        );
      } else {
        await api.exportTables(
          databaseId,
          exportDialogState.tableNames,
          exportDialogState.format,
          (progress) => {
            setExportDialogState((prev) =>
              prev ? { ...prev, progress } : null,
            );
          },
        );
      }

      clearSelection();
      setExportDialogState(null);
    } catch (err) {
      setExportDialogState((prev) =>
        prev
          ? {
              ...prev,
              isExporting: false,
              error:
                err instanceof Error ? err.message : "Failed to export tables",
            }
          : null,
      );
    }
  };

  // Delete handlers
  const handleDeleteClick = async (): Promise<void> => {
    if (selectedTables.length === 0) return;

    setDeleteDialogState({
      tableNames: selectedTables,
      isDeleting: false,
      loadingDependencies: true,
    });

    // Fetch dependencies
    try {
      const deps = await api.getTableDependencies(databaseId, selectedTables);
      setDeleteDialogState((prev) =>
        prev
          ? {
              ...prev,
              dependencies: deps,
              loadingDependencies: false,
            }
          : null,
      );
    } catch {
      setDeleteDialogState((prev) =>
        prev
          ? {
              ...prev,
              loadingDependencies: false,
              error:
                "Failed to load table dependencies. You can still proceed with deletion.",
            }
          : null,
      );
    }
  };

  const handleSimulateCascadeImpact = (tableName: string): void => {
    setCascadeSimulatorTable(tableName);
    setShowCascadeSimulator(true);
  };

  // Single-table handlers for card buttons
  const handleSingleClone = (tableName: string): void => {
    setCloneDialogState({
      tableNames: [tableName],
      cloneNames: { [tableName]: `${tableName}_copy` },
      isCloning: false,
    });
  };

  const handleSingleExport = (tableName: string): void => {
    setExportDialogState({
      tableNames: [tableName],
      format: "sql",
      isExporting: false,
    });
  };

  const handleSingleImport = (tableName: string): void => {
    setImportDialogState({ tableName });
  };

  const handleSingleR2BackupClick = (tableName: string): void => {
    if (!r2BackupStatus?.configured) return;
    setR2BackupDialogTable(tableName);
  };

  const handleStartR2TableBackup = async (): Promise<void> => {
    if (!r2BackupDialogTable || !r2BackupStatus?.configured) return;

    setR2BackupDialogLoading(true);
    try {
      const result = await backupTableToR2(
        databaseId,
        databaseName,
        r2BackupDialogTable,
        "sql",
        "table_backup",
      );
      setR2BackupDialogTable(null);
      setR2TableBackupProgress({
        jobId: result.job_id,
        tableName: r2BackupDialogTable,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start R2 backup",
      );
    } finally {
      setR2BackupDialogLoading(false);
    }
  };

  const handleSingleR2RestoreClick = async (
    tableName: string,
  ): Promise<void> => {
    if (!r2BackupStatus?.configured) return;
    setR2RestoreDialogTable(tableName);
    setR2RestoreLoading(true);
    setR2RestoreError(null);
    setR2RestoreSelected(null);

    try {
      const allBackups = await listR2Backups(databaseId);
      // Filter to only show backups for this specific table
      const tableBackups = allBackups.filter(
        (b) => b.tableName === tableName && b.backupType === "table",
      );
      setR2RestoreBackups(tableBackups);
    } catch (err) {
      setR2RestoreError(
        err instanceof Error ? err.message : "Failed to load backups",
      );
    } finally {
      setR2RestoreLoading(false);
    }
  };

  const handleTableRestore = async (): Promise<void> => {
    if (!r2RestoreSelected || !r2RestoreDialogTable) return;

    setR2RestoreIsRestoring(true);
    setR2RestoreError(null);

    try {
      const result = await restoreFromR2(databaseId, r2RestoreSelected.path);
      setR2RestoreDialogTable(null);
      setR2RestoreProgressDialog({
        jobId: result.job_id,
        tableName: r2RestoreDialogTable,
      });
    } catch (err) {
      setR2RestoreError(
        err instanceof Error ? err.message : "Failed to start restore",
      );
    } finally {
      setR2RestoreIsRestoring(false);
    }
  };

  const handleTableBackupDelete = async (
    backup: R2BackupListItem,
  ): Promise<void> => {
    try {
      await deleteR2Backup(databaseId, backup.timestamp, backup.path);
      setR2RestoreBackups((prev) => prev.filter((b) => b.path !== backup.path));
    } catch (err) {
      setR2RestoreError(
        err instanceof Error ? err.message : "Failed to delete backup",
      );
    }
  };

  const handleTableBackupDownload = async (
    backup: R2BackupListItem,
  ): Promise<void> => {
    try {
      // downloadR2Backup handles the download internally
      await downloadR2Backup(
        databaseId,
        backup.timestamp,
        backup.tableName ?? databaseName,
      );
    } catch (err) {
      setR2RestoreError(
        err instanceof Error ? err.message : "Failed to download backup",
      );
    }
  };

  const handleStrictClick = (tableName: string, isStrict: boolean): void => {
    // Set initial dialog state with validation in progress
    setStrictDialogState({
      tableName,
      isStrict,
      isConverting: false,
      confirmed: false,
      backupFirst: false,
      backupMethod: r2BackupStatus?.configured ? "r2" : "download",
      backupFormat: "sql",
      isBackingUp: false,
      isValidating: true,
    });

    // Fetch validation data asynchronously
    api
      .checkStrictCompatibility(databaseId, tableName)
      .then((validation) => {
        setStrictDialogState((prev) =>
          prev
            ? {
                ...prev,
                isValidating: false,
                validation,
              }
            : null,
        );
      })
      .catch((err: unknown) => {
        setStrictDialogState((prev) =>
          prev
            ? {
                ...prev,
                isValidating: false,
                error: `Failed to check compatibility: ${err instanceof Error ? err.message : String(err)}`,
              }
            : null,
        );
      });
  };

  const handleConvertToStrict = async (): Promise<void> => {
    if (!strictDialogState?.confirmed) return;

    const tableToConvert = strictDialogState.tableName;

    // Backup is now triggered immediately via buttons in the dialog
    // The backupFirst flag indicates if a backup was completed

    setStrictDialogState({
      ...strictDialogState,
      isConverting: true,
      isBackingUp: false,
    });

    try {
      await api.convertToStrict(databaseId, tableToConvert);
      await loadTables(true); // Skip cache after STRICT conversion
      setStrictDialogState(null);
      onUndoableOperation?.();
    } catch (err) {
      setStrictDialogState((prev) =>
        prev
          ? {
              ...prev,
              isConverting: false,
              error:
                err instanceof Error
                  ? err.message
                  : "Failed to convert table to STRICT mode",
            }
          : null,
      );
    }
  };

  const handleConvertFts5Click = (tableName: string): void => {
    setConvertFts5Dialog({
      tableName,
      newTableName: `${tableName.replace(/_fts$/, "")}_regular`,
      deleteOriginal: false,
      backupFirst: false,
      backupMethod: r2BackupStatus?.configured ? "r2" : "download",
      backupFormat: "sql",
      isBackingUp: false,
      isConverting: false,
    });
  };

  const handleConvertFts5ToTable = async (): Promise<void> => {
    if (!convertFts5Dialog) return;

    try {
      // Backup is now triggered immediately via buttons in the dialog
      // The backupFirst flag indicates if a backup was completed

      setConvertFts5Dialog({
        ...convertFts5Dialog,
        isBackingUp: false,
        isConverting: true,
      });

      await convertFTS5ToTable(databaseId, convertFts5Dialog.tableName, {
        newTableName: convertFts5Dialog.newTableName,
        deleteOriginal: convertFts5Dialog.deleteOriginal,
      });

      await loadTables(true); // Skip cache after FTS5 conversion
      setConvertFts5Dialog(null);
      onUndoableOperation?.();
    } catch (err) {
      setConvertFts5Dialog((prev) =>
        prev
          ? {
              ...prev,
              isBackingUp: false,
              isConverting: false,
              error:
                err instanceof Error
                  ? err.message
                  : "Failed to convert FTS5 table",
            }
          : null,
      );
    }
  };

  const handleSingleDelete = async (tableName: string): Promise<void> => {
    setDeleteDialogState({
      tableNames: [tableName],
      isDeleting: false,
      loadingDependencies: true,
    });

    // Fetch dependencies
    try {
      const deps = await api.getTableDependencies(databaseId, [tableName]);
      setDeleteDialogState((prev) =>
        prev
          ? {
              ...prev,
              dependencies: deps,
              loadingDependencies: false,
            }
          : null,
      );
    } catch {
      setDeleteDialogState((prev) =>
        prev
          ? {
              ...prev,
              loadingDependencies: false,
              error:
                "Failed to load table dependencies. You can still proceed with deletion.",
            }
          : null,
      );
    }
  };

  const handleDeleteTables = async (): Promise<void> => {
    if (!deleteDialogState) return;

    // Require backup confirmation
    if (!deleteDialogState.backupConfirmed) {
      setDeleteDialogState((prev) =>
        prev
          ? {
              ...prev,
              error: "Please confirm you have backed up your data",
            }
          : null,
      );
      return;
    }

    setDeleteDialogState((prev) => {
      if (!prev) return null;
      const { error: _error, ...rest } = prev;
      void _error;
      return { ...rest, isDeleting: true };
    });
    setError(null);

    try {
      const result = await api.deleteTables(
        databaseId,
        deleteDialogState.tableNames,
        (current, total) => {
          setDeleteDialogState((prev) =>
            prev
              ? {
                  ...prev,
                  progress: { current, total },
                }
              : null,
          );
        },
      );

      if (result.failed.length > 0) {
        setError(
          `Some tables failed to delete:\n${result.failed.map((f) => `${f.name}: ${f.error}`).join("\n")}`,
        );
      }

      await loadTables(true); // Skip cache after delete
      clearSelection();
      setDeleteDialogState(null);

      // Notify parent of undo able operation
      if (onUndoableOperation) {
        onUndoableOperation();
      }
    } catch (err) {
      setDeleteDialogState((prev) =>
        prev
          ? {
              ...prev,
              isDeleting: false,
              error:
                err instanceof Error ? err.message : "Failed to delete tables",
            }
          : null,
      );
    }
  };

  const handleDeleteTableBackup = async (): Promise<void> => {
    if (!deleteDialogState) return;

    setDeleteDialogState((prev) =>
      prev ? { ...prev, isExporting: true } : null,
    );

    try {
      const firstTableName = deleteDialogState.tableNames[0];
      if (deleteDialogState.tableNames.length === 1 && firstTableName) {
        await api.exportTable(databaseId, firstTableName, "sql");
      } else {
        await api.exportTables(databaseId, deleteDialogState.tableNames, "sql");
      }
    } catch (err) {
      setDeleteDialogState((prev) =>
        prev
          ? {
              ...prev,
              error:
                err instanceof Error ? err.message : "Failed to export tables",
            }
          : null,
      );
    } finally {
      setDeleteDialogState((prev) =>
        prev ? { ...prev, isExporting: false } : null,
      );
    }
  };

  const handleR2TableBackup = async (): Promise<void> => {
    if (
      !deleteDialogState?.tableNames.length ||
      deleteDialogState.tableNames.length !== 1
    )
      return;

    const tableName = deleteDialogState.tableNames[0];
    if (!tableName) return;

    setDeleteDialogState((prev) =>
      prev ? { ...prev, isR2Backing: true } : null,
    );

    try {
      const result = await backupTableToR2(
        databaseId,
        databaseName,
        tableName,
        "sql",
        "table_backup",
      );
      setR2TableBackupProgress({
        jobId: result.job_id,
        tableName,
      });
    } catch (err) {
      setDeleteDialogState((prev) =>
        prev
          ? {
              ...prev,
              error:
                err instanceof Error
                  ? err.message
                  : "Failed to start R2 backup",
            }
          : null,
      );
    } finally {
      setDeleteDialogState((prev) =>
        prev ? { ...prev, isR2Backing: false } : null,
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-3xl font-semibold">{databaseName}</h2>
            <button
              onClick={() => void copyDatabaseId()}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group mt-1"
              title="Click to copy database ID"
            >
              <span className="text-muted-foreground/70">ID:</span>
              <span className="font-mono">{databaseId}</span>
              {idCopied ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
              {idCopied && (
                <span className="text-green-500 text-xs">Copied!</span>
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 mr-4">
            <Button
              variant={activeTab === "tables" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("tables")}
            >
              <Table className="h-4 w-4 mr-2" />
              Tables
            </Button>
            <Button
              variant={activeTab === "relationships" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("relationships")}
            >
              <Network className="h-4 w-4 mr-2" />
              Relationships
            </Button>
            <Button
              variant={activeTab === "circular" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("circular")}
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Circular Dependencies
            </Button>
            <Button
              variant={activeTab === "fts5" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("fts5")}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              FTS5 Search
            </Button>
            <Button
              variant={activeTab === "performance" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("performance")}
            >
              <Zap className="h-4 w-4 mr-2" />
              Performance
            </Button>
            <Button
              variant={activeTab === "time-travel" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("time-travel")}
            >
              <Clock className="h-4 w-4 mr-2" />
              Time Travel
            </Button>
            <Button
              variant={activeTab === "replication" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("replication")}
            >
              <Globe className="h-4 w-4 mr-2" />
              Replication
            </Button>
            <Button
              variant={activeTab === "ai-search" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("ai-search")}
            >
              <BrainCircuit className="h-4 w-4 mr-2" />
              AI Search
            </Button>
          </div>
          {activeTab === "tables" && (
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={() => void loadTables(true)}
                title="Refresh table list"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button onClick={() => setShowSchemaDesigner(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Table
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content based on active tab */}
      {activeTab === "relationships" ? (
        <>
          {/* View toggle for Relationships tab */}
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <span className="text-sm font-medium text-muted-foreground">
              View:
            </span>
            <div className="flex gap-1">
              <Button
                variant={relationshipsView === "editor" ? "default" : "outline"}
                size="sm"
                onClick={() => setRelationshipsView("editor")}
              >
                Foreign Key Editor
              </Button>
              <Button
                variant={
                  relationshipsView === "diagram" ? "default" : "outline"
                }
                size="sm"
                onClick={() => setRelationshipsView("diagram")}
              >
                ER Diagram
              </Button>
            </div>
          </div>

          {relationshipsView === "editor" ? (
            <ForeignKeyVisualizer
              databaseId={databaseId}
              onTableSelect={onSelectTable}
            />
          ) : (
            <ERDiagram
              databaseId={databaseId}
              databaseName={databaseName}
              onTableSelect={onSelectTable}
            />
          )}
        </>
      ) : activeTab === "circular" ? (
        <CircularDependencyDetector
          databaseId={databaseId}
          onNavigateToRelationships={() => {
            setRelationshipsView("editor");
            setActiveTab("relationships");
          }}
        />
      ) : activeTab === "fts5" ? (
        <FTS5Manager
          databaseId={databaseId}
          databaseName={databaseName}
          onNavigateToTables={() => setActiveTab("tables")}
          onConvertFTS5ToTable={(tableName) => {
            setConvertFts5Dialog({
              tableName,
              newTableName: `${tableName}_regular`,
              deleteOriginal: false,
              backupFirst: false,
              backupMethod: r2BackupStatus?.configured ? "r2" : "download",
              backupFormat: "sql",
              isBackingUp: false,
              isConverting: false,
            });
          }}
          onUndoableOperation={onUndoableOperation}
        />
      ) : activeTab === "performance" ? (
        <IndexAnalyzer databaseId={databaseId} databaseName={databaseName} />
      ) : activeTab === "time-travel" ? (
        <TimeTravelInfo databaseId={databaseId} databaseName={databaseName} />
      ) : activeTab === "replication" ? (
        <ReadReplicationInfo
          databaseId={databaseId}
          databaseName={databaseName}
        />
      ) : activeTab === "ai-search" ? (
        <AISearchPanel databaseId={databaseId} databaseName={databaseName} />
      ) : (
        <>
          {/* Search Bar */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="table-search"
                  name="table-search"
                  autoComplete="off"
                  placeholder="Filter tables..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  aria-label="Search tables"
                />
              </div>
              <div className="text-sm text-muted-foreground">
                {filteredTables.length}{" "}
                {filteredTables.length === 1 ? "table" : "tables"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {tableViewMode === "grid" && (
                <GridSortSelect
                  options={tableSortOptions}
                  value={tableGridSortField}
                  direction={tableGridSortDirection}
                  onValueChange={setTableGridSortField}
                  onDirectionToggle={() =>
                    setTableGridSortDirection((d) =>
                      d === "asc" ? "desc" : "asc",
                    )
                  }
                />
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={toggleTableViewMode}
                aria-label={
                  tableViewMode === "grid"
                    ? "Switch to list view"
                    : "Switch to grid view"
                }
                title={
                  tableViewMode === "grid"
                    ? "Switch to list view"
                    : "Switch to grid view"
                }
                className="flex items-center gap-2"
              >
                {tableViewMode === "grid" ? (
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

          {/* Selection Toolbar */}
          {filteredTables.length > 0 && (
            <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  onClick={() => setImportDialogState({})}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import
                </Button>
                <Button variant="outline" onClick={selectAllTables}>
                  Select All
                </Button>
                {selectedTables.length > 0 && (
                  <>
                    <Button variant="outline" onClick={clearSelection}>
                      Clear Selection
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {selectedTables.length} table
                      {selectedTables.length !== 1 ? "s" : ""} selected
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectedTables.length > 0 && (
                  <>
                    <Button variant="outline" onClick={handleCloneClick}>
                      <Copy className="h-4 w-4 mr-2" />
                      Clone Selected
                    </Button>
                    <Button variant="outline" onClick={handleExportClick}>
                      <Download className="h-4 w-4 mr-2" />
                      Export Selected
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => void handleDeleteClick()}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Selected
                    </Button>
                  </>
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

          {/* Tables Grid/List */}
          {!loading && !error && (
            <>
              {filteredTables.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Table className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">
                      {searchQuery ? "No tables found" : "No tables yet"}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {searchQuery
                        ? "Try adjusting your search query"
                        : "Create your first table to get started"}
                    </p>
                    {!searchQuery && (
                      <Button onClick={() => setShowSchemaDesigner(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Table
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Table action handlers for both grid and list views */}
                  {(() => {
                    const tableActionHandlers: TableActionHandlers = {
                      onBrowse: onSelectTable,
                      onRename: handleRenameClick,
                      onClone: handleSingleClone,
                      onImport: handleSingleImport,
                      onExport: handleSingleExport,
                      onFts5: (tableName, isFts5) => {
                        if (isFts5) {
                          handleConvertFts5Click(tableName);
                        } else {
                          setActiveTab("fts5");
                        }
                      },
                      onStrict: handleStrictClick,
                      onR2Backup: handleSingleR2BackupClick,
                      onR2Restore: (tableName) =>
                        void handleSingleR2RestoreClick(tableName),
                      onDelete: (tableName) =>
                        void handleSingleDelete(tableName),
                    };

                    return tableViewMode === "list" ? (
                      <TableListView
                        tables={filteredTables}
                        selectedTables={selectedTables}
                        tableColors={tableColors}
                        fts5TableNames={fts5TableNames}
                        r2BackupConfigured={r2BackupStatus?.configured ?? false}
                        onToggleSelection={toggleTableSelection}
                        onSelectAll={selectAllTables}
                        onClearSelection={clearSelection}
                        onColorChange={handleTableColorChange}
                        actionHandlers={tableActionHandlers}
                      />
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredTables.map((table) => {
                          const isSelected = selectedTables.includes(
                            table.name,
                          );
                          const colorConfig = getColorConfig(
                            tableColors[table.name] ?? null,
                          );
                          return (
                            <Card
                              key={table.name}
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
                                    toggleTableSelection(table.name)
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={`Select table ${table.name}`}
                                />
                              </div>
                              <CardHeader
                                className={`pb-3 ${colorConfig ? "pl-14" : "pl-12"}`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Table className="h-5 w-5 text-primary" />
                                    <CardTitle className="text-base">
                                      {table.name}
                                    </CardTitle>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    {table.strict === 1 && (
                                      <span
                                        className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 flex items-center gap-1"
                                        title="STRICT mode enabled - type checking enforced"
                                      >
                                        <Shield className="h-3 w-3" />
                                        STRICT
                                      </span>
                                    )}
                                    {fts5TableNames.has(table.name) && (
                                      <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 flex items-center gap-1">
                                        <Sparkles className="h-3 w-3" />
                                        FTS5
                                      </span>
                                    )}
                                    <DatabaseColorPicker
                                      value={tableColors[table.name] ?? null}
                                      onChange={(color) =>
                                        handleTableColorChange(
                                          table.name,
                                          color,
                                        )
                                      }
                                    />
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent
                                className={colorConfig ? "pl-5" : ""}
                              >
                                <div className="space-y-2 text-sm mb-4">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">
                                      Type:
                                    </span>
                                    <span className="font-medium capitalize">
                                      {table.type}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">
                                      Columns:
                                    </span>
                                    <span className="font-medium">
                                      {table.ncol}
                                    </span>
                                  </div>
                                  {typeof table.row_count === "number" && (
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">
                                        Rows:
                                      </span>
                                      <span className="font-medium">
                                        {table.row_count.toLocaleString()}
                                      </span>
                                    </div>
                                  )}
                                  {table.type === "table" && (
                                    <>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">
                                          Without rowid:
                                        </span>
                                        <span className="font-medium">
                                          {table.wr ? "Yes" : "No"}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">
                                          Strict:
                                        </span>
                                        <span className="font-medium">
                                          {table.strict ? "Yes" : "No"}
                                        </span>
                                      </div>
                                    </>
                                  )}
                                </div>
                                {/* Action Buttons - Row 1: Browse, Rename, Clone, Import, Export */}
                                <div className="flex justify-center gap-1 mb-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onSelectTable(table.name)}
                                    aria-label="Browse table"
                                    title="Browse"
                                  >
                                    <Table className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRenameClick(table.name);
                                    }}
                                    aria-label="Rename table"
                                    title="Rename"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSingleClone(table.name);
                                    }}
                                    aria-label="Clone table"
                                    title="Clone"
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSingleImport(table.name);
                                    }}
                                    aria-label="Import data into table"
                                    title="Import"
                                  >
                                    <Upload className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSingleExport(table.name);
                                    }}
                                    aria-label="Export table"
                                    title="Export"
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </div>
                                {/* Action Buttons - Row 2: FTS5/Convert, STRICT mode, Delete */}
                                <div className="flex justify-center gap-1">
                                  {table.type === "table" && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveTab("fts5");
                                      }}
                                      aria-label="Full-text search (FTS5)"
                                      title="Convert to FTS5"
                                      className="hover:bg-purple-100 hover:text-purple-700 hover:border-purple-300 dark:hover:bg-purple-900/30 dark:hover:text-purple-300 dark:hover:border-purple-700"
                                    >
                                      <Sparkles className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {table.type === "virtual" && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleConvertFts5Click(table.name);
                                      }}
                                      aria-label="Convert FTS5 to regular table"
                                      title="Convert to Regular Table"
                                      className="hover:bg-purple-100 hover:text-purple-700 hover:border-purple-300 dark:hover:bg-purple-900/30 dark:hover:text-purple-300 dark:hover:border-purple-700"
                                    >
                                      <Sparkles className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {table.strict !== 1 &&
                                    table.type === "table" && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleStrictClick(
                                            table.name,
                                            table.strict === 1,
                                          );
                                        }}
                                        aria-label="Convert to STRICT mode"
                                        title="Enable STRICT mode"
                                        className="hover:bg-blue-500/10 hover:text-blue-600 hover:border-blue-500"
                                      >
                                        <Shield className="h-4 w-4" />
                                      </Button>
                                    )}
                                  {/* R2 Backup button */}
                                  {r2BackupStatus?.configured && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSingleR2BackupClick(table.name);
                                      }}
                                      aria-label="Backup table to R2"
                                      title="Backup to R2"
                                      className="hover:bg-blue-500/10 hover:text-blue-600 hover:border-blue-500"
                                    >
                                      <Cloud className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {/* R2 Restore button */}
                                  {r2BackupStatus?.configured && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleSingleR2RestoreClick(
                                          table.name,
                                        );
                                      }}
                                      aria-label="Restore table from R2"
                                      title="Restore from R2"
                                      className="hover:bg-green-500/10 hover:text-green-600 hover:border-green-500"
                                    >
                                      <RotateCcw className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {/* Delete button - last */}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleSingleDelete(table.name);
                                    }}
                                    aria-label="Delete table"
                                    title="Delete"
                                    className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
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
        </>
      )}

      {/* Schema Designer Dialog */}
      <SchemaDesigner
        open={showSchemaDesigner}
        onOpenChange={setShowSchemaDesigner}
        onCreateTable={handleCreateTable}
      />

      {/* Import Table Dialog */}
      {importDialogState !== null && (
        <ImportTableDialog
          open={true}
          onOpenChange={(open) => !open && setImportDialogState(null)}
          databaseId={databaseId}
          tableName={importDialogState.tableName}
          existingTables={tables
            .filter((t) => t.type === "table")
            .map((t) => t.name)}
          onSuccess={() => void loadTables(true)}
        />
      )}

      {/* STRICT Mode Dialog */}
      {strictDialogState && (
        <Dialog
          open={true}
          onOpenChange={() =>
            !strictDialogState.isConverting &&
            !strictDialogState.isBackingUp &&
            !strictDialogState.isValidating &&
            setStrictDialogState(null)
          }
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-500" />
                Enable STRICT Mode
              </DialogTitle>
              <DialogDescription>
                Convert &quot;{strictDialogState.tableName}&quot; to use SQLite
                STRICT mode
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              {/* Validation Loading State */}
              {strictDialogState.isValidating && (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Checking compatibility...
                </div>
              )}

              {/* Blockers - Cannot Convert */}
              {!strictDialogState.isValidating &&
                strictDialogState.validation?.blockers &&
                strictDialogState.validation.blockers.length > 0 && (
                  <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                      <div>
                        <h4 className="font-medium text-destructive">
                          Cannot Convert to STRICT Mode
                        </h4>
                        <ul className="text-sm text-destructive/90 space-y-1.5 mt-2 list-disc list-inside">
                          {strictDialogState.validation.blockers.map(
                            (blocker, i) => (
                              <li key={i}>{blocker}</li>
                            ),
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

              {/* Already STRICT notice */}
              {!strictDialogState.isValidating &&
                strictDialogState.validation?.isAlreadyStrict && (
                  <div className="bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                      <Shield className="h-5 w-5" />
                      <span className="font-medium">
                        This table is already in STRICT mode
                      </span>
                    </div>
                  </div>
                )}

              {/* Show conversion UI only if compatible */}
              {!strictDialogState.isValidating &&
                strictDialogState.validation?.compatible && (
                  <>
                    {/* Warnings (informational, allow proceeding) */}
                    {strictDialogState.validation.warnings.length > 0 && (
                      <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-2">
                        <h4 className="font-medium text-amber-900 dark:text-amber-100 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          Notes
                        </h4>
                        <ul className="text-sm text-amber-800 dark:text-amber-200 space-y-1 list-disc list-inside">
                          {strictDialogState.validation.warnings.map(
                            (warning, i) => (
                              <li key={i}>{warning}</li>
                            ),
                          )}
                        </ul>
                      </div>
                    )}

                    <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-3">
                      <h4 className="font-medium text-blue-900 dark:text-blue-100">
                        What is STRICT mode?
                      </h4>
                      <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1.5 list-disc list-inside">
                        <li>
                          Enforces column type checking - values MUST match
                          declared types
                        </li>
                        <li>
                          Prevents storing text in INTEGER columns, wrong types
                          in REAL columns, etc.
                        </li>
                        <li>
                          Catches data integrity issues at INSERT/UPDATE time
                        </li>
                        <li>
                          Only allows types: INTEGER, REAL, TEXT, BLOB, ANY
                        </li>
                      </ul>
                    </div>

                    <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <h4 className="font-medium text-amber-900 dark:text-amber-100">
                            Important Warnings
                          </h4>
                          <ul className="text-sm text-amber-800 dark:text-amber-200 space-y-1.5 mt-2 list-disc list-inside">
                            <li>
                              <strong>This is a destructive operation</strong> -
                              the table will be recreated
                            </li>
                            <li>
                              If existing data doesn&apos;t match column types,
                              the conversion will fail
                            </li>
                            <li>
                              You cannot undo this operation (the table will
                              remain STRICT)
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Backup Recommendation */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">
                        💾 Strongly Recommended: Create a backup first
                      </h4>
                      <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
                        Before converting, we highly recommend creating a backup
                        of your table in case anything goes wrong during the
                        conversion process.
                      </p>

                      {/* Backup Format Selection */}
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-xs font-medium text-blue-800 dark:text-blue-200">
                          Format:
                        </span>
                        <RadioGroup
                          value={strictDialogState.backupFormat}
                          onValueChange={(value: "sql" | "csv" | "json") =>
                            setStrictDialogState((prev) =>
                              prev ? { ...prev, backupFormat: value } : null,
                            )
                          }
                          disabled={
                            strictDialogState.isConverting ||
                            strictDialogState.isBackingUp
                          }
                          className="flex gap-3"
                        >
                          <div className="flex items-center space-x-1">
                            <RadioGroupItem
                              value="sql"
                              id="strict-backup-sql"
                              className="h-3 w-3"
                            />
                            <Label
                              htmlFor="strict-backup-sql"
                              className="text-xs text-blue-700 dark:text-blue-300"
                            >
                              SQL
                            </Label>
                          </div>
                          <div className="flex items-center space-x-1">
                            <RadioGroupItem
                              value="csv"
                              id="strict-backup-csv"
                              className="h-3 w-3"
                            />
                            <Label
                              htmlFor="strict-backup-csv"
                              className="text-xs text-blue-700 dark:text-blue-300"
                            >
                              CSV
                            </Label>
                          </div>
                          <div className="flex items-center space-x-1">
                            <RadioGroupItem
                              value="json"
                              id="strict-backup-json"
                              className="h-3 w-3"
                            />
                            <Label
                              htmlFor="strict-backup-json"
                              className="text-xs text-blue-700 dark:text-blue-300"
                            >
                              JSON
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>

                      {/* Backup Buttons - trigger immediate backup */}
                      <div className="flex gap-2">
                        {r2BackupStatus?.configured && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              // Capture values before state update to avoid closure issues
                              const formatToExport =
                                strictDialogState.backupFormat;
                              const tableToExport = strictDialogState.tableName;
                              setStrictDialogState((prev) =>
                                prev ? { ...prev, isBackingUp: true } : null,
                              );
                              try {
                                const result = await backupTableToR2(
                                  databaseId,
                                  databaseName,
                                  tableToExport,
                                  formatToExport,
                                  "strict_mode",
                                );
                                setStrictDialogState((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        isBackingUp: false,
                                        backupFirst: true,
                                        backupMethod: "r2",
                                      }
                                    : null,
                                );
                                setBackupProgressDialog({
                                  jobId: result.job_id,
                                  operationName: "Table Backup to R2",
                                  tableName: tableToExport,
                                });
                              } catch {
                                setStrictDialogState((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        isBackingUp: false,
                                        error: "Failed to start R2 backup",
                                      }
                                    : null,
                                );
                              }
                            }}
                            disabled={
                              strictDialogState.isConverting ||
                              strictDialogState.isBackingUp
                            }
                            className="flex-1 bg-blue-600 text-white hover:bg-blue-700 border-blue-600"
                          >
                            {strictDialogState.isBackingUp &&
                            strictDialogState.backupMethod === "r2" ? (
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
                            // Capture values before state update to avoid closure issues
                            const formatToExport =
                              strictDialogState.backupFormat;
                            const tableToExport = strictDialogState.tableName;
                            setStrictDialogState((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    isBackingUp: true,
                                    backupMethod: "download",
                                  }
                                : null,
                            );
                            try {
                              await api.exportTable(
                                databaseId,
                                tableToExport,
                                formatToExport,
                              );
                              setStrictDialogState((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      isBackingUp: false,
                                      backupFirst: true,
                                    }
                                  : null,
                              );
                            } catch {
                              setStrictDialogState((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      isBackingUp: false,
                                      error: "Failed to download backup",
                                    }
                                  : null,
                              );
                            }
                          }}
                          disabled={
                            strictDialogState.isConverting ||
                            strictDialogState.isBackingUp
                          }
                          className={
                            r2BackupStatus?.configured ? "flex-1" : "w-full"
                          }
                        >
                          {strictDialogState.isBackingUp &&
                          strictDialogState.backupMethod === "download" ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4 mr-2" />
                          )}
                          Download Backup
                        </Button>
                      </div>

                      {/* Backup completed indicator */}
                      {strictDialogState.backupFirst &&
                        !strictDialogState.isBackingUp && (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-2 flex items-center gap-1">
                            ✓ Backup{" "}
                            {strictDialogState.backupMethod === "r2"
                              ? "started"
                              : "downloaded"}
                          </p>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="strict-confirm"
                        checked={strictDialogState.confirmed}
                        onCheckedChange={(checked) =>
                          setStrictDialogState((prev) =>
                            prev
                              ? { ...prev, confirmed: checked === true }
                              : null,
                          )
                        }
                        disabled={
                          strictDialogState.isConverting ||
                          strictDialogState.isBackingUp
                        }
                      />
                      <Label htmlFor="strict-confirm" className="text-sm">
                        I understand the risks and want to proceed
                      </Label>
                    </div>
                  </>
                )}

              <ErrorMessage
                error={strictDialogState.error}
                variant="inline"
                showTitle
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setStrictDialogState(null)}
                disabled={
                  strictDialogState.isConverting ||
                  strictDialogState.isBackingUp ||
                  strictDialogState.isValidating
                }
              >
                {strictDialogState.validation?.compatible === false ||
                strictDialogState.validation?.isAlreadyStrict
                  ? "Close"
                  : "Cancel"}
              </Button>
              {strictDialogState.validation?.compatible &&
                !strictDialogState.validation?.isAlreadyStrict && (
                  <Button
                    onClick={() => void handleConvertToStrict()}
                    disabled={
                      !strictDialogState.confirmed ||
                      strictDialogState.isConverting ||
                      strictDialogState.isBackingUp ||
                      strictDialogState.isValidating
                    }
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {strictDialogState.isBackingUp ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Backing up...
                      </>
                    ) : strictDialogState.isConverting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Converting...
                      </>
                    ) : (
                      <>
                        <Shield className="h-4 w-4 mr-2" />
                        Enable STRICT Mode
                      </>
                    )}
                  </Button>
                )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Convert FTS5 to Regular Table Dialog */}
      {convertFts5Dialog && (
        <Dialog
          open={true}
          onOpenChange={() =>
            !convertFts5Dialog.isConverting &&
            !convertFts5Dialog.isBackingUp &&
            setConvertFts5Dialog(null)
          }
        >
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                Convert FTS5 to Regular Table
              </DialogTitle>
              <DialogDescription>
                Convert "{convertFts5Dialog.tableName}" to a regular SQLite
                table
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <ErrorMessage error={convertFts5Dialog.error} variant="inline" />

              <div className="space-y-2">
                <Label htmlFor="fts5-new-table-name">New Table Name</Label>
                <Input
                  id="fts5-new-table-name"
                  value={convertFts5Dialog.newTableName}
                  onChange={(e) =>
                    setConvertFts5Dialog((prev) =>
                      prev ? { ...prev, newTableName: e.target.value } : null,
                    )
                  }
                  placeholder="Enter table name"
                  disabled={
                    convertFts5Dialog.isConverting ||
                    convertFts5Dialog.isBackingUp
                  }
                />
              </div>

              {/* Backup Recommendation */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">
                  💾 Strongly Recommended: Create a backup first
                </h4>
                <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
                  Before converting, we highly recommend creating a backup of
                  your table in case anything goes wrong during the conversion
                  process.
                </p>

                {/* Backup Buttons - trigger immediate backup (SQL only for FTS5 tables) */}
                <div className="flex gap-2">
                  {r2BackupStatus?.configured && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        // FTS5 tables only support SQL backup format
                        const tableToExport = convertFts5Dialog.tableName;
                        setConvertFts5Dialog((prev) =>
                          prev
                            ? { ...prev, isBackingUp: true, backupMethod: "r2" }
                            : null,
                        );
                        try {
                          const result = await backupTableToR2(
                            databaseId,
                            databaseName,
                            tableToExport,
                            "sql", // FTS5 tables only support SQL format
                            "fts5_convert",
                          );
                          setConvertFts5Dialog((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  isBackingUp: false,
                                  backupFirst: true,
                                }
                              : null,
                          );
                          setBackupProgressDialog({
                            jobId: result.job_id,
                            operationName: "Table Backup to R2",
                            tableName: tableToExport,
                          });
                        } catch {
                          setConvertFts5Dialog((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  isBackingUp: false,
                                  error: "Failed to start R2 backup",
                                }
                              : null,
                          );
                        }
                      }}
                      disabled={
                        convertFts5Dialog.isConverting ||
                        convertFts5Dialog.isBackingUp
                      }
                      className="flex-1 bg-blue-600 text-white hover:bg-blue-700 border-blue-600"
                    >
                      {convertFts5Dialog.isBackingUp &&
                      convertFts5Dialog.backupMethod === "r2" ? (
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
                      // FTS5 tables only support SQL backup format
                      const tableToExport = convertFts5Dialog.tableName;
                      setConvertFts5Dialog((prev) =>
                        prev
                          ? {
                              ...prev,
                              isBackingUp: true,
                              backupMethod: "download",
                            }
                          : null,
                      );
                      try {
                        await api.exportTable(databaseId, tableToExport, "sql");
                        setConvertFts5Dialog((prev) =>
                          prev
                            ? { ...prev, isBackingUp: false, backupFirst: true }
                            : null,
                        );
                      } catch {
                        setConvertFts5Dialog((prev) =>
                          prev
                            ? {
                                ...prev,
                                isBackingUp: false,
                                error: "Failed to download backup",
                              }
                            : null,
                        );
                      }
                    }}
                    disabled={
                      convertFts5Dialog.isConverting ||
                      convertFts5Dialog.isBackingUp
                    }
                    className={r2BackupStatus?.configured ? "flex-1" : "w-full"}
                  >
                    {convertFts5Dialog.isBackingUp &&
                    convertFts5Dialog.backupMethod === "download" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    Download Backup
                  </Button>
                </div>

                {/* Backup completed indicator */}
                {convertFts5Dialog.backupFirst &&
                  !convertFts5Dialog.isBackingUp && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-2 flex items-center gap-1">
                      ✓ Backup{" "}
                      {convertFts5Dialog.backupMethod === "r2"
                        ? "started"
                        : "downloaded"}
                    </p>
                  )}
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="fts5-delete-original"
                  checked={convertFts5Dialog.deleteOriginal}
                  onCheckedChange={(checked) =>
                    setConvertFts5Dialog((prev) =>
                      prev
                        ? { ...prev, deleteOriginal: checked === true }
                        : null,
                    )
                  }
                  disabled={
                    convertFts5Dialog.isConverting ||
                    convertFts5Dialog.isBackingUp
                  }
                />
                <div className="grid gap-1">
                  <Label
                    htmlFor="fts5-delete-original"
                    className="text-sm font-medium"
                  >
                    Delete original FTS5 table after conversion
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    The FTS5 table and its indexes will be permanently deleted
                  </p>
                </div>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-md">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>Note:</strong> Converting removes full-text search
                  capabilities. The new table will be a regular SQLite table
                  with TEXT columns.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConvertFts5Dialog(null)}
                disabled={
                  convertFts5Dialog.isConverting ||
                  convertFts5Dialog.isBackingUp
                }
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleConvertFts5ToTable()}
                disabled={
                  convertFts5Dialog.isConverting ||
                  convertFts5Dialog.isBackingUp ||
                  !convertFts5Dialog.newTableName.trim()
                }
                className="bg-purple-600 hover:bg-purple-700"
              >
                {convertFts5Dialog.isBackingUp ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Backing up...
                  </>
                ) : convertFts5Dialog.isConverting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Converting...
                  </>
                ) : (
                  "Convert to Table"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Rename Table Dialog */}
      {renameDialogState && (
        <Dialog
          open={true}
          onOpenChange={() =>
            !renameDialogState.isRenaming && setRenameDialogState(null)
          }
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename Table</DialogTitle>
              <DialogDescription>
                Rename "{renameDialogState.tableName}" to a new name
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="rename-table-name">New Table Name</Label>
                <Input
                  id="rename-table-name"
                  placeholder="new_table_name"
                  value={renameDialogState.newName}
                  onChange={(e) =>
                    setRenameDialogState((prev) => {
                      if (!prev) return null;
                      const { error: _error, ...rest } = prev;
                      void _error;
                      return { ...rest, newName: e.target.value };
                    })
                  }
                  disabled={renameDialogState.isRenaming}
                />
              </div>
              <ErrorMessage error={renameDialogState.error} variant="inline" />
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
                onClick={() => void handleRenameTable()}
                disabled={
                  renameDialogState.isRenaming ||
                  !renameDialogState.newName.trim()
                }
              >
                {renameDialogState.isRenaming && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {renameDialogState.isRenaming ? "Renaming..." : "Rename Table"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Clone Tables Dialog */}
      {cloneDialogState && (
        <Dialog
          open={true}
          onOpenChange={() =>
            !cloneDialogState.isCloning && setCloneDialogState(null)
          }
        >
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Clone Tables</DialogTitle>
              <DialogDescription>
                Specify new names for the cloned tables. Structure, data, and
                indexes will be copied.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {cloneDialogState.tableNames.map((tableName) => (
                <div key={tableName} className="grid gap-2">
                  <Label htmlFor={`clone-${tableName}`}>
                    Clone of "{tableName}"
                  </Label>
                  <Input
                    id={`clone-${tableName}`}
                    placeholder={`${tableName}_copy`}
                    value={cloneDialogState.cloneNames[tableName]}
                    onChange={(e) =>
                      setCloneDialogState((prev) => {
                        if (!prev) return null;
                        const { error: _error, ...rest } = prev;
                        void _error;
                        return {
                          ...rest,
                          cloneNames: {
                            ...prev.cloneNames,
                            [tableName]: e.target.value,
                          },
                        };
                      })
                    }
                    disabled={cloneDialogState.isCloning}
                  />
                </div>
              ))}
              {cloneDialogState.isCloning && cloneDialogState.progress && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Cloning table {cloneDialogState.progress.current} of{" "}
                    {cloneDialogState.progress.total}...
                  </p>
                  <Progress
                    value={
                      (cloneDialogState.progress.current /
                        cloneDialogState.progress.total) *
                      100
                    }
                  />
                </div>
              )}
              <ErrorMessage error={cloneDialogState.error} variant="inline" />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCloneDialogState(null)}
                disabled={cloneDialogState.isCloning}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleCloneTables()}
                disabled={cloneDialogState.isCloning}
              >
                {cloneDialogState.isCloning && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {cloneDialogState.isCloning
                  ? "Cloning..."
                  : `Clone ${String(cloneDialogState.tableNames.length)} Table${cloneDialogState.tableNames.length !== 1 ? "s" : ""}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Export Tables Dialog */}
      {exportDialogState && (
        <Dialog
          open={true}
          onOpenChange={() =>
            !exportDialogState.isExporting && setExportDialogState(null)
          }
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Export Tables</DialogTitle>
              <DialogDescription>
                Choose the export format for{" "}
                {exportDialogState.tableNames.length} table
                {exportDialogState.tableNames.length !== 1 ? "s" : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Export Format</Label>
                <RadioGroup
                  value={exportDialogState.format}
                  onValueChange={(value) =>
                    setExportDialogState((prev) =>
                      prev
                        ? {
                            ...prev,
                            format: value as "sql" | "csv" | "json",
                          }
                        : null,
                    )
                  }
                  disabled={exportDialogState.isExporting}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="sql" id="format-sql" />
                    <Label htmlFor="format-sql" className="font-normal">
                      SQL (includes structure and data)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="csv" id="format-csv" />
                    <Label htmlFor="format-csv" className="font-normal">
                      CSV (data only)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="json" id="format-json" />
                    <Label htmlFor="format-json" className="font-normal">
                      JSON (array of objects)
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="bg-muted p-3 rounded-md">
                <p className="text-sm text-muted-foreground">
                  Tables to export:
                </p>
                <ul className="text-sm list-disc list-inside mt-2">
                  {exportDialogState.tableNames.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
              {exportDialogState.isExporting &&
                exportDialogState.progress !== undefined && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Exporting... {Math.round(exportDialogState.progress)}%
                    </p>
                    <Progress value={exportDialogState.progress} />
                  </div>
                )}
              <ErrorMessage error={exportDialogState.error} variant="inline" />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setExportDialogState(null)}
                disabled={exportDialogState.isExporting}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleExportTables()}
                disabled={exportDialogState.isExporting}
              >
                {exportDialogState.isExporting && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {exportDialogState.isExporting ? "Exporting..." : "Export"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Tables Dialog */}
      {deleteDialogState && (
        <Dialog
          open={true}
          onOpenChange={() =>
            !deleteDialogState.isDeleting &&
            !deleteDialogState.isExporting &&
            !deleteDialogState.isR2Backing &&
            setDeleteDialogState(null)
          }
        >
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {deleteDialogState.tableNames.length === 1
                  ? "Delete Table?"
                  : `Delete ${String(deleteDialogState.tableNames.length)} Tables?`}
              </DialogTitle>
              <DialogDescription>
                This action cannot be undone. This will permanently delete the
                table{deleteDialogState.tableNames.length !== 1 ? "s" : ""} and
                all{" "}
                {deleteDialogState.tableNames.length !== 1 ? "their" : "its"}{" "}
                data.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              {/* Loading dependencies */}
              {deleteDialogState.loadingDependencies && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
                  <span className="text-sm text-muted-foreground">
                    Checking dependencies...
                  </span>
                </div>
              )}

              {/* Single table delete */}
              {!deleteDialogState.loadingDependencies &&
                deleteDialogState.tableNames.length === 1 &&
                (() => {
                  const firstTableName = deleteDialogState.tableNames[0];
                  if (!firstTableName) return null;
                  const tableDeps =
                    deleteDialogState.dependencies?.[firstTableName];
                  return (
                    <div className="space-y-4">
                      <p className="text-sm">
                        Table: <strong>{firstTableName}</strong>
                      </p>

                      <div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleSimulateCascadeImpact(firstTableName)
                          }
                          className="w-full"
                        >
                          <AlertTriangle className="h-4 w-4 mr-2" />
                          Simulate Cascade Impact
                        </Button>
                        <p className="text-xs text-muted-foreground mt-2">
                          Preview the full cascade impact of deleting this table
                        </p>
                      </div>

                      {tableDeps && (
                        <TableDependenciesView
                          tableName={firstTableName}
                          dependencies={tableDeps}
                        />
                      )}
                    </div>
                  );
                })()}

              {/* Bulk delete with per-table accordion */}
              {!deleteDialogState.loadingDependencies &&
                deleteDialogState.tableNames.length > 1 && (
                  <div className="space-y-4">
                    <p className="text-sm font-medium">
                      Tables to delete ({deleteDialogState.tableNames.length}):
                    </p>

                    {deleteDialogState.dependencies && (
                      <Accordion type="multiple" className="w-full">
                        {deleteDialogState.tableNames.map((tableName) => {
                          const deps =
                            deleteDialogState.dependencies?.[tableName];
                          const hasDeps =
                            deps &&
                            (deps.inbound.length > 0 ||
                              deps.outbound.length > 0);
                          const depCount = deps
                            ? deps.inbound.length + deps.outbound.length
                            : 0;

                          return (
                            <AccordionItem key={tableName} value={tableName}>
                              <AccordionTrigger className="hover:no-underline">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">
                                    {tableName}
                                  </span>
                                  {hasDeps && (
                                    <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 px-2 py-0.5 rounded-full">
                                      {depCount}{" "}
                                      {depCount === 1
                                        ? "dependency"
                                        : "dependencies"}
                                    </span>
                                  )}
                                </div>
                              </AccordionTrigger>
                              <AccordionContent>
                                {deps ? (
                                  <div className="pt-2">
                                    <TableDependenciesView
                                      tableName={tableName}
                                      dependencies={deps}
                                    />
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground pt-2">
                                    No dependencies
                                  </p>
                                )}
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    )}
                  </div>
                )}

              {/* Backup Recommendation */}
              {!deleteDialogState.loadingDependencies && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">
                    💾 Recommended: Create a backup first
                  </h4>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
                    {deleteDialogState.tableNames.length === 1
                      ? "Backup your table before deletion so you can recover the data if needed."
                      : "Export your tables before deletion so you can recover the data if needed."}
                  </p>
                  <div className="flex gap-2">
                    {r2BackupStatus?.configured &&
                      deleteDialogState.tableNames.length === 1 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleR2TableBackup()}
                          disabled={
                            (deleteDialogState.isDeleting ?? false) ||
                            (deleteDialogState.isExporting ?? false) ||
                            (deleteDialogState.isR2Backing ?? false)
                          }
                          className="flex-1 bg-blue-600 text-white hover:bg-blue-700 border-blue-600"
                        >
                          {deleteDialogState.isR2Backing ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Cloud className="h-4 w-4 mr-2" />
                          )}
                          {deleteDialogState.isR2Backing
                            ? "Backing up..."
                            : "Backup to R2"}
                        </Button>
                      )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleDeleteTableBackup()}
                      disabled={
                        (deleteDialogState.isDeleting ?? false) ||
                        (deleteDialogState.isExporting ?? false) ||
                        (deleteDialogState.isR2Backing ?? false)
                      }
                      className={
                        r2BackupStatus?.configured &&
                        deleteDialogState.tableNames.length === 1
                          ? "flex-1"
                          : "w-full"
                      }
                    >
                      {deleteDialogState.isExporting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      {deleteDialogState.isExporting
                        ? "Exporting..."
                        : `Download${deleteDialogState.tableNames.length > 1 ? " All" : ""} (SQL)`}
                    </Button>
                  </div>
                </div>
              )}

              {/* Confirmation checkbox for tables with dependencies */}
              {!deleteDialogState.loadingDependencies &&
                deleteDialogState.dependencies &&
                (() => {
                  const hasDependencies = Object.values(
                    deleteDialogState.dependencies,
                  ).some(
                    (dep) => dep.inbound.length > 0 || dep.outbound.length > 0,
                  );
                  return (
                    hasDependencies && (
                      <div className="flex items-start space-x-3 rounded-md border border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/30 p-4">
                        <Checkbox
                          id="confirm-dependencies"
                          checked={
                            deleteDialogState.confirmDependencies ?? false
                          }
                          onCheckedChange={(checked) =>
                            setDeleteDialogState((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    confirmDependencies: checked === true,
                                  }
                                : null,
                            )
                          }
                        />
                        <div className="space-y-1 leading-none">
                          <Label
                            htmlFor="confirm-dependencies"
                            className="text-sm font-medium cursor-pointer"
                          >
                            I understand that deleting{" "}
                            {deleteDialogState.tableNames.length === 1
                              ? "this table"
                              : "these tables"}{" "}
                            will affect dependent tables
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Foreign key constraints may cause cascading
                            deletions or prevent deletion entirely.
                          </p>
                        </div>
                      </div>
                    )
                  );
                })()}

              {/* Backup Confirmation Checkbox */}
              {!deleteDialogState.loadingDependencies && (
                <div className="flex items-start space-x-3 p-3 border rounded-lg">
                  <Checkbox
                    id="delete-table-backup-confirmed"
                    checked={deleteDialogState.backupConfirmed ?? false}
                    onCheckedChange={(checked) =>
                      setDeleteDialogState((prev) =>
                        prev
                          ? {
                              ...prev,
                              backupConfirmed: checked === true,
                            }
                          : null,
                      )
                    }
                    disabled={
                      deleteDialogState.isDeleting ||
                      deleteDialogState.isExporting
                    }
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label
                      htmlFor="delete-table-backup-confirmed"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      I have backed up this data or don&apos;t need a backup
                    </label>
                    <p className="text-xs text-muted-foreground">
                      I understand this action is permanent and cannot be undone
                    </p>
                  </div>
                </div>
              )}

              {/* Progress indicator */}
              {deleteDialogState.isDeleting && deleteDialogState.progress && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Deleting table {deleteDialogState.progress.current} of{" "}
                    {deleteDialogState.progress.total}...
                  </p>
                  <Progress
                    value={
                      (deleteDialogState.progress.current /
                        deleteDialogState.progress.total) *
                      100
                    }
                  />
                </div>
              )}

              {/* Error message */}
              <ErrorMessage error={deleteDialogState.error} variant="inline" />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogState(null)}
                disabled={
                  deleteDialogState.isDeleting || deleteDialogState.isExporting
                }
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleDeleteTables()}
                disabled={
                  (deleteDialogState.isDeleting ?? false) ||
                  (deleteDialogState.isExporting ?? false) ||
                  (deleteDialogState.isR2Backing ?? false) ||
                  (deleteDialogState.loadingDependencies ?? false) ||
                  !deleteDialogState.backupConfirmed ||
                  (deleteDialogState.dependencies &&
                    Object.values(deleteDialogState.dependencies).some(
                      (dep) =>
                        dep.inbound.length > 0 || dep.outbound.length > 0,
                    ) &&
                    !deleteDialogState.confirmDependencies)
                }
              >
                {deleteDialogState.isDeleting && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {deleteDialogState.isDeleting
                  ? "Deleting..."
                  : deleteDialogState.tableNames.length === 1
                    ? "Delete Table"
                    : `Delete ${String(deleteDialogState.tableNames.length)} Tables`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Cascade Impact Simulator */}
      <CascadeImpactSimulator
        databaseId={databaseId}
        targetTable={cascadeSimulatorTable}
        open={showCascadeSimulator}
        onClose={() => setShowCascadeSimulator(false)}
      />

      {/* Backup Progress Dialog */}
      {backupProgressDialog && (
        <BackupProgressDialog
          open={true}
          jobId={backupProgressDialog.jobId}
          operationName={backupProgressDialog.operationName}
          databaseName={
            backupProgressDialog.tableName
              ? `${databaseName}.${backupProgressDialog.tableName}`
              : databaseName
          }
          onClose={() => setBackupProgressDialog(null)}
        />
      )}

      {/* R2 Table Backup Progress Dialog - shown when backing up table from delete dialog */}
      {r2TableBackupProgress && (
        <BackupProgressDialog
          open={true}
          jobId={r2TableBackupProgress.jobId}
          operationName="Backup Table to R2"
          databaseName={`${databaseName}.${r2TableBackupProgress.tableName}`}
          onClose={() => setR2TableBackupProgress(null)}
        />
      )}

      {/* R2 Table Backup Confirmation Dialog */}
      <Dialog
        open={r2BackupDialogTable !== null}
        onOpenChange={(open) => !open && setR2BackupDialogTable(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-blue-500" />
              Backup Table to R2
            </DialogTitle>
            <DialogDescription>
              Create a backup of table <strong>{r2BackupDialogTable}</strong> to
              R2 cloud storage.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Cloud className="h-5 w-5 text-blue-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    R2 Cloud Backup
                  </p>
                  <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                    This will export the table schema and data as SQL and store
                    it in your R2 bucket. You can restore this backup later from
                    the Backup & Restore Hub.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setR2BackupDialogTable(null)}
              disabled={r2BackupDialogLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleStartR2TableBackup()}
              disabled={r2BackupDialogLoading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {r2BackupDialogLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Cloud className="h-4 w-4 mr-2" />
                  Start Backup
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* R2 Table Restore Dialog - shows list of backups for this table */}
      <Dialog
        open={r2RestoreDialogTable !== null}
        onOpenChange={(open) => {
          if (!open && !r2RestoreIsRestoring) {
            setR2RestoreDialogTable(null);
            setR2RestoreSelected(null);
            setR2RestoreError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-green-500" />
              Restore Table from R2
            </DialogTitle>
            <DialogDescription>
              Select a backup to restore table{" "}
              <strong>{r2RestoreDialogTable}</strong>.
            </DialogDescription>
          </DialogHeader>

          {r2RestoreError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-sm text-red-600 dark:text-red-400">
                {r2RestoreError}
              </p>
            </div>
          )}

          <div className="py-2">
            {r2RestoreLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : r2RestoreBackups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <RotateCcw className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No backups found for this table</p>
                <p className="text-xs mt-1">
                  Create a backup first using the cloud icon on the table card
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {r2RestoreBackups.map((backup) => (
                  <div
                    key={backup.path}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      r2RestoreSelected?.path === backup.path
                        ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                        : "border-border hover:bg-accent"
                    }`}
                    onClick={() => setR2RestoreSelected(backup)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                          📄 Table
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {getR2BackupSourceLabel(backup.source)}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-3">
                        <span>
                          {new Date(backup.timestamp).toLocaleString()}
                        </span>
                        <span>{(backup.size / 1024).toFixed(1)} KB</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleTableBackupDownload(backup);
                        }}
                        title="Download"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleTableBackupDelete(backup);
                        }}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {r2RestoreSelected && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  This will restore the table to the state from{" "}
                  {new Date(r2RestoreSelected.timestamp).toLocaleString()}. Any
                  current data in the table may be overwritten.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setR2RestoreDialogTable(null);
                setR2RestoreSelected(null);
              }}
              disabled={r2RestoreIsRestoring}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleTableRestore()}
              disabled={!r2RestoreSelected || r2RestoreIsRestoring}
              className="bg-green-600 hover:bg-green-700"
            >
              {r2RestoreIsRestoring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Restoring...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restore
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* R2 Table Restore Progress Dialog */}
      {r2RestoreProgressDialog && (
        <BackupProgressDialog
          open={true}
          jobId={r2RestoreProgressDialog.jobId}
          operationName="Restore Table from R2"
          databaseName={`${databaseName}.${r2RestoreProgressDialog.tableName}`}
          onClose={() => {
            setR2RestoreProgressDialog(null);
            void loadTables(true); // Refresh tables after restore
          }}
        />
      )}
    </div>
  );
}
