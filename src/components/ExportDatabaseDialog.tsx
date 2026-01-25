/**
 * Export Database Dialog
 *
 * Multi-format export wizard supporting SQL, JSON, and CSV formats
 * with options for table selection, schema/data inclusion, and row limits.
 * Enables cross-account migration via portable download files.
 */

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import {
  Download,
  Loader2,
  FileText,
  FileJson,
  Table2,
  Info,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { listTables, type D1Database, type TableInfo } from "@/services/api";
import {
  exportAndDownloadDatabase,
  type ExportFormat,
  type ExportOptions,
  type ExportProgress,
} from "@/services/exportApi";
import { ErrorMessage } from "@/components/ui/error-message";

interface ExportDatabaseDialogProps {
  open: boolean;
  database: D1Database;
  onClose: () => void;
}

type Step = "format" | "tables" | "options" | "progress";

const ROW_LIMIT_OPTIONS = [
  { value: 1000, label: "1,000 rows" },
  { value: 10000, label: "10,000 rows" },
  { value: 50000, label: "50,000 rows (default)" },
  { value: 100000, label: "100,000 rows" },
];

export function ExportDatabaseDialog({
  open,
  database,
  onClose,
}: ExportDatabaseDialogProps): React.JSX.Element {
  // Step state
  const [step, setStep] = useState<Step>("format");

  // Format selection
  const [format, setFormat] = useState<ExportFormat>("sql");

  // Table selection
  const [availableTables, setAvailableTables] = useState<TableInfo[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [selectAll, setSelectAll] = useState(true);

  // Options
  const [includeSchema, setIncludeSchema] = useState(true);
  const [includeData, setIncludeData] = useState(true);
  const [rowLimit, setRowLimit] = useState(50000);
  const [deferForeignKeys, setDeferForeignKeys] = useState(true);

  // Progress
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStep("format");
      setFormat("sql");
      setSelectedTables([]);
      setSelectAll(true);
      setIncludeSchema(true);
      setIncludeData(true);
      setRowLimit(50000);
      setDeferForeignKeys(true);
      setExporting(false);
      setProgress(null);
      setCompleted(false);
      setError(null);
      void loadTables();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, database.uuid]);

  const loadTables = async (): Promise<void> => {
    setLoadingTables(true);
    try {
      const tables = await listTables(database.uuid);
      const exportableTables = tables.filter(
        (t) => t.type === "table" || t.type === "virtual",
      );
      setAvailableTables(exportableTables);
      setSelectedTables(exportableTables.map((t) => t.name));
    } catch {
      setError("Failed to load tables");
    } finally {
      setLoadingTables(false);
    }
  };

  const hasFTS5 = availableTables.some((t) => t.type === "virtual");
  const isFullExport = selectedTables.length === availableTables.length;

  const handleNext = (): void => {
    setError(null);

    if (step === "format") {
      setStep("tables");
    } else if (step === "tables") {
      setStep("options");
    } else if (step === "options") {
      setStep("progress");
      void handleExport();
    }
  };

  const handleBack = (): void => {
    setError(null);

    if (step === "tables") {
      setStep("format");
    } else if (step === "options") {
      setStep("tables");
    }
  };

  const handleExport = async (): Promise<void> => {
    setExporting(true);
    setError(null);
    setCompleted(false);

    try {
      const options: ExportOptions = {
        format,
        scope: isFullExport ? "full" : "selective",
        ...(isFullExport ? {} : { tables: selectedTables }),
        includeSchema,
        includeData,
        rowLimit,
        deferForeignKeys,
      };

      await exportAndDownloadDatabase(
        database.uuid,
        database.name,
        options,
        (p) => setProgress(p),
      );

      setCompleted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleSelectAll = (checked: boolean): void => {
    setSelectAll(checked);
    if (checked) {
      setSelectedTables(availableTables.map((t) => t.name));
    } else {
      setSelectedTables([]);
    }
  };

  const handleTableToggle = (tableName: string, checked: boolean): void => {
    if (checked) {
      setSelectedTables([...selectedTables, tableName]);
    } else {
      setSelectedTables(selectedTables.filter((t) => t !== tableName));
      setSelectAll(false);
    }
  };

  const handleClose = (): void => {
    if (!exporting) {
      onClose();
    }
  };

  const canProceed = (): boolean => {
    if (step === "format") return true;
    if (step === "tables") return selectedTables.length > 0;
    if (step === "options") return includeSchema || includeData;
    return false;
  };

  const getFormatIcon = (f: ExportFormat): React.ReactNode => {
    switch (f) {
      case "sql":
        return <FileText className="h-5 w-5" />;
      case "json":
        return <FileJson className="h-5 w-5" />;
      case "csv":
        return <Table2 className="h-5 w-5" />;
    }
  };

  const getProgressPercent = (): number => {
    if (!progress) return 0;
    if (progress.phase === "generating") return 90;
    const tableProgress =
      (progress.tablesCompleted / progress.totalTables) * 85;
    return Math.min(tableProgress, 85);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Export Database
          </DialogTitle>
          <DialogDescription>
            Export &quot;{database.name}&quot; for backup or cross-account
            migration
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Step 1: Format Selection */}
          {step === "format" && (
            <>
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium leading-none mb-3">
                  Export Format
                </legend>
                <RadioGroup
                  value={format}
                  onValueChange={(v) => setFormat(v as ExportFormat)}
                >
                  <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem
                      value="sql"
                      id="format-sql"
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <Label
                        htmlFor="format-sql"
                        className="font-medium flex items-center gap-2 cursor-pointer"
                      >
                        <FileText className="h-4 w-4 text-blue-600" />
                        SQL Dump
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Complete SQL file with CREATE TABLE and INSERT
                        statements. Best for{" "}
                        <code className="bg-muted px-1 rounded">
                          wrangler d1 execute
                        </code>
                        .
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem
                      value="json"
                      id="format-json"
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <Label
                        htmlFor="format-json"
                        className="font-medium flex items-center gap-2 cursor-pointer"
                      >
                        <FileJson className="h-4 w-4 text-green-600" />
                        JSON Export
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Structured JSON with schema metadata and typed data.
                        Best for programmatic processing.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem
                      value="csv"
                      id="format-csv"
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <Label
                        htmlFor="format-csv"
                        className="font-medium flex items-center gap-2 cursor-pointer"
                      >
                        <Table2 className="h-4 w-4 text-orange-600" />
                        CSV (ZIP)
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        ZIP file with one CSV per table plus metadata. Best for
                        spreadsheet tools and data analysis.
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </fieldset>

              {/* Cross-account info */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-blue-700 dark:text-blue-300">
                    <span className="font-medium">
                      Cross-Account Migration:
                    </span>{" "}
                    Download this export and import it into another D1 Manager
                    deployment or use{" "}
                    <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">
                      wrangler d1 execute
                    </code>
                    .
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Step 2: Table Selection */}
          {step === "tables" && (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Select Tables</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="select-all"
                      checked={selectAll}
                      onCheckedChange={(checked) =>
                        handleSelectAll(checked === true)
                      }
                    />
                    <Label
                      htmlFor="select-all"
                      className="text-xs font-normal cursor-pointer"
                    >
                      Select all
                    </Label>
                  </div>
                </div>

                {loadingTables ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                    {availableTables.map((table) => (
                      <div key={table.name} className="flex items-center gap-2">
                        <Checkbox
                          id={`table-${table.name}`}
                          checked={selectedTables.includes(table.name)}
                          onCheckedChange={(checked) =>
                            handleTableToggle(table.name, checked === true)
                          }
                        />
                        <Label
                          htmlFor={`table-${table.name}`}
                          className="font-normal flex items-center gap-2 cursor-pointer"
                        >
                          {table.name}
                          {table.type === "virtual" && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 flex items-center gap-1">
                              <Sparkles className="h-3 w-3" />
                              FTS5
                            </span>
                          )}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  {selectedTables.length} of {availableTables.length} tables
                  selected
                </p>

                {hasFTS5 &&
                  selectedTables.some(
                    (t) =>
                      availableTables.find((at) => at.name === t)?.type ===
                      "virtual",
                  ) && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                        <div className="text-xs text-amber-700 dark:text-amber-300">
                          <span className="font-medium">FTS5 Tables:</span>{" "}
                          Virtual table schemas cannot be fully exported. The
                          export will include a comment placeholder.
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            </>
          )}

          {/* Step 3: Export Options */}
          {step === "options" && (
            <div className="space-y-4">
              <div className="space-y-3">
                <Label className="text-sm font-medium">Content to Export</Label>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="include-schema"
                    checked={includeSchema}
                    onCheckedChange={(checked) =>
                      setIncludeSchema(checked === true)
                    }
                  />
                  <div>
                    <Label
                      htmlFor="include-schema"
                      className="font-medium cursor-pointer"
                    >
                      Include Schema
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Export CREATE TABLE statements and table structure
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="include-data"
                    checked={includeData}
                    onCheckedChange={(checked) =>
                      setIncludeData(checked === true)
                    }
                  />
                  <div>
                    <Label
                      htmlFor="include-data"
                      className="font-medium cursor-pointer"
                    >
                      Include Data
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Export row data as INSERT statements or data arrays
                    </p>
                  </div>
                </div>
              </div>

              {includeData && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">
                    Row Limit per Table
                  </Label>
                  <RadioGroup
                    value={String(rowLimit)}
                    onValueChange={(v) => setRowLimit(Number(v))}
                    className="grid grid-cols-2 gap-2"
                  >
                    {ROW_LIMIT_OPTIONS.map((opt) => (
                      <div
                        key={opt.value}
                        className="flex items-center space-x-2"
                      >
                        <RadioGroupItem
                          value={String(opt.value)}
                          id={`limit-${String(opt.value)}`}
                        />
                        <Label
                          htmlFor={`limit-${String(opt.value)}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {opt.label}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              )}

              {format === "sql" && (
                <div className="flex items-start gap-3 pt-2 border-t">
                  <Checkbox
                    id="defer-fk"
                    checked={deferForeignKeys}
                    onCheckedChange={(checked) =>
                      setDeferForeignKeys(checked === true)
                    }
                  />
                  <div>
                    <Label
                      htmlFor="defer-fk"
                      className="font-medium cursor-pointer"
                    >
                      Defer Foreign Keys
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Add PRAGMA defer_foreign_keys for easier import
                    </p>
                  </div>
                </div>
              )}

              {!includeSchema && !includeData && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
                  Select at least one content type to export
                </div>
              )}
            </div>
          )}

          {/* Step 4: Progress */}
          {step === "progress" && (
            <div className="space-y-4">
              {!completed && !error && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      {getFormatIcon(format)}
                      {progress?.currentTable
                        ? `Exporting ${progress.currentTable}...`
                        : progress?.phase === "generating"
                          ? "Generating file..."
                          : "Preparing export..."}
                    </span>
                    <span className="text-muted-foreground">
                      {progress
                        ? `${String(progress.tablesCompleted)}/${String(progress.totalTables)} tables`
                        : ""}
                    </span>
                  </div>
                  <Progress value={getProgressPercent()} className="h-2" />
                  {progress && progress.rowsExported > 0 && (
                    <p className="text-xs text-muted-foreground text-center">
                      {progress.rowsExported.toLocaleString()} rows exported
                    </p>
                  )}
                  {progress?.warning && (
                    <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                      {progress.warning}
                    </div>
                  )}
                </div>
              )}

              {completed && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="font-medium text-green-800 dark:text-green-200">
                      Export completed!
                    </span>
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-2">
                    Your {format.toUpperCase()} export has been downloaded.
                    {format === "sql" && " Use wrangler d1 execute to import."}
                    {format === "json" &&
                      " The file includes schema metadata and typed data."}
                    {format === "csv" &&
                      " Extract the ZIP and import CSVs as needed."}
                  </p>
                  {progress?.warning && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                      ⚠️ Note: {progress.warning}
                    </p>
                  )}
                </div>
              )}

              <ErrorMessage error={error} variant="inline" />
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {step !== "progress" && (
            <>
              {step !== "format" && (
                <Button
                  variant="outline"
                  onClick={handleBack}
                  className="sm:mr-auto"
                >
                  Back
                </Button>
              )}

              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>

              <Button onClick={handleNext} disabled={!canProceed()}>
                {step === "options" ? (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Start Export
                  </>
                ) : (
                  "Next"
                )}
              </Button>
            </>
          )}

          {step === "progress" && (
            <>
              {completed || error ? (
                <Button onClick={handleClose}>
                  {completed ? "Done" : "Close"}
                </Button>
              ) : (
                <Button disabled>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting...
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
