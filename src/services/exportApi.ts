/**
 * Database Export Service
 * 
 * Provides portable export functionality in multiple formats (SQL, JSON, CSV)
 * for single tables, selected tables, or entire databases.
 * Supports cross-account migration via downloadable files.
 */

import { listTables, getTableSchema, getTableData, type ColumnInfo } from './api';

// ============================================================================
// Retry Helper with Exponential Backoff
// ============================================================================

/**
 * Retry a function with exponential backoff for rate limit errors (429/503/504)
 * Per GEMINI.md rules: 2s → 4s → 8s backoff
 */
async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3
): Promise<T> {
    const delays = [2000, 4000, 8000]; // 2s, 4s, 8s per GEMINI.md
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // Check if it's a rate limit or transient error
            const isRetryable =
                lastError.message.includes('429') ||
                lastError.message.includes('503') ||
                lastError.message.includes('504') ||
                lastError.message.includes('Too Many Requests') ||
                lastError.message.includes('rate limit');

            if (!isRetryable || attempt >= maxRetries) {
                throw lastError;
            }

            // Wait with exponential backoff
            const delay = delays[attempt] ?? 8000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError ?? new Error('Retry failed');
}

/**
 * Add delay between operations to avoid rate limiting
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Types
// ============================================================================

export type ExportFormat = 'sql' | 'json' | 'csv';
export type ExportScope = 'full' | 'selective';

export interface ExportOptions {
    format: ExportFormat;
    scope: ExportScope;
    tables?: string[];
    includeSchema: boolean;
    includeData: boolean;
    rowLimit: number;
    deferForeignKeys: boolean;
}

export interface TableExport {
    name: string;
    type: 'table' | 'virtual';
    schema: ColumnInfo[];
    data: Record<string, unknown>[];
    rowCount: number;
    createStatement?: string;
    foreignKeys?: ForeignKeyInfo[];
    indexes?: IndexInfo[];
}

export interface ForeignKeyInfo {
    column: string;
    refTable: string;
    refColumn: string;
    onDelete: string | null;
    onUpdate: string | null;
}

export interface IndexInfo {
    name: string;
    unique: boolean;
    columns: string[];
}

export interface ExportResult {
    format: ExportFormat;
    tables: TableExport[];
    totalRows: number;
    databaseName: string;
    exportedAt: string;
    emptyTableCount: number; // Number of tables with 0 rows (for UX warning)
}

export interface ExportProgress {
    currentTable: string;
    tablesCompleted: number;
    totalTables: number;
    rowsExported: number;
    phase: 'schema' | 'data' | 'generating';
    warning?: string; // Warning message for UX (e.g., empty tables)
}

// ============================================================================
// Core Export Functions
// ============================================================================

/**
 * Export a database (or selected tables) with the given options
 */
