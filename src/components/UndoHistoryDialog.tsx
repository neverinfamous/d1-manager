import { useState, useEffect } from 'react';
import { Undo, Loader2, Trash2, Clock, Table as TableIcon, Columns, Rows } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Dialog as ConfirmDialog,
  DialogContent as ConfirmDialogContent,
  DialogDescription as ConfirmDialogDescription,
  DialogFooter as ConfirmDialogFooter,
  DialogHeader as ConfirmDialogHeader,
  DialogTitle as ConfirmDialogTitle,
} from '@/components/ui/dialog';
import { getUndoHistory, restoreUndo, clearUndoHistory, type UndoHistoryEntry } from '@/services/api';

interface UndoHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  databaseId: string;
  databaseName: string;
  onRestoreSuccess?: () => void;
}

export function UndoHistoryDialog({
  open,
  onOpenChange,
  databaseId,
  databaseName,
  onRestoreSuccess
}: UndoHistoryDialogProps) {
  const [history, setHistory] = useState<UndoHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState<UndoHistoryEntry | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (open) {
      loadHistory();
    }
  }, [open, databaseId]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getUndoHistory(databaseId);
      setHistory(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load undo history');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (entry: UndoHistoryEntry) => {
    try {
      setRestoring(entry.id);
      setError(null);
      await restoreUndo(databaseId, entry.id);
      
      // Reload history
      await loadHistory();
      
      // Notify parent
      if (onRestoreSuccess) {
        onRestoreSuccess();
      }
      
      setShowConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore');
    } finally {
      setRestoring(null);
    }
  };

  const handleClearHistory = async () => {
    try {
      setClearing(true);
      setError(null);
      await clearUndoHistory(databaseId);
      setHistory([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear history');
    } finally {
      setClearing(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const getOperationIcon = (type: string) => {
    switch (type) {
      case 'DROP_TABLE':
        return <TableIcon className="h-4 w-4" />;
      case 'DROP_COLUMN':
        return <Columns className="h-4 w-4" />;
      case 'DELETE_ROW':
        return <Rows className="h-4 w-4" />;
      default:
        return <Undo className="h-4 w-4" />;
    }
  };

  const getOperationColor = (type: string) => {
    switch (type) {
      case 'DROP_TABLE':
        return 'text-red-600 dark:text-red-400';
      case 'DROP_COLUMN':
        return 'text-orange-600 dark:text-orange-400';
      case 'DELETE_ROW':
        return 'text-yellow-600 dark:text-yellow-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo className="h-5 w-5" />
              Undo History - {databaseName}
            </DialogTitle>
            <DialogDescription>
              Restore from recent destructive operations (last 10 operations)
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {error && (
              <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            {!loading && !error && history.length === 0 && (
              <div className="text-center py-12">
                <Undo className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No undo history</h3>
                <p className="text-sm text-muted-foreground">
                  Destructive operations like dropping tables or deleting rows will appear here
                </p>
              </div>
            )}

            {!loading && history.length > 0 && (
              <div className="space-y-2">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className={`mt-1 ${getOperationColor(entry.operation_type)}`}>
                      {getOperationIcon(entry.operation_type)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{entry.description}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{formatDate(entry.executed_at)}</span>
                            {entry.target_column && (
                              <>
                                <span>•</span>
                                <span>Column: {entry.target_column}</span>
                              </>
                            )}
                          </div>
                        </div>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowConfirm(entry)}
                          disabled={restoring !== null}
                        >
                          {restoring === entry.id ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              Restoring...
                            </>
                          ) : (
                            <>
                              <Undo className="h-3.5 w-3.5 mr-1.5" />
                              Restore
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearHistory}
              disabled={history.length === 0 || clearing || restoring !== null}
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
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      {showConfirm && (
        <ConfirmDialog open={true} onOpenChange={() => setShowConfirm(null)}>
          <ConfirmDialogContent>
            <ConfirmDialogHeader>
              <ConfirmDialogTitle>Confirm Restore</ConfirmDialogTitle>
              <ConfirmDialogDescription>
                Are you sure you want to restore this operation?
              </ConfirmDialogDescription>
            </ConfirmDialogHeader>

            <div className="py-4">
              <div className="bg-muted/50 border rounded-lg p-4 space-y-2">
                <p className="font-medium">{showConfirm.description}</p>
                <p className="text-sm text-muted-foreground">
                  Table: <span className="font-mono">{showConfirm.target_table}</span>
                </p>
                {showConfirm.target_column && (
                  <p className="text-sm text-muted-foreground">
                    Column: <span className="font-mono">{showConfirm.target_column}</span>
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  {formatDate(showConfirm.executed_at)}
                </p>
              </div>

              <div className="mt-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900 rounded-lg p-3">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>Warning:</strong> If the table/column/rows currently exist, this restoration may fail or cause conflicts.
                </p>
              </div>
            </div>

            <ConfirmDialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowConfirm(null)}
                disabled={restoring !== null}
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleRestore(showConfirm)}
                disabled={restoring !== null}
              >
                {restoring === showConfirm.id ? (
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
            </ConfirmDialogFooter>
          </ConfirmDialogContent>
        </ConfirmDialog>
      )}
    </>
  );
}

