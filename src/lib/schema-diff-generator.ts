/**
 * Schema Difference Generator
 * 
 * Generates migration SQL scripts from schema comparison results.
 * Handles SQLite-specific constraints like table recreation for column modifications.
 */

// #region Types

export type MigrationStepType =
    | 'create_table'
    | 'drop_table'
    | 'add_column'
    | 'drop_column'
    | 'modify_column'
    | 'create_index'
    | 'drop_index'
    | 'add_foreign_key'
    | 'drop_foreign_key'
    | 'create_trigger'
    | 'drop_trigger';

export type RiskLevel = 'safe' | 'warning' | 'danger';

export interface MigrationStep {
    type: MigrationStepType;
    sql: string;
    table: string;
    object?: string; // column/index/fk/trigger name
    risk: RiskLevel;
    note?: string;
}

export interface ColumnInfo {
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
}

export interface TableWithColumns {
    name: string;
    type: string;
    strict: number;
    columns: ColumnInfo[];
}

export interface IndexInfo {
    table: string;
    name: string;
    unique: number;
    columns: string[];
    partial?: number;
}

export interface TriggerInfo {
    name: string;
    table: string;
    sql: string;
}

export interface ForeignKeyInfo {
    table: string;
    column: string;
    refTable: string;
    refColumn: string;
    onDelete: string;
    onUpdate: string;
}

export interface FullDatabaseSchema {
    tables: TableWithColumns[];
    indexes: IndexInfo[];
    triggers: TriggerInfo[];
    foreignKeys: ForeignKeyInfo[];
}

export interface SchemaDiff {
    table: string;
    status: 'added' | 'removed' | 'modified' | 'unchanged';
    columnDiffs?: ColumnDiff[];
}

export interface ColumnDiff {
    column: string;
    status: 'added' | 'removed' | 'modified' | 'unchanged';
    leftDef?: string;
    rightDef?: string;
    leftColumn?: ColumnInfo;
    rightColumn?: ColumnInfo;
}

export interface ExtendedSchemaDiff extends SchemaDiff {
    indexDiffs?: IndexDiff[];
    fkDiffs?: ForeignKeyDiff[];
    triggerDiffs?: TriggerDiff[];
    tableInfo?: {
        left?: TableWithColumns;
        right?: TableWithColumns;
    };
}

export interface IndexDiff {
    name: string;
    status: 'added' | 'removed' | 'modified';
    leftIndex?: IndexInfo;
    rightIndex?: IndexInfo;
}

export interface ForeignKeyDiff {
    key: string; // table.column -> refTable.refColumn
    status: 'added' | 'removed' | 'modified';
    leftFk?: ForeignKeyInfo;
    rightFk?: ForeignKeyInfo;
}

export interface TriggerDiff {
    name: string;
    status: 'added' | 'removed' | 'modified';
    leftTrigger?: TriggerInfo;
    rightTrigger?: TriggerInfo;
}

// #endregion

// #region Comparison Functions

/**
 * Compare two full database schemas and return extended diffs
 */