export async function exportDatabase(
    databaseId: string,
    databaseName: string,
    options: ExportOptions,
    onProgress?: (progress: ExportProgress) => void
): Promise<Blob> {
    // Get table list
    const allTables = await listTables(databaseId);
    const tablesToExport = options.scope === 'full'
        ? allTables.filter(t => t.type === 'table' || t.type === 'virtual')
        : allTables.filter(t => options.tables?.includes(t.name));

    const tableExports: TableExport[] = [];
    let totalRows = 0;

    // Export each table
    for (let i = 0; i < tablesToExport.length; i++) {
        const table = tablesToExport[i];
        if (!table) continue;

        onProgress?.({
            currentTable: table.name,
            tablesCompleted: i,
            totalTables: tablesToExport.length,
            rowsExported: totalRows,
            phase: 'schema'
        });

        const tableExport: TableExport = {
            name: table.name,
            type: table.type === 'virtual' ? 'virtual' : 'table',
            schema: [],
            data: [],
            rowCount: 0
        };

        // Get schema if requested (with retry for rate limits)
        if (options.includeSchema) {
            tableExport.schema = await withRetry(() => getTableSchema(databaseId, table.name));

            // Generate CREATE TABLE statement for SQL format
            if (options.format === 'sql') {
                tableExport.createStatement = generateCreateTableStatement(
                    table.name,
                    tableExport.schema,
                    table.type === 'virtual'
                );
            }
        }

        // Get data if requested
        if (options.includeData && table.type !== 'virtual') {
            onProgress?.({
                currentTable: table.name,
                tablesCompleted: i,
                totalTables: tablesToExport.length,
                rowsExported: totalRows,
                phase: 'data'
            });

            // Get data with retry for rate limits
            const result = await withRetry(() => getTableData(databaseId, table.name, options.rowLimit));
            tableExport.data = result.results;
            tableExport.rowCount = result.results.length;
            totalRows += tableExport.rowCount;
        }

        tableExports.push(tableExport);

        // Add delay between tables to prevent rate limiting (300ms per GEMINI.md batch guidance)
        if (i < tablesToExport.length - 1) {
            await delay(300);
        }
    }

    // Count tables with no data
    const emptyTableCount = tableExports.filter(t => t.rowCount === 0).length;
    const allTablesEmpty = emptyTableCount === tableExports.length && tableExports.length > 0;

    onProgress?.({
        currentTable: '',
        tablesCompleted: tablesToExport.length,
        totalTables: tablesToExport.length,
        rowsExported: totalRows,
        phase: 'generating',
        ...(allTablesEmpty ? { warning: 'All selected tables are empty. For CSV format, only metadata will be included.' } : {})
    });

    const exportResult: ExportResult = {
        format: options.format,
        tables: tableExports,
        totalRows,
        databaseName,
        exportedAt: new Date().toISOString(),
        emptyTableCount
    };

    // Generate the appropriate format
    switch (options.format) {
        case 'sql':
            return generateSqlDump(exportResult, options.deferForeignKeys);
        case 'json':
            return generateJsonExport(exportResult);
        case 'csv':
            return generateCsvZip(exportResult);
        default:
            throw new Error(`Unsupported export format: ${String(options.format)}`);
    }
}

// ============================================================================
// SQL Format Generation
// ============================================================================

/**
 * Generate a complete SQL dump as a downloadable file
 */
function generateSqlDump(result: ExportResult, deferForeignKeys: boolean): Blob {
    const lines: string[] = [];

    // Header comment
    lines.push('-- ============================================================================');
    lines.push(`-- D1 Manager Database Export`);
    lines.push(`-- Database: ${result.databaseName}`);
    lines.push(`-- Exported: ${result.exportedAt}`);
    lines.push(`-- Tables: ${String(result.tables.length)}`);
    lines.push(`-- Total Rows: ${String(result.totalRows)}`);
    lines.push('-- ============================================================================');
    lines.push('');

    // Foreign key deferral
    if (deferForeignKeys) {
        lines.push('-- Defer foreign key constraints until transaction commits');
        lines.push('PRAGMA defer_foreign_keys = ON;');
        lines.push('');
    }

    lines.push('BEGIN TRANSACTION;');
    lines.push('');

    // CREATE TABLE statements
    for (const table of result.tables) {
        if (table.createStatement) {
            lines.push(`-- Table: ${table.name}`);
            lines.push(table.createStatement);
            lines.push('');
        }
    }

    // INSERT statements
    for (const table of result.tables) {
        if (table.data.length > 0) {
            lines.push(`-- Data for table: ${table.name} (${String(table.rowCount)} rows)`);

            // Get column order from first row
            const firstRow = table.data[0];
            if (firstRow) {
                const columns = Object.keys(firstRow);
                const quotedColumns = columns.map(c => `"${c}"`).join(', ');

                for (const row of table.data) {
                    const values = columns.map(col => formatSqlValue(row[col])).join(', ');
                    lines.push(`INSERT INTO "${table.name}" (${quotedColumns}) VALUES (${values});`);
                }
                lines.push('');
            }
        }
    }

    lines.push('COMMIT;');
    lines.push('');

    // Reset pragma
    if (deferForeignKeys) {
        lines.push('PRAGMA defer_foreign_keys = OFF;');
    }

    const content = lines.join('\n');
    return new Blob([content], { type: 'text/plain;charset=utf-8' });
}

