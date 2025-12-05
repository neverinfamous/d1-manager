/**
 * Scheduled Backup Routes
 * 
 * CRUD API for managing scheduled backup configurations.
 * Supports creating, updating, deleting, and listing backup schedules.
 */

import type { Env, ScheduledBackup, ScheduledBackupInput, ScheduledBackupSchedule } from '../types';
import { logInfo, logWarning } from '../utils/error-logger';
import {
  calculateNextRunAt,
  validateScheduleParams,
  generateScheduleId,
  getScheduleDescription
} from '../utils/scheduled-backups';

type CorsHeaders = HeadersInit;

// Helper to create response headers with CORS
function jsonHeaders(corsHeaders: CorsHeaders): Headers {
  const headers = new Headers(corsHeaders);
  headers.set('Content-Type', 'application/json');
  return headers;
}

/**
 * Get current ISO timestamp
 */
function nowISO(): string {
  return new Date().toISOString();
}

/**
 * JSON response helper
 */
function jsonResponse(
  data: unknown,
  corsHeaders: CorsHeaders,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: jsonHeaders(corsHeaders),
  });
}

/**
 * Error response helper
 */
function errorResponse(
  message: string,
  corsHeaders: CorsHeaders,
  status = 500
): Response {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: jsonHeaders(corsHeaders),
  });
}

/**
 * Parse JSON body safely
 */
async function parseJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return await request.json() as T;
  } catch {
    return null;
  }
}

/**
 * Mock schedules for local development
 */
const MOCK_SCHEDULES: ScheduledBackup[] = [
  {
    id: 'sched_mock_1',
    database_id: 'mock-db-1',
    database_name: 'production-db',
    schedule: 'daily',
    day_of_week: null,
    day_of_month: null,
    hour: 2,
    enabled: 1,
    last_run_at: new Date(Date.now() - 86400000).toISOString(),
    next_run_at: new Date(Date.now() + 43200000).toISOString(),
    last_job_id: 'scheduled_backup-abc123',
    last_status: 'success',
    created_at: new Date(Date.now() - 604800000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    created_by: 'dev@localhost'
  },
  {
    id: 'sched_mock_2',
    database_id: 'mock-db-2',
    database_name: 'staging-db',
    schedule: 'weekly',
    day_of_week: 0,
    day_of_month: null,
    hour: 3,
    enabled: 1,
    last_run_at: null,
    next_run_at: new Date(Date.now() + 259200000).toISOString(),
    last_job_id: null,
    last_status: null,
    created_at: new Date(Date.now() - 172800000).toISOString(),
    updated_at: new Date(Date.now() - 172800000).toISOString(),
    created_by: 'dev@localhost'
  }
];

/**
 * Handle scheduled backup routes
 */
export async function handleScheduledBackupRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean,
  userEmail: string
): Promise<Response | null> {
  const method = request.method;
  const path = url.pathname;

  // GET /api/scheduled-backups - List all schedules
  if (method === 'GET' && path === '/api/scheduled-backups') {
    return listSchedules(env, corsHeaders, isLocalDev, userEmail);
  }

  // POST /api/scheduled-backups - Create or update schedule
  if (method === 'POST' && path === '/api/scheduled-backups') {
    return createOrUpdateSchedule(request, env, corsHeaders, isLocalDev, userEmail);
  }

  // GET /api/scheduled-backups/:databaseId - Get schedule for specific database
  const singleMatch = /^\/api\/scheduled-backups\/([^/]+)$/.exec(path);
  if (method === 'GET' && singleMatch) {
    const databaseId = singleMatch[1];
    if (!databaseId) {
      return errorResponse('Database ID required', corsHeaders, 400);
    }
    return getSchedule(databaseId, env, corsHeaders, isLocalDev, userEmail);
  }

  // DELETE /api/scheduled-backups/:databaseId - Delete schedule
  if (method === 'DELETE' && singleMatch) {
    const databaseId = singleMatch[1];
    if (!databaseId) {
      return errorResponse('Database ID required', corsHeaders, 400);
    }
    return deleteSchedule(databaseId, env, corsHeaders, isLocalDev, userEmail);
  }

  // PUT /api/scheduled-backups/:databaseId/toggle - Toggle enabled/disabled
  const toggleMatch = /^\/api\/scheduled-backups\/([^/]+)\/toggle$/.exec(path);
  if (method === 'PUT' && toggleMatch) {
    const databaseId = toggleMatch[1];
    if (!databaseId) {
      return errorResponse('Database ID required', corsHeaders, 400);
    }
    return toggleSchedule(databaseId, env, corsHeaders, isLocalDev, userEmail);
  }

  // Route not matched
  return null;
}