export function compareFullSchemas(
    left: FullDatabaseSchema,
    right: FullDatabaseSchema
): ExtendedSchemaDiff[] {
    const leftTableMap = new Map(left.tables.map(t => [t.name, t]));
    const rightTableMap = new Map(right.tables.map(t => [t.name, t]));
    const allTableNames = new Set([...leftTableMap.keys(), ...rightTableMap.keys()]);

    const diffs: ExtendedSchemaDiff[] = [];

    for (const tableName of allTableNames) {
        const leftTable = leftTableMap.get(tableName);
        const rightTable = rightTableMap.get(tableName);

        if (leftTable && !rightTable) {
            // Table removed (exists in left/source, not in right/target)
            diffs.push({
                table: tableName,
                status: 'removed',
                tableInfo: { left: leftTable }
            });
        } else if (!leftTable && rightTable) {
            // Table added (exists in right/target, not in left/source)
            diffs.push({
                table: tableName,
                status: 'added',
                tableInfo: { right: rightTable }
            });
        } else if (leftTable && rightTable) {
            // Compare columns
            const columnDiffs = compareColumns(leftTable.columns, rightTable.columns);
            const hasColumnChanges = columnDiffs.some(c => c.status !== 'unchanged');

            // Compare indexes for this table
            const leftIndexes = left.indexes.filter(i => i.table === tableName);
            const rightIndexes = right.indexes.filter(i => i.table === tableName);
            const indexDiffs = compareIndexes(leftIndexes, rightIndexes);

            // Compare foreign keys for this table
            const leftFks = left.foreignKeys.filter(fk => fk.table === tableName);
            const rightFks = right.foreignKeys.filter(fk => fk.table === tableName);
            const fkDiffs = compareForeignKeys(leftFks, rightFks);

            // Compare triggers for this table
            const leftTriggers = left.triggers.filter(t => t.table === tableName);
            const rightTriggers = right.triggers.filter(t => t.table === tableName);
            const triggerDiffs = compareTriggers(leftTriggers, rightTriggers);

            const hasIndexChanges = indexDiffs.length > 0;
            const hasFkChanges = fkDiffs.length > 0;
            const hasTriggerChanges = triggerDiffs.length > 0;

            if (hasColumnChanges || hasIndexChanges || hasFkChanges || hasTriggerChanges) {
                const modifiedDiff: ExtendedSchemaDiff = {
                    table: tableName,
                    status: 'modified',
                    columnDiffs,
                    tableInfo: { left: leftTable, right: rightTable }
                };
                if (indexDiffs.length > 0) modifiedDiff.indexDiffs = indexDiffs;
                if (fkDiffs.length > 0) modifiedDiff.fkDiffs = fkDiffs;
                if (triggerDiffs.length > 0) modifiedDiff.triggerDiffs = triggerDiffs;
                diffs.push(modifiedDiff);
            } else {
                diffs.push({
                    table: tableName,
                    status: 'unchanged',
                    tableInfo: { left: leftTable, right: rightTable }
                });
            }
        }
    }

    return diffs;
}

function compareColumns(leftCols: ColumnInfo[], rightCols: ColumnInfo[]): ColumnDiff[] {
    const leftColMap = new Map(leftCols.map(c => [c.name, c]));
    const rightColMap = new Map(rightCols.map(c => [c.name, c]));
    const allColNames = new Set([...leftColMap.keys(), ...rightColMap.keys()]);

    const diffs: ColumnDiff[] = [];

    for (const colName of allColNames) {
        const leftCol = leftColMap.get(colName);
        const rightCol = rightColMap.get(colName);

        if (leftCol && !rightCol) {
            diffs.push({
                column: colName,
                status: 'removed',
                leftDef: formatColumnDef(leftCol),
                leftColumn: leftCol
            });
        } else if (!leftCol && rightCol) {
            diffs.push({
                column: colName,
                status: 'added',
                rightDef: formatColumnDef(rightCol),
                rightColumn: rightCol
            });
        } else if (leftCol && rightCol) {
            const leftDef = formatColumnDef(leftCol);
            const rightDef = formatColumnDef(rightCol);
            const isModified = leftDef !== rightDef;

            diffs.push({
                column: colName,
                status: isModified ? 'modified' : 'unchanged',
                leftDef,
                rightDef,
                leftColumn: leftCol,
                rightColumn: rightCol
            });
        }
    }

    return diffs;
}

function compareIndexes(leftIndexes: IndexInfo[], rightIndexes: IndexInfo[]): IndexDiff[] {
    const leftIndexMap = new Map(leftIndexes.map(i => [i.name, i]));
    const rightIndexMap = new Map(rightIndexes.map(i => [i.name, i]));
    const allIndexNames = new Set([...leftIndexMap.keys(), ...rightIndexMap.keys()]);

    const diffs: IndexDiff[] = [];

    for (const indexName of allIndexNames) {
        const leftIndex = leftIndexMap.get(indexName);
        const rightIndex = rightIndexMap.get(indexName);

        if (leftIndex && !rightIndex) {
            diffs.push({ name: indexName, status: 'removed', leftIndex });
        } else if (!leftIndex && rightIndex) {
            diffs.push({ name: indexName, status: 'added', rightIndex });
        } else if (leftIndex && rightIndex) {
            // Check if index definition changed
            const leftCols = leftIndex.columns.join(',');
            const rightCols = rightIndex.columns.join(',');
            if (leftCols !== rightCols || leftIndex.unique !== rightIndex.unique) {
                diffs.push({ name: indexName, status: 'modified', leftIndex, rightIndex });
            }
        }
    }

    return diffs;
}

