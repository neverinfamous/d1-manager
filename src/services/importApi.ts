/**
 * Database Import Service
 * 
 * Provides import functionality for D1 Manager export formats (SQL, JSON, CSV).
 * Converts JSON and CSV exports to SQL statements for use with D1's import API.
 */

// ============================================================================
// Types
// ============================================================================

export type ImportFormat = 'sql' | 'json' | 'csv';

export interface DetectedFormat {
    format: ImportFormat;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
}

export interface ImportPreview {
    format: ImportFormat;
    tables: TablePreview[];
    totalRows: number;
    estimatedSqlSize: number;
    warnings: string[];
}

export interface TablePreview {
    name: string;
    columns: string[];
    rowCount: number;
    hasSchema: boolean;
}

export interface D1ManagerExportJson {
    meta: {
        format: string;
        version: string;
        databaseName: string;
        exportedAt: string;
        tableCount: number;
        totalRows: number;
    };
    tables: Record<string, {
        type: 'table' | 'virtual';
        schema: {
            name: string;
            type: string;
            notnull: number;
            pk: number;
            dflt_value: string | null;
        }[];
        rowCount: number;
        data: Record<string, unknown>[];
    }>;
}

export interface CsvMetadata {
    format: string;
    version: string;
    databaseName: string;
    exportedAt: string;
    tables: {
        name: string;
        type: 'table' | 'virtual';
        rowCount: number;
        columns: {
            name: string;
            type: string;
            nullable: boolean;
            primaryKey: boolean;
        }[];
    }[];
}

// ============================================================================
// Format Detection
// ============================================================================

/**
 * Detect the format of uploaded content
 */
export function detectFormat(content: string, filename?: string): DetectedFormat {
    // Check filename extension first
    if (filename) {
        const ext = filename.toLowerCase().split('.').pop();
        if (ext === 'sql') {
            return { format: 'sql', confidence: 'high', reason: 'File extension .sql' };
        }
        if (ext === 'json') {
            return { format: 'json', confidence: 'high', reason: 'File extension .json' };
        }
        if (ext === 'csv') {
            return { format: 'csv', confidence: 'high', reason: 'File extension .csv' };
        }
        if (ext === 'zip') {
            return { format: 'csv', confidence: 'high', reason: 'ZIP file (CSV export)' };
        }
    }

    // Content-based detection
    const trimmed = content.trim();

    // JSON detection
    if (trimmed.startsWith('{')) {
        try {
            const parsed = JSON.parse(trimmed) as Record<string, unknown>;
            if (parsed['meta'] && parsed['tables']) {
                return { format: 'json', confidence: 'high', reason: 'D1 Manager JSON export format' };
            }
            return { format: 'json', confidence: 'medium', reason: 'JSON structure detected' };
        } catch {
            // Not valid JSON, continue
        }
    }

    // SQL detection - look for common SQL keywords
    const sqlPatterns = [
        /^\s*--/m,                           // SQL comment
        /^\s*CREATE\s+TABLE/im,              // CREATE TABLE
        /^\s*INSERT\s+INTO/im,               // INSERT
        /^\s*BEGIN\s+TRANSACTION/im,         // Transaction
        /^\s*PRAGMA/im,                      // SQLite pragma
    ];

    for (const pattern of sqlPatterns) {
        if (pattern.test(trimmed)) {
            return { format: 'sql', confidence: 'high', reason: 'SQL keywords detected' };
        }
    }

    // CSV detection - check for comma-separated values pattern
    const lines = trimmed.split('\n').slice(0, 5);
    const commaCount = lines.filter(line => line.includes(',')).length;
    if (commaCount >= 3 && lines.length >= 2) {
        return { format: 'csv', confidence: 'medium', reason: 'CSV pattern detected' };
    }

    // Default to SQL if uncertain
    return { format: 'sql', confidence: 'low', reason: 'Unable to detect format, assuming SQL' };
}

