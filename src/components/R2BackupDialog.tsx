import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Cloud, Loader2, AlertTriangle, Info } from 'lucide-react';
import { backupToR2 } from '@/services/api';

interface R2BackupDialogProps {
  open: boolean;
  databaseId: string;
  databaseName: string;
  hasFts5Tables?: boolean;
  onClose: () => void;
  onBackupStarted: (jobId: string) => void;
}

export function R2BackupDialog({
  open,
  databaseId,
  databaseName,
  hasFts5Tables = false,
  onClose,
  onBackupStarted,
}: R2BackupDialogProps): React.JSX.Element {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBackup = async (): Promise<void> => {
    setIsStarting(true);
    setError(null);

    try {
      const result = await backupToR2(databaseId, databaseName, 'manual');
      onBackupStarted(result.job_id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start backup');
    } finally {
      setIsStarting(false);
    }
  };

  const handleClose = (): void => {
    if (!isStarting) {
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-blue-500" />
            Backup to R2
          </DialogTitle>
          <DialogDescription>
            Create a backup of &quot;{databaseName}&quot; in R2 storage
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Info Alert */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">
                  About R2 Backups
                </h4>
                <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
                  <li>Backups are stored in your configured R2 bucket</li>
                  <li>Full SQL dump including schema and data</li>
                  <li>Can be restored at any time from the Restore dialog</li>
                </ul>
              </div>
            </div>
          </div>

          {/* FTS5 Warning */}
          {hasFts5Tables && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">
                    FTS5 Tables Detected
                  </h4>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    This database contains FTS5 (Full-Text Search) virtual tables. 
                    The D1 export API cannot export databases with FTS5 tables. 
                    You must convert or remove FTS5 tables before backing up, then recreate them afterward.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
              <p className="font-medium">Backup Failed</p>
              <p className="mt-1">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isStarting}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleBackup()}
            disabled={isStarting || hasFts5Tables}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isStarting ? (
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
  );
}