function compareForeignKeys(leftFks: ForeignKeyInfo[], rightFks: ForeignKeyInfo[]): ForeignKeyDiff[] {
    const fkKey = (fk: ForeignKeyInfo): string => fk.table + '.' + fk.column + '->' + fk.refTable + '.' + fk.refColumn;

    const leftFkMap = new Map(leftFks.map(fk => [fkKey(fk), fk]));
    const rightFkMap = new Map(rightFks.map(fk => [fkKey(fk), fk]));
    const allFkKeys = new Set([...leftFkMap.keys(), ...rightFkMap.keys()]);

    const diffs: ForeignKeyDiff[] = [];

    for (const key of allFkKeys) {
        const leftFk = leftFkMap.get(key);
        const rightFk = rightFkMap.get(key);

        if (leftFk && !rightFk) {
            diffs.push({ key, status: 'removed', leftFk });
        } else if (!leftFk && rightFk) {
            diffs.push({ key, status: 'added', rightFk });
        } else if (leftFk && rightFk) {
            // Check if FK definition changed (e.g., ON DELETE action)
            if (leftFk.onDelete !== rightFk.onDelete || leftFk.onUpdate !== rightFk.onUpdate) {
                diffs.push({ key, status: 'modified', leftFk, rightFk });
            }
        }
    }

    return diffs;
}

function compareTriggers(leftTriggers: TriggerInfo[], rightTriggers: TriggerInfo[]): TriggerDiff[] {
    const leftTriggerMap = new Map(leftTriggers.map(t => [t.name, t]));
    const rightTriggerMap = new Map(rightTriggers.map(t => [t.name, t]));
    const allTriggerNames = new Set([...leftTriggerMap.keys(), ...rightTriggerMap.keys()]);

    const diffs: TriggerDiff[] = [];

    for (const triggerName of allTriggerNames) {
        const leftTrigger = leftTriggerMap.get(triggerName);
        const rightTrigger = rightTriggerMap.get(triggerName);

        if (leftTrigger && !rightTrigger) {
            diffs.push({ name: triggerName, status: 'removed', leftTrigger });
        } else if (!leftTrigger && rightTrigger) {
            diffs.push({ name: triggerName, status: 'added', rightTrigger });
        } else if (leftTrigger && rightTrigger) {
            // Check if trigger SQL changed
            if (leftTrigger.sql !== rightTrigger.sql) {
                diffs.push({ name: triggerName, status: 'modified', leftTrigger, rightTrigger });
            }
        }
    }

    return diffs;
}

// #endregion

// #region Migration Script Generation

/**
 * Generate migration steps from schema diffs
 * Target: Apply changes to make LEFT database look like RIGHT database
 */
export function generateMigrationSteps(diffs: ExtendedSchemaDiff[]): MigrationStep[] {
    const steps: MigrationStep[] = [];

    for (const diff of diffs) {
        switch (diff.status) {
            case 'added':
                // Table exists in RIGHT (target) but not in LEFT (source)
                // Need to CREATE TABLE
                if (diff.tableInfo?.right) {
                    steps.push(generateCreateTableStep(diff.tableInfo.right));
                }
                break;

            case 'removed':
                // Table exists in LEFT (source) but not in RIGHT (target)
                // Need to DROP TABLE
                steps.push({
                    type: 'drop_table',
                    sql: `DROP TABLE IF EXISTS "${diff.table}";`,
                    table: diff.table,
                    risk: 'danger',
                    note: 'This will permanently delete all data in this table'
                });
                break;

            case 'modified':
                // Generate column modification steps
                if (diff.columnDiffs) {
                    steps.push(...generateColumnMigrationSteps(diff.table, diff.columnDiffs, diff.tableInfo?.right));
                }

                // Generate index modification steps
                if (diff.indexDiffs) {
                    steps.push(...generateIndexMigrationSteps(diff.table, diff.indexDiffs));
                }

                // Generate FK modification steps
                if (diff.fkDiffs) {
                    steps.push(...generateFKMigrationSteps(diff.table, diff.fkDiffs));
                }

                // Generate trigger modification steps
                if (diff.triggerDiffs) {
                    steps.push(...generateTriggerMigrationSteps(diff.table, diff.triggerDiffs));
                }
                break;
        }
    }

    return steps;
}

