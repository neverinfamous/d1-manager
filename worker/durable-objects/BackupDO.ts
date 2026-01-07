import type { DurableObjectState } from '@cloudflare/workers-types';
import type { Env, R2BackupParams, R2TableBackupParams, R2RestoreParams, R2BackupMetadata } from '../types';
import { logError, logInfo, logWarning } from '../utils/error-logger';
import { completeJob, updateJobProgress } from '../routes/jobs';
import { CF_API } from '../types';
import { triggerWebhooks, createBackupCompletePayload, createRestoreCompletePayload } from '../utils/webhooks';

/**
 * Durable Object for handling async D1 backup/restore operations to R2
 */
export class BackupDO {
  private env: Env;
  private isLocalDev: boolean;

  constructor(_state: DurableObjectState, env: Env) {
    this.env = env;
    this.isLocalDev = !env.BACKUP_BUCKET;
  }

  /**
   * Handle incoming requests for backup/restore processing
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Backup/Restore processing endpoints
    if (url.pathname.startsWith('/process/')) {
      const jobType = url.pathname.split('/')[2];
      logInfo(`Received backup request for job type: ${jobType ?? 'unknown'}`, {
        module: 'backup_do',
        operation: 'process_request',
        metadata: { jobType }
      });

      try {
        const body: unknown = await request.json();

        switch (jobType) {
          case 'database-backup':
            await this.processDatabaseBackup(body as R2BackupParams & { jobId: string });
            break;
          case 'table-backup':
            await this.processTableBackup(body as R2TableBackupParams & { jobId: string });
            break;
          case 'database-restore':
            await this.processDatabaseRestore(body as R2RestoreParams & { jobId: string });
            break;
          default:
            logWarning(`Unknown backup job type: ${jobType ?? 'undefined'}`, {
              module: 'backup_do',
              operation: 'process_request',
              metadata: { jobType }
            });
            return new Response(JSON.stringify({ error: 'Unknown job type' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        void logError(this.env, error instanceof Error ? error : String(error), {
          module: 'backup_do',
          operation: 'process_job',
          metadata: { jobType }
        }, this.isLocalDev);
        return new Response(JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Process database backup to R2
   */
  private async processDatabaseBackup(params: R2BackupParams & { jobId: string }): Promise<void> {
    const { jobId, databaseId, databaseName, source, userEmail } = params;
    const db = this.env.METADATA;

    logInfo(`Starting database backup: ${databaseId}`, {
      module: 'backup_do',
      operation: 'database_backup',
      databaseId,
      databaseName,
      userId: userEmail ?? 'system',
      metadata: { jobId, source }
    });

    try {
      // Step 1: Start export via D1 Export API
      await updateJobProgress(db, { jobId, processedItems: 0, totalItems: 100 });

      const cfHeaders = {
        'Authorization': `Bearer ${this.env.API_KEY}`,
        'Content-Type': 'application/json'
      };

      // Start export with polling mode
      const exportUrl = `${CF_API}/accounts/${this.env.ACCOUNT_ID}/d1/database/${databaseId}/export`;
      const exportResponse = await fetch(exportUrl, {
        method: 'POST',
        headers: cfHeaders,
        body: JSON.stringify({ output_format: 'polling' })
      });

      if (!exportResponse.ok) {
        const errorText = await exportResponse.text();
        throw new Error(`Failed to start export: ${errorText}`);
      }

      interface ExportStartResult {
        success: boolean;
        result?: {
          at_bookmark?: string;
          signed_url?: string;
          status?: string;
          // Nested result for completed exports
          result?: {
            signed_url?: string;
            filename?: string;
          };
        };
        errors?: { message: string }[];
      }

      const exportStartData = await exportResponse.json() as ExportStartResult;

      if (!exportStartData.success) {
        const errorMsg = exportStartData.errors?.[0]?.message ?? 'Export failed';
        throw new Error(errorMsg);
      }

      await updateJobProgress(db, { jobId, processedItems: 20, totalItems: 100 });

      // Check if export is already complete (small databases)
      // signed_url can be at result.signed_url OR result.result.signed_url (nested)
      let signedUrl = exportStartData.result?.signed_url ?? exportStartData.result?.result?.signed_url;
      const bookmark = exportStartData.result?.at_bookmark;

      if (!signedUrl && bookmark) {
        // Step 2: Poll for export completion
        const maxAttempts = 180; // 180 attempts * 2s = 6 minutes timeout
        let attempts = 0;

        while (!signedUrl && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000));

          const pollResponse = await fetch(exportUrl, {
            method: 'POST',
            headers: cfHeaders,
            body: JSON.stringify({
              output_format: 'polling',
              current_bookmark: bookmark
            })
          });

          if (!pollResponse.ok) {
            const errorText = await pollResponse.text();
            throw new Error(`Poll failed: ${pollResponse.statusText} - ${errorText}`);
          }

          interface ExportPollResult {
            success: boolean;
            result?: {
              signed_url?: string;
              status?: string;
              result?: {
                signed_url?: string;
              };
            };
          }

          const pollData = await pollResponse.json() as ExportPollResult;

          // signed_url can be at result.signed_url OR result.result.signed_url
          const pollSignedUrl = pollData.result?.signed_url ?? pollData.result?.result?.signed_url;
          if (pollSignedUrl) {
            signedUrl = pollSignedUrl;
          }

          attempts++;
          // Progress from 20% to 70% based on polling attempts
          const progress = Math.min(20 + (attempts / maxAttempts) * 50, 70);
          await updateJobProgress(db, { jobId, processedItems: Math.round(progress), totalItems: 100 });
        }

        if (!signedUrl) {
          throw new Error('Export timeout after 6 minutes - database export is taking longer than expected. Try a manual backup or contact support if the issue persists.');
        }
      }

