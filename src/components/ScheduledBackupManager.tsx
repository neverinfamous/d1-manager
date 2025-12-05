/**
 * ScheduledBackupManager Component
 * 
 * Provides a UI for managing scheduled backup configurations.
 * Supports creating, editing, deleting, and toggling scheduled backups.
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { ErrorMessage } from '@/components/ui/error-message';
import {
  listScheduledBackups,
  saveScheduledBackup,
  deleteScheduledBackup,
  toggleScheduledBackup,
  getR2BackupStatus,
  type ScheduledBackup,
  type ScheduledBackupSchedule,
  type ScheduledBackupInput
} from '@/services/api';
import {
  DAY_OF_WEEK_LABELS,
  getOrdinalSuffix,
  formatScheduleDate,
  isOverdue
} from '@/types/scheduledBackup';

// Icons as inline SVGs for accessibility
const RefreshIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
    <path d="M16 16h5v5" />
  </svg>
);

const PlusIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

const EditIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
);

const TrashIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

const CalendarIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
    <line x1="16" x2="16" y1="2" y2="6" />
    <line x1="8" x2="8" y1="2" y2="6" />
    <line x1="3" x2="21" y1="10" y2="10" />
  </svg>
);

const ClockIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const DatabaseIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </svg>
);

const CheckCircleIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const AlertCircleIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const LoaderIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

const CloudIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
  </svg>
);

const AlertTriangleIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);

interface ScheduledBackupManagerProps {
  databases?: { uuid: string; name: string; fts5_count?: number }[];
  singleDatabaseId?: string;
  singleDatabaseName?: string;
  singleDatabaseFts5Count?: number;
}

export function ScheduledBackupManager({
  databases = [],
  singleDatabaseId,
  singleDatabaseName,
  singleDatabaseFts5Count
}: ScheduledBackupManagerProps): React.ReactElement {
  const [schedules, setSchedules] = useState<ScheduledBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [r2Configured, setR2Configured] = useState<boolean | null>(null);

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduledBackup | null>(null);
  const [deletingSchedule, setDeletingSchedule] = useState<ScheduledBackup | null>(null);

  // Form states
  const [formDatabaseId, setFormDatabaseId] = useState('');
  const [formDatabaseName, setFormDatabaseName] = useState('');
  const [formSchedule, setFormSchedule] = useState<ScheduledBackupSchedule>('daily');
  const [formDayOfWeek, setFormDayOfWeek] = useState(0);
  const [formDayOfMonth, setFormDayOfMonth] = useState(1);
  const [formHour, setFormHour] = useState(2);
  const [formEnabled, setFormEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const isSingleDatabase = singleDatabaseId !== undefined;

  // FTS5 detection
  const selectedDatabase = databases.find(db => db.uuid === formDatabaseId);
  const hasFts5Tables = isSingleDatabase 
    ? (singleDatabaseFts5Count ?? 0) > 0
    : (selectedDatabase?.fts5_count ?? 0) > 0;
  const fts5Count = isSingleDatabase 
    ? (singleDatabaseFts5Count ?? 0)
    : (selectedDatabase?.fts5_count ?? 0);

  const loadSchedules = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError('');
      
      const data = await listScheduledBackups();
      
      // Filter to single database if in single-database mode
      if (isSingleDatabase) {
        setSchedules(data.filter(s => s.database_id === singleDatabaseId));
      } else {
        setSchedules(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  }, [isSingleDatabase, singleDatabaseId]);

  const checkR2Status = useCallback(async (): Promise<void> => {
    try {
      const status = await getR2BackupStatus();
      setR2Configured(status.configured);
    } catch {
      setR2Configured(false);
    }
  }, []);

  useEffect(() => {
    void checkR2Status();
    void loadSchedules();
  }, [checkR2Status, loadSchedules]);

  const resetForm = (): void => {
    if (isSingleDatabase) {
      setFormDatabaseId(singleDatabaseId);
      setFormDatabaseName(singleDatabaseName ?? '');
    } else {
      setFormDatabaseId('');
      setFormDatabaseName('');
    }
    setFormSchedule('daily');
    setFormDayOfWeek(0);
    setFormDayOfMonth(1);
    setFormHour(2);
    setFormEnabled(true);
  };

  const openCreateDialog = (): void => {
    resetForm();
    setShowCreateDialog(true);
  };

  const openEditDialog = (schedule: ScheduledBackup): void => {
    setFormDatabaseId(schedule.database_id);
    setFormDatabaseName(schedule.database_name);
    setFormSchedule(schedule.schedule);
    setFormDayOfWeek(schedule.day_of_week ?? 0);
    setFormDayOfMonth(schedule.day_of_month ?? 1);
    setFormHour(schedule.hour);
    setFormEnabled(schedule.enabled === 1);
    setEditingSchedule(schedule);
  };

  const handleSaveSchedule = async (): Promise<void> => {
    if (!formDatabaseId || !formDatabaseName) {
      setError('Database is required');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const input: ScheduledBackupInput = {
        database_id: formDatabaseId,
        database_name: formDatabaseName,
        schedule: formSchedule,
        hour: formHour,
        enabled: formEnabled,
        ...(formSchedule === 'weekly' && { day_of_week: formDayOfWeek }),
        ...(formSchedule === 'monthly' && { day_of_month: formDayOfMonth }),
      };

      await saveScheduledBackup(input);
      setShowCreateDialog(false);
      setEditingSchedule(null);
      resetForm();
      await loadSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSchedule = async (): Promise<void> => {
    if (!deletingSchedule) return;

    setSubmitting(true);
    try {
      await deleteScheduledBackup(deletingSchedule.database_id);
      setDeletingSchedule(null);
      await loadSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete schedule');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleSchedule = async (schedule: ScheduledBackup): Promise<void> => {
    try {
      await toggleScheduledBackup(schedule.database_id);
      await loadSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle schedule');
    }
  };

  const handleDatabaseSelect = (databaseId: string): void => {
    setFormDatabaseId(databaseId);
    const db = databases.find(d => d.uuid === databaseId);
    if (db) {
      setFormDatabaseName(db.name);
    }
  };

  // Generate hour options (0-23) with timezone hints
  // Shows major city examples for common timezones
  const getTimezoneHint = (utcHour: number): string => {
    // Calculate local times for major cities
    // UTC offsets: NYC=-5/-4, LA=-8/-7, London=0/+1, Tokyo=+9, Sydney=+10/+11
    // Using standard time (not DST) for simplicity
    const cities: string[] = [];
    
    // New York (UTC-5)
    const nyHour = (utcHour - 5 + 24) % 24;
    // Los Angeles (UTC-8)
    const laHour = (utcHour - 8 + 24) % 24;
    // London (UTC+0)
    const londonHour = utcHour;
    // Tokyo (UTC+9)
    const tokyoHour = (utcHour + 9) % 24;
    
    // Show 2-3 representative cities
    cities.push(`${nyHour.toString().padStart(2, '0')}:00 NYC`);
    cities.push(`${laHour.toString().padStart(2, '0')}:00 LA`);
    cities.push(`${londonHour.toString().padStart(2, '0')}:00 London`);
    cities.push(`${tokyoHour.toString().padStart(2, '0')}:00 Tokyo`);
    
    return cities.join(' · ');
  };

  const hourOptions = Array.from({ length: 24 }, (_, i) => ({
    value: i,
    label: `${i.toString().padStart(2, '0')}:00 UTC`,
    hint: getTimezoneHint(i)
  }));

  // Generate day of month options (1-28)
  const dayOfMonthOptions = Array.from({ length: 28 }, (_, i) => ({
    value: i + 1,
    label: `${i + 1}${getOrdinalSuffix(i + 1)}`
  }));

  // Check if schedule already exists for selected database
  const hasExistingSchedule = schedules.some(s => s.database_id === formDatabaseId);
  const isEditing = editingSchedule !== null;

  if (r2Configured === false) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <CloudIcon className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">R2 Backups Not Configured</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Scheduled backups require R2 storage to be configured. 
            Please add BACKUP_BUCKET and BACKUP_DO bindings to wrangler.toml and redeploy.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Scheduled Backups
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Automatically backup databases to R2 on a schedule
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => void loadSchedules()}
            disabled={loading}
            aria-label="Refresh schedules"
          >
            <RefreshIcon className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {(!isSingleDatabase || schedules.length === 0) && (
            <Button onClick={openCreateDialog} aria-label="Add scheduled backup">
              <PlusIcon className="h-4 w-4 mr-2" />
              {isSingleDatabase ? 'Configure Schedule' : 'Add Schedule'}
            </Button>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6">
          <ErrorMessage error={error} showTitle />
          <button
            type="button"
            onClick={() => setError('')}
            className="mt-2 underline text-sm text-destructive"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12" role="status" aria-label="Loading schedules">
          <LoaderIcon className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!loading && schedules.length === 0 && (
        <div className="text-center py-12">
          <CalendarIcon className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">No scheduled backups</h3>
          <p className="text-muted-foreground mb-4">
            {isSingleDatabase 
              ? 'Configure automatic backups for this database'
              : 'Schedule automatic backups for your databases'}
          </p>
          <Button onClick={openCreateDialog}>
            <PlusIcon className="h-4 w-4 mr-2" />
            {isSingleDatabase ? 'Configure Schedule' : 'Add Your First Schedule'}
          </Button>
        </div>
      )}

      {/* Schedule List */}
      {!loading && schedules.length > 0 && (
        <div className="space-y-4" role="list" aria-label="Scheduled backups">
          {schedules.map((schedule) => {
            const overdue = isOverdue(schedule.next_run_at);
            return (
              <Card 
                key={schedule.id} 
                className={schedule.enabled === 0 ? 'opacity-60' : ''}
                role="listitem"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <DatabaseIcon className={`h-5 w-5 ${schedule.enabled === 1 ? 'text-primary' : 'text-muted-foreground'}`} />
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          {schedule.database_name}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-1">
                          <ClockIcon className="h-3 w-3" />
                          {schedule.schedule_description ?? `${schedule.schedule} at ${schedule.hour}:00 UTC`}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          schedule.enabled === 1
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                        }`}
                      >
                        {schedule.enabled === 1 ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Next Run (Local)</span>
                      <p className={`font-medium ${overdue ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                        {formatScheduleDate(schedule.next_run_at)}
                        {overdue && ' (overdue)'}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Last Run</span>
                      <p className="font-medium">{formatScheduleDate(schedule.last_run_at)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Last Status</span>
                      <p className="font-medium flex items-center gap-1">
                        {schedule.last_status === 'success' ? (
                          <>
                            <CheckCircleIcon className="h-4 w-4 text-green-500" />
                            Success
                          </>
                        ) : schedule.last_status === 'failed' ? (
                          <>
                            <AlertCircleIcon className="h-4 w-4 text-red-500" />
                            Failed
                          </>
                        ) : (
                          'Never run'
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Created</span>
                      <p className="font-medium">{formatScheduleDate(schedule.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleToggleSchedule(schedule)}
                      aria-label={`${schedule.enabled === 1 ? 'Disable' : 'Enable'} schedule for ${schedule.database_name}`}
                    >
                      {schedule.enabled === 1 ? 'Disable' : 'Enable'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditDialog(schedule)}
                      aria-label={`Edit schedule for ${schedule.database_name}`}
                    >
                      <EditIcon className="h-4 w-4" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setDeletingSchedule(schedule)}
                      aria-label={`Delete schedule for ${schedule.database_name}`}
                    >
                      <TrashIcon className="h-4 w-4" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog
        open={showCreateDialog || editingSchedule !== null}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setEditingSchedule(null);
            resetForm();
            setError('');
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Edit Scheduled Backup' : 'Add Scheduled Backup'}
            </DialogTitle>
            <DialogDescription>
              Configure automatic backups to R2 storage
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Database Selector (only in multi-database mode) */}
            {!isSingleDatabase && (
              <div className="space-y-2">
                <Label htmlFor="schedule-database">Database</Label>
                <Select
                  value={formDatabaseId}
                  onValueChange={handleDatabaseSelect}
                  disabled={isEditing}
                >
                  <SelectTrigger id="schedule-database">
                    <SelectValue placeholder="Select a database" />
                  </SelectTrigger>
                  <SelectContent>
                    {databases.map((db) => (
                      <SelectItem key={db.uuid} value={db.uuid}>
                        {db.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hasExistingSchedule && !isEditing && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    This database already has a schedule. Saving will update it.
                  </p>
                )}
              </div>
            )}

            {/* FTS5 Warning */}
            {hasFts5Tables && formDatabaseId && (
              <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangleIcon className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800 dark:text-amber-200">
                    <p className="font-semibold mb-1">⚠️ Database contains {fts5Count} FTS5 {fts5Count === 1 ? 'table' : 'tables'}</p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Databases with FTS5 (Full-Text Search) tables may take significantly longer to export and could timeout during scheduled backups. 
                      The backup will be retried at the next scheduled time if it fails. Consider using manual backups for databases with large FTS5 indexes.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Schedule Type */}
            <div className="space-y-2">
              <Label htmlFor="schedule-type">Frequency</Label>
              <Select
                value={formSchedule}
                onValueChange={(value: ScheduledBackupSchedule) => setFormSchedule(value)}
              >
                <SelectTrigger id="schedule-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Day of Week (for weekly) */}
            {formSchedule === 'weekly' && (
              <div className="space-y-2">
                <Label htmlFor="schedule-day-of-week">Day of Week</Label>
                <Select
                  value={String(formDayOfWeek)}
                  onValueChange={(value) => setFormDayOfWeek(parseInt(value, 10))}
                >
                  <SelectTrigger id="schedule-day-of-week">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_OF_WEEK_LABELS.map((day, index) => (
                      <SelectItem key={index} value={String(index)}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Day of Month (for monthly) */}
            {formSchedule === 'monthly' && (
              <div className="space-y-2">
                <Label htmlFor="schedule-day-of-month">Day of Month</Label>
                <Select
                  value={String(formDayOfMonth)}
                  onValueChange={(value) => setFormDayOfMonth(parseInt(value, 10))}
                >
                  <SelectTrigger id="schedule-day-of-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dayOfMonthOptions.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Limited to 1-28 to ensure the day exists in all months
                </p>
              </div>
            )}

            {/* Hour */}
            <div className="space-y-2">
              <Label htmlFor="schedule-hour">Time (UTC)</Label>
              <Select
                value={String(formHour)}
                onValueChange={(value) => setFormHour(parseInt(value, 10))}
              >
                <SelectTrigger id="schedule-hour">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {hourOptions.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      <div className="flex flex-col">
                        <span>{option.label}</span>
                        <span className="text-xs text-muted-foreground">{option.hint}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                ≈ {hourOptions[formHour]?.hint}
              </p>
              <p className="text-xs text-muted-foreground italic">
                Times are approximate (standard time, not DST adjusted)
              </p>
            </div>

            {/* Enabled */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="schedule-enabled"
                checked={formEnabled}
                onCheckedChange={(checked) => setFormEnabled(checked === true)}
              />
              <Label htmlFor="schedule-enabled" className="cursor-pointer">
                Enabled
              </Label>
            </div>

            {error && <ErrorMessage error={error} />}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setEditingSchedule(null);
                resetForm();
                setError('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleSaveSchedule()}
              disabled={submitting || !formDatabaseId}
            >
              {submitting && <LoaderIcon className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deletingSchedule !== null} onOpenChange={() => setDeletingSchedule(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Scheduled Backup</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the scheduled backup for &quot;{deletingSchedule?.database_name}&quot;? 
              This will not delete existing backups.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingSchedule(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeleteSchedule()}
              disabled={submitting}
            >
              {submitting && <LoaderIcon className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