// ============================================================================
// JSON Import
// ============================================================================

/**
 * Parse and preview a D1 Manager JSON export
 */
export function parseJsonExport(content: string): ImportPreview {
    const data = JSON.parse(content) as D1ManagerExportJson;
    const warnings: string[] = [];
    const tables: TablePreview[] = [];
    let totalRows = 0;

    if (data.meta?.format !== 'd1-manager-export') {
        warnings.push('File does not appear to be a D1 Manager export. Import may fail.');
    }

    for (const [tableName, tableData] of Object.entries(data.tables)) {
        tables.push({
            name: tableName,
            columns: tableData.schema.map(c => c.name),
            rowCount: tableData.rowCount,
            hasSchema: tableData.schema.length > 0
        });
        totalRows += tableData.rowCount;

        if (tableData.type === 'virtual') {
            warnings.push(`Table "${tableName}" is a virtual table (FTS5) - schema may need manual recreation.`);
        }
    }

    // Estimate SQL size (rough: 100 bytes per row average)
    const estimatedSqlSize = totalRows * 100;

    return {
        format: 'json',
        tables,
        totalRows,
        estimatedSqlSize,
        warnings
    };
}

/**
 * Convert D1 Manager JSON export to SQL statements
 */
export function convertJsonToSql(content: string, options: {
    includeSchema?: boolean;
    deferForeignKeys?: boolean;
} = {}): string {
    const { includeSchema = true, deferForeignKeys = true } = options;
    const data = JSON.parse(content) as D1ManagerExportJson;
    const lines: string[] = [];

    // Header
    lines.push('-- Converted from D1 Manager JSON export');
    lines.push(`-- Original database: ${data.meta?.databaseName ?? 'unknown'}`);
    lines.push(`-- Exported at: ${data.meta?.exportedAt ?? 'unknown'}`);
    lines.push('');

    if (deferForeignKeys) {
        lines.push('PRAGMA defer_foreign_keys = ON;');
        lines.push('');
    }

    // Process each table
    for (const [tableName, tableData] of Object.entries(data.tables)) {
        // Skip virtual tables for schema
        if (tableData.type === 'virtual') {
            lines.push(`-- Virtual table (FTS5): ${tableName} - schema not included`);
            lines.push('');
            continue;
        }

        // CREATE TABLE statement
        if (includeSchema && tableData.schema.length > 0) {
            const columns = tableData.schema.map(col => {
                let def = `  "${col.name}" ${col.type || 'TEXT'}`;
                if (col.pk > 0) def += ' PRIMARY KEY';
                if (col.notnull && col.pk === 0) def += ' NOT NULL';
                if (col.dflt_value !== null && col.dflt_value !== undefined) {
                    def += ` DEFAULT ${col.dflt_value}`;
                }
                return def;
            });

            lines.push(`CREATE TABLE IF NOT EXISTS "${tableName}" (`);
            lines.push(columns.join(',\n'));
            lines.push(');');
            lines.push('');
        }

        // INSERT statements
        if (tableData.data.length > 0) {
            lines.push(`-- Data for ${tableName} (${String(tableData.rowCount)} rows)`);

            const firstRow = tableData.data[0];
            if (firstRow) {
                const columnNames = Object.keys(firstRow);
                const quotedColumns = columnNames.map(c => `"${c}"`).join(', ');

                for (const row of tableData.data) {
                    const values = columnNames.map(col => formatSqlValue(row[col])).join(', ');
                    lines.push(`INSERT INTO "${tableName}" (${quotedColumns}) VALUES (${values});`);
                }
                lines.push('');
            }
        }
    }

    if (deferForeignKeys) {
        lines.push('PRAGMA defer_foreign_keys = OFF;');
    }

    return lines.join('\n');
}

// ============================================================================
// CSV Import (ZIP)
// ============================================================================

/**
 * Parse and preview a D1 Manager CSV ZIP export
 */
