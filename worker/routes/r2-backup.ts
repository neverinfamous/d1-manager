import type { Env, R2BackupListItem, R2BackupSource, BackupJobResponse } from '../types';
import { logError, logInfo, logWarning } from '../utils/error-logger';
import { generateJobId, createJob, completeJob } from './jobs';
import { OperationType } from '../utils/job-tracking';

// Helper to create response headers with CORS
function jsonHeaders(corsHeaders: HeadersInit): Headers {
  const headers = new Headers(corsHeaders);
  headers.set('Content-Type', 'application/json');
  return headers;
}

interface BackupRequestBody {
  source?: R2BackupSource;
  databaseName?: string;
}

interface TableBackupRequestBody {
  tableName?: string;
  format?: 'sql' | 'csv' | 'json';
  source?: R2BackupSource;
  databaseName?: string;
}

interface RestoreRequestBody {
  backupPath?: string;
}

// Type guard to check if R2 backup is configured
function isR2Configured(env: Env): env is Env & { BACKUP_BUCKET: R2Bucket; BACKUP_DO: DurableObjectNamespace } {
  return env.BACKUP_BUCKET !== undefined && env.BACKUP_DO !== undefined;
}

/**
 * Handle R2 backup routes
 */
export async function handleR2BackupRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string,
  ctx: ExecutionContext
): Promise<Response | null> {
  const db = env.METADATA;

  // GET /api/r2-backup/:databaseId/list - List backups for a database
  const listMatch = /^\/api\/r2-backup\/([^/]+)\/list$/.exec(url.pathname);
  if (listMatch !== null && request.method === 'GET') {
    const databaseId = listMatch[1] ?? '';

    logInfo(`Listing R2 backups for database: ${databaseId}`, {
      module: 'r2_backup',
      operation: 'list',
      databaseId,
      userId: userEmail
    });

    // Return mock data for local dev or if BACKUP_BUCKET not configured
    if (isLocalDev || !isR2Configured(env)) {
      const mockBackups: R2BackupListItem[] = [
        {
          path: `backups/${databaseId}/${Date.now() - 86400000}.sql`,
          databaseId,
          databaseName: 'mock-database',
          source: 'manual',
          timestamp: Date.now() - 86400000,
          size: 1024,
          uploaded: new Date(Date.now() - 86400000).toISOString(),
          backupType: 'database'
        },
        {
          path: `backups/${databaseId}/${Date.now() - 172800000}.sql`,
          databaseId,
          databaseName: 'mock-database',
          source: 'rename_database',
          timestamp: Date.now() - 172800000,
          size: 2048,
          uploaded: new Date(Date.now() - 172800000).toISOString(),
          backupType: 'database'
        }
      ];

      return new Response(JSON.stringify({ success: true, result: mockBackups }), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    try {
      // List all backup files for this database
      const prefix = `backups/${databaseId}/`;
      const listed = await env.BACKUP_BUCKET.list({ prefix });

      const backups: R2BackupListItem[] = [];

      for (const obj of listed.objects) {
        // Get metadata from object
        const metadata = obj.customMetadata ?? {};
        
        // Check if this is a table backup (path contains /tables/)
        const isTableBackup = obj.key.includes('/tables/');
        
        // Extract timestamp from filename
        const filename = obj.key.split('/').pop() ?? '';
        const timestamp = parseInt(filename.replace('.sql', ''), 10) || 0;
        
        // For table backups, extract table name from path if not in metadata
        // Path format: backups/{dbId}/tables/{tableName}/{timestamp}.sql
        let extractedTableName = typeof metadata['tableName'] === 'string' ? metadata['tableName'] : undefined;
        if (isTableBackup && !extractedTableName) {
          const pathParts = obj.key.split('/');
          // Find the part after 'tables'
          const tablesIndex = pathParts.indexOf('tables');
          if (tablesIndex >= 0 && tablesIndex + 1 < pathParts.length) {
            extractedTableName = pathParts[tablesIndex + 1];
          }
        }

        const metadataSource = typeof metadata['source'] === 'string' ? metadata['source'] : (isTableBackup ? 'table_backup' : 'manual');
        const backupItem: R2BackupListItem = {
          path: obj.key,
          databaseId: typeof metadata['databaseId'] === 'string' ? metadata['databaseId'] : databaseId,
          databaseName: typeof metadata['databaseName'] === 'string' ? metadata['databaseName'] : '',
          source: metadataSource as R2BackupSource,
          timestamp,
          size: obj.size,
          uploaded: obj.uploaded.toISOString(),
          tableName: extractedTableName,
          tableFormat: typeof metadata['format'] === 'string' 
            ? metadata['format'] as 'sql' | 'csv' | 'json' 
            : undefined,
          backupType: isTableBackup ? 'table' : 'database'
        };

        backups.push(backupItem);
      }

      // Sort by timestamp descending (newest first)
      backups.sort((itemA, itemB) => itemB.timestamp - itemA.timestamp);

      return new Response(JSON.stringify({ success: true, result: backups }), {
        headers: jsonHeaders(corsHeaders)
      });
    } catch (error) {
      void logError(env, error instanceof Error ? error : String(error), {
        module: 'r2_backup',
        operation: 'list',
        databaseId,
        userId: userEmail
      }, isLocalDev);

      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to list backups'
      }), {
        status: 500,
        headers: jsonHeaders(corsHeaders)
      });
    }
  }

  // POST /api/r2-backup/:databaseId/table - Backup a single table
  const tableBackupMatch = /^\/api\/r2-backup\/([^/]+)\/table$/.exec(url.pathname);
  if (tableBackupMatch !== null && request.method === 'POST') {
    const databaseId = tableBackupMatch[1] ?? '';
    const body = await request.json() as TableBackupRequestBody;
    const tableName = body.tableName;
    const format: 'sql' | 'csv' | 'json' = body.format ?? 'sql';
    const source: R2BackupSource = body.source ?? 'table_export';
    const databaseName = body.databaseName ?? '';

    if (tableName === undefined || tableName === '') {
      return new Response(JSON.stringify({
        success: false,
        error: 'tableName is required'
      }), {
        status: 400,
        headers: jsonHeaders(corsHeaders)
      });
    }

    logInfo(`Starting table backup to R2: ${tableName}`, {
      module: 'r2_backup',
      operation: 'table_backup',
      databaseId,
      userId: userEmail,
      metadata: { tableName, format, source }
    });

    // Return mock job for local dev only
    if (isLocalDev) {
      const jobId = `r2-table-backup-mock-${Date.now()}`;
      const response: { success: boolean; result: BackupJobResponse } = {
        success: true,
        result: { job_id: jobId, status: 'queued' }
      };
      return new Response(JSON.stringify(response), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    // Check if R2 is configured for production
    if (!isR2Configured(env)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'R2 backup is not configured. Please add BACKUP_BUCKET and BACKUP_DO bindings to your wrangler.toml and redeploy.'
      }), {
        status: 503,
        headers: jsonHeaders(corsHeaders)
      });
    }

    try {
      // Create job for tracking
      const jobId = generateJobId('r2_table_backup');
      await createJob(db, {
        jobId,
        databaseId,
        operationType: 'r2_table_backup',
        totalItems: 100,
        userEmail,
        metadata: { tableName, format, source }
      });

      // Start backup in Durable Object
      const doId = env.BACKUP_DO.idFromName(jobId);
      const stub = env.BACKUP_DO.get(doId);

      const doRequest = new Request('https://do/process/table-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          databaseId,
          databaseName,
          tableName,
          format,
          source,
          userEmail
        })
      });

      // Use waitUntil to ensure DO completes
      ctx.waitUntil(stub.fetch(doRequest));

      const response: { success: boolean; result: BackupJobResponse } = {
        success: true,
        result: { job_id: jobId, status: 'queued' }
      };

      return new Response(JSON.stringify(response), {
        headers: jsonHeaders(corsHeaders)
      });
    } catch (error) {
      void logError(env, error instanceof Error ? error : String(error), {
        module: 'r2_backup',
        operation: 'table_backup',
        databaseId,
        userId: userEmail,
        metadata: { tableName }
      }, isLocalDev);

      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to start table backup'
      }), {
        status: 500,
        headers: jsonHeaders(corsHeaders)
      });
    }
  }

  // POST /api/r2-backup/:databaseId - Backup database to R2
  const backupMatch = /^\/api\/r2-backup\/([^/]+)$/.exec(url.pathname);
  if (backupMatch !== null && request.method === 'POST') {
    const databaseId = backupMatch[1] ?? '';
    const body = await request.json() as BackupRequestBody;
    const source: R2BackupSource = body.source ?? 'manual';
    const databaseName = body.databaseName ?? '';

    logInfo(`Starting database backup to R2: ${databaseId}`, {
      module: 'r2_backup',
      operation: 'backup',
      databaseId,
      userId: userEmail,
      metadata: { source }
    });

    // Return mock job for local dev only
    if (isLocalDev) {
      const jobId = `r2-backup-mock-${Date.now()}`;
      const response: { success: boolean; result: BackupJobResponse } = {
        success: true,
        result: { job_id: jobId, status: 'queued' }
      };
      return new Response(JSON.stringify(response), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    // Check if R2 is configured for production
    if (!isR2Configured(env)) {
      const bucketAvailable = env.BACKUP_BUCKET !== undefined;
      const doAvailable = env.BACKUP_DO !== undefined;
      logInfo(`R2 not configured - bucket: ${bucketAvailable}, DO: ${doAvailable}`, {
        module: 'r2_backup',
        operation: 'backup',
        databaseId,
        metadata: { bucketAvailable, doAvailable }
      });
      return new Response(JSON.stringify({
        success: false,
        error: `R2 backup is not configured. Bucket: ${bucketAvailable ? 'OK' : 'MISSING'}, DO: ${doAvailable ? 'OK' : 'MISSING'}. Please add BACKUP_BUCKET and BACKUP_DO bindings to wrangler.toml and redeploy.`
      }), {
        status: 503,
        headers: jsonHeaders(corsHeaders)
      });
    }

    try {
      // Create job for tracking
      const jobId = generateJobId('r2_backup');
      await createJob(db, {
        jobId,
        databaseId,
        operationType: 'r2_backup',
        totalItems: 100,
        userEmail,
        metadata: { source }
      });

      // Start backup in Durable Object
      logInfo(`Creating DO stub for job: ${jobId}`, {
        module: 'r2_backup',
        operation: 'backup',
        databaseId,
        metadata: { jobId }
      });

      const doId = env.BACKUP_DO.idFromName(jobId);
      const stub = env.BACKUP_DO.get(doId);

      const doRequest = new Request('https://do/process/database-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          databaseId,
          databaseName,
          source,
          userEmail
        })
      });

      logInfo(`Sending request to DO for backup`, {
        module: 'r2_backup',
        operation: 'backup',
        databaseId,
        metadata: { jobId, doId: doId.toString() }
      });

      // Use waitUntil to ensure DO request completes even after response is sent
      ctx.waitUntil(
        stub.fetch(doRequest).then(
          async (res) => {
            if (!res.ok) {
              const responseText = await res.text();
              void logError(env, `DO backup failed: ${res.status} - ${responseText}`, {
                module: 'r2_backup',
                operation: 'backup_do_error',
                databaseId,
                userId: userEmail
              }, isLocalDev);
            }
          },
          (err: unknown) => {
            void logError(env, err instanceof Error ? err : String(err), {
              module: 'r2_backup',
              operation: 'backup_do_error',
              databaseId,
              userId: userEmail
            }, isLocalDev);
          }
        )
      );

      const response: { success: boolean; result: BackupJobResponse } = {
        success: true,
        result: { job_id: jobId, status: 'queued' }
      };

      return new Response(JSON.stringify(response), {
        headers: jsonHeaders(corsHeaders)
      });
    } catch (error) {
      void logError(env, error instanceof Error ? error : String(error), {
        module: 'r2_backup',
        operation: 'backup',
        databaseId,
        userId: userEmail
      }, isLocalDev);

      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to start backup'
      }), {
        status: 500,
        headers: jsonHeaders(corsHeaders)
      });
    }
  }

  // POST /api/r2-restore/:databaseId - Restore database from R2
  const restoreMatch = /^\/api\/r2-restore\/([^/]+)$/.exec(url.pathname);
  if (restoreMatch !== null && request.method === 'POST') {
    const databaseId = restoreMatch[1] ?? '';
    const body = await request.json() as RestoreRequestBody;
    const backupPath = body.backupPath ?? '';

    if (backupPath === '') {
      return new Response(JSON.stringify({
        success: false,
        error: 'backupPath is required'
      }), {
        status: 400,
        headers: jsonHeaders(corsHeaders)
      });
    }

    logInfo(`Starting database restore from R2: ${databaseId}`, {
      module: 'r2_backup',
      operation: 'restore',
      databaseId,
      userId: userEmail,
      metadata: { backupPath }
    });

    // Return mock job for local dev only
    if (isLocalDev) {
      const jobId = `r2-restore-mock-${Date.now()}`;
      const response: { success: boolean; result: BackupJobResponse } = {
        success: true,
        result: { job_id: jobId, status: 'queued' }
      };
      return new Response(JSON.stringify(response), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    // Check if R2 is configured for production
    if (!isR2Configured(env)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'R2 backup is not configured. Please add BACKUP_BUCKET and BACKUP_DO bindings to your wrangler.toml and redeploy.'
      }), {
        status: 503,
        headers: jsonHeaders(corsHeaders)
      });
    }

    try {
      // Verify backup exists
      const backupObject = await env.BACKUP_BUCKET.head(backupPath);
      if (backupObject === null) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Backup not found'
        }), {
          status: 404,
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Create job for tracking
      const jobId = generateJobId('r2_restore');
      await createJob(db, {
        jobId,
        databaseId,
        operationType: 'r2_restore',
        totalItems: 100,
        userEmail,
        metadata: { backupPath }
      });

      // Start restore in Durable Object
      const doId = env.BACKUP_DO.idFromName(jobId);
      const stub = env.BACKUP_DO.get(doId);

      const doRequest = new Request('https://do/process/database-restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          databaseId,
          backupPath,
          userEmail
        })
      });

      // Use waitUntil to ensure DO completes
      ctx.waitUntil(stub.fetch(doRequest));

      const response: { success: boolean; result: BackupJobResponse } = {
        success: true,
        result: { job_id: jobId, status: 'queued' }
      };

      return new Response(JSON.stringify(response), {
        headers: jsonHeaders(corsHeaders)
      });
    } catch (error) {
      void logError(env, error instanceof Error ? error : String(error), {
        module: 'r2_backup',
        operation: 'restore',
        databaseId,
        userId: userEmail,
        metadata: { backupPath }
      }, isLocalDev);

      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to start restore'
      }), {
        status: 500,
        headers: jsonHeaders(corsHeaders)
      });
    }
  }

  // GET /api/r2-backup/:databaseId/download/:timestamp - Download a backup
  const downloadMatch = /^\/api\/r2-backup\/([^/]+)\/download\/(\d+)$/.exec(url.pathname);
  if (downloadMatch !== null && request.method === 'GET') {
    const databaseId = downloadMatch[1] ?? '';
    const timestamp = downloadMatch[2] ?? '';

    logInfo(`Downloading R2 backup: ${databaseId}/${timestamp}`, {
      module: 'r2_backup',
      operation: 'download',
      databaseId,
      userId: userEmail,
      metadata: { timestamp }
    });

    if (isLocalDev || env.BACKUP_BUCKET === undefined) {
      // Return mock SQL for local dev
      const mockSql = `-- Mock backup for database ${databaseId}\n-- Created: ${new Date(parseInt(timestamp, 10)).toISOString()}\nCREATE TABLE mock_table (id INTEGER PRIMARY KEY);\n`;
      const headers = new Headers(corsHeaders);
      headers.set('Content-Type', 'application/sql');
      headers.set('Content-Disposition', `attachment; filename="backup-${timestamp}.sql"`);
      return new Response(mockSql, { headers });
    }

    try {
      const backupPath = `backups/${databaseId}/${timestamp}.sql`;
      const backupObject = await env.BACKUP_BUCKET.get(backupPath);

      if (!backupObject) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Backup not found'
        }), {
          status: 404,
          headers: jsonHeaders(corsHeaders)
        });
      }

      // Get the database name from metadata for filename
      const metadata = backupObject.customMetadata ?? {};
      const databaseName = typeof metadata['databaseName'] === 'string' ? metadata['databaseName'] : 'database';
      const filename = `${databaseName}-backup-${timestamp}.sql`;

      const headers = new Headers(corsHeaders);
      headers.set('Content-Type', 'application/sql');
      headers.set('Content-Disposition', `attachment; filename="${filename}"`);
      headers.set('Content-Length', String(backupObject.size));

      logInfo(`Backup downloaded: ${backupPath}`, {
        module: 'r2_backup',
        operation: 'download',
        databaseId,
        metadata: { backupPath, size: backupObject.size }
      });

      return new Response(backupObject.body, { headers });
    } catch (error) {
      void logError(env, error instanceof Error ? error : String(error), {
        module: 'r2_backup',
        operation: 'download',
        databaseId,
        userId: userEmail
      }, isLocalDev);

      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to download backup'
      }), {
        status: 500,
        headers: jsonHeaders(corsHeaders)
      });
    }
  }

  // DELETE /api/r2-backup/:databaseId/:timestamp - Delete a backup
  // Accepts optional 'path' query param for table backups with different path structure
  const deleteMatch = /^\/api\/r2-backup\/([^/]+)\/(\d+)$/.exec(url.pathname);
  if (deleteMatch !== null && request.method === 'DELETE') {
    const databaseId = deleteMatch[1] ?? '';
    const timestamp = deleteMatch[2] ?? '';
    
    // Check for explicit path in query params (used for table backups)
    const explicitPath = url.searchParams.get('path');
    
    // Determine if this is a table backup based on path
    const isTableBackup = explicitPath?.includes('/tables/') ?? false;
    
    // Extract table name if it's a table backup
    let tableName: string | undefined;
    if (isTableBackup && explicitPath) {
      const pathParts = explicitPath.split('/');
      const tablesIndex = pathParts.indexOf('tables');
      if (tablesIndex >= 0 && tablesIndex + 1 < pathParts.length) {
        tableName = pathParts[tablesIndex + 1];
      }
    }

    logInfo(`Deleting R2 backup: ${databaseId}/${timestamp}`, {
      module: 'r2_backup',
      operation: 'delete',
      databaseId,
      userId: userEmail,
      metadata: { timestamp, explicitPath, isTableBackup, tableName }
    });

    if (isLocalDev || env.BACKUP_BUCKET === undefined) {
      return new Response(JSON.stringify({ success: true }), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    // Create job for tracking
    let jobId: string | undefined;
    try {
      jobId = generateJobId(OperationType.R2_BACKUP_DELETE);
      await createJob(env.METADATA, {
        jobId,
        databaseId,
        operationType: OperationType.R2_BACKUP_DELETE,
        totalItems: 1,
        userEmail,
        metadata: { timestamp, isTableBackup, tableName }
      });
    } catch {
      // Continue even if job creation fails
    }

    try {
      // Use explicit path if provided, otherwise construct default database backup path
      const backupPath = explicitPath ?? `backups/${databaseId}/${timestamp}.sql`;
      
      // Validate that path belongs to this database (security check)
      if (!backupPath.startsWith(`backups/${databaseId}/`)) {
        if (jobId) {
          await completeJob(env.METADATA, {
            jobId,
            status: 'failed',
            processedItems: 0,
            errorCount: 1,
            userEmail,
            errorMessage: 'Invalid backup path for this database'
          });
        }
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid backup path for this database'
        }), {
          status: 400,
          headers: jsonHeaders(corsHeaders)
        });
      }
      
      await env.BACKUP_BUCKET.delete(backupPath);

      logInfo(`Backup deleted: ${backupPath}`, {
        module: 'r2_backup',
        operation: 'delete',
        databaseId,
        metadata: { backupPath }
      });

      // Complete job successfully
      if (jobId) {
        await completeJob(env.METADATA, {
          jobId,
          status: 'completed',
          processedItems: 1,
          errorCount: 0,
          userEmail
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: jsonHeaders(corsHeaders)
      });
    } catch (error) {
      void logError(env, error instanceof Error ? error : String(error), {
        module: 'r2_backup',
        operation: 'delete',
        databaseId,
        userId: userEmail
      }, isLocalDev);

      // Mark job as failed
      if (jobId) {
        await completeJob(env.METADATA, {
          jobId,
          status: 'failed',
          processedItems: 0,
          errorCount: 1,
          userEmail,
          errorMessage: error instanceof Error ? error.message : 'Failed to delete backup'
        });
      }

      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to delete backup'
      }), {
        status: 500,
        headers: jsonHeaders(corsHeaders)
      });
    }
  }

  // DELETE /api/r2-backup/:databaseId/bulk - Bulk delete backups
  const bulkDeleteMatch = /^\/api\/r2-backup\/([^/]+)\/bulk$/.exec(url.pathname);
  if (bulkDeleteMatch !== null && request.method === 'DELETE') {
    const databaseId = bulkDeleteMatch[1] ?? '';
    
    interface BulkDeleteBody {
      timestamps?: number[];
    }
    
    const body = await request.json() as BulkDeleteBody;
    const timestamps = body.timestamps ?? [];

    if (timestamps.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'timestamps array is required'
      }), {
        status: 400,
        headers: jsonHeaders(corsHeaders)
      });
    }

    logInfo(`Bulk deleting R2 backups: ${databaseId}`, {
      module: 'r2_backup',
      operation: 'bulk_delete',
      databaseId,
      userId: userEmail,
      metadata: { count: timestamps.length }
    });

    if (isLocalDev || env.BACKUP_BUCKET === undefined) {
      return new Response(JSON.stringify({ 
        success: true, 
        result: { deleted: timestamps.length, failed: 0 } 
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    }

    try {
      let deleted = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const timestamp of timestamps) {
        try {
          const backupPath = `backups/${databaseId}/${String(timestamp)}.sql`;
          await env.BACKUP_BUCKET.delete(backupPath);
          deleted++;
        } catch (err) {
          failed++;
          errors.push(`Failed to delete backup ${String(timestamp)}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      logInfo(`Bulk delete completed: ${String(deleted)} deleted, ${String(failed)} failed`, {
        module: 'r2_backup',
        operation: 'bulk_delete',
        databaseId,
        metadata: { deleted, failed }
      });

      return new Response(JSON.stringify({ 
        success: true, 
        result: { deleted, failed, errors: errors.length > 0 ? errors : undefined } 
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    } catch (error) {
      void logError(env, error instanceof Error ? error : String(error), {
        module: 'r2_backup',
        operation: 'bulk_delete',
        databaseId,
        userId: userEmail
      }, isLocalDev);

      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to bulk delete backups'
      }), {
        status: 500,
        headers: jsonHeaders(corsHeaders)
      });
    }
  }

  // DELETE /api/r2-backup/:databaseId/all - Delete all backups for a database (including table backups)
  const deleteAllMatch = /^\/api\/r2-backup\/([^/]+)\/all$/.exec(url.pathname);
  if (deleteAllMatch !== null && request.method === 'DELETE') {
    const databaseId = deleteAllMatch[1] ?? '';

    logInfo(`Deleting all R2 backups for database: ${databaseId}`, {
      module: 'r2_backup',
      operation: 'delete_all',
      databaseId,
      userId: userEmail
    });

    if (!env.BACKUP_BUCKET) {
      return new Response(JSON.stringify({
        success: false,
        error: 'R2 backup bucket not configured'
      }), {
        status: 500,
        headers: jsonHeaders(corsHeaders)
      });
    }

    try {
      // List all objects under this database's backup prefix
      const prefix = `backups/${databaseId}/`;
      const listed = await env.BACKUP_BUCKET.list({ prefix });
      
      let deleted = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const obj of listed.objects) {
        try {
          await env.BACKUP_BUCKET.delete(obj.key);
          deleted++;
        } catch (err) {
          failed++;
          errors.push(`Failed to delete ${obj.key}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      logInfo(`Delete all completed: ${String(deleted)} deleted, ${String(failed)} failed`, {
        module: 'r2_backup',
        operation: 'delete_all',
        databaseId,
        metadata: { deleted, failed, totalFound: listed.objects.length }
      });

      return new Response(JSON.stringify({
        success: true,
        result: { deleted, failed, errors: errors.length > 0 ? errors : undefined }
      }), {
        headers: jsonHeaders(corsHeaders)
      });
    } catch (error) {
      void logError(env, error instanceof Error ? error : String(error), {
        module: 'r2_backup',
        operation: 'delete_all',
        databaseId,
        userId: userEmail
      }, isLocalDev);

      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to delete all backups'
      }), {
        status: 500,
        headers: jsonHeaders(corsHeaders)
      });
    }
  }

  // GET /api/r2-backup/orphaned - List backups from databases that no longer exist
  if (url.pathname === '/api/r2-backup/orphaned' && request.method === 'GET') {
    logInfo('Listing orphaned R2 backups', {
      module: 'r2_backup',
      operation: 'list_orphaned',
      userId: userEmail
    });

    // Check R2 bucket is available
    if (!env.BACKUP_BUCKET) {
      return new Response(JSON.stringify({
        success: false,
        error: 'R2 backup bucket not configured'
      }), {
        status: 500,
        headers: jsonHeaders(corsHeaders)
      });
    }

    try {
      // List all backups in the R2 bucket
      const prefix = 'backups/';
      const listed = await env.BACKUP_BUCKET.list({ prefix });

      // Get all existing database IDs from Cloudflare API
      // Use Bearer token auth (API Token) - consistent with rest of the codebase
      const cfHeaders: HeadersInit = {
        'Authorization': `Bearer ${env.API_KEY}`,
        'Content-Type': 'application/json'
      };

      // Fetch all pages of databases to avoid pagination issues
      const existingDbIds = new Set<string>();
      let cursor: string | undefined;
      const perPage = 100; // Max allowed by Cloudflare API

      interface D1Database {
        uuid: string;
        name: string;
      }
      interface D1ListResponse {
        result: D1Database[];
        success: boolean;
        result_info?: {
          cursor?: string;
          count?: number;
          total_count?: number;
        };
      }

      do {
        const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/d1/database`);
        url.searchParams.set('per_page', String(perPage));
        if (cursor) {
          url.searchParams.set('cursor', cursor);
        }

        const dbListResponse = await fetch(url.toString(), { headers: cfHeaders });

        if (!dbListResponse.ok) {
          logWarning(`Failed to fetch database list: ${dbListResponse.status}`, {
            module: 'r2_backup',
            operation: 'list_orphaned',
            userId: userEmail
          });
          break;
        }

        const dbListData = await dbListResponse.json() as D1ListResponse;
        
        if (dbListData.success && dbListData.result.length > 0) {
          for (const db of dbListData.result) {
            existingDbIds.add(db.uuid);
          }
        }

        // Get next page cursor
        cursor = dbListData.result_info?.cursor;
      } while (cursor);

      // Group backups by database ID
      const backupsByDb = new Map<string, R2BackupListItem[]>();
      
      for (const obj of listed.objects) {
        // Parse path: backups/{databaseId}/{timestamp}.sql or backups/{databaseId}/tables/{tableName}/{timestamp}.sql
        const pathParts = obj.key.split('/');
        if (pathParts.length < 3) continue;
        
        const databaseId = pathParts[1];
        if (!databaseId) continue;
        
        // Check if this database still exists
        if (existingDbIds.has(databaseId)) continue;

        // This is an orphaned backup
        const metadata = obj.customMetadata ?? {};
        const isTableBackup = obj.key.includes('/tables/');
        const filename = obj.key.split('/').pop() ?? '';
        const timestamp = parseInt(filename.replace('.sql', ''), 10) || 0;
        
        // Extract table name for table backups
        let extractedTableName = typeof metadata['tableName'] === 'string' ? metadata['tableName'] : undefined;
        if (isTableBackup && !extractedTableName) {
          const tablesIndex = pathParts.indexOf('tables');
          if (tablesIndex >= 0 && tablesIndex + 1 < pathParts.length) {
            extractedTableName = pathParts[tablesIndex + 1];
          }
        }

        const metadataSource = typeof metadata['source'] === 'string' ? metadata['source'] : (isTableBackup ? 'table_backup' : 'manual');
        const backupItem: R2BackupListItem = {
          path: obj.key,
          databaseId,
          databaseName: typeof metadata['databaseName'] === 'string' ? metadata['databaseName'] : 'Deleted Database',
          source: metadataSource as R2BackupSource,
          timestamp,
          size: obj.size,
          uploaded: obj.uploaded.toISOString(),
          tableName: extractedTableName,
          tableFormat: typeof metadata['format'] === 'string' 
            ? metadata['format'] as 'sql' | 'csv' | 'json' 
            : undefined,
          backupType: isTableBackup ? 'table' : 'database'
        };

        const existingBackups = backupsByDb.get(databaseId);
        if (existingBackups) {
          existingBackups.push(backupItem);
        } else {
          backupsByDb.set(databaseId, [backupItem]);
        }
      }

      // Convert to array grouped by database, sorted by newest first
      interface OrphanedBackupGroup {
        databaseId: string;
        databaseName: string;
        backups: R2BackupListItem[];
      }

      // Look up database names from METADATA table for orphaned database IDs
      const orphanedDbIds = [...backupsByDb.keys()];
      const dbNameLookup = new Map<string, string>();
      
      if (orphanedDbIds.length > 0) {
        try {
          // Query the databases table for names of orphaned databases
          const placeholders = orphanedDbIds.map(() => '?').join(',');
          const stmt = env.METADATA.prepare(
            `SELECT database_id, database_name FROM databases WHERE database_id IN (${placeholders})`
          );
          const result = await stmt.bind(...orphanedDbIds).all();
          
          if (result.results.length > 0) {
            for (const row of result.results) {
              const dbId = row['database_id'];
              const dbName = row['database_name'];
              if (typeof dbId === 'string' && typeof dbName === 'string' && dbName.length > 0) {
                dbNameLookup.set(dbId, dbName);
              }
            }
          }
          
          logInfo(`Database name lookup: found ${String(dbNameLookup.size)} of ${String(orphanedDbIds.length)} names`, {
            module: 'r2_backup',
            operation: 'list_orphaned',
            userId: userEmail,
            metadata: { 
              orphanedCount: orphanedDbIds.length, 
              foundNames: dbNameLookup.size,
              lookupResults: Object.fromEntries(dbNameLookup)
            }
          });
        } catch (lookupErr) {
          // If lookup fails, continue without names
          logWarning(`Database name lookup failed: ${lookupErr instanceof Error ? lookupErr.message : String(lookupErr)}`, {
            module: 'r2_backup',
            operation: 'list_orphaned',
            userId: userEmail
          });
        }
      }

      const orphanedGroups: OrphanedBackupGroup[] = [];
      for (const [dbId, backups] of backupsByDb) {
        backups.sort((a, b) => b.timestamp - a.timestamp);
        
        // Priority for database name:
        // 1. METADATA databases table lookup
        // 2. R2 backup metadata (from first backup)
        // 3. Fallback to 'Deleted Database'
        let databaseName = dbNameLookup.get(dbId);
        if (databaseName === undefined || databaseName === '' || databaseName === 'Deleted Database') {
          // Try to find a valid name from backup metadata
          const backupWithName = backups.find(b => 
            b.databaseName !== undefined && 
            b.databaseName !== '' &&
            b.databaseName !== 'Deleted Database' && 
            b.databaseName !== 'Unknown Name'
          );
          databaseName = backupWithName?.databaseName ?? 'Deleted Database';
        }
        
        orphanedGroups.push({
          databaseId: dbId,
          databaseName,
          backups
        });
      }

      // Sort groups by most recent backup
      orphanedGroups.sort((a, b) => (b.backups[0]?.timestamp ?? 0) - (a.backups[0]?.timestamp ?? 0));

      logInfo(`Found ${String(orphanedGroups.length)} orphaned backup groups`, {
        module: 'r2_backup',
        operation: 'list_orphaned',
        userId: userEmail,
        metadata: { groupCount: orphanedGroups.length }
      });

      return new Response(JSON.stringify({ success: true, result: orphanedGroups }), {
        headers: jsonHeaders(corsHeaders)
      });
    } catch (error) {
      void logError(env, error instanceof Error ? error : String(error), {
        module: 'r2_backup',
        operation: 'list_orphaned',
        userId: userEmail
      }, isLocalDev);

      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to list orphaned backups'
      }), {
        status: 500,
        headers: jsonHeaders(corsHeaders)
      });
    }
  }

  // GET /api/r2-backup/status - Check if R2 backups are configured
  if (url.pathname === '/api/r2-backup/status' && request.method === 'GET') {
    const bucketAvailable = env.BACKUP_BUCKET !== undefined;
    const doAvailable = env.BACKUP_DO !== undefined;
    const isConfigured = !isLocalDev && bucketAvailable && doAvailable;

    logInfo('Checking R2 backup status', {
      module: 'r2_backup',
      operation: 'status',
      userId: userEmail,
      metadata: { isConfigured }
    });

    return new Response(JSON.stringify({
      success: true,
      result: {
        configured: isConfigured,
        bucketAvailable,
        doAvailable
      }
    }), {
      headers: jsonHeaders(corsHeaders)
    });
  }

  // Not an R2 backup route
  return null;
}
