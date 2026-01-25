/**
 * Job Tracking Utility Module
 * Centralizes job creation, progress tracking, and completion logic
 * for all major user operations in D1 Manager.
 *
 * Integrates with webhooks to notify external systems of job failures
 * and batch operation completions.
 */

import type { Env } from "../types";
import {
  triggerWebhooks,
  createJobFailedPayload,
  createBatchCompletePayload,
} from "./webhooks";
import { logWarning } from "./error-logger";

// Re-export job functions from routes/jobs.ts for convenience
export {
  generateJobId,
  createJob,
  updateJobProgress,
  completeJob,
  logJobEvent,
} from "../routes/jobs";

/**
 * Operation type constants for job tracking
 * Organized by category for easier maintenance
 */
export const OperationType = {
  // Database operations
  DATABASE_CREATE: "database_create",
  DATABASE_DELETE: "database_delete",
  DATABASE_RENAME: "database_rename",
  DATABASE_EXPORT: "database_export",
  DATABASE_IMPORT: "database_import",
  DATABASE_OPTIMIZE: "database_optimize",

  // Table operations
  TABLE_CREATE: "table_create",
  TABLE_DELETE: "table_delete",
  TABLE_RENAME: "table_rename",
  TABLE_CLONE: "table_clone",
  TABLE_EXPORT: "table_export",
  TABLE_STRICT: "table_strict",
  ROW_DELETE: "row_delete",

  // Column operations
  COLUMN_ADD: "column_add",
  COLUMN_RENAME: "column_rename",
  COLUMN_MODIFY: "column_modify",
  COLUMN_DELETE: "column_delete",

  // Foreign key operations
  FOREIGN_KEY_ADD: "foreign_key_add",
  FOREIGN_KEY_MODIFY: "foreign_key_modify",
  FOREIGN_KEY_DELETE: "foreign_key_delete",

  // FTS5 operations
  FTS5_CREATE: "fts5_create",
  FTS5_CREATE_FROM_TABLE: "fts5_create_from_table",
  FTS5_DELETE: "fts5_delete",
  FTS5_REBUILD: "fts5_rebuild",
  FTS5_OPTIMIZE: "fts5_optimize",

  // Index operations
  INDEX_CREATE: "index_create",

  // Constraint operations
  CONSTRAINT_FIX: "constraint_fix",

  // Undo operations
  UNDO_RESTORE: "undo_restore",

  // R2 Backup operations
  R2_BACKUP: "r2_backup",
  R2_TABLE_BACKUP: "r2_table_backup",
  R2_RESTORE: "r2_restore",
  R2_BACKUP_DELETE: "r2_backup_delete",

  // Scheduled backup operations
  SCHEDULED_BACKUP: "scheduled_backup",
} as const;

export type OperationTypeValue =
  (typeof OperationType)[keyof typeof OperationType];

/**
 * Parameters for tracking an operation
 */
export interface TrackOperationParams<T> {
  /** Worker environment bindings */
  env: Env;
  /** Type of operation being performed */
  operationType: OperationTypeValue;
  /** ID of the database being operated on */
  databaseId: string;
  /** Email of the user performing the operation */
  userEmail: string;
  /** Whether running in local development mode */
  isLocalDev: boolean;
  /** Additional metadata to store with the job */
  metadata?: Record<string, unknown>;
  /** Total number of items being processed (optional) */
  totalItems?: number;
  /** The operation to execute */
  operation: () => Promise<T>;
  /** Whether to trigger webhooks on failure (default: true) */
  triggerWebhookOnFailure?: boolean;
}

/**
 * Result of a tracked operation
 */
export interface TrackOperationResult<T> {
  /** Result of the operation */
  result: T;
  /** Job ID if tracking was enabled */
  jobId?: string;
}

/**
 * Wrapper function for tracking operations with job history
 * Handles job creation, execution, and completion automatically
 *
 * @example
 * ```typescript
 * const { result, jobId } = await trackOperation({
 *   db: env.METADATA,
 *   operationType: OperationType.TABLE_CREATE,
 *   databaseId: dbId,
 *   userEmail: 'user@example.com',
 *   isLocalDev: false,
 *   metadata: { tableName: 'users' },
 *   operation: async () => {
 *     // Create the table
 *     return await createTable(dbId, tableDef);
 *   }
 * });
 * ```
 */