/**
 * Generate CREATE TABLE statement from schema
 */
function generateCreateTableStatement(
    tableName: string,
    schema: ColumnInfo[],
    isVirtual: boolean
): string {
    if (isVirtual) {
        // FTS5 virtual tables need special handling - just add a comment
        return `-- Virtual table (FTS5): ${tableName} - schema export not supported`;
    }

    const columns = schema.map(col => {
        let def = `  "${col.name}" ${col.type || 'TEXT'}`;
        if (col.pk > 0) def += ' PRIMARY KEY';
        if (col.notnull && col.pk === 0) def += ' NOT NULL';
        if (col.dflt_value !== null && col.dflt_value !== undefined) {
            def += ` DEFAULT ${col.dflt_value}`;
        }
        return def;
    });

    return `CREATE TABLE IF NOT EXISTS "${tableName}" (\n${columns.join(',\n')}\n);`;
}

/**
 * Format a value for SQL INSERT statement
 */
function formatSqlValue(value: unknown): string {
    if (value === null || value === undefined) {
        return 'NULL';
    }
    if (typeof value === 'number') {
        return String(value);
    }
    if (typeof value === 'boolean') {
        return value ? '1' : '0';
    }
    if (typeof value === 'object') {
        const jsonStr = JSON.stringify(value);
        return "'" + jsonStr.replace(/'/g, "''") + "'";
    }
    // Value is now string or symbol - handle safely
    const strVal = typeof value === 'string' ? value : JSON.stringify(value);
    return "'" + strVal.replace(/'/g, "''") + "'";
}

// ============================================================================
// JSON Format Generation
// ============================================================================

/**
 * Generate a structured JSON export
 */
function generateJsonExport(result: ExportResult): Blob {
    const output: Record<string, unknown> = {
        meta: {
            format: 'd1-manager-export',
            version: '1.0.0',
            databaseName: result.databaseName,
            exportedAt: result.exportedAt,
            tableCount: result.tables.length,
            totalRows: result.totalRows
        },
        tables: {} as Record<string, unknown>
    };

    const tables = output['tables'] as Record<string, unknown>;

    for (const table of result.tables) {
        tables[table.name] = {
            type: table.type,
            schema: table.schema,
            rowCount: table.rowCount,
            data: table.data
        };
    }

    const content = JSON.stringify(output, null, 2);
    return new Blob([content], { type: 'application/json' });
}

// ============================================================================
// CSV Format Generation (ZIP with multiple files)
// ============================================================================

/**
 * Generate a ZIP file containing CSV files for each table
 */
async function generateCsvZip(result: ExportResult): Promise<Blob> {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    // Add a metadata file
    const metadata = {
        format: 'd1-manager-export',
        version: '1.0.0',
        databaseName: result.databaseName,
        exportedAt: result.exportedAt,
        tables: result.tables.map(t => ({
            name: t.name,
            type: t.type,
            rowCount: t.rowCount,
            columns: t.schema.map(c => ({
                name: c.name,
                type: c.type,
                nullable: !c.notnull,
                primaryKey: c.pk > 0
            }))
        }))
    };
    zip.file('_metadata.json', JSON.stringify(metadata, null, 2));

    // Add CSV file for each table with data
    for (const table of result.tables) {
        if (table.data.length === 0) continue;

        const csvContent = generateCsvContent(table.data, table.schema);
        zip.file(`${table.name}.csv`, csvContent);
    }

    return zip.generateAsync({ type: 'blob' });
}

/**
 * Generate CSV content from table data
 */
function generateCsvContent(
    data: Record<string, unknown>[],
    schema: ColumnInfo[]
): string {
    if (data.length === 0) return '';

    // Use schema order if available, otherwise use first row keys
    const columns = schema.length > 0
        ? schema.map(c => c.name)
        : Object.keys(data[0] ?? {});

    const lines: string[] = [];

    // Header row
    lines.push(columns.map(c => escapeCsvValue(c)).join(','));

    // Data rows
    for (const row of data) {
        const values = columns.map(col => escapeCsvValue(row[col]));
        lines.push(values.join(','));
    }

    return lines.join('\n');
}

/**
 * Escape a value for CSV format
 */
function escapeCsvValue(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }

    let strVal: string;
    if (typeof value === 'object') {
        strVal = JSON.stringify(value);
    } else if (typeof value === 'string') {
        strVal = value;
    } else {
        strVal = JSON.stringify(value);
    }

    // Escape if contains comma, quote, or newline
    if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
        strVal = '"' + strVal.replace(/"/g, '""') + '"';
    }

    return strVal;
}

// ============================================================================
// Download Helpers
// ============================================================================

/**
 * Download a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
}

/**
 * Generate a filename for the export
 */
export function generateExportFilename(
    databaseName: string,
    format: ExportFormat,
    scope: ExportScope
): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const scopeSuffix = scope === 'selective' ? '-partial' : '';

    const extension = format === 'csv' ? 'zip' : format;
    return `${databaseName}${scopeSuffix}-${timestamp}.${extension}`;
}

