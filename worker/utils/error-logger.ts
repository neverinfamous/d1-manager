/**
 * Centralized Error Logging System
 * 
 * Provides structured error logging with consistent format across all modules.
 * Integrates with webhooks to automatically notify external systems of critical errors.
 */

import type { Env, ErrorContext, ErrorSeverity, StructuredError } from '../types';
import { triggerWebhooks, createJobFailedPayload } from './webhooks';

/**
 * Generate current ISO timestamp
 */
function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Error code prefixes by module
 */
const ERROR_CODE_PREFIXES: Record<string, string> = {
  databases: 'DB',
  tables: 'TBL',
  queries: 'QRY',
  saved_queries: 'SQ',
  fts5: 'FTS',
  jobs: 'JOB',
  undo: 'UNDO',
  indexes: 'IDX',
  colors: 'CLR',
  webhooks: 'WHK',
  auth: 'AUTH',
  time_travel: 'TT',
  worker: 'WRK',
  session: 'SESS',
  db_tracking: 'DBT',
  database_tracking: 'DBT',
  db_protection: 'DBP',
  database_protection: 'DBP',
  r2_backup: 'R2B',
  backup_do: 'BDO',
  health: 'HLTH',
  ai_search: 'AIS',
};

/**
 * Generate an error code from context with appropriate suffix based on severity
 */
function generateErrorCode(context: ErrorContext, level: ErrorSeverity): string {
  const prefix = ERROR_CODE_PREFIXES[context.module] ?? 'ERR';
  const operation = context.operation.toUpperCase().replace(/[^A-Z0-9]/g, '_');

  // Use appropriate suffix based on severity level
  switch (level) {
    case 'error':
      return `${prefix}_${operation}_FAILED`;
    case 'warning':
      return `${prefix}_${operation}_WARN`;
    case 'info':
      return `${prefix}_${operation}`;
  }
}

/**
 * Format error for console logging with structured output
 */
function formatForConsole(error: StructuredError): string {
  const parts = [
    `[${error.level.toUpperCase()}]`,
    `[${error.context.module}]`,
    `[${error.code}]`,
    error.message,
  ];

  if (error.context.databaseId) {
    parts.push(`(db: ${error.context.databaseId})`);
  }

  return parts.join(' ');
}

/**
 * Create a structured error object
 */
export function createStructuredError(
  error: Error | string,
  context: ErrorContext,
  level: ErrorSeverity = 'error'
): StructuredError {
  const message = error instanceof Error ? error.message : error;
  const stack = error instanceof Error ? error.stack : undefined;

  return {
    timestamp: nowISO(),
    level,
    code: generateErrorCode(context, level),
    message,
    context,
    stack,
  };
}

/**
 * Log an error with structured format
 * Automatically triggers webhooks for error-level logs
 */
export async function logError(
  env: Env,
  error: Error | string,
  context: ErrorContext,
  isLocalDev: boolean,
  options: {
    triggerWebhook?: boolean;
    jobId?: string;
  } = {}
): Promise<StructuredError> {
  const structuredError = createStructuredError(error, context, 'error');

  // Log to console with structured format
  console.error(formatForConsole(structuredError));
  if (structuredError.stack) {
    console.error('[Stack]', structuredError.stack);
  }

  // Log metadata if present
  if (context.metadata && Object.keys(context.metadata).length > 0) {
    console.error('[Metadata]', JSON.stringify(context.metadata));
  }

  // Trigger webhook for job failures
  if (options.triggerWebhook !== false && options.jobId) {
    try {
      await triggerWebhooks(
        env,
        'job_failed',
        createJobFailedPayload(
          options.jobId,
          context.operation,
          structuredError.message,
          context.databaseId ?? null,
          context.userId ?? null
        ),
        isLocalDev
      );
    } catch (webhookError) {
      console.error('[ErrorLogger] Failed to trigger webhook:', webhookError);
    }
  }

  return structuredError;
}

/**
 * Log a warning with structured format
 */
export function logWarning(
  message: string,
  context: ErrorContext
): StructuredError {
  const structuredError = createStructuredError(message, context, 'warning');

  console.warn(formatForConsole(structuredError));

  if (context.metadata && Object.keys(context.metadata).length > 0) {
    console.warn('[Metadata]', JSON.stringify(context.metadata));
  }

  return structuredError;
}

/**
 * Log an info message with structured format
 */
export function logInfo(
  message: string,
  context: ErrorContext
): StructuredError {
  const structuredError = createStructuredError(message, context, 'info');

  console.log(formatForConsole(structuredError));

  return structuredError;
}

/**
 * Format error for webhook payload
 */
export function formatErrorForWebhook(error: StructuredError): Record<string, unknown> {
  return {
    timestamp: error.timestamp,
    level: error.level,
    code: error.code,
    message: error.message,
    module: error.context.module,
    operation: error.context.operation,
    database_id: error.context.databaseId,
    user_id: error.context.userId,
    metadata: error.context.metadata,
  };
}

/**
 * Create error context helper
 */
export function createErrorContext(
  module: string,
  operation: string,
  options: {
    databaseId?: string;
    databaseName?: string;
    userId?: string;
    metadata?: Record<string, unknown>;
  } = {}
): ErrorContext {
  return {
    module,
    operation,
    ...options,
  };
}

/**
 * Wrap an async operation with error logging
 * Logs errors and optionally triggers webhooks on failure
 */
export async function withErrorLogging<T>(
  env: Env,
  context: ErrorContext,
  isLocalDev: boolean,
  operation: () => Promise<T>,
  options: {
    triggerWebhook?: boolean;
    jobId?: string;
    rethrow?: boolean;
  } = {}
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    const logOptions: { triggerWebhook?: boolean; jobId?: string } = {};
    if (options.triggerWebhook !== undefined) {
      logOptions.triggerWebhook = options.triggerWebhook;
    }
    if (options.jobId !== undefined) {
      logOptions.jobId = options.jobId;
    }

    await logError(
      env,
      error instanceof Error ? error : String(error),
      context,
      isLocalDev,
      logOptions
    );

    if (options.rethrow !== false) {
      throw error;
    }

    return null;
  }
}

