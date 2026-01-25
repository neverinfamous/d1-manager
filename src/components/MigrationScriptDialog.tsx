/**
 * Migration Script Dialog
 *
 * Displays generated SQL migration script with syntax highlighting,
 * copy/download functionality, and Apply Migration option.
 */

import React, { useState, useMemo } from "react";
import {
  X,
  Copy,
  Download,
  AlertTriangle,
  Check,
  Play,
  FileCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type MigrationStep,
  formatMigrationAsSQL,
  getMigrationStats,
} from "@/lib/schema-diff-generator";

interface MigrationScriptDialogProps {
  open: boolean;
  onClose: () => void;
  steps: MigrationStep[];
  leftDbName: string;
  rightDbName: string;
  leftDbId: string;
  rightDbId: string;
  onApply?: (sql: string, targetDbId: string) => Promise<void>;
}

export function MigrationScriptDialog({
  open,
  onClose,
  steps,
  leftDbName,
  rightDbName,
  leftDbId: _leftDbId,
  rightDbId,
  onApply,
}: MigrationScriptDialogProps): React.JSX.Element | null {
  const [copied, setCopied] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState(false);
  const [showConfirmApply, setShowConfirmApply] = useState(false);

  // Generate SQL script
  const script = useMemo(() => {
    return formatMigrationAsSQL(steps, {
      leftDbName,
      rightDbName,
      includeComments: true,
    });
  }, [steps, leftDbName, rightDbName]);

  // Get statistics
  const stats = useMemo(() => getMigrationStats(steps), [steps]);

  if (!open) return null;

  const handleCopy = async (): Promise<void> => {
    await navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (): void => {
    const blob = new Blob([script], { type: "text/sql" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, -5);
    link.download = `migration-${leftDbName}-to-${rightDbName}-${timestamp}.sql`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleApply = async (): Promise<void> => {
    if (!onApply) return;

    setApplying(true);
    setApplyError(null);

    try {
      // Apply to right database (target)
      await onApply(script, rightDbId);
      setApplySuccess(true);
      setShowConfirmApply(false);
    } catch (err) {
      setApplyError(
        err instanceof Error ? err.message : "Failed to apply migration",
      );
    } finally {
      setApplying(false);
    }
  };

  const getRiskBadgeColor = (risk: "safe" | "warning" | "danger"): string => {
    switch (risk) {
      case "safe":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "warning":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "danger":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="migration-script-dialog-title"
    >
      <div className="bg-background rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <FileCode className="h-5 w-5" aria-hidden="true" />
            <h2
              id="migration-script-dialog-title"
              className="text-lg font-semibold"
            >
              Migration Script Preview
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Migration Direction */}
          <div className="text-sm">
            <span className="text-muted-foreground">From:</span>{" "}
            <span className="font-medium">{leftDbName}</span>
            <span className="mx-2 text-muted-foreground">→</span>
            <span className="text-muted-foreground">To:</span>{" "}
            <span className="font-medium">{rightDbName}</span>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-4 gap-4">
            <Card className="p-3">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {stats.safe}
              </div>
              <div className="text-xs text-muted-foreground">Safe Changes</div>
            </Card>
            <Card className="p-3">
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {stats.warning}
              </div>
              <div className="text-xs text-muted-foreground">Warnings</div>
            </Card>
            <Card className="p-3">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {stats.danger}
              </div>
              <div className="text-xs text-muted-foreground">Dangerous</div>
            </Card>
            <Card className="p-3">
              <div className="text-2xl font-bold text-muted-foreground">
                {stats.total}
              </div>
              <div className="text-xs text-muted-foreground">Total Steps</div>
            </Card>
          </div>

          {/* Warning for dangerous operations */}
          {stats.danger > 0 && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-900">
              <AlertTriangle
                className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div>
                <div className="font-medium text-red-800 dark:text-red-200">
                  Warning: Destructive Operations
                </div>
                <div className="text-sm text-red-700 dark:text-red-300">
                  This migration contains {stats.danger} dangerous operation
                  {stats.danger !== 1 ? "s" : ""} that may result in data loss.
                  Create a backup before applying.
                </div>
              </div>
            </div>
          )}

          {/* Migration Steps Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Migration Steps</CardTitle>
            </CardHeader>
            <CardContent className="max-h-32 overflow-y-auto">
              <ul className="text-sm space-y-1" role="list">
                {steps.map((step, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs ${getRiskBadgeColor(step.risk)}`}
                    >
                      {step.risk}
                    </span>
                    <span className="text-muted-foreground">{step.table}</span>
                    <span>→</span>
                    <span>{step.type.replace(/_/g, " ")}</span>
                    {step.object !== undefined && step.object !== "" && (
                      <span className="font-mono text-xs">({step.object})</span>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* SQL Script */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Generated SQL</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-3 rounded-lg text-xs font-mono overflow-x-auto max-h-64 whitespace-pre-wrap">
                {script}
              </pre>
            </CardContent>
          </Card>

          {/* Apply Confirmation */}
          {showConfirmApply && (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-900">
              <div className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                Confirm Migration
              </div>
              <div className="text-sm text-yellow-700 dark:text-yellow-300 mb-4">
                This will apply the migration script to{" "}
                <strong>{rightDbName}</strong>. Make sure you have a backup
                before proceeding.
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => void handleApply()}
                  disabled={applying}
                  variant="destructive"
                  size="sm"
                >
                  {applying ? "Applying..." : "Yes, Apply Migration"}
                </Button>
                <Button
                  onClick={() => setShowConfirmApply(false)}
                  variant="outline"
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Apply Error */}
          {applyError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-900">
              <div className="text-sm text-red-700 dark:text-red-300">
                {applyError}
              </div>
            </div>
          )}

          {/* Apply Success */}
          {applySuccess && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-900">
              <Check
                className="h-5 w-5 text-green-600 dark:text-green-400"
                aria-hidden="true"
              />
              <div className="text-sm text-green-700 dark:text-green-300">
                Migration applied successfully!
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t">
          <div className="text-xs text-muted-foreground">
            Target database: {rightDbName}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" aria-hidden="true" />
              Download .sql
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleCopy()}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" aria-hidden="true" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" aria-hidden="true" />
                  Copy
                </>
              )}
            </Button>
            {onApply !== undefined && !applySuccess && (
              <Button
                size="sm"
                onClick={() => setShowConfirmApply(true)}
                disabled={applying || showConfirmApply}
              >
                <Play className="h-4 w-4 mr-2" aria-hidden="true" />
                Apply to Target
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