export async function parseCsvZipExport(file: File): Promise<ImportPreview> {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(file);
    const warnings: string[] = [];
    const tables: TablePreview[] = [];
    let totalRows = 0;

    // Look for metadata file
    const metadataFile = zip.file('_metadata.json');
    let metadata: CsvMetadata | null = null;

    if (metadataFile) {
        try {
            const metadataContent = await metadataFile.async('string');
            metadata = JSON.parse(metadataContent) as CsvMetadata;
        } catch {
            warnings.push('Could not parse metadata file. Table schemas may be incomplete.');
        }
    } else {
        warnings.push('No metadata file found. Table schemas will be inferred from CSV headers.');
    }

    // Process each CSV file
    const csvFiles = Object.keys(zip.files).filter(name => name.endsWith('.csv'));

    for (const csvName of csvFiles) {
        const tableName = csvName.replace('.csv', '');
        const csvFile = zip.file(csvName);

        if (csvFile) {
            const csvContent = await csvFile.async('string');
            const lines = csvContent.split('\n').filter(line => line.trim());
            const rowCount = Math.max(0, lines.length - 1); // Minus header

            // Get columns from header or metadata
            let columns: string[] = [];
            if (metadata) {
                const tableMeta = metadata.tables.find(t => t.name === tableName);
                if (tableMeta) {
                    columns = tableMeta.columns.map(c => c.name);
                }
            }

            if (columns.length === 0 && lines.length > 0) {
                // Parse header from CSV
                const headerLine = lines[0];
                if (headerLine) {
                    columns = parseCsvLine(headerLine);
                }
            }

            tables.push({
                name: tableName,
                columns,
                rowCount,
                hasSchema: metadata !== null
            });
            totalRows += rowCount;
        }
    }

    // Add tables from metadata that don't have CSV files (empty tables)
    if (metadata) {
        const csvTableNames = new Set(tables.map(t => t.name));
        const emptyTables = metadata.tables.filter(t => !csvTableNames.has(t.name));

        for (const emptyTable of emptyTables) {
            tables.push({
                name: emptyTable.name,
                columns: emptyTable.columns.map(c => c.name),
                rowCount: 0,
                hasSchema: true
            });
        }

        if (emptyTables.length > 0) {
            warnings.push(`${String(emptyTables.length)} table(s) have no data and will only have schema created.`);
        }
    }

    // Estimate SQL size
    const estimatedSqlSize = totalRows * 100;

    return {
        format: 'csv',
        tables,
        totalRows,
        estimatedSqlSize,
        warnings
    };
}

/**
 * Convert D1 Manager CSV ZIP export to SQL statements
 */
