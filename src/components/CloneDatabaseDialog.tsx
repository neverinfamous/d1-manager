import { useState, useEffect } from "react";
import {
  Loader2,
  Copy,
  AlertCircle,
  Sparkles,
  Database,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  listTables,
  getTableSchema,
  getTableData,
  executeQuery,
  createDatabase,
  type D1Database,
  type TableInfo,
} from "@/services/api";
import { ErrorMessage } from "@/components/ui/error-message";

interface CloneDatabaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  database: D1Database;
  allDatabases: D1Database[];
  existingDatabaseNames: string[];
  onClone: (
    sourceDatabaseId: string,
    sourceDatabaseName: string,
    newDatabaseName: string,
    onProgress: (
      step: "exporting" | "creating" | "importing" | "completed",
      progress: number,
    ) => void,
  ) => Promise<D1Database>;
  onSuccess: () => void;
}

type Step = "target" | "tables" | "options" | "review" | "progress";
type TargetMode = "new" | "existing";

interface MigrationTask {
  table: string;
  status: "pending" | "running" | "completed" | "failed";
  rowCount?: number;
  error?: string;
}

export function CloneDatabaseDialog({
  open,
  onOpenChange,
  database,
  allDatabases,
  existingDatabaseNames,
  onClone,
  onSuccess,
}: CloneDatabaseDialogProps): React.JSX.Element {
  // Step state
  const [step, setStep] = useState<Step>("target");

  // Target selection
  const [targetMode, setTargetMode] = useState<TargetMode>("new");
  const [newDbName, setNewDbName] = useState("");
  const [existingDbId, setExistingDbId] = useState("");

  // Table selection
  const [availableTables, setAvailableTables] = useState<TableInfo[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);

  // Options
  const [copySchema, setCopySchema] = useState(true);
  const [copyData, setCopyData] = useState(true);
  const [dropExisting, setDropExisting] = useState(false);

  // Progress
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<MigrationTask[]>([]);
  const [fullCloneProgress, setFullCloneProgress] = useState<{
    step: "exporting" | "creating" | "importing" | "completed";
    percent: number;
  } | null>(null);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setStep("target");
      setTargetMode("new");
      setNewDbName(`${database.name}-copy`);
      setExistingDbId("");
      setSelectedTables([]);
      setCopySchema(true);
      setCopyData(true);
      setDropExisting(false);
      setError(null);
      setTasks([]);
      setFullCloneProgress(null);
      setCloning(false);
      void loadTables();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, database.name, database.uuid]);

  const loadTables = async (): Promise<void> => {
    setLoadingTables(true);
    try {
      const tables = await listTables(database.uuid);
      // Include both regular tables and virtual tables (FTS5)
      const filteredTables = tables.filter(
        (t) => t.type === "table" || t.type === "virtual",
      );
      setAvailableTables(filteredTables);
      // Select all by default
      setSelectedTables(filteredTables.map((t) => t.name));
    } catch {
      setError("Failed to load tables");
    } finally {
      setLoadingTables(false);
    }
  };

  const hasFTS5 = database.fts5_count !== undefined && database.fts5_count > 0;
  const isFullClone =
    targetMode === "new" && selectedTables.length === availableTables.length;

  const validateNewName = (name: string): string | null => {
    if (!name.trim()) {
      return "Database name is required";
    }
    if (name.length > 64) {
      return "Database name must be 64 characters or less";
    }
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      return "Database name must start with a letter and contain only lowercase letters, numbers, and hyphens";
    }
    if (name.startsWith("-") || name.endsWith("-")) {
      return "Database name cannot start or end with a hyphen";
    }
    if (existingDatabaseNames.includes(name)) {
      return "A database with this name already exists";
    }
    return null;
  };

  const newNameError = targetMode === "new" ? validateNewName(newDbName) : null;

  const canProceedFromTarget = (): boolean => {
    if (targetMode === "new") {
      return !newNameError && !hasFTS5;
    }
    return !!existingDbId;
  };

  const canProceedFromTables = (): boolean => {
    return selectedTables.length > 0;
  };

  const canProceedFromOptions = (): boolean => {
    // Must have at least one option selected
    if (!copySchema && !copyData) return false;
    // For new databases, if copying data we must also copy schema (tables don't exist yet)
    if (targetMode === "new" && copyData && !copySchema) return false;
    return true;
  };

  const targetDbName =
    targetMode === "new"
      ? newDbName
      : (allDatabases.find((d) => d.uuid === existingDbId)?.name ?? "");

  const handleNext = (): void => {
    setError(null);

    if (step === "target") {
      // If creating new database with all tables, we can use full clone (faster)
      // Otherwise, go through table selection
      setStep("tables");
    } else if (step === "tables") {
      if (targetMode === "existing") {
        setStep("options");
      } else {
        // For new database, skip options if all tables selected (full clone)
        if (isFullClone) {
          setStep("review");
        } else {
          setStep("options");
        }
      }
    } else if (step === "options") {
      setStep("review");
    } else if (step === "review") {
      setStep("progress");
      void handleClone();
    }
  };

  const handleBack = (): void => {
    setError(null);

    if (step === "tables") {
      setStep("target");
    } else if (step === "options") {
      setStep("tables");
    } else if (step === "review") {
      if (targetMode === "existing" || !isFullClone) {
        setStep("options");
      } else {
        setStep("tables");
      }
    }
  };

  const handleClone = async (): Promise<void> => {
    setCloning(true);
    setError(null);

    try {
      if (targetMode === "new" && isFullClone && !hasFTS5) {
        // Use fast full database clone
        setFullCloneProgress({ step: "exporting", percent: 0 });

        await onClone(
          database.uuid,
          database.name,
          newDbName.trim(),
          (cloneStep, percent) => {
            setFullCloneProgress({ step: cloneStep, percent });
          },
        );

        setFullCloneProgress({ step: "completed", percent: 100 });
      } else {
        // Use table-by-table migration
        const targetId =
          targetMode === "new"
            ? await createNewDatabase(newDbName.trim())
            : existingDbId;

        if (!targetId) {
          throw new Error("Failed to get target database");
        }

        await migrateTablesOneByOne(targetId);
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clone failed");
    } finally {
      setCloning(false);
    }
  };

  const createNewDatabase = async (name: string): Promise<string> => {
    // Create an empty database (not a full clone)
    const result = await createDatabase(name);
    return result.uuid;
  };

  const migrateTablesOneByOne = async (targetDbId: string): Promise<void> => {
    const migrationTasks: MigrationTask[] = selectedTables.map((table) => ({
      table,
      status: "pending",
    }));
    setTasks(migrationTasks);

    for (let i = 0; i < selectedTables.length; i++) {
      const table = selectedTables[i];
      if (!table) continue;

      // Update status to running
      setTasks((prev) =>
        prev.map((t, idx) => (idx === i ? { ...t, status: "running" } : t)),
      );

      try {
        // Copy schema
        if (copySchema) {
          const schema = await getTableSchema(database.uuid, table);

          // Drop if requested
          if (dropExisting) {
            try {
              await executeQuery(
                targetDbId,
                `DROP TABLE IF EXISTS "${table}";`,
                undefined,
                true,
              );
            } catch {
              // Table doesn't exist in target, that's fine
            }
          }

          // Create table
          const columns = schema
            .map((col) => {
              let def = `"${col.name}" ${col.type || "TEXT"}`;
              if (col.pk > 0) def += " PRIMARY KEY";
              if (col.notnull && col.pk === 0) def += " NOT NULL";
              return def;
            })
            .join(", ");

          await executeQuery(
            targetDbId,
            `CREATE TABLE IF NOT EXISTS "${table}" (${columns});`,
            undefined,
            true,
          );
        }

        // Copy data
        let rowCount = 0;
        if (copyData) {
          const dataResult = await getTableData(database.uuid, table, 10000);
          const data = dataResult.results;

          if (data.length > 0) {
            const firstRow = data[0];
            const cols = firstRow ? Object.keys(firstRow) : [];

            for (const row of data) {
              try {
                const values = cols
                  .map((col) => {
                    const val = row[col];
                    if (val === null) return "NULL";
                    if (typeof val === "number") return String(val);
                    if (typeof val === "boolean") return val ? "1" : "0";
                    const strVal =
                      typeof val === "object"
                        ? JSON.stringify(val)
                        : (val as string);
                    return `'${strVal.replace(/'/g, "''")}'`;
                  })
                  .join(", ");

                await executeQuery(
                  targetDbId,
                  `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${values});`,
                  undefined,
                  true,
                );
                rowCount++;
              } catch {
                // Continue with next row
              }
            }
          }
        }

        setTasks((prev) =>
          prev.map((t, idx) =>
            idx === i ? { ...t, status: "completed", rowCount } : t,
          ),
        );
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Migration failed";
        setTasks((prev) =>
          prev.map((t, idx) =>
            idx === i ? { ...t, status: "failed", error: errorMsg } : t,
          ),
        );
      }
    }
  };

  const handleOpenChange = (newOpen: boolean): void => {
    if (!cloning) {
      onOpenChange(newOpen);
    }
  };

  const getStepLabel = (s: string): string => {
    switch (s) {
      case "exporting":
        return "Exporting source database...";
      case "creating":
        return "Creating new database...";
      case "importing":
        return "Importing data...";
      case "completed":
        return "Clone completed!";
      default:
        return "Processing...";
    }
  };

  const completedTasks = tasks.filter((t) => t.status === "completed").length;
  const failedTasks = tasks.filter((t) => t.status === "failed").length;
  const isComplete =
    step === "progress" &&
    !cloning &&
    (fullCloneProgress?.step === "completed" || tasks.length > 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Clone Database
          </DialogTitle>
          <DialogDescription>
            Copy tables and data from{" "}
            <span className="font-medium">{database.name}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Step 1: Target Selection */}
          {step === "target" && (
            <>
              {/* FTS5 Warning for new database */}
              {hasFTS5 && targetMode === "new" && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        FTS5 Tables Detected
                      </h4>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                        This database has {database.fts5_count} FTS5 table(s).
                        Full database clone isn't available, but you can copy to
                        an existing database or select specific tables.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <fieldset className="space-y-3">
                <legend className="text-sm font-medium leading-none">
                  Clone To
                </legend>
                <RadioGroup
                  value={targetMode}
                  onValueChange={(v) => setTargetMode(v as TargetMode)}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem
                      value="new"
                      id="target-new"
                      disabled={hasFTS5}
                    />
                    <Label
                      htmlFor="target-new"
                      className={`font-normal ${hasFTS5 ? "opacity-50" : ""}`}
                    >
                      Create new database
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="existing" id="target-existing" />
                    <Label htmlFor="target-existing" className="font-normal">
                      Copy to existing database
                    </Label>
                  </div>
                </RadioGroup>
              </fieldset>

              {targetMode === "new" && (
                <div className="space-y-2">
                  <Label htmlFor="clone-db-name">New Database Name</Label>
                  <Input
                    id="clone-db-name"
                    value={newDbName}
                    onChange={(e) => setNewDbName(e.target.value.toLowerCase())}
                    placeholder="my-database-copy"
                    disabled={hasFTS5}
                    autoComplete="off"
                  />
                  {newNameError && (
                    <p className="text-sm text-destructive">{newNameError}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Lowercase letters, numbers, and hyphens only. Must start
                    with a letter.
                  </p>
                </div>
              )}

              {targetMode === "existing" && (
                <div className="space-y-2">
                  <Label htmlFor="existing-db-select">Target Database</Label>
                  <select
                    id="existing-db-select"
                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                    value={existingDbId}
                    onChange={(e) => setExistingDbId(e.target.value)}
                  >
                    <option value="">Select a database...</option>
                    {allDatabases
                      .filter((d) => d.uuid !== database.uuid)
                      .map((db) => (
                        <option key={db.uuid} value={db.uuid}>
                          {db.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </>
          )}

          {/* Step 2: Table Selection */}
          {step === "tables" && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Select Tables to Clone</Label>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setSelectedTables(availableTables.map((t) => t.name))
                      }
                    >
                      All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedTables([])}
                    >
                      None
                    </Button>
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
                          onCheckedChange={(checked) => {
                            if (checked === true) {
                              setSelectedTables([
                                ...selectedTables,
                                table.name,
                              ]);
                            } else {
                              setSelectedTables(
                                selectedTables.filter((t) => t !== table.name),
                              );
                            }
                          }}
                        />
                        <Label
                          htmlFor={`table-${table.name}`}
                          className="font-normal flex items-center gap-2"
                        >
                          {table.name}
                          {table.type === "virtual" && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
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
              </div>
            </>
          )}

          {/* Step 3: Options (for existing target or partial clone) */}
          {step === "options" && (
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="copy-schema"
                    checked={copySchema}
                    onCheckedChange={(checked) => {
                      setCopySchema(checked === true);
                      // Reset dropExisting if schema is unchecked
                      if (checked !== true) {
                        setDropExisting(false);
                      }
                    }}
                    disabled={targetMode === "new" && copyData}
                  />
                  <div>
                    <Label htmlFor="copy-schema" className="font-medium">
                      Copy Schema
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Create table structures in target database
                    </p>
                    {targetMode === "new" && copyData && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        Required when copying data to a new database
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="copy-data"
                    checked={copyData}
                    onCheckedChange={(checked) => {
                      setCopyData(checked === true);
                      // Auto-enable schema when enabling data for new database
                      if (checked === true && targetMode === "new") {
                        setCopySchema(true);
                      }
                    }}
                  />
                  <div>
                    <Label htmlFor="copy-data" className="font-medium">
                      Copy Data
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Copy all rows from source tables (up to 10,000 rows per
                      table)
                    </p>
                  </div>
                </div>

                {targetMode === "existing" && (
                  <div className="flex items-start gap-3 pt-2 border-t">
                    <Checkbox
                      id="drop-existing"
                      checked={dropExisting}
                      onCheckedChange={(checked) =>
                        setDropExisting(checked === true)
                      }
                      disabled={!copySchema}
                    />
                    <div>
                      <Label
                        htmlFor="drop-existing"
                        className={`font-medium ${copySchema ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        Drop Existing Tables
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {copySchema
                          ? "⚠️ Warning: Permanently delete existing tables in target before copying"
                          : 'Requires "Copy Schema" to be enabled'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === "review" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-md">
                <div>
                  <div className="text-xs text-muted-foreground">Source</div>
                  <div className="flex items-center gap-2 mt-1 font-medium">
                    <Database className="h-4 w-4 text-primary" />
                    {database.name}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Target</div>
                  <div className="flex items-center gap-2 mt-1 font-medium">
                    <Database className="h-4 w-4 text-primary" />
                    {targetDbName}
                    {targetMode === "new" && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        new
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">
                  Tables ({selectedTables.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedTables.slice(0, 10).map((table) => (
                    <span
                      key={table}
                      className="px-2 py-1 bg-primary/10 text-primary rounded text-xs"
                    >
                      {table}
                    </span>
                  ))}
                  {selectedTables.length > 10 && (
                    <span className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs">
                      +{selectedTables.length - 10} more
                    </span>
                  )}
                </div>
              </div>

              {(targetMode === "existing" || !isFullClone) && (
                <div>
                  <div className="text-sm font-medium mb-2">Options</div>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>{copySchema ? "✓ Copy schema" : "○ Skip schema"}</li>
                    <li>{copyData ? "✓ Copy data" : "○ Skip data"}</li>
                    {dropExisting && (
                      <li className="text-destructive">
                        ⚠️ Drop existing tables first
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Progress */}
          {step === "progress" && (
            <div className="space-y-4">
              {fullCloneProgress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>{getStepLabel(fullCloneProgress.step)}</span>
                    <span className="text-muted-foreground">
                      {fullCloneProgress.percent}%
                    </span>
                  </div>
                  <Progress value={fullCloneProgress.percent} className="h-2" />
                </div>
              )}

              {tasks.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {tasks.map((task) => (
                    <div
                      key={task.table}
                      className="flex items-center justify-between p-2 bg-muted rounded-md text-sm"
                    >
                      <div className="flex items-center gap-2">
                        {task.status === "running" && (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                        {task.status === "completed" && (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        )}
                        {task.status === "failed" && (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        )}
                        {task.status === "pending" && (
                          <div className="h-4 w-4 border-2 border-muted-foreground rounded-full" />
                        )}

                        <div>
                          <span className="font-medium">{task.table}</span>
                          {task.error && (
                            <span className="text-xs text-destructive ml-2">
                              {task.error}
                            </span>
                          )}
                          {task.rowCount !== undefined &&
                            task.status === "completed" && (
                              <span className="text-xs text-muted-foreground ml-2">
                                ({task.rowCount} rows)
                              </span>
                            )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isComplete && (
                <div
                  className={`p-4 rounded-lg ${failedTasks > 0 ? "bg-amber-50 dark:bg-amber-900/20" : "bg-green-50 dark:bg-green-900/20"}`}
                >
                  <div className="flex items-center gap-2">
                    {failedTasks > 0 ? (
                      <AlertCircle className="h-5 w-5 text-amber-600" />
                    ) : (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    )}
                    <span className="font-medium">
                      {failedTasks > 0
                        ? `Completed with ${failedTasks} error(s)`
                        : "Clone completed successfully!"}
                    </span>
                  </div>
                  {tasks.length > 0 && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {completedTasks} of {tasks.length} tables copied
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          <ErrorMessage error={error} variant="inline" />
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {step !== "progress" && (
            <>
              {step !== "target" && (
                <Button
                  variant="outline"
                  onClick={handleBack}
                  className="sm:mr-auto"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              )}

              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>

              <Button
                onClick={handleNext}
                disabled={
                  (step === "target" && !canProceedFromTarget()) ||
                  (step === "tables" && !canProceedFromTables()) ||
                  (step === "options" && !canProceedFromOptions())
                }
              >
                {step === "review" ? "Start Clone" : "Next"}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </>
          )}

          {step === "progress" && (
            <>
              {isComplete ? (
                <Button onClick={() => onOpenChange(false)}>Done</Button>
              ) : (
                <Button disabled>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cloning...
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