// ============================================================================
// Convenience Function for Full Export + Download
// ============================================================================

/**
 * Export and download a database in one step
 */
export async function exportAndDownloadDatabase(
    databaseId: string,
    databaseName: string,
    options: ExportOptions,
    onProgress?: (progress: ExportProgress) => void
): Promise<void> {
    const blob = await exportDatabase(databaseId, databaseName, options, onProgress);
    const filename = generateExportFilename(databaseName, options.format, options.scope);
    downloadBlob(blob, filename);
}

// ============================================================================
// Default Export Options
// ============================================================================

export function getDefaultExportOptions(): ExportOptions {
    return {
        format: 'sql',
        scope: 'full',
        includeSchema: true,
        includeData: true,
        rowLimit: 50000,
        deferForeignKeys: true
    };
}

// ============================================================================
// Batch Export (Multiple Databases)
// ============================================================================

export interface BatchExportProgress {
    currentDatabase: string;
    databasesCompleted: number;
    totalDatabases: number;
    overallProgress: number;
}

/**
 * Export multiple databases in selected format and download as ZIP
 * Per GEMINI.md: Uses 300ms delay between databases and retry logic for rate limiting
 */
export async function exportAndDownloadMultipleDatabases(
    databases: { uuid: string; name: string }[],
    format: ExportFormat,
    onProgress?: (progress: BatchExportProgress) => void
): Promise<{ skipped: { name: string; reason: string }[] }> {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const skipped: { name: string; reason: string }[] = [];

    const options = getDefaultExportOptions();
    options.format = format;

    for (let i = 0; i < databases.length; i++) {
        const db = databases[i];
        if (!db) continue;

        onProgress?.({
            currentDatabase: db.name,
            databasesCompleted: i,
            totalDatabases: databases.length,
            overallProgress: Math.round((i / databases.length) * 100)
        });

        try {
            const blob = await exportDatabase(db.uuid, db.name, options);
            const content = await blob.arrayBuffer();

            // Determine filename based on format
            const extension = format === 'csv' ? 'zip' : format;
            zip.file(`${db.name}.${extension}`, content);
        } catch (err) {
            skipped.push({
                name: db.name,
                reason: err instanceof Error ? err.message : 'Export failed'
            });
        }

        // Add delay between databases to prevent rate limiting (300ms per GEMINI.md)
        if (i < databases.length - 1) {
            await delay(300);
        }
    }

    onProgress?.({
        currentDatabase: '',
        databasesCompleted: databases.length,
        totalDatabases: databases.length,
        overallProgress: 100
    });

    // Generate and download the combined ZIP
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const extension = format === 'csv' ? 'zip' : format;
    downloadBlob(zipBlob, `databases-${extension}-${timestamp}.zip`);

    return { skipped };
}