function generateCreateTableStep(table: TableWithColumns): MigrationStep {
    const columnDefs = table.columns.map(col => {
        let def = `"${col.name}" ${col.type || 'TEXT'}`;
        if (col.pk > 0) def += ' PRIMARY KEY';
        if (col.notnull && col.pk === 0) def += ' NOT NULL';
        if (col.dflt_value !== null) def += ` DEFAULT ${col.dflt_value}`;
        return def;
    }).join(',\n  ');

    const strictSuffix = table.strict ? ' STRICT' : '';

    return {
        type: 'create_table',
        sql: `CREATE TABLE "${table.name}" (\n  ${columnDefs}\n)${strictSuffix};`,
        table: table.name,
        risk: 'safe',
        note: `Creates new table with ${table.columns.length} columns`
    };
}

function generateColumnMigrationSteps(
    tableName: string,
    columnDiffs: ColumnDiff[],
    targetTable?: TableWithColumns
): MigrationStep[] {
    const steps: MigrationStep[] = [];

    for (const diff of columnDiffs) {
        switch (diff.status) {
            case 'added':
                if (diff.rightColumn) {
                    const col = diff.rightColumn;
                    let colDef = col.type || 'TEXT';
                    if (col.notnull && col.dflt_value === null) {
                        // SQLite requires DEFAULT for NOT NULL columns added to existing tables
                        colDef += ` NOT NULL DEFAULT ''`;
                        steps.push({
                            type: 'add_column',
                            sql: `ALTER TABLE "${tableName}" ADD COLUMN "${col.name}" ${colDef};`,
                            table: tableName,
                            object: col.name,
                            risk: 'warning',
                            note: 'Adding NOT NULL column requires default value for existing rows'
                        });
                    } else {
                        if (col.notnull) colDef += ' NOT NULL';
                        if (col.dflt_value !== null) colDef += ` DEFAULT ${col.dflt_value}`;
                        steps.push({
                            type: 'add_column',
                            sql: `ALTER TABLE "${tableName}" ADD COLUMN "${col.name}" ${colDef};`,
                            table: tableName,
                            object: col.name,
                            risk: 'safe'
                        });
                    }
                }
                break;

            case 'removed':
                // SQLite does not support DROP COLUMN directly in older versions
                // We need to recreate the table
                steps.push({
                    type: 'drop_column',
                    sql: `-- SQLite requires table recreation to drop columns\n-- Column "${diff.column}" needs to be removed from "${tableName}"`,
                    table: tableName,
                    object: diff.column,
                    risk: 'danger',
                    note: 'Dropping column requires table recreation - see generated table recreation script below'
                });
                break;

            case 'modified':
                // SQLite does not support modifying columns directly
                steps.push({
                    type: 'modify_column',
                    sql: `-- SQLite requires table recreation to modify columns\n-- Column "${diff.column}" type/constraints changed\n-- From: ${diff.leftDef ?? 'unknown'}\n-- To: ${diff.rightDef ?? 'unknown'}`,
                    table: tableName,
                    object: diff.column,
                    risk: 'warning',
                    note: 'Modifying column type/constraints requires table recreation'
                });
                break;
        }
    }

    // If we have column drops or modifications, generate full table recreation script
    const hasComplexChanges = columnDiffs.some(d => d.status === 'removed' || d.status === 'modified');
    if (hasComplexChanges && targetTable) {
        steps.push(generateTableRecreationStep(tableName, targetTable));
    }

    return steps;
}