      await updateJobProgress(db, { jobId, processedItems: 75, totalItems: 100 });

      // Step 3: Download the SQL dump
      logInfo('Downloading SQL dump from signed URL', {
        module: 'backup_do',
        operation: 'database_backup',
        databaseId,
        metadata: { jobId }
      });

      if (!signedUrl) {
        throw new Error('No signed URL received from export');
      }
      const downloadResponse = await fetch(signedUrl);
      if (!downloadResponse.ok) {
        throw new Error(`Failed to download export: ${downloadResponse.statusText}`);
      }

      const sqlContent = await downloadResponse.text();
      await updateJobProgress(db, { jobId, processedItems: 85, totalItems: 100 });

      // Step 4: Upload to R2
      const timestamp = Date.now();
      const backupPath = `backups/${databaseId}/${timestamp}.sql`;

      const metadata: R2BackupMetadata = {
        databaseId,
        databaseName,
        source,
        timestamp,
        size: sqlContent.length,
        bookmark: bookmark ?? undefined,
        userEmail: userEmail ?? undefined
      };

      if (this.env.BACKUP_BUCKET) {
        await this.env.BACKUP_BUCKET.put(backupPath, sqlContent, {
          customMetadata: {
            databaseId,
            databaseName,
            source,
            timestamp: String(timestamp),
            size: String(sqlContent.length),
            bookmark: bookmark ?? '',
            userEmail: userEmail ?? ''
          }
        });

        logInfo(`Backup uploaded to R2: ${backupPath}`, {
          module: 'backup_do',
          operation: 'database_backup',
          databaseId,
          metadata: { jobId, backupPath, size: sqlContent.length }
        });
      } else {
        logWarning('BACKUP_BUCKET not configured - skipping R2 upload', {
          module: 'backup_do',
          operation: 'database_backup',
          databaseId,
          metadata: { jobId }
        });
      }

      // Complete the job
      await completeJob(db, {
        jobId,
        status: 'completed',
        processedItems: 100,
        errorCount: 0,
        userEmail: userEmail ?? 'system'
      });

      logInfo(`Database backup completed: ${databaseId}`, {
        module: 'backup_do',
        operation: 'database_backup',
        databaseId,
        metadata: { jobId, backupPath, size: metadata.size }
      });

