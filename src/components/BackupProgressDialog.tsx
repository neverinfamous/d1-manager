import React, { useEffect, useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle2, XCircle, AlertCircle, Cloud } from 'lucide-react';

interface JobStatus {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  percentage: number;
  processed_items: number | null;
  total_items: number | null;
  error_count: number | null;
  error_message?: string | null;
}

interface BackupProgressDialogProps {
  open: boolean;
  jobId: string;
  operationName: string;
  databaseName?: string;
  onClose: () => void;
  onComplete?: (success: boolean) => void;
}

const WORKER_API = import.meta.env.VITE_WORKER_API || window.location.origin;

export function BackupProgressDialog({
  open,
  jobId,
  operationName,
  databaseName,
  onClose,
  onComplete,
}: BackupProgressDialogProps): React.JSX.Element {
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canClose, setCanClose] = useState(false);
  const [autoCloseTimer, setAutoCloseTimer] = useState<number | null>(null);
  
  // Use refs to avoid recreating the interval on every render
  const isPollingRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onCloseRef = useRef(onClose);
  
  // Keep refs in sync
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onCloseRef.current = onClose;
  }, [onComplete, onClose]);

  useEffect(() => {
    if (!open || !jobId) return;
    
    // Prevent multiple polling instances
    if (isPollingRef.current) return;
    isPollingRef.current = true;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    let isMounted = true;

    const fetchJobStatus = async (): Promise<boolean> => {
      try {
        const response = await fetch(`${WORKER_API}/api/jobs/${jobId}`, {
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error('Failed to fetch job status');
        }

        const data = await response.json() as { result: JobStatus; success: boolean };
        
        if (!isMounted) return true; // Stop if unmounted
        
        setJobStatus(data.result);

        // Check if job is complete
        if (data.result.status === 'completed' || data.result.status === 'failed' || data.result.status === 'cancelled') {
          setCanClose(true);
          
          if (onCompleteRef.current) {
            onCompleteRef.current(data.result.status === 'completed');
          }

          // Auto-close on success after 3 seconds
          if (data.result.status === 'completed') {
            const timer = window.setTimeout(() => {
              onCloseRef.current();
            }, 3000);
            setAutoCloseTimer(timer);
          }
          
          return true; // Job is done, stop polling
        }
        
        return false; // Continue polling
      } catch (err) {
        if (!isMounted) return true;
        setError(err instanceof Error ? err.message : 'Unknown error');
        setCanClose(true);
        return true; // Stop polling on error
      }
    };

    // Initial fetch
    void fetchJobStatus().then((isDone) => {
      if (isDone || !isMounted) return;
      
      // Poll every 2 seconds
      intervalId = setInterval(() => {
        void fetchJobStatus().then((done) => {
          if (done && intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
        });
      }, 2000);
    });

    return () => {
      isMounted = false;
      isPollingRef.current = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [open, jobId]); // Only depend on open and jobId
  
  // Cleanup auto-close timer separately
  useEffect(() => {
    return () => {
      if (autoCloseTimer) {
        clearTimeout(autoCloseTimer);
      }
    };
  }, [autoCloseTimer]);

  const handleClose = (): void => {
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      setAutoCloseTimer(null);
    }
    setJobStatus(null);
    setError(null);
    setCanClose(false);
    onClose();
  };

  const getStatusIcon = (): React.JSX.Element => {
    if (!jobStatus) {
      return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    }

    switch (jobStatus.status) {
      case 'queued':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'running':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'failed':
      case 'cancelled':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Loader2 className="h-5 w-5 animate-spin text-gray-500" />;
    }
  };

  const getStatusText = (): string => {
    if (!jobStatus) return 'Initializing...';

    switch (jobStatus.status) {
      case 'queued': return 'Queued';
      case 'running': return 'In Progress';
      case 'completed': return 'Completed';
      case 'failed': return 'Failed';
      case 'cancelled': return 'Cancelled';
      default: return jobStatus.status;
    }
  };

  const percentage = jobStatus?.percentage ?? 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && canClose && handleClose()}>
      <DialogContent 
        className="sm:max-w-[450px]" 
        onPointerDownOutside={(e) => { if (!canClose) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (!canClose) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-blue-500" />
            {operationName}
          </DialogTitle>
          {databaseName && (
            <DialogDescription>
              Database: {databaseName}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Status */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Status:</span>
            <span className="flex items-center gap-2 font-medium">
              {getStatusIcon()}
              {getStatusText()}
            </span>
          </div>

          {/* Progress Bar */}
          {jobStatus && jobStatus.status !== 'failed' && jobStatus.status !== 'cancelled' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress:</span>
                <span className="font-medium">{Math.round(percentage)}%</span>
              </div>
              <Progress value={percentage} className="h-2" />
            </div>
          )}

          {/* Error Message */}
          {(jobStatus?.status === 'failed' || error) && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              <p className="font-medium">Error:</p>
              <p className="mt-1">{jobStatus?.error_message || error || 'Operation failed'}</p>
            </div>
          )}

          {/* Success Message */}
          {jobStatus?.status === 'completed' && (
            <div className="rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-200">
              <p className="font-medium">Operation completed successfully!</p>
              {autoCloseTimer && (
                <p className="mt-2 text-xs">Closing automatically in 3 seconds...</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={handleClose}
            disabled={!canClose}
            variant={jobStatus?.status === 'completed' ? 'default' : 'outline'}
          >
            {canClose ? 'Close' : 'Processing...'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

