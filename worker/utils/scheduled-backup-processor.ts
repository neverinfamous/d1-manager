/**
 * Scheduled Backup Processor
 * 
 * Handles the execution of scheduled backups when triggered by cron.
 * Queries the scheduled_backups table for due backups and triggers
 * the backup process via BackupDO.
 */

import type { Env, ScheduledBackup, ScheduledBackupSchedule } from '../types';
import { logInfo, logError, logWarning } from './error-logger';
import { calculateNextRunAt } from './scheduled-backups';
import { generateJobId, createJob, completeJob } from '../routes/jobs';
import { OperationType } from './job-tracking';

/**
 * Process all due scheduled backups
 */
export async function processScheduledBackups(env: Env): Promise<void> {
  const isLocalDev = !env.BACKUP_BUCKET || !env.BACKUP_DO;
  
  logInfo('Starting scheduled backup processing', {
    module: 'scheduled_backup_processor',
    operation: 'start'
  });

  if (isLocalDev) {
    logInfo('Skipping scheduled backups - R2 not configured', {
      module: 'scheduled_backup_processor',
      operation: 'skip'
    });
    return;
  }

  try {
    const db = env.METADATA;
    const now = new Date().toISOString();

    // Query for due schedules
    const dueSchedules = await db.prepare(`
      SELECT * FROM scheduled_backups 
      WHERE enabled = 1 
        AND next_run_at IS NOT NULL 
        AND next_run_at <= ?
      ORDER BY next_run_at ASC
    `).bind(now).all<ScheduledBackup>();

    if (dueSchedules.results.length === 0) {
      logInfo('No scheduled backups due', {
        module: 'scheduled_backup_processor',
        operation: 'check'
      });
      return;
    }

    logInfo(`Found ${String(dueSchedules.results.length)} scheduled backup(s) due`, {
      module: 'scheduled_backup_processor',
      operation: 'check',
      metadata: { count: dueSchedules.results.length }
    });

    // Process each due schedule
    for (const schedule of dueSchedules.results) {
      await processSchedule(schedule, env, isLocalDev);
    }

  } catch (error) {
    void logError(env, error instanceof Error ? error : String(error), {
      module: 'scheduled_backup_processor',
      operation: 'process'
    }, isLocalDev);
  }
}

/**
 * Process a single scheduled backup
 */
async function processSchedule(
  schedule: ScheduledBackup,
  env: Env,
  isLocalDev: boolean
): Promise<void> {
  const db = env.METADATA;
  const { database_id, database_name, schedule: scheduleType, hour, day_of_week, day_of_month } = schedule;

  logInfo(`Processing scheduled backup for: ${database_name}`, {
    module: 'scheduled_backup_processor',
    operation: 'process_schedule',
    databaseId: database_id,
    databaseName: database_name,
    metadata: { scheduleId: schedule.id }
  });

  // Create job for tracking (as "Scheduled Backup" / scheduled_backup operation type)
  let jobId: string | undefined;
  try {
    jobId = generateJobId(OperationType.SCHEDULED_BACKUP);
    await createJob(db, {
      jobId,
      databaseId: database_id,
      operationType: OperationType.SCHEDULED_BACKUP,
      totalItems: 100,
      userEmail: 'system',
      metadata: {
        databaseName: database_name,
        schedule: scheduleType,
        scheduledTime: schedule.next_run_at
      }
    });
  } catch (err) {
    logWarning(`Failed to create job for scheduled backup: ${err instanceof Error ? err.message : String(err)}`, {
      module: 'scheduled_backup_processor',
      operation: 'create_job',
      databaseId: database_id
    });
    // Continue even if job creation fails
  }

  try {
    // Start backup via BackupDO
    if (env.BACKUP_DO) {
      const doId = env.BACKUP_DO.idFromName(jobId ?? `scheduled-${database_id}-${Date.now()}`);
      const stub = env.BACKUP_DO.get(doId);

      const doRequest = new Request('https://do/process/database-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          databaseId: database_id,
          databaseName: database_name,
          source: 'scheduled',
          userEmail: 'system'
        })
      });

      // Wait for the DO to complete (or at least start processing)
      const doResponse = await stub.fetch(doRequest);

      if (!doResponse.ok) {
        const responseText = await doResponse.text();
        throw new Error(`Backup DO failed: ${doResponse.status} - ${responseText}`);
      }

      logInfo(`Scheduled backup started for: ${database_name}`, {
        module: 'scheduled_backup_processor',
        operation: 'backup_started',
        databaseId: database_id,
        metadata: { jobId }
      });
    }

    // Calculate next run time
    const nextRunAt = calculateNextRunAt(
      scheduleType as ScheduledBackupSchedule,
      hour,
      day_of_week,
      day_of_month
    );

    // Update schedule with last run info and next run time
    await db.prepare(`
      UPDATE scheduled_backups SET
        last_run_at = ?,
        next_run_at = ?,
        last_job_id = ?,
        last_status = 'success',
        updated_at = ?
      WHERE id = ?
    `).bind(
      new Date().toISOString(),
      nextRunAt,
      jobId ?? null,
      new Date().toISOString(),
      schedule.id
    ).run();

    logInfo(`Scheduled backup completed for: ${database_name}`, {
      module: 'scheduled_backup_processor',
      operation: 'completed',
      databaseId: database_id,
      metadata: { jobId, nextRunAt }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    void logError(env, error instanceof Error ? error : String(error), {
      module: 'scheduled_backup_processor',
      operation: 'backup_failed',
      databaseId: database_id,
      databaseName: database_name,
      metadata: { scheduleId: schedule.id }
    }, isLocalDev);

    // Mark job as failed
    if (jobId) {
      try {
        await completeJob(db, {
          jobId,
          status: 'failed',
          processedItems: 0,
          errorCount: 1,
          userEmail: 'system',
          errorMessage
        });
      } catch {
        // Ignore errors in failure reporting
      }
    }

    // Calculate next run time even on failure (don't skip future runs)
    const nextRunAt = calculateNextRunAt(
      scheduleType as ScheduledBackupSchedule,
      hour,
      day_of_week,
      day_of_month
    );

    // Update schedule with failure status
    try {
      await db.prepare(`
        UPDATE scheduled_backups SET
          last_run_at = ?,
          next_run_at = ?,
          last_job_id = ?,
          last_status = 'failed',
          updated_at = ?
        WHERE id = ?
      `).bind(
        new Date().toISOString(),
        nextRunAt,
        jobId ?? null,
        new Date().toISOString(),
        schedule.id
      ).run();
    } catch {
      // Ignore errors in status update
    }
  }
}