export async function trackOperation<T>(
  params: TrackOperationParams<T>,
): Promise<TrackOperationResult<T>> {
  const {
    env,
    operationType,
    databaseId,
    userEmail,
    isLocalDev,
    metadata,
    totalItems = 1,
    operation,
    triggerWebhookOnFailure = true,
  } = params;

  const db = env.METADATA;

  // Import dynamically to avoid circular dependencies
  const { generateJobId, createJob, completeJob } =
    await import("../routes/jobs");

  let jobId: string | undefined;

  // Create job record if not in local dev
  if (!isLocalDev) {
    try {
      jobId = generateJobId(operationType);
      const createParams: {
        jobId: string;
        databaseId: string;
        operationType: string;
        totalItems?: number;
        userEmail: string;
        metadata?: Record<string, unknown>;
      } = {
        jobId,
        databaseId,
        operationType,
        totalItems,
        userEmail,
      };
      if (metadata) {
        createParams.metadata = metadata;
      }
      await createJob(db, createParams);
    } catch (err) {
      logWarning(
        `Failed to create job record for ${operationType}: ${err instanceof Error ? err.message : String(err)}`,
        {
          module: "job_tracking",
          operation: "create_job",
          databaseId,
          userId: userEmail,
          metadata: {
            operationType,
            error: err instanceof Error ? err.message : String(err),
          },
        },
      );
      // Continue with operation even if job tracking fails
    }
  }

  try {
    // Execute the operation
    const result = await operation();

    // Mark job as completed
    if (jobId) {
      try {
        await completeJob(db, {
          jobId,
          status: "completed",
          processedItems: totalItems,
          errorCount: 0,
          userEmail,
        });
      } catch (err) {
        logWarning(
          `Failed to complete job record for ${operationType}: ${err instanceof Error ? err.message : String(err)}`,
          {
            module: "job_tracking",
            operation: "complete_job",
            databaseId,
            userId: userEmail,
            metadata: {
              operationType,
              jobId,
              error: err instanceof Error ? err.message : String(err),
            },
          },
        );
      }
    }

    return { result, jobId } as TrackOperationResult<T>;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    // Mark job as failed
    if (jobId) {
      try {
        await completeJob(db, {
          jobId,
          status: "failed",
          processedItems: 0,
          errorCount: 1,
          userEmail,
          errorMessage,
        });
      } catch (jobErr) {
        logWarning(
          `Failed to mark job as failed for ${operationType}: ${jobErr instanceof Error ? jobErr.message : String(jobErr)}`,
          {
            module: "job_tracking",
            operation: "fail_job",
            databaseId,
            userId: userEmail,
            metadata: {
              operationType,
              jobId,
              error: jobErr instanceof Error ? jobErr.message : String(jobErr),
            },
          },
        );
      }
    }

    // Trigger job_failed webhook
    if (triggerWebhookOnFailure && jobId) {
      try {
        await triggerWebhooks(
          env,
          "job_failed",
          createJobFailedPayload(
            jobId,
            operationType,
            errorMessage,
            databaseId,
            userEmail,
          ),
          isLocalDev,
        );
      } catch (webhookErr) {
        logWarning(
          `Failed to trigger job_failed webhook: ${webhookErr instanceof Error ? webhookErr.message : String(webhookErr)}`,
          {
            module: "job_tracking",
            operation: "trigger_webhook",
            databaseId,
            userId: userEmail,
            metadata: {
              operationType,
              jobId,
              error:
                webhookErr instanceof Error
                  ? webhookErr.message
                  : String(webhookErr),
            },
          },
        );
      }
    }

    // Re-throw the original error
    throw err;
  }
}

/**
 * Helper to track a simple operation without wrapping
 * Use this when you need more control over the job lifecycle
 */
