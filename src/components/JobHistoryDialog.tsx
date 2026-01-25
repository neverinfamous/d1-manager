import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  getJobEvents,
  type JobEvent,
  type JobEventDetails,
} from "../services/api";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Circle,
  Play,
  Ban,
} from "lucide-react";

interface JobHistoryDialogProps {
  open: boolean;
  jobId: string;
  onClose: () => void;
}

export function JobHistoryDialog({
  open,
  jobId,
  onClose,
}: JobHistoryDialogProps): React.JSX.Element {
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && jobId) {
      void loadEvents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, jobId]);

  const loadEvents = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const data = await getJobEvents(jobId);
      setEvents(data.events);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load job events",
      );
    } finally {
      setLoading(false);
    }
  };

  const getEventIcon = (eventType: string): React.JSX.Element => {
    switch (eventType) {
      case "started":
        return <Play className="h-4 w-4 text-blue-500 fill-blue-500" />;
      case "progress":
        return <Circle className="h-4 w-4 text-blue-500 fill-blue-500" />;
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "cancelled":
        return <Ban className="h-5 w-5 text-gray-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getEventLabel = (eventType: string): string => {
    switch (eventType) {
      case "started":
        return "Started";
      case "progress":
        return "Progress Update";
      case "completed":
        return "Completed";
      case "failed":
        return "Failed";
      case "cancelled":
        return "Cancelled";
      default:
        return eventType;
    }
  };

  const formatTimestamp = (
    timestamp: string,
  ): { relative: string; absolute: string } => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    let relative = "";
    if (diffMins < 1) relative = "just now";
    else if (diffMins < 60) relative = `${String(diffMins)}m ago`;
    else if (diffHours < 24) relative = `${String(diffHours)}h ago`;
    else if (diffDays < 7) relative = `${String(diffDays)}d ago`;
    else relative = date.toLocaleDateString();

    const absolute = date.toLocaleString();
    return { relative, absolute };
  };

  const parseDetails = (details: string | null): JobEventDetails => {
    if (!details) return {};
    try {
      return JSON.parse(details) as JobEventDetails;
    } catch {
      return {};
    }
  };

  const renderEventDetails = (event: JobEvent): string | null => {
    const details = parseDetails(event.details);
    const items: string[] = [];

    if (details.total !== undefined) {
      items.push(`Total: ${details.total.toLocaleString()}`);
    }
    if (details.processed !== undefined) {
      items.push(`Processed: ${details.processed.toLocaleString()}`);
    }
    if (details.errors !== undefined && details.errors > 0) {
      items.push(`Errors: ${details.errors.toLocaleString()}`);
    }
    if (details.percentage !== undefined) {
      items.push(`${details.percentage.toFixed(1)}%`);
    }
    if (details.error_message) {
      items.push(`Error: ${details.error_message}`);
    }

    return items.length > 0 ? items.join(" • ") : null;
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Job Event History</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            Job ID: {jobId}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              <p className="font-medium">Error:</p>
              <p className="mt-1">{error}</p>
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No events found for this job
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-border" />

              {/* Events */}
              <div className="space-y-6">
                {events.map((event) => {
                  const time = formatTimestamp(event.timestamp);
                  const details = renderEventDetails(event);
                  const isTerminal = [
                    "completed",
                    "failed",
                    "cancelled",
                  ].includes(event.event_type);

                  return (
                    <div key={event.id} className="relative pl-8">
                      {/* Icon */}
                      <div className="absolute left-0 top-1 flex items-center justify-center">
                        {getEventIcon(event.event_type)}
                      </div>

                      {/* Content */}
                      <div
                        className={`rounded-lg border p-3 ${isTerminal ? "border-primary/50 bg-primary/5" : "bg-card"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="font-semibold text-sm">
                              {getEventLabel(event.event_type)}
                            </div>
                            {details && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {details}
                              </div>
                            )}
                          </div>
                          <div
                            className="text-xs text-muted-foreground text-right shrink-0"
                            title={time.absolute}
                          >
                            {time.relative}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