export async function convertCsvZipToSql(file: File, options: {
    includeSchema?: boolean;
    deferForeignKeys?: boolean;
} = {}): Promise<string> {
    const { includeSchema = true, deferForeignKeys = true } = options;
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(file);
    const lines: string[] = [];

    // Look for metadata
    const metadataFile = zip.file('_metadata.json');
    let metadata: CsvMetadata | null = null;

    if (metadataFile) {
        try {
            const metadataContent = await metadataFile.async('string');
            metadata = JSON.parse(metadataContent) as CsvMetadata;
        } catch {
            // Ignore metadata parse errors
        }
    }

    // Header
    lines.push('-- Converted from D1 Manager CSV export');
    if (metadata) {
        lines.push(`-- Original database: ${metadata.databaseName}`);
        lines.push(`-- Exported at: ${metadata.exportedAt}`);
    }
    lines.push('');

    if (deferForeignKeys) {
        lines.push('PRAGMA defer_foreign_keys = ON;');
        lines.push('');
    }

    // Process each CSV file
    const csvFiles = Object.keys(zip.files).filter(name => name.endsWith('.csv'));

    for (const csvName of csvFiles) {
        const tableName = csvName.replace('.csv', '');
        const csvFile = zip.file(csvName);

        if (!csvFile) continue;

        const csvContent = await csvFile.async('string');
        const csvLines = csvContent.split('\n').filter(line => line.trim());

        if (csvLines.length === 0) continue;

        const headerLine = csvLines[0];
        if (!headerLine) continue;

        const headers = parseCsvLine(headerLine);
        const dataLines = csvLines.slice(1);

        // CREATE TABLE from metadata if available
        if (includeSchema && metadata) {
            const tableMeta = metadata.tables.find(t => t.name === tableName);
            if (tableMeta && tableMeta.type !== 'virtual') {
                const columns = tableMeta.columns.map(col => {
                    let def = `  "${col.name}" ${col.type || 'TEXT'}`;
                    if (col.primaryKey) def += ' PRIMARY KEY';
                    if (!col.nullable && !col.primaryKey) def += ' NOT NULL';
                    return def;
                });

                lines.push(`CREATE TABLE IF NOT EXISTS "${tableName}" (`);
                lines.push(columns.join(',\n'));
                lines.push(');');
                lines.push('');
            }
        }

        // INSERT statements
        if (dataLines.length > 0) {
            lines.push(`-- Data for ${tableName} (${String(dataLines.length)} rows)`);
            const quotedColumns = headers.map(c => `"${c}"`).join(', ');

            for (const dataLine of dataLines) {
                const values = parseCsvLine(dataLine);
                const sqlValues = values.map(v => formatSqlValue(v)).join(', ');
                lines.push(`INSERT INTO "${tableName}" (${quotedColumns}) VALUES (${sqlValues});`);
            }
            lines.push('');
        }
    }

    // Generate CREATE TABLE for empty tables (tables in metadata but without CSV files)
    if (includeSchema && metadata) {
        const csvTableNames = new Set(csvFiles.map(n => n.replace('.csv', '')));
        const emptyTables = metadata.tables.filter(t => !csvTableNames.has(t.name) && t.type !== 'virtual');

        if (emptyTables.length > 0) {
            lines.push('-- Empty tables (schema only, no data)');
            for (const tableMeta of emptyTables) {
                const columns = tableMeta.columns.map(col => {
                    let def = `  "${col.name}" ${col.type || 'TEXT'}`;
                    if (col.primaryKey) def += ' PRIMARY KEY';
                    if (!col.nullable && !col.primaryKey) def += ' NOT NULL';
                    return def;
                });

                lines.push(`CREATE TABLE IF NOT EXISTS "${tableMeta.name}" (`);
                lines.push(columns.join(',\n'));
                lines.push(');');
                lines.push('');
            }
        }
    }

    if (deferForeignKeys) {
        lines.push('PRAGMA defer_foreign_keys = OFF;');
    }

    return lines.join('\n');
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse a CSV line respecting quoted values
 */
function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // Escaped quote
                current += '"';
                i++;
            } else {
                // Toggle quote state
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    result.push(current);
    return result;
}

/**
 * Format a value for SQL INSERT statement
 */
function formatSqlValue(value: unknown): string {
    if (value === null || value === undefined || value === '') {
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
    const strVal = typeof value === 'string' ? value : JSON.stringify(value);
    return "'" + strVal.replace(/'/g, "''") + "'";
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate SQL content before import
 */
export function validateSqlContent(sql: string): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for dangerous operations
    if (/DROP\s+TABLE/i.test(sql)) {
        warnings.push('SQL contains DROP TABLE statements. Existing tables may be deleted.');
    }
    if (/DELETE\s+FROM/i.test(sql) && !/WHERE/i.test(sql)) {
        warnings.push('SQL contains DELETE statements without WHERE clause. All rows may be deleted.');
    }

    // Check for potentially problematic statements
    if (/ATTACH\s+DATABASE/i.test(sql)) {
        errors.push('ATTACH DATABASE is not supported in D1.');
    }
    if (/DETACH\s+DATABASE/i.test(sql)) {
        errors.push('DETACH DATABASE is not supported in D1.');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}