function generateTableRecreationStep(tableName: string, targetTable: TableWithColumns): MigrationStep {
    const tempTableName = `${tableName}_migration_temp`;
    const columnDefs = targetTable.columns.map(col => {
        let def = `"${col.name}" ${col.type || 'TEXT'}`;
        if (col.pk > 0) def += ' PRIMARY KEY';
        if (col.notnull && col.pk === 0) def += ' NOT NULL';
        if (col.dflt_value !== null) def += ` DEFAULT ${col.dflt_value}`;
        return def;
    }).join(',\n  ');

    const colNames = targetTable.columns.map(c => `"${c.name}"`).join(', ');
    const strictSuffix = targetTable.strict ? ' STRICT' : '';

    const sql = `-- Table Recreation for "${tableName}"
-- This is required because SQLite doesn't support DROP/MODIFY COLUMN directly

PRAGMA foreign_keys = OFF;

CREATE TABLE "${tempTableName}" (
  ${columnDefs}
)${strictSuffix};

INSERT INTO "${tempTableName}" (${colNames})
SELECT ${colNames} FROM "${tableName}";

DROP TABLE "${tableName}";

ALTER TABLE "${tempTableName}" RENAME TO "${tableName}";

PRAGMA foreign_keys = ON;`;

    return {
        type: 'modify_column',
        sql,
        table: tableName,
        risk: 'danger',
        note: 'Table recreation script - backup recommended before running'
    };
}

function generateIndexMigrationSteps(tableName: string, indexDiffs: IndexDiff[]): MigrationStep[] {
    const steps: MigrationStep[] = [];

    for (const diff of indexDiffs) {
        switch (diff.status) {
            case 'added':
                if (diff.rightIndex) {
                    const idx = diff.rightIndex;
                    const uniqueStr = idx.unique ? 'UNIQUE ' : '';
                    const colList = idx.columns.map(c => `"${c}"`).join(', ');
                    steps.push({
                        type: 'create_index',
                        sql: `CREATE ${uniqueStr}INDEX "${idx.name}" ON "${tableName}" (${colList});`,
                        table: tableName,
                        object: idx.name,
                        risk: 'safe'
                    });
                }
                break;

            case 'removed':
                steps.push({
                    type: 'drop_index',
                    sql: `DROP INDEX IF EXISTS "${diff.name}";`,
                    table: tableName,
                    object: diff.name,
                    risk: 'warning',
                    note: 'Dropping index may affect query performance'
                });
                break;

            case 'modified':
                // Drop and recreate
                if (diff.rightIndex) {
                    const idx = diff.rightIndex;
                    const uniqueStr = idx.unique ? 'UNIQUE ' : '';
                    const colList = idx.columns.map(c => `"${c}"`).join(', ');
                    steps.push({
                        type: 'drop_index',
                        sql: `DROP INDEX IF EXISTS "${diff.name}";`,
                        table: tableName,
                        object: diff.name,
                        risk: 'warning'
                    });
                    steps.push({
                        type: 'create_index',
                        sql: `CREATE ${uniqueStr}INDEX "${idx.name}" ON "${tableName}" (${colList});`,
                        table: tableName,
                        object: idx.name,
                        risk: 'safe'
                    });
                }
                break;
        }
    }

    return steps;
}

function generateFKMigrationSteps(tableName: string, fkDiffs: ForeignKeyDiff[]): MigrationStep[] {
    const steps: MigrationStep[] = [];

    for (const diff of fkDiffs) {
        if (diff.status === 'added' || diff.status === 'removed' || diff.status === 'modified') {
            // Foreign key changes require table recreation in SQLite
            steps.push({
                type: diff.status === 'added' ? 'add_foreign_key' : diff.status === 'removed' ? 'drop_foreign_key' : 'add_foreign_key',
                sql: `-- Foreign key ${diff.status}: ${diff.key}\n-- SQLite requires table recreation to modify foreign keys`,
                table: tableName,
                object: diff.key,
                risk: 'danger',
                note: 'Foreign key changes require table recreation'
            });
        }
    }

    return steps;
}