/**
 * List all scheduled backups
 */
async function listSchedules(
  env: Env,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean,
  userEmail: string
): Promise<Response> {
  logInfo('Listing scheduled backups', {
    module: 'scheduled_backups',
    operation: 'list',
    userId: userEmail
  });

  if (isLocalDev) {
    return jsonResponse({
      success: true,
      result: MOCK_SCHEDULES.map(s => ({
        ...s,
        schedule_description: getScheduleDescription(
          s.schedule,
          s.hour,
          s.day_of_week,
          s.day_of_month
        )
      }))
    }, corsHeaders);
  }

  try {
    const result = await env.METADATA.prepare(
      'SELECT * FROM scheduled_backups ORDER BY created_at DESC'
    ).all<ScheduledBackup>();

    // Add human-readable schedule description
    const schedulesWithDesc = result.results.map(s => ({
      ...s,
      schedule_description: getScheduleDescription(
        s.schedule as ScheduledBackupSchedule,
        s.hour,
        s.day_of_week,
        s.day_of_month
      )
    }));

    return jsonResponse({ success: true, result: schedulesWithDesc }, corsHeaders);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logWarning(`List error: ${errorMessage}`, {
      module: 'scheduled_backups',
      operation: 'list',
      userId: userEmail
    });

    // Check for missing table error
    if (errorMessage.includes('no such table')) {
      return jsonResponse({ success: true, result: [] }, corsHeaders);
    }

    return errorResponse('Failed to list scheduled backups', corsHeaders, 500);
  }
}

/**
 * Get schedule for a specific database
 */
async function getSchedule(
  databaseId: string,
  env: Env,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean,
  userEmail: string
): Promise<Response> {
  logInfo(`Getting schedule for database: ${databaseId}`, {
    module: 'scheduled_backups',
    operation: 'get',
    databaseId,
    userId: userEmail
  });

  if (isLocalDev) {
    const schedule = MOCK_SCHEDULES.find(s => s.database_id === databaseId);
    if (!schedule) {
      return jsonResponse({ success: true, result: null }, corsHeaders);
    }
    return jsonResponse({
      success: true,
      result: {
        ...schedule,
        schedule_description: getScheduleDescription(
          schedule.schedule,
          schedule.hour,
          schedule.day_of_week,
          schedule.day_of_month
        )
      }
    }, corsHeaders);
  }

  try {
    const schedule = await env.METADATA.prepare(
      'SELECT * FROM scheduled_backups WHERE database_id = ?'
    ).bind(databaseId).first<ScheduledBackup>();

    if (!schedule) {
      return jsonResponse({ success: true, result: null }, corsHeaders);
    }

    return jsonResponse({
      success: true,
      result: {
        ...schedule,
        schedule_description: getScheduleDescription(
          schedule.schedule as ScheduledBackupSchedule,
          schedule.hour,
          schedule.day_of_week,
          schedule.day_of_month
        )
      }
    }, corsHeaders);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logWarning(`Get error: ${errorMessage}`, {
      module: 'scheduled_backups',
      operation: 'get',
      databaseId,
      userId: userEmail
    });

    if (errorMessage.includes('no such table')) {
      return jsonResponse({ success: true, result: null }, corsHeaders);
    }

    return errorResponse('Failed to get schedule', corsHeaders, 500);
  }
}

/**
 * Create or update a scheduled backup
 */