      // Trigger backup_complete webhook
      void triggerWebhooks(
        this.env,
        'backup_complete',
        createBackupCompletePayload(databaseId, databaseName, backupPath, metadata.size, userEmail ?? null),
        this.isLocalDev
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      void logError(this.env, error instanceof Error ? error : String(error), {
        module: 'backup_do',
        operation: 'database_backup',
        databaseId,
        databaseName,
        userId: userEmail ?? 'system'
      }, this.isLocalDev);

      await completeJob(db, {
        jobId,
        status: 'failed',
        processedItems: 0,
        errorCount: 1,
        userEmail: userEmail ?? 'system',
        errorMessage
      });

      throw error;
    }
  }

  /**
   * Process table backup to R2
   */
  private async processTableBackup(params: R2TableBackupParams & { jobId: string }): Promise<void> {
    const { jobId, databaseId, databaseName, tableName, format, source, userEmail } = params;
    const db = this.env.METADATA;

    logInfo(`Starting table backup: ${tableName}`, {
      module: 'backup_do',
      operation: 'table_backup',
      databaseId,
      databaseName,
      metadata: { jobId, tableName, format, source }
    });

    try {
      await updateJobProgress(db, { jobId, processedItems: 10, totalItems: 100 });

      const cfHeaders = {
        'Authorization': `Bearer ${this.env.API_KEY}`,
        'Content-Type': 'application/json'
      };

      // Query to get table data
      const queryUrl = `${CF_API}/accounts/${this.env.ACCOUNT_ID}/d1/database/${databaseId}/query`;

      // Get table schema first
      const schemaResponse = await fetch(queryUrl, {
        method: 'POST',
        headers: cfHeaders,
        body: JSON.stringify({ sql: `PRAGMA table_info("${tableName}")` })
      });

      if (!schemaResponse.ok) {
        throw new Error(`Failed to get table schema: ${schemaResponse.statusText}`);
      }

      interface ColumnInfo {
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }

      interface QueryResult<T> {
        success: boolean;
        result?: { results: T[] }[];
        errors?: { message: string }[];
      }

      const schemaData = await schemaResponse.json() as QueryResult<ColumnInfo>;
      const columns = schemaData.result?.[0]?.results ?? [];

      await updateJobProgress(db, { jobId, processedItems: 30, totalItems: 100 });

      // Get table data
      const dataResponse = await fetch(queryUrl, {
        method: 'POST',
        headers: cfHeaders,
        body: JSON.stringify({ sql: `SELECT * FROM "${tableName}"` })
      });

      if (!dataResponse.ok) {
        throw new Error(`Failed to get table data: ${dataResponse.statusText}`);
      }

      const tableData = await dataResponse.json() as QueryResult<Record<string, unknown>>;
      const rows = tableData.result?.[0]?.results ?? [];

      await updateJobProgress(db, { jobId, processedItems: 60, totalItems: 100 });

      // Format the data
      let content: string;
      let contentType: string;

      if (format === 'json') {
        content = JSON.stringify(rows, null, 2);
        contentType = 'application/json';
      } else if (format === 'csv') {
        // Build CSV
        const columnNames = columns.map(c => c.name);
        const header = columnNames.map(escapeCSV).join(',');
        const dataRows = rows.map(row =>
          columnNames.map(col => {
            const value = row[col];
            if (value === null || value === undefined) return '';
            if (typeof value === 'object') return escapeCSV(JSON.stringify(value));
            if (typeof value === 'string') return escapeCSV(value);
            if (typeof value === 'number' || typeof value === 'boolean') return escapeCSV(String(value));
            return '';
          }).join(',')
        );
        content = [header, ...dataRows].join('\n');
        contentType = 'text/csv';
      } else {
        // SQL format
        const createStatement = buildCreateStatement(tableName, columns);
        const insertStatements = rows.map(row => buildInsertStatement(tableName, columns, row));
        content = [createStatement, '', ...insertStatements].join('\n');
        contentType = 'application/sql';
      }

      await updateJobProgress(db, { jobId, processedItems: 80, totalItems: 100 });

      // Upload to R2
      const timestamp = Date.now();
      const extension = format === 'json' ? 'json' : format === 'csv' ? 'csv' : 'sql';
      const backupPath = `backups/${databaseId}/tables/${tableName}/${timestamp}.${extension}`;

      if (this.env.BACKUP_BUCKET) {
        await this.env.BACKUP_BUCKET.put(backupPath, content, {
          httpMetadata: { contentType },
          customMetadata: {
            databaseId,
            databaseName,
            tableName,
            source,
            format,
            timestamp: String(timestamp),
            size: String(content.length),
            rowCount: String(rows.length),
            userEmail: userEmail ?? ''
          }
        });

        logInfo(`Table backup uploaded to R2: ${backupPath}`, {
          module: 'backup_do',
          operation: 'table_backup',
          databaseId,
          metadata: { jobId, backupPath, size: content.length, rowCount: rows.length }
        });
      }

      // Complete the job
      await completeJob(db, {
        jobId,
        status: 'completed',
        processedItems: 100,
        errorCount: 0,
        userEmail: userEmail ?? 'system'
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      void logError(this.env, error instanceof Error ? error : String(error), {
        module: 'backup_do',
        operation: 'table_backup',
        databaseId,
        databaseName,
        metadata: { tableName }
      }, this.isLocalDev);

      await completeJob(db, {
        jobId,
        status: 'failed',
        processedItems: 0,
        errorCount: 1,
        userEmail: userEmail ?? 'system',
        errorMessage
      });

      throw error;
    }
  }

  /**
   * Process database restore from R2
   */
  private async processDatabaseRestore(params: R2RestoreParams & { jobId: string }): Promise<void> {
    const { jobId, databaseId, backupPath, userEmail } = params;
    const db = this.env.METADATA;

    logInfo(`Starting database restore: ${databaseId}`, {
      module: 'backup_do',
      operation: 'database_restore',
      databaseId,
      metadata: { jobId, backupPath }
    });

    try {
      await updateJobProgress(db, { jobId, processedItems: 10, totalItems: 100 });

      // Step 1: Download backup from R2
      if (!this.env.BACKUP_BUCKET) {
        throw new Error('BACKUP_BUCKET not configured');
      }

      const backupObject = await this.env.BACKUP_BUCKET.get(backupPath);
      if (!backupObject) {
        throw new Error(`Backup not found: ${backupPath}`);
      }

      const sqlContent = await backupObject.text();
      await updateJobProgress(db, { jobId, processedItems: 20, totalItems: 100 });

      // Step 2: Compute MD5 hash (etag) of SQL content - required by D1 import API
      const encoder = new TextEncoder();
      const data = encoder.encode(sqlContent);
      const hashBuffer = await crypto.subtle.digest('MD5', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const etag = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      logInfo(`Computed etag for import: ${etag}`, {
        module: 'backup_do',
        operation: 'database_restore',
        databaseId,
        metadata: { jobId, sqlSize: sqlContent.length }
      });

      // Step 3: Import to D1 using Import API
      const cfHeaders = {
        'Authorization': `Bearer ${this.env.API_KEY}`,
        'Content-Type': 'application/json'
      };

      const importUrl = `${CF_API}/accounts/${this.env.ACCOUNT_ID}/d1/database/${databaseId}/import`;

      // Init upload - requires etag
      const initResponse = await fetch(importUrl, {
        method: 'POST',
        headers: cfHeaders,
        body: JSON.stringify({ action: 'init', etag })
      });

      interface ImportInitResult {
        success: boolean;
        result?: {
          upload_url?: string;
          filename?: string;
        };
        errors?: { message: string }[];
      }

      const initData = await initResponse.json() as ImportInitResult;

      if (!initResponse.ok || !initData.success) {
        const errorMsg = initData.errors?.[0]?.message ?? initResponse.statusText;
        throw new Error(`Failed to initialize import: ${errorMsg}`);
      }

      if (!initData.result?.upload_url) {
        throw new Error('Failed to get upload URL for import');
      }

      await updateJobProgress(db, { jobId, processedItems: 40, totalItems: 100 });

      // Upload SQL content to the provided URL
      const uploadResponse = await fetch(initData.result.upload_url, {
        method: 'PUT',
        body: sqlContent
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload SQL: ${uploadResponse.statusText}`);
      }

      // Verify etag matches (optional but recommended)
      const r2Etag = uploadResponse.headers.get('ETag')?.replace(/"/g, '');
      if (r2Etag && r2Etag !== etag) {
        logInfo(`ETag mismatch warning: expected ${etag}, got ${r2Etag}`, {
          module: 'backup_do',
          operation: 'database_restore',
          databaseId,
          metadata: { jobId }
        });
      }

      await updateJobProgress(db, { jobId, processedItems: 60, totalItems: 100 });

      // Start ingestion - action is 'ingest', not 'start'
      const ingestResponse = await fetch(importUrl, {
        method: 'POST',
        headers: cfHeaders,
        body: JSON.stringify({
          action: 'ingest',
          etag,
          filename: initData.result.filename
        })
      });

      interface ImportResult {
        success: boolean;
        result?: {
          num_queries?: number;
          at_bookmark?: string;
          success?: boolean;
          error?: string;
        };
        errors?: { message: string }[];
      }

      const ingestData = await ingestResponse.json() as ImportResult;

      if (!ingestResponse.ok || !ingestData.success) {
        const errorMsg = ingestData.errors?.[0]?.message ?? ingestResponse.statusText;
        throw new Error(`Failed to start ingestion: ${errorMsg}`);
      }

      await updateJobProgress(db, { jobId, processedItems: 70, totalItems: 100 });

      // Poll until import completes
      const bookmark = ingestData.result?.at_bookmark;
      let pollAttempts = 0;
      const maxPollAttempts = 60; // Max 60 seconds

      while (pollAttempts < maxPollAttempts) {
        const pollResponse = await fetch(importUrl, {
          method: 'POST',
          headers: cfHeaders,
          body: JSON.stringify({
            action: 'poll',
            current_bookmark: bookmark
          })
        });

        const pollData = await pollResponse.json() as ImportResult;

        // Check if import completed
        if (pollData.result?.success === true) {
          logInfo(`Import completed successfully`, {
            module: 'backup_do',
            operation: 'database_restore',
            databaseId,
            metadata: { jobId, numQueries: pollData.result.num_queries }
          });
          break;
        }

        // Check for completion (no active import)
        if (!pollData.result?.success && pollData.result?.error === 'Not currently importing anything.') {
          logInfo(`Import finished (no active import)`, {
            module: 'backup_do',
            operation: 'database_restore',
            databaseId,
            metadata: { jobId }
          });
          break;
        }

        // Check for error
        const firstError = pollData.errors?.[0];
        if (firstError) {
          throw new Error(`Import poll error: ${firstError.message}`);
        }

        // Update progress based on poll attempts
        const progress = Math.min(70 + Math.floor(pollAttempts * 0.5), 95);
        await updateJobProgress(db, { jobId, processedItems: progress, totalItems: 100 });

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, 1000));
        pollAttempts++;
      }

      if (pollAttempts >= maxPollAttempts) {
        throw new Error('Import timed out after 60 seconds');
      }

      // Complete the job
      await completeJob(db, {
        jobId,
        status: 'completed',
        processedItems: 100,
        errorCount: 0,
        userEmail: userEmail ?? 'system'
      });

      logInfo(`Database restore completed: ${databaseId}`, {
        module: 'backup_do',
        operation: 'database_restore',
        databaseId,
        metadata: {
          jobId,
          backupPath
        }
      });

      // Trigger restore_complete webhook
      // Note: We don't have databaseName in restore params, using empty string
      void triggerWebhooks(
        this.env,
        'restore_complete',
        createRestoreCompletePayload(databaseId, '', backupPath, 0, userEmail ?? null),
        this.isLocalDev
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      void logError(this.env, error instanceof Error ? error : String(error), {
        module: 'backup_do',
        operation: 'database_restore',
        databaseId
      }, this.isLocalDev);

      await completeJob(db, {
        jobId,
        status: 'failed',
        processedItems: 0,
        errorCount: 1,
        userEmail: userEmail ?? 'system',
        errorMessage
      });

      throw error;
    }
  }
}

/**
 * Helper: Escape value for CSV
 */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Helper: Build CREATE TABLE statement
 */
function buildCreateStatement(tableName: string, columns: { name: string; type: string; notnull: number; dflt_value: string | null; pk: number }[]): string {
  const columnDefs = columns.map(col => {
    let def = `"${col.name}" ${col.type}`;
    if (col.pk) def += ' PRIMARY KEY';
    if (col.notnull) def += ' NOT NULL';
    if (col.dflt_value !== null) def += ` DEFAULT ${col.dflt_value}`;
    return def;
  });
  return `CREATE TABLE IF NOT EXISTS "${tableName}" (\n  ${columnDefs.join(',\n  ')}\n);`;
}

/**
 * Helper: Build INSERT statement
 */
function buildInsertStatement(
  tableName: string,
  columns: { name: string }[],
  row: Record<string, unknown>
): string {
  const columnNames = columns.map(c => `"${c.name}"`).join(', ');
  const values = columns.map(c => {
    const value = row[c.name];
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? '1' : '0';
    if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
    return `'${String(value as string | number).replace(/'/g, "''")}'`;
  }).join(', ');
  return `INSERT INTO "${tableName}" (${columnNames}) VALUES (${values});`;
}