function generateTriggerMigrationSteps(tableName: string, triggerDiffs: TriggerDiff[]): MigrationStep[] {
    const steps: MigrationStep[] = [];

    for (const diff of triggerDiffs) {
        switch (diff.status) {
            case 'added':
                if (diff.rightTrigger) {
                    steps.push({
                        type: 'create_trigger',
                        sql: diff.rightTrigger.sql + ';',
                        table: tableName,
                        object: diff.name,
                        risk: 'warning',
                        note: 'Adding trigger - ensure logic is correct'
                    });
                }
                break;

            case 'removed':
                steps.push({
                    type: 'drop_trigger',
                    sql: `DROP TRIGGER IF EXISTS "${diff.name}";`,
                    table: tableName,
                    object: diff.name,
                    risk: 'warning',
                    note: 'Dropping trigger may affect application logic'
                });
                break;

            case 'modified':
                if (diff.rightTrigger) {
                    steps.push({
                        type: 'drop_trigger',
                        sql: `DROP TRIGGER IF EXISTS "${diff.name}";`,
                        table: tableName,
                        object: diff.name,
                        risk: 'warning'
                    });
                    steps.push({
                        type: 'create_trigger',
                        sql: diff.rightTrigger.sql + ';',
                        table: tableName,
                        object: diff.name,
                        risk: 'warning'
                    });
                }
                break;
        }
    }

    return steps;
}

// #endregion

// #region Formatting

export function formatColumnDef(col: ColumnInfo): string {
    let def = col.type || 'ANY';
    if (col.pk > 0) def += ' PRIMARY KEY';
    if (col.notnull && col.pk === 0) def += ' NOT NULL';
    if (col.dflt_value) def += ` DEFAULT ${col.dflt_value}`;
    return def;
}

/**
 * Format migration steps as a complete SQL script
 */
export function formatMigrationAsSQL(
    steps: MigrationStep[],
    options?: {
        leftDbName?: string;
        rightDbName?: string;
        includeComments?: boolean;
    }
): string {
    const { leftDbName = 'source', rightDbName = 'target', includeComments = true } = options ?? {};

    const lines: string[] = [];

    if (includeComments) {
        lines.push(`-- Migration Script`);
        lines.push(`-- From: ${leftDbName}`);
        lines.push(`-- To: ${rightDbName}`);
        lines.push(`-- Generated: ${new Date().toISOString()}`);
        lines.push(`--`);
        lines.push(`-- WARNING: Review carefully before executing!`);
        lines.push(`-- Backup your database before running this script.`);
        lines.push('');
    }

    // Group steps by table for readability
    const stepsByTable = new Map<string, MigrationStep[]>();
    for (const step of steps) {
        const existing = stepsByTable.get(step.table) ?? [];
        existing.push(step);
        stepsByTable.set(step.table, existing);
    }

    for (const [table, tableSteps] of stepsByTable) {
        if (includeComments) {
            lines.push(`-- =============================================`);
            lines.push(`-- Table: ${table}`);
            lines.push(`-- =============================================`);
            lines.push('');
        }

        for (const step of tableSteps) {
            if (includeComments && step.note) {
                lines.push(`-- ${step.note}`);
            }
            lines.push(step.sql);
            lines.push('');
        }
    }

    return lines.join('\n');
}

/**
 * Get summary statistics for migration steps
 */
export function getMigrationStats(steps: MigrationStep[]): {
    safe: number;
    warning: number;
    danger: number;
    total: number;
    byType: Record<MigrationStepType, number>;
} {
    const stats = {
        safe: 0,
        warning: 0,
        danger: 0,
        total: steps.length,
        byType: {} as Record<MigrationStepType, number>
    };

    for (const step of steps) {
        stats[step.risk]++;
        stats.byType[step.type] = (stats.byType[step.type] ?? 0) + 1;
    }

    return stats;
}

// #endregion
