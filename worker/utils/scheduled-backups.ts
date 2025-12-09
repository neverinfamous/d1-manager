/**
 * Scheduled Backup Utilities
 * 
 * Provides helper functions for calculating next run times
 * and managing scheduled backup execution.
 */

import type { ScheduledBackupSchedule } from '../types';

/**
 * Calculate the next run time based on schedule configuration.
 * 
 * @param schedule - 'daily', 'weekly', or 'monthly'
 * @param hour - Hour of day to run (0-23 UTC)
 * @param dayOfWeek - Day of week for weekly (0=Sunday, 1=Monday, etc.)
 * @param dayOfMonth - Day of month for monthly (1-28)
 * @param fromDate - Base date to calculate from (defaults to now)
 * @returns ISO string of the next scheduled run time
 */
export function calculateNextRunAt(
  schedule: ScheduledBackupSchedule,
  hour: number,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null,
  fromDate?: Date
): string {
  const now = fromDate ?? new Date();
  const next = new Date(now);

  // Set to the target hour, minute 0, second 0
  next.setUTCMinutes(0);
  next.setUTCSeconds(0);
  next.setUTCMilliseconds(0);
  next.setUTCHours(hour);

  switch (schedule) {
    case 'daily': {
      // If we're past today's scheduled time, schedule for tomorrow
      if (next <= now) {
        next.setUTCDate(next.getUTCDate() + 1);
      }
      break;
    }

    case 'weekly': {
      const targetDay = dayOfWeek ?? 0; // Default to Sunday
      const currentDay = next.getUTCDay();
      let daysUntilTarget = targetDay - currentDay;

      // If today is the target day but we're past the scheduled time,
      // or if the target day is earlier in the week, schedule next week
      if (daysUntilTarget < 0 || (daysUntilTarget === 0 && next <= now)) {
        daysUntilTarget += 7;
      }

      next.setUTCDate(next.getUTCDate() + daysUntilTarget);
      break;
    }

    case 'monthly': {
      const targetDayOfMonth = dayOfMonth ?? 1; // Default to 1st
      next.setUTCDate(targetDayOfMonth);

      // If we're past this month's scheduled time, schedule for next month
      if (next <= now) {
        next.setUTCMonth(next.getUTCMonth() + 1);
        next.setUTCDate(targetDayOfMonth);
      }

      // Handle months with fewer days than the target (e.g., Feb 30 -> Feb 28)
      const maxDay = new Date(next.getUTCFullYear(), next.getUTCMonth() + 1, 0).getUTCDate();
      if (targetDayOfMonth > maxDay) {
        next.setUTCDate(maxDay);
      }
      break;
    }
  }

  return next.toISOString();
}

/**
 * Check if a scheduled backup is due to run.
 * 
 * @param nextRunAt - ISO string of the scheduled next run time
 * @param now - Current time (defaults to now)
 * @returns true if the backup should run now
 */
export function isDue(nextRunAt: string | null, now?: Date): boolean {
  if (!nextRunAt) return false;

  const scheduledTime = new Date(nextRunAt);
  const currentTime = now ?? new Date();

  return scheduledTime <= currentTime;
}

/**
 * Get a human-readable description of the schedule.
 * 
 * @param schedule - The schedule type
 * @param hour - Hour of day (0-23 UTC)
 * @param dayOfWeek - Day of week for weekly
 * @param dayOfMonth - Day of month for monthly
 * @returns Human-readable schedule description
 */
export function getScheduleDescription(
  schedule: ScheduledBackupSchedule,
  hour: number,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null
): string {
  const hourStr = hour.toString().padStart(2, '0');
  const timeStr = `${hourStr}:00 UTC`;

  switch (schedule) {
    case 'daily':
      return `Daily at ${timeStr}`;

    case 'weekly': {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = days[dayOfWeek ?? 0];
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
 * Get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
 */
function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? 'th';
}

/**
 * Validate schedule parameters.
 * 
 * @returns Error message if invalid, null if valid
 */
export function validateScheduleParams(
  schedule: ScheduledBackupSchedule,
  hour?: number,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null
): string | null {
  // Validate hour (0-23)
  if (hour !== undefined && (hour < 0 || hour > 23)) {
    return 'Hour must be between 0 and 23';
  }

  // Validate day of week for weekly (0-6)
  if (schedule === 'weekly' && dayOfWeek !== null && dayOfWeek !== undefined) {
    if (dayOfWeek < 0 || dayOfWeek > 6) {
      return 'Day of week must be between 0 (Sunday) and 6 (Saturday)';
    }
  }

  // Validate day of month for monthly (1-28)
  if (schedule === 'monthly' && dayOfMonth !== null && dayOfMonth !== undefined) {
    if (dayOfMonth < 1 || dayOfMonth > 28) {
      return 'Day of month must be between 1 and 28';
    }
  }

  return null;
}

/**
 * Generate a unique ID for scheduled backups
 */
export function generateScheduleId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `sched_${timestamp}_${random}`;
}