async function createOrUpdateSchedule(
  request: Request,
  env: Env,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean,
  userEmail: string
): Promise<Response> {
  const body = await parseJsonBody<ScheduledBackupInput>(request);
  if (!body) {
    return errorResponse('Invalid request body', corsHeaders, 400);
  }

  const {
    database_id,
    database_name,
    schedule,
    day_of_week,
    day_of_month,
    hour = 0,
    enabled = true
  } = body;

  // Validate required fields
  if (!database_id || !database_name || !schedule) {
    return errorResponse('database_id, database_name, and schedule are required', corsHeaders, 400);
  }

  // Validate schedule type
  if (!['daily', 'weekly', 'monthly'].includes(schedule)) {
    return errorResponse('schedule must be daily, weekly, or monthly', corsHeaders, 400);
  }

  // Validate schedule parameters
  const validationError = validateScheduleParams(
    schedule as ScheduledBackupSchedule,
    hour,
    day_of_week,
    day_of_month
  );
  if (validationError) {
    return errorResponse(validationError, corsHeaders, 400);
  }

  logInfo(`Creating/updating schedule for database: ${database_id}`, {
    module: 'scheduled_backups',
    operation: 'upsert',
    databaseId: database_id,
    userId: userEmail,
    metadata: { schedule, hour, day_of_week, day_of_month }
  });

  // Calculate next run time
  const nextRunAt = calculateNextRunAt(
    schedule as ScheduledBackupSchedule,
    hour,
    day_of_week,
    day_of_month
  );

  if (isLocalDev) {
    const existingIndex = MOCK_SCHEDULES.findIndex(s => s.database_id === database_id);
    const newSchedule: ScheduledBackup = {
      id: existingIndex >= 0 ? MOCK_SCHEDULES[existingIndex]?.id ?? generateScheduleId() : generateScheduleId(),
      database_id,
      database_name,
      schedule: schedule as ScheduledBackupSchedule,
      day_of_week: schedule === 'weekly' ? (day_of_week ?? 0) : null,
      day_of_month: schedule === 'monthly' ? (day_of_month ?? 1) : null,
      hour,
      enabled: enabled ? 1 : 0,
      last_run_at: existingIndex >= 0 ? MOCK_SCHEDULES[existingIndex]?.last_run_at ?? null : null,
      next_run_at: nextRunAt,
      last_job_id: existingIndex >= 0 ? MOCK_SCHEDULES[existingIndex]?.last_job_id ?? null : null,
      last_status: existingIndex >= 0 ? MOCK_SCHEDULES[existingIndex]?.last_status ?? null : null,
      created_at: existingIndex >= 0 ? MOCK_SCHEDULES[existingIndex]?.created_at ?? nowISO() : nowISO(),
      updated_at: nowISO(),
      created_by: userEmail
    };

    if (existingIndex >= 0) {
      MOCK_SCHEDULES[existingIndex] = newSchedule;
    } else {
      MOCK_SCHEDULES.unshift(newSchedule);
    }

    return jsonResponse({
      success: true,
      result: {
        ...newSchedule,
        schedule_description: getScheduleDescription(
          newSchedule.schedule,
          newSchedule.hour,
          newSchedule.day_of_week,
          newSchedule.day_of_month
        )
      }
    }, corsHeaders, existingIndex >= 0 ? 200 : 201);
  }

  try {
    const now = nowISO();

    // Check if schedule exists for this database
    const existing = await env.METADATA.prepare(
      'SELECT id FROM scheduled_backups WHERE database_id = ?'
    ).bind(database_id).first<{ id: string }>();

    if (existing) {
      // Update existing schedule
      await env.METADATA.prepare(`
        UPDATE scheduled_backups SET
          database_name = ?,
          schedule = ?,
          day_of_week = ?,
          day_of_month = ?,
          hour = ?,
          enabled = ?,
          next_run_at = ?,
          updated_at = ?
        WHERE database_id = ?
      `).bind(
        database_name,
        schedule,
        schedule === 'weekly' ? (day_of_week ?? 0) : null,
        schedule === 'monthly' ? (day_of_month ?? 1) : null,
        hour,
        enabled ? 1 : 0,
        nextRunAt,
        now,
        database_id
      ).run();

      logInfo(`Updated schedule for database: ${database_id}`, {
        module: 'scheduled_backups',
        operation: 'update',
        databaseId: database_id,
        userId: userEmail
      });
    } else {
      // Create new schedule
      const scheduleId = generateScheduleId();
      await env.METADATA.prepare(`
        INSERT INTO scheduled_backups (
          id, database_id, database_name, schedule,
          day_of_week, day_of_month, hour, enabled,
          next_run_at, created_at, updated_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        scheduleId,
        database_id,
        database_name,
        schedule,
        schedule === 'weekly' ? (day_of_week ?? 0) : null,
        schedule === 'monthly' ? (day_of_month ?? 1) : null,
        hour,
        enabled ? 1 : 0,
        nextRunAt,
        now,
        now,
        userEmail
      ).run();

      logInfo(`Created schedule for database: ${database_id}`, {
        module: 'scheduled_backups',
        operation: 'create',
        databaseId: database_id,
        userId: userEmail
      });
    }

    // Fetch and return the schedule
    const result = await env.METADATA.prepare(
      'SELECT * FROM scheduled_backups WHERE database_id = ?'
    ).bind(database_id).first<ScheduledBackup>();

    return jsonResponse({
      success: true,
      result: result ? {
        ...result,
        schedule_description: getScheduleDescription(
          result.schedule as ScheduledBackupSchedule,
          result.hour,
          result.day_of_week,
          result.day_of_month
        )
      } : null
    }, corsHeaders, existing ? 200 : 201);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logWarning(`Create/update error: ${errorMessage}`, {
      module: 'scheduled_backups',
      operation: 'upsert',
      databaseId: database_id,
      userId: userEmail
    });

    return errorResponse('Failed to save schedule', corsHeaders, 500);
  }
}

/**
 * Delete a scheduled backup
 */
async function deleteSchedule(
  databaseId: string,
  env: Env,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean,
  userEmail: string
): Promise<Response> {
  logInfo(`Deleting schedule for database: ${databaseId}`, {
    module: 'scheduled_backups',
    operation: 'delete',
    databaseId,
    userId: userEmail
  });

  if (isLocalDev) {
    const index = MOCK_SCHEDULES.findIndex(s => s.database_id === databaseId);
    if (index >= 0) {
      MOCK_SCHEDULES.splice(index, 1);
    }
    return jsonResponse({ success: true }, corsHeaders);
  }

  try {
    await env.METADATA.prepare(
      'DELETE FROM scheduled_backups WHERE database_id = ?'
    ).bind(databaseId).run();

    return jsonResponse({ success: true }, corsHeaders);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logWarning(`Delete error: ${errorMessage}`, {
      module: 'scheduled_backups',
      operation: 'delete',
      databaseId,
      userId: userEmail
    });

    return errorResponse('Failed to delete schedule', corsHeaders, 500);
  }
}

/**
 * Toggle a schedule's enabled status
 */
async function toggleSchedule(
  databaseId: string,
  env: Env,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean,
  userEmail: string
): Promise<Response> {
  logInfo(`Toggling schedule for database: ${databaseId}`, {
    module: 'scheduled_backups',
    operation: 'toggle',
    databaseId,
    userId: userEmail
  });

  if (isLocalDev) {
    const schedule = MOCK_SCHEDULES.find(s => s.database_id === databaseId);
    if (!schedule) {
      return errorResponse('Schedule not found', corsHeaders, 404);
    }
    schedule.enabled = schedule.enabled === 1 ? 0 : 1;
    schedule.updated_at = nowISO();
    return jsonResponse({
      success: true,
      result: {
        ...schedule,
        schedule_description: getScheduleDescription(
          schedule.schedule,
          schedule.hour,
          schedule.day_of_week,
          schedule.day_of_month
        )
      }
    }, corsHeaders);
  }

  try {
    // Get current state
    const current = await env.METADATA.prepare(
      'SELECT enabled FROM scheduled_backups WHERE database_id = ?'
    ).bind(databaseId).first<{ enabled: number }>();

    if (!current) {
      return errorResponse('Schedule not found', corsHeaders, 404);
    }

    const newEnabled = current.enabled === 1 ? 0 : 1;
    const now = nowISO();

    await env.METADATA.prepare(`
      UPDATE scheduled_backups SET enabled = ?, updated_at = ?
      WHERE database_id = ?
    `).bind(newEnabled, now, databaseId).run();

    // Return updated schedule
    const result = await env.METADATA.prepare(
      'SELECT * FROM scheduled_backups WHERE database_id = ?'
    ).bind(databaseId).first<ScheduledBackup>();

    return jsonResponse({
      success: true,
      result: result ? {
        ...result,
        schedule_description: getScheduleDescription(
          result.schedule as ScheduledBackupSchedule,
          result.hour,
          result.day_of_week,
          result.day_of_month
        )
      } : null
    }, corsHeaders);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logWarning(`Toggle error: ${errorMessage}`, {
      module: 'scheduled_backups',
      operation: 'toggle',
      databaseId,
      userId: userEmail
    });

    return errorResponse('Failed to toggle schedule', corsHeaders, 500);
  }
}