export async function startJobTracking(
  env: Env,
  operationType: OperationTypeValue,
  databaseId: string,
  userEmail: string,
  isLocalDev: boolean,
  metadata?: Record<string, unknown>,
  totalItems?: number,
): Promise<string | undefined> {
  const db = env.METADATA;

  if (isLocalDev) {
    return undefined;
  }

  const { generateJobId, createJob } = await import("../routes/jobs");

  try {
    const jobId = generateJobId(operationType);
    const createParams: {
      jobId: string;
      databaseId: string;
      operationType: string;
      totalItems?: number;
      userEmail: string;
      metadata?: Record<string, unknown>;
    } = {
      jobId,
      databaseId,
      operationType,
      userEmail,
    };
    if (totalItems !== undefined) {
      createParams.totalItems = totalItems;
    }
    if (metadata) {
      createParams.metadata = metadata;
    }
    await createJob(db, createParams);
    return jobId;
  } catch (err) {
    logWarning(
      `Failed to start job tracking for ${operationType}: ${err instanceof Error ? err.message : String(err)}`,
      {
        module: "job_tracking",
        operation: "start_tracking",
        databaseId,
        userId: userEmail,
        metadata: {
          operationType,
          error: err instanceof Error ? err.message : String(err),
        },
      },
    );
    return undefined;
  }
}

/**
 * Helper to finish job tracking with optional webhook trigger
 */
export async function finishJobTracking(
  env: Env,
  jobId: string | undefined,
  status: "completed" | "failed" | "cancelled",
  userEmail: string,
  isLocalDev: boolean,
  options: {
    operationType?: string;
    databaseId?: string;
    processedItems?: number;
    errorCount?: number;
    errorMessage?: string;
    triggerWebhook?: boolean;
    totalItems?: number;
    successCount?: number;
    failedCount?: number;
  } = {},
): Promise<void> {
  const db = env.METADATA;

  if (!jobId) {
    return;
  }

  const { completeJob } = await import("../routes/jobs");

  try {
    const completeParams: {
      jobId: string;
      status: "completed" | "failed" | "cancelled";
      processedItems?: number;
      errorCount?: number;
      userEmail: string;
      errorMessage?: string;
    } = {
      jobId,
      status,
      userEmail,
    };
    if (options.processedItems !== undefined) {
      completeParams.processedItems = options.processedItems;
    }
    if (options.errorCount !== undefined) {
      completeParams.errorCount = options.errorCount;
    }
    if (options.errorMessage) {
      completeParams.errorMessage = options.errorMessage;
    }
    await completeJob(db, completeParams);
  } catch (err) {
    logWarning(
      `Failed to finish job tracking: ${err instanceof Error ? err.message : String(err)}`,
      {
        module: "job_tracking",
        operation: "finish_tracking",
        userId: userEmail,
        metadata: {
          jobId,
          status,
          error: err instanceof Error ? err.message : String(err),
        },
      },
    );
  }

  // Trigger webhooks based on status
  if (options.triggerWebhook !== false) {
    try {
      if (status === "failed" && options.operationType) {
        await triggerWebhooks(
          env,
          "job_failed",
          createJobFailedPayload(
            jobId,
            options.operationType,
            options.errorMessage ?? "Unknown error",
            options.databaseId ?? null,
            userEmail,
          ),
          isLocalDev,
        );
      } else if (status === "completed" && options.totalItems !== undefined) {
        // Trigger batch_complete for batch operations
        await triggerWebhooks(
          env,
          "batch_complete",
          createBatchCompletePayload(
            options.operationType ?? "unknown",
            options.totalItems,
            options.successCount ?? options.processedItems ?? 0,
            options.failedCount ?? options.errorCount ?? 0,
            userEmail,
          ),
          isLocalDev,
        );
      }
    } catch (webhookErr) {
      logWarning(
        `Failed to trigger webhook: ${webhookErr instanceof Error ? webhookErr.message : String(webhookErr)}`,
        {
          module: "job_tracking",
          operation: "trigger_webhook",
          userId: userEmail,
          metadata: {
            jobId,
            status,
            error:
              webhookErr instanceof Error
                ? webhookErr.message
                : String(webhookErr),
          },
        },
      );
    }
  }
}
