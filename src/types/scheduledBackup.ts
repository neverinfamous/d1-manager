/**
 * Scheduled Backup Types for D1 Manager Frontend
 */

/**
 * Scheduled backup frequency options
 */
export type ScheduledBackupSchedule = 'daily' | 'weekly' | 'monthly';

/**
 * Scheduled backup from API
 */
export interface ScheduledBackup {
  id: string;
  database_id: string;
  database_name: string;
  schedule: ScheduledBackupSchedule;
  day_of_week: number | null;     // 0-6 for weekly (0=Sunday)
  day_of_month: number | null;    // 1-28 for monthly
  hour: number;                    // 0-23 UTC
  enabled: number;                 // 0 or 1
  last_run_at: string | null;
  next_run_at: string | null;
  last_job_id: string | null;
  last_status: 'success' | 'failed' | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  schedule_description?: string;   // Human-readable description from API
}

/**
 * Scheduled backup create/update request
 */
export interface ScheduledBackupInput {
  database_id: string;
  database_name: string;
  schedule: ScheduledBackupSchedule;
  day_of_week?: number;
  day_of_month?: number;
  hour?: number;
  enabled?: boolean;
}

/**
 * API response types
 */
export interface ScheduledBackupsResponse {
  success: boolean;
  result: ScheduledBackup[];
}

export interface ScheduledBackupResponse {
  success: boolean;
  result: ScheduledBackup | null;
}

/**
 * Schedule type labels for UI display
 */
export const SCHEDULE_LABELS: Record<ScheduledBackupSchedule, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

/**
 * Schedule type descriptions for UI display
 */
export const SCHEDULE_DESCRIPTIONS: Record<ScheduledBackupSchedule, string> = {
  daily: 'Runs every day at the specified hour',
  weekly: 'Runs once per week on the specified day',
  monthly: 'Runs once per month on the specified day',
};

/**
 * Day of week labels (0=Sunday)
 */
export const DAY_OF_WEEK_LABELS: string[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * Get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
 */
export function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0] ?? 'th';
}

/**
 * Format hour for display (24h format with timezone)
 */
export function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00 UTC`;
}

/**
 * Get a human-readable description of the schedule
 */
export function getScheduleDescription(
  schedule: ScheduledBackupSchedule,
  hour: number,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null
): string {
  const timeStr = formatHour(hour);
  
  switch (schedule) {
    case 'daily':
      return `Daily at ${timeStr}`;
    
    case 'weekly': {
      const dayName = DAY_OF_WEEK_LABELS[dayOfWeek ?? 0] ?? 'Sunday';
      return `Every ${dayName} at ${timeStr}`;
    }
    
    case 'monthly': {
      const day = dayOfMonth ?? 1;
      const suffix = getOrdinalSuffix(day);
      return `Monthly on the ${day}${suffix} at ${timeStr}`;
    }
  }
}

/**
 * Format a date for display
 */
export function formatScheduleDate(dateString: string | null): string {
  if (!dateString) return 'Never';
  
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

/**
 * Check if a scheduled backup is overdue (should have run but hasn't)
 */
export function isOverdue(nextRunAt: string | null): boolean {
  if (!nextRunAt) return false;
  return new Date(nextRunAt) < new Date();
}

