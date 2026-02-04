import { useState, useCallback, useEffect } from "react";
import {
  Database,
  RefreshCw,
  Loader2,
  Download,
  Copy,
  CheckCircle2,
  AlertCircle,
  Play,
  FileCode,
  History,
  Search,
  Zap,
  Upload,
  X,
  AlertTriangle,
  ClipboardPaste,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  introspectDatabase,
  getMigrationStatus,
  generateMigrationPreview,
  pushSchemaChanges,
  exportSchema,
  clearIntrospectionCache,
  compareSchemas,
  type IntrospectionResult,
  type MigrationInfo,
  type DrizzleTable,
  type SchemaComparisonResult,
} from "@/services/drizzleApi";
import {
  invalidateTableListCache,
  invalidateTableSchemaCache,
} from "@/services/api";

interface DrizzleConsoleProps {
  databaseId: string;
  databaseName: string;
  onSchemaChange?: (() => void) | undefined;
}

type DrizzleCommand =
  | "introspect"
  | "migrations"
  | "generate"
  | "push"
  | "check";

interface CommandOption {
  value: DrizzleCommand;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const COMMANDS: CommandOption[] = [
  {
    value: "introspect",
    label: "Introspect",
    description: "Pull schema from database and generate Drizzle TypeScript",
    icon: <Search className="h-4 w-4" />,
  },
  {
    value: "migrations",
    label: "Migration Status",
    description: "View applied migrations and migration history",
    icon: <History className="h-4 w-4" />,
  },
  {
    value: "generate",
    label: "Generate",
    description: "Generate migration SQL from schema changes",
    icon: <FileCode className="h-4 w-4" />,
  },
  {
    value: "push",
    label: "Push",
    description: "Push schema changes directly to database (no migrations)",
    icon: <Zap className="h-4 w-4" />,
  },
  {
    value: "check",
    label: "Check",
    description: "Validate schema against current database state",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
];

export function DrizzleConsole({
  databaseId,
  databaseName,
  onSchemaChange,
}: DrizzleConsoleProps): React.JSX.Element {
  const [selectedCommand, setSelectedCommand] =
    useState<DrizzleCommand>("introspect");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Results state
  const [schema, setSchema] = useState<string | null>(null);
  const [tables, setTables] = useState<DrizzleTable[]>([]);
  const [migrationInfo, setMigrationInfo] = useState<MigrationInfo | null>(
    null,
  );
  const [migrationPreview, setMigrationPreview] = useState<{
    preview: string;
    statements: string[];
  } | null>(null);
  const [checkResult, setCheckResult] = useState<{
    tableCount: number;
    valid: boolean;
  } | null>(null);

  // Schema input state
  const [schemaInputMode, setSchemaInputMode] = useState<"file" | "paste">(
    "file",
  );
  const [uploadedSchemaContent, setUploadedSchemaContent] = useState<
    string | null
  >(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [pastedSchema, setPastedSchema] = useState<string>("");
  const [comparisonResult, setComparisonResult] =
    useState<SchemaComparisonResult | null>(null);

  // Get the active schema content (from file or paste)
  const activeSchemaContent =
    schemaInputMode === "file"
      ? uploadedSchemaContent
      : pastedSchema.trim() || null;

  // Get source label for display
  const schemaSourceLabel =
    schemaInputMode === "file"
      ? uploadedFileName
      : pastedSchema.trim()
        ? "pasted schema"
        : null;

  // Push dialog state
  const [showPushDialog, setShowPushDialog] = useState(false);
  const [pushStatements, setPushStatements] = useState<string[]>([]);
  const [dryRun, setDryRun] = useState(true);
  const [pushing, setPushing] = useState(false);

  // Output log
  const [outputLog, setOutputLog] = useState<string[]>([]);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setOutputLog((prev) => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  const clearResults = useCallback(() => {
    setSchema(null);
    setTables([]);
    setMigrationInfo(null);
    setMigrationPreview(null);
    setCheckResult(null);
    setComparisonResult(null);
    setError(null);
  }, []);

  const handleIntrospect = useCallback(
    async (skipCache = false): Promise<void> => {
      setLoading(true);
      clearResults();
      addLog("Starting database introspection...");

      try {
        const result: IntrospectionResult = await introspectDatabase(
          databaseId,
          skipCache,
        );

        if (result.success && result.schema) {
          setSchema(result.schema);
          setTables(result.tables ?? []);
          addLog(
            `Introspection complete: ${result.tables?.length ?? 0} tables found`,
          );
        } else {
          setError(result.error ?? "Introspection failed");
          addLog(`Error: ${result.error ?? "Unknown error"}`);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Introspection failed";
        setError(message);
        addLog(`Error: ${message}`);
      } finally {
        setLoading(false);
      }
    },
    [databaseId, addLog, clearResults],
  );

  // Auto-run introspect on mount
  useEffect(() => {
    void handleIntrospect(false);
  }, [handleIntrospect]);

  const handleMigrationStatus = async (): Promise<void> => {
    setLoading(true);
    clearResults();
    addLog("Checking migration status...");

    try {
      const info = await getMigrationStatus(databaseId);
      setMigrationInfo(info);

      if (info.hasMigrationsTable) {
        addLog(`Found ${info.appliedMigrations.length} applied migration(s)`);
      } else {
        addLog(
          "No migrations table found (database may not use Drizzle migrations)",
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to get migration status";
      setError(message);
      addLog(`Error: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e): void => {
      const content = e.target?.result as string;
      setUploadedSchemaContent(content);
      setUploadedFileName(file.name);
      addLog(`Schema file uploaded: ${file.name}`);
    };
    reader.onerror = (): void => {
      setError("Failed to read file");
      addLog("Error: Failed to read uploaded file");
    };
    reader.readAsText(file);
  };

  const handleClearUpload = (): void => {
    setUploadedSchemaContent(null);
    setUploadedFileName(null);
    setComparisonResult(null);
    addLog("Uploaded schema cleared");
  };

  const handleClearPaste = (): void => {
    setPastedSchema("");
    setComparisonResult(null);
    addLog("Pasted schema cleared");
  };

  const handleGenerate = async (): Promise<void> => {
    setLoading(true);
    clearResults();

    // If schema is provided (file or paste), use comparison
    if (activeSchemaContent) {
      addLog("Comparing schema with database...");

      try {
        const comparison = await compareSchemas(
          databaseId,
          activeSchemaContent,
        );
        setComparisonResult(comparison);

        if (comparison.sqlStatements.length > 0) {
          setMigrationPreview({
            preview: comparison.summary,
            statements: comparison.sqlStatements,
          });
          addLog(`Comparison complete: ${comparison.summary}`);

          if (comparison.warnings.length > 0) {
            for (const warning of comparison.warnings) {
              addLog(`Warning: ${warning}`);
            }
          }
        } else {
          addLog("No differences found between schemas");
          setMigrationPreview({
            preview: "No changes detected",
            statements: [],
          });
        }

        if (comparison.parseErrors.length > 0) {
          for (const parseError of comparison.parseErrors) {
            addLog(`Parse warning: ${parseError}`);
          }
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to compare schemas";
        setError(message);
        addLog(`Error: ${message}`);
      }
    } else {
      addLog("Generating migration preview...");
      addLog(
        "Note: Upload a schema.ts file to generate migrations from differences",
      );

      try {
        const preview = await generateMigrationPreview(databaseId);
        setMigrationPreview({
          preview: preview.preview,
          statements: preview.statements,
        });
        addLog(`Generated ${preview.statements.length} statement(s)`);
        addLog(preview.preview);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to generate migration";
        setError(message);
        addLog(`Error: ${message}`);
      }
    }

    setLoading(false);
  };

  const handleCheck = async (): Promise<void> => {
    setLoading(true);
    clearResults();
    addLog("Checking database schema...");

    try {
      // Use introspection for check
      const result = await introspectDatabase(databaseId, true);

      if (result.success) {
        setCheckResult({
          tableCount: result.tables?.length ?? 0,
          valid: true,
        });
        setSchema(result.schema ?? null);
        setTables(result.tables ?? []);
        addLog(
          `Check complete: ${result.tables?.length ?? 0} tables, schema valid`,
        );
      } else {
        setCheckResult({ tableCount: 0, valid: false });
        setError(result.error ?? "Schema check failed");
        addLog(`Check failed: ${result.error ?? "Unknown error"}`);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Schema check failed";
      setError(message);
      addLog(`Error: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePushPreview = async (): Promise<void> => {
    setLoading(true);

    // If schema is provided (file or paste), use comparison
    if (activeSchemaContent) {
      addLog("Comparing schema with database for push...");

      try {
        const comparison = await compareSchemas(
          databaseId,
          activeSchemaContent,
        );
        setComparisonResult(comparison);

        if (comparison.sqlStatements.length === 0) {
          addLog("No changes to push");
          setError("No schema changes detected");
        } else {
          setPushStatements(comparison.sqlStatements);
          setDryRun(true);
          setDryRunResult(null);
          setShowPushDialog(true);
          addLog(
            `Found ${comparison.sqlStatements.length} statement(s) to push`,
          );

          if (comparison.warnings.length > 0) {
            for (const warning of comparison.warnings) {
              addLog(`Warning: ${warning}`);
            }
          }
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to compare schemas";
        setError(message);
        addLog(`Error: ${message}`);
      }
    } else {
      addLog("Preparing push preview...");
      addLog("Note: Upload a schema.ts file to push schema changes");

      try {
        const preview = await generateMigrationPreview(databaseId);

        if (preview.statements.length === 0) {
          addLog("No changes to push");
          setError("No schema changes detected");
        } else {
          setPushStatements(preview.statements);
          setDryRun(true);
          setDryRunResult(null);
          setShowPushDialog(true);
          addLog(`Found ${preview.statements.length} statement(s) to push`);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to prepare push";
        setError(message);
        addLog(`Error: ${message}`);
      }
    }

    setLoading(false);
  };

  // Track dry run result for display in dialog
  const [dryRunResult, setDryRunResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handlePushExecute = async (): Promise<void> => {
    setPushing(true);
    setDryRunResult(null);
    addLog(dryRun ? "Running dry run..." : "Pushing schema changes...");

    try {
      const result = await pushSchemaChanges(
        databaseId,
        pushStatements,
        dryRun,
      );

      if (result.allSucceeded) {
        if (dryRun) {
          const message = `Dry run successful! ${pushStatements.length} statement(s) validated. No changes made to database.`;
          addLog("Dry run successful - no changes made");
          setDryRunResult({ success: true, message });
          // Don't close dialog on dry run - let user see results and optionally push for real
        } else {
          addLog(
            `Push complete: ${result.executedStatements} statement(s) executed`,
          );
          // Invalidate all caches after successful schema push
          clearIntrospectionCache(databaseId);
          invalidateTableListCache(databaseId);
          invalidateTableSchemaCache(databaseId); // Clear column schema cache for all tables
          await handleIntrospect(true);
          setShowPushDialog(false);
          // Notify parent to refresh database/table lists
          onSchemaChange?.();
        }
      } else {
        const failedStatements =
          result.results?.filter((r) => !r.success) ?? [];
        const errorMsg =
          failedStatements.length > 0
            ? `Push failed: ${failedStatements.length} statement(s) failed`
            : "Push failed: Unknown error";
        setError(errorMsg);
        if (dryRun) {
          setDryRunResult({ success: false, message: errorMsg });
        }
        for (const failed of failedStatements) {
          addLog(
            `Failed: ${failed.statement.substring(0, 50)}... - ${failed.error ?? "Unknown error"}`,
          );
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Push failed";
      setError(message);
      if (dryRun) {
        setDryRunResult({ success: false, message });
      }
      addLog(`Error: ${message}`);
    } finally {
      setPushing(false);
    }
  };

  const handleExecuteCommand = async (): Promise<void> => {
    switch (selectedCommand) {
      case "introspect":
        await handleIntrospect(true);
        break;
      case "migrations":
        await handleMigrationStatus();
        break;
      case "generate":
        await handleGenerate();
        break;
      case "push":
        await handlePushPreview();
        break;
      case "check":
        await handleCheck();
        break;
    }
  };

  const handleExport = async (): Promise<void> => {
    addLog("Exporting schema...");
    try {
      await exportSchema(databaseId);
      addLog("Schema exported successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed";
      setError(message);
      addLog(`Error: ${message}`);
    }
  };

  const handleCopySchema = async (): Promise<void> => {
    if (!schema) return;

    try {
      await navigator.clipboard.writeText(schema);
      setCopied(true);
      addLog("Schema copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addLog("Failed to copy to clipboard");
    }
  };

  const selectedCommandInfo = COMMANDS.find((c) => c.value === selectedCommand);

  return (
    <div className="space-y-4">
      {/* Command Selection */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Drizzle ORM Console</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Database: {databaseName}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="drizzle-command">Command</Label>
              <Select
                value={selectedCommand}
                onValueChange={(value) =>
                  setSelectedCommand(value as DrizzleCommand)
                }
              >
                <SelectTrigger id="drizzle-command" className="w-full">
                  <SelectValue placeholder="Select command" />
                </SelectTrigger>
                <SelectContent>
                  {COMMANDS.map((cmd) => (
                    <SelectItem key={cmd.value} value={cmd.value}>
                      <div className="flex items-center gap-2">
                        {cmd.icon}
                        <span>{cmd.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCommandInfo && (
                <p className="text-xs text-muted-foreground">
                  {selectedCommandInfo.description}
                </p>
              )}
            </div>

            <div className="flex items-end gap-2">
              <Button
                onClick={() => void handleExecuteCommand()}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Execute
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  clearIntrospectionCache(databaseId);
                  void handleIntrospect(true);
                }}
                disabled={loading}
                title="Refresh schema"
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schema Input */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileCode className="h-4 w-4" />
              Schema Input
            </CardTitle>
            <div className="flex gap-1">
              <Button
                variant={schemaInputMode === "file" ? "default" : "outline"}
                size="sm"
                onClick={() => setSchemaInputMode("file")}
              >
                <Upload className="h-3 w-3 mr-1" />
                File
              </Button>
              <Button
                variant={schemaInputMode === "paste" ? "default" : "outline"}
                size="sm"
                onClick={() => setSchemaInputMode("paste")}
              >
                <ClipboardPaste className="h-3 w-3 mr-1" />
                Paste
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {schemaInputMode === "file" ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Upload a Drizzle schema.ts file to generate migrations or push
                  changes.
                </p>

                {uploadedFileName ? (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2">
                      <FileCode className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium">
                        {uploadedFileName}
                      </span>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearUpload}
                      title="Remove uploaded file"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept=".ts,.tsx"
                      onChange={handleFileUpload}
                      id="schema-upload"
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      onClick={() =>
                        document.getElementById("schema-upload")?.click()
                      }
                      className="flex-1"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Choose Schema File (.ts)
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Paste your Drizzle schema code directly. Use sqliteTable()
                  definitions.
                </p>

                <div className="relative">
                  <Label htmlFor="schema-paste" className="sr-only">
                    Paste Drizzle schema
                  </Label>
                  <textarea
                    id="schema-paste"
                    name="schema-paste"
                    value={pastedSchema}
                    onChange={(e) => setPastedSchema(e.target.value)}
                    placeholder={`import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email')
});`}
                    className="w-full h-48 p-3 text-sm font-mono bg-muted rounded-lg border resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {pastedSchema.trim() && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearPaste}
                      className="absolute top-2 right-2"
                      title="Clear pasted schema"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {pastedSchema.trim() && (
                  <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-3 w-3" />
                    Schema ready ({pastedSchema.length} characters)
                  </div>
                )}
              </>
            )}

            {!activeSchemaContent && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3 inline mr-1" />
                Without a schema, Generate and Push will show no changes.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      <ErrorMessage error={error} variant="card" className="font-mono" />

      {/* Schema Viewer */}
      {schema && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileCode className="h-4 w-4" />
                Generated Schema
                {tables.length > 0 && (
                  <span className="text-xs text-muted-foreground font-normal">
                    ({tables.length} table{tables.length !== 1 ? "s" : ""})
                  </span>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCopySchema()}
                  disabled={!schema}
                >
                  {copied ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleExport()}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-sm font-mono max-h-96 overflow-y-auto">
                <code>{schema}</code>
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Migration Info */}
      {migrationInfo && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <History className="h-4 w-4" />
              Migration History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {migrationInfo.hasMigrationsTable ? (
              migrationInfo.appliedMigrations.length > 0 ? (
                <div className="space-y-2">
                  {migrationInfo.appliedMigrations.map((migration, index) => (
                    <div
                      key={migration.id}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                          #{index + 1}
                        </span>
                        <code className="text-sm font-mono">
                          {migration.hash}
                        </code>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(migration.created_at).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No migrations applied yet
                </p>
              )
            ) : (
              <div className="text-center py-4">
                <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No migrations table found. This database may not use Drizzle
                  migrations.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Migration Preview */}
      {migrationPreview && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileCode className="h-4 w-4" />
              Migration Preview
              {schemaSourceLabel && (
                <span className="text-xs text-muted-foreground font-normal">
                  (from {schemaSourceLabel})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-mono whitespace-pre-wrap">
                  {migrationPreview.preview}
                </p>
              </div>
              {migrationPreview.statements.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">SQL Statements:</h4>
                  {migrationPreview.statements.map((stmt, index) => (
                    <pre
                      key={index}
                      className="p-3 bg-muted rounded-lg text-sm font-mono overflow-x-auto"
                    >
                      {stmt}
                    </pre>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comparison Warnings */}
      {comparisonResult && comparisonResult.warnings.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              Warnings ({comparisonResult.warnings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {comparisonResult.warnings.map((warning, index) => (
                <div
                  key={index}
                  className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg text-sm text-amber-800 dark:text-amber-200"
                >
                  {warning}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Check Result */}
      {checkResult && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {checkResult.valid ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
              Schema Check Result
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`p-4 rounded-lg ${checkResult.valid ? "bg-green-50 dark:bg-green-950" : "bg-red-50 dark:bg-red-950"}`}
            >
              <p className="text-sm">
                {checkResult.valid
                  ? `Schema is valid. Found ${checkResult.tableCount} table(s).`
                  : "Schema validation failed."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Output Log */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Output Log</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOutputLog([])}
              disabled={outputLog.length === 0}
            >
              Clear
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-muted rounded-lg p-4 h-40 overflow-y-auto font-mono text-xs">
            {outputLog.length === 0 ? (
              <p className="text-muted-foreground">
                No output yet. Run a command to see results.
              </p>
            ) : (
              outputLog.map((log, index) => (
                <div key={index} className="text-muted-foreground">
                  {log}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Push Confirmation Dialog */}
      <Dialog open={showPushDialog} onOpenChange={setShowPushDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Push Schema Changes</DialogTitle>
            <DialogDescription>
              The following SQL statements will be executed against the
              database.
              {schemaSourceLabel && (
                <span className="block mt-1 text-xs">
                  Source: {schemaSourceLabel}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Comparison Warnings in Dialog */}
            {comparisonResult && comparisonResult.warnings.length > 0 && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800 max-h-32 overflow-y-auto">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
                  <AlertTriangle className="h-4 w-4 inline mr-1" />
                  {comparisonResult.warnings.length} warning(s):
                </p>
                <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-1 list-disc list-inside">
                  {comparisonResult.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="max-h-60 overflow-y-auto space-y-2">
              {pushStatements.map((stmt, index) => (
                <pre
                  key={index}
                  className="p-3 bg-muted rounded-lg text-sm font-mono overflow-x-auto"
                >
                  {stmt}
                </pre>
              ))}
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="dry-run"
                checked={dryRun}
                onCheckedChange={(checked) => setDryRun(checked === true)}
              />
              <Label
                htmlFor="dry-run"
                className="text-sm font-normal cursor-pointer"
              >
                Dry run (preview changes without executing)
              </Label>
            </div>

            {!dryRun && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <AlertCircle className="h-4 w-4 inline mr-2" />
                  Warning: This will modify your database. Make sure you have a
                  backup.
                </p>
              </div>
            )}

            {/* Dry Run Result */}
            {dryRunResult && (
              <div
                className={`p-3 rounded-lg border ${
                  dryRunResult.success
                    ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
                    : "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800"
                }`}
              >
                <p
                  className={`text-sm ${
                    dryRunResult.success
                      ? "text-green-800 dark:text-green-200"
                      : "text-red-800 dark:text-red-200"
                  }`}
                >
                  {dryRunResult.success ? (
                    <CheckCircle2 className="h-4 w-4 inline mr-2" />
                  ) : (
                    <AlertCircle className="h-4 w-4 inline mr-2" />
                  )}
                  {dryRunResult.message}
                </p>
                {dryRunResult.success && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    Uncheck "Dry run" above and click "Push Changes" to apply.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPushDialog(false)}
              disabled={pushing}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handlePushExecute()}
              disabled={pushing}
              variant={dryRun ? "default" : "destructive"}
            >
              {pushing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {dryRun ? "Running..." : "Pushing..."}
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  {dryRun ? "Run Dry Run" : "Push Changes"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
