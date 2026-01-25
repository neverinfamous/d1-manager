import type { Env } from "../types";
import { logInfo, logWarning } from "./error-logger";

/**
 * Drizzle schema column definition
 */
interface DrizzleColumn {
  name: string;
  type: string;
  drizzleType: string;
  isPrimaryKey: boolean;
  isAutoIncrement: boolean;
  isNotNull: boolean;
  defaultValue: string | null;
  isUnique: boolean;
}

/**
 * Drizzle schema table definition
 */
interface DrizzleTable {
  name: string;
  columns: DrizzleColumn[];
  primaryKey: string[];
  foreignKeys: {
    columns: string[];
    references: { table: string; columns: string[] };
    onDelete?: string;
    onUpdate?: string;
  }[];
  indexes: {
    name: string;
    columns: string[];
    isUnique: boolean;
  }[];
}

/**
 * Result of schema introspection
 */
export interface IntrospectionResult {
  success: boolean;
  schema?: string;
  tables?: DrizzleTable[];
  error?: string;
}

/**
 * Map SQLite types to Drizzle SQLite types
 */
function mapSqliteTypeToDrizzle(sqliteType: string): string {
  const upperType = sqliteType.toUpperCase().trim();

  // Integer types
  if (
    upperType === "INTEGER" ||
    upperType === "INT" ||
    upperType === "BIGINT" ||
    upperType === "SMALLINT" ||
    upperType === "TINYINT"
  ) {
    return "integer";
  }

  // Real/float types
  if (
    upperType === "REAL" ||
    upperType === "DOUBLE" ||
    upperType === "FLOAT" ||
    upperType.startsWith("DOUBLE")
  ) {
    return "real";
  }

  // Text types
  if (
    upperType === "TEXT" ||
    upperType.startsWith("VARCHAR") ||
    upperType.startsWith("CHAR") ||
    upperType === "CLOB" ||
    upperType.startsWith("NVARCHAR") ||
    upperType.startsWith("NCHAR")
  ) {
    return "text";
  }

  // Blob type
  if (
    upperType === "BLOB" ||
    upperType === "BINARY" ||
    upperType.startsWith("VARBINARY")
  ) {
    return "blob";
  }

  // Numeric type (for precise decimals)
  if (upperType === "NUMERIC" || upperType.startsWith("DECIMAL")) {
    return "numeric";
  }

  // Boolean (SQLite uses INTEGER for boolean)
  if (upperType === "BOOLEAN" || upperType === "BOOL") {
    return "integer"; // SQLite stores as 0/1
  }

  // Date/time types (SQLite stores as TEXT or INTEGER)
  if (
    upperType === "DATE" ||
    upperType === "DATETIME" ||
    upperType === "TIMESTAMP"
  ) {
    return "text";
  }

  // Default to text for unknown types
  return "text";
}

/**
 * Generate Drizzle column definition code
 */
function generateColumnCode(column: DrizzleColumn, _tableName: string): string {
  const columnName = column.name;
  const drizzleType = column.drizzleType;

  let code = `  ${columnName}: ${drizzleType}('${columnName}')`;

  // Add modifiers
  const modifiers: string[] = [];

  if (column.isPrimaryKey) {
    modifiers.push("primaryKey()");
    if (column.isAutoIncrement) {
      // For SQLite autoincrement with Drizzle
      modifiers.push("{ autoIncrement: true }");
    }
  }

  if (column.isNotNull && !column.isPrimaryKey) {
    modifiers.push("notNull()");
  }

  if (column.isUnique && !column.isPrimaryKey) {
    modifiers.push("unique()");
  }

  if (column.defaultValue !== null) {
    // Handle different default value types
    const defaultVal = column.defaultValue;
    if (
      defaultVal.toUpperCase() === "CURRENT_TIMESTAMP" ||
      defaultVal.toUpperCase() === "CURRENT_DATE"
    ) {
      modifiers.push(`default(sql\`${defaultVal}\`)`);
    } else if (defaultVal.startsWith("'") && defaultVal.endsWith("'")) {
      // String default
      modifiers.push(`default(${defaultVal})`);
    } else if (!isNaN(Number(defaultVal))) {
      // Numeric default
      modifiers.push(`default(${defaultVal})`);
    } else if (defaultVal.toUpperCase() === "NULL") {
      // Explicit NULL default - skip adding modifier
    } else {
      // SQL expression
      modifiers.push(`default(sql\`${defaultVal}\`)`);
    }
  }

  if (modifiers.length > 0) {
    // Handle primaryKey with autoIncrement specially
    if (column.isPrimaryKey && column.isAutoIncrement) {
      code += `.primaryKey({ autoIncrement: true })`;
      // Add remaining modifiers except primaryKey
      const otherModifiers = modifiers.filter(
        (m) => !m.startsWith("primaryKey") && !m.includes("autoIncrement"),
      );
      for (const mod of otherModifiers) {
        code += `.${mod}`;
      }
    } else {
      for (const mod of modifiers) {
        if (!mod.includes("autoIncrement")) {
          code += `.${mod}`;
        }
      }
    }
  }

  return code;
}

/**
 * Generate Drizzle schema TypeScript code from tables
 */
function generateDrizzleSchema(tables: DrizzleTable[]): string {
  const imports = new Set<string>();
  imports.add("sqliteTable");

  // Collect all needed type imports
  for (const table of tables) {
    for (const column of table.columns) {
      imports.add(column.drizzleType);
    }
  }

  // Check if we need sql import for defaults
  const needsSql = tables.some((t) =>
    t.columns.some(
      (c) =>
        c.defaultValue !== null &&
        (c.defaultValue.toUpperCase().includes("CURRENT_") ||
          (!c.defaultValue.startsWith("'") &&
            isNaN(Number(c.defaultValue)) &&
            c.defaultValue.toUpperCase() !== "NULL")),
    ),
  );

  let code = "// Auto-generated Drizzle schema\n";
  code += "// Generated by D1 Manager\n\n";
  code += `import { ${Array.from(imports).sort().join(", ")} } from 'drizzle-orm/sqlite-core';\n`;

  if (needsSql) {
    code += `import { sql } from 'drizzle-orm';\n`;
  }

  code += "\n";

  // Generate table definitions
  for (const table of tables) {
    const tableName = table.name;
    const camelName = tableName.replace(/_([a-z])/g, (_, letter: string) =>
      letter.toUpperCase(),
    );

    code += `export const ${camelName} = sqliteTable('${tableName}', {\n`;

    // Generate columns
    const columnDefs = table.columns.map((col) =>
      generateColumnCode(col, tableName),
    );
    code += columnDefs.join(",\n");
    code += "\n});\n\n";

    // Generate type exports
    code += `export type ${camelName.charAt(0).toUpperCase() + camelName.slice(1)} = typeof ${camelName}.$inferSelect;\n`;
    code += `export type New${camelName.charAt(0).toUpperCase() + camelName.slice(1)} = typeof ${camelName}.$inferInsert;\n\n`;
  }

  return code;
}

/**
 * Parse column info from PRAGMA table_info result
 */
interface PragmaColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

/**
 * Parse foreign key info from PRAGMA foreign_key_list result
 */
interface PragmaForeignKey {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
  match: string;
}

/**
 * Parse index info from PRAGMA index_list result
 */
interface PragmaIndexInfo {
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

/**
 * Execute a query against D1 via REST API
 */
async function executeD1Query(
  databaseId: string,
  query: string,
  env: Env,
): Promise<{ results: unknown[]; meta: Record<string, unknown> }> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql: query, params: [] }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`D1 query failed: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as {
    success: boolean;
    result?: { results: unknown[]; meta?: Record<string, unknown> }[];
    errors?: { message: string }[];
  };

  if (!data.success || !data.result?.[0]) {
    throw new Error(data.errors?.[0]?.message ?? "Unknown D1 error");
  }

  return { results: data.result[0].results, meta: data.result[0].meta ?? {} };
}

/**
 * Introspect a D1 database and generate Drizzle schema
 */
export async function introspectDatabase(
  databaseId: string,
  env: Env,
): Promise<IntrospectionResult> {
  try {
    logInfo("Starting database introspection", {
      module: "drizzle",
      operation: "introspect",
      databaseId,
    });

    // Get list of tables
    const tablesResult = await executeD1Query(
      databaseId,
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
      env,
    );

    const tableNames = (tablesResult.results as { name: string }[]).map(
      (r) => r.name,
    );

    if (tableNames.length === 0) {
      return {
        success: true,
        schema: "// No tables found in database\n",
        tables: [],
      };
    }

    const tables: DrizzleTable[] = [];

    for (const tableName of tableNames) {
      // Skip FTS5 virtual tables and their auxiliary tables
      if (
        tableName.endsWith("_content") ||
        tableName.endsWith("_segments") ||
        tableName.endsWith("_segdir") ||
        tableName.endsWith("_docsize") ||
        tableName.endsWith("_data") ||
        tableName.endsWith("_idx") ||
        tableName.endsWith("_config")
      ) {
        continue;
      }

      // Get column info
      const columnsResult = await executeD1Query(
        databaseId,
        `PRAGMA table_info("${tableName}")`,
        env,
      );

      const columns: DrizzleColumn[] = (
        columnsResult.results as PragmaColumnInfo[]
      ).map((col) => ({
        name: col.name,
        type: col.type || "TEXT",
        drizzleType: mapSqliteTypeToDrizzle(col.type || "TEXT"),
        isPrimaryKey: col.pk > 0,
        isAutoIncrement:
          col.pk > 0 && (col.type || "").toUpperCase() === "INTEGER",
        isNotNull: col.notnull === 1,
        defaultValue: col.dflt_value,
        isUnique: false, // Will be updated from index info
      }));

      // Get foreign keys
      const fkResult = await executeD1Query(
        databaseId,
        `PRAGMA foreign_key_list("${tableName}")`,
        env,
      );

      const foreignKeys = (fkResult.results as PragmaForeignKey[]).reduce<
        DrizzleTable["foreignKeys"]
      >((acc, fk) => {
        const existing = acc.find((f) => f.references.table === fk.table);
        if (existing) {
          existing.columns.push(fk.from);
          existing.references.columns.push(fk.to);
        } else {
          const fkEntry: DrizzleTable["foreignKeys"][number] = {
            columns: [fk.from],
            references: { table: fk.table, columns: [fk.to] },
          };
          if (fk.on_delete !== "NO ACTION") {
            fkEntry.onDelete = fk.on_delete;
          }
          if (fk.on_update !== "NO ACTION") {
            fkEntry.onUpdate = fk.on_update;
          }
          acc.push(fkEntry);
        }
        return acc;
      }, []);

      // Get indexes
      const indexResult = await executeD1Query(
        databaseId,
        `PRAGMA index_list("${tableName}")`,
        env,
      );

      const indexes: DrizzleTable["indexes"] = [];

      for (const idx of indexResult.results as PragmaIndexInfo[]) {
        // Skip auto-created indexes
        if (idx.origin === "pk" || idx.name.startsWith("sqlite_")) {
          continue;
        }

        // Get index columns
        const indexInfoResult = await executeD1Query(
          databaseId,
          `PRAGMA index_info("${idx.name}")`,
          env,
        );

        const indexColumns = (
          indexInfoResult.results as { name: string }[]
        ).map((c) => c.name);

        // Mark single-column unique indexes on columns
        if (idx.unique === 1 && indexColumns.length === 1) {
          const col = columns.find((c) => c.name === indexColumns[0]);
          if (col) {
            col.isUnique = true;
          }
        }

        indexes.push({
          name: idx.name,
          columns: indexColumns,
          isUnique: idx.unique === 1,
        });
      }

      tables.push({
        name: tableName,
        columns,
        primaryKey: columns.filter((c) => c.isPrimaryKey).map((c) => c.name),
        foreignKeys,
        indexes,
      });
    }

    // Generate schema code
    const schema = generateDrizzleSchema(tables);

    logInfo(`Introspection complete: ${tables.length} tables`, {
      module: "drizzle",
      operation: "introspect",
      databaseId,
      metadata: { tableCount: tables.length },
    });

    return {
      success: true,
      schema,
      tables,
    };
  } catch (error) {
    logWarning(
      `Introspection failed: ${error instanceof Error ? error.message : String(error)}`,
      {
        module: "drizzle",
        operation: "introspect",
        databaseId,
      },
    );

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Validate Drizzle schema syntax (basic validation)
 */
export function validateDrizzleSchema(schema: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check for required imports
  if (!schema.includes("from 'drizzle-orm/sqlite-core'")) {
    errors.push("Missing import from 'drizzle-orm/sqlite-core'");
  }

  // Check for at least one table definition
  if (!schema.includes("sqliteTable(")) {
    errors.push("No table definitions found");
  }

  // Check for balanced parentheses and braces
  const openParens = (schema.match(/\(/g) ?? []).length;
  const closeParens = (schema.match(/\)/g) ?? []).length;
  if (openParens !== closeParens) {
    errors.push("Unbalanced parentheses");
  }

  const openBraces = (schema.match(/\{/g) ?? []).length;
  const closeBraces = (schema.match(/\}/g) ?? []).length;
  if (openBraces !== closeBraces) {
    errors.push("Unbalanced braces");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generate migration SQL from schema changes
 * This is a simplified version - full migration generation would require Drizzle Kit
 */
export function generateMigrationPreview(
  currentTables: DrizzleTable[],
  targetTables: DrizzleTable[],
): { statements: string[]; summary: string } {
  const statements: string[] = [];
  const changes: string[] = [];

  const currentTableNames = new Set(currentTables.map((t) => t.name));
  const targetTableNames = new Set(targetTables.map((t) => t.name));

  // Find new tables
  for (const table of targetTables) {
    if (!currentTableNames.has(table.name)) {
      changes.push(`+ Add table: ${table.name}`);
      // Generate CREATE TABLE statement
      let createStmt = `CREATE TABLE "${table.name}" (\n`;
      const columnDefs = table.columns.map((col) => {
        let def = `  "${col.name}" ${col.type}`;
        if (col.isPrimaryKey) def += " PRIMARY KEY";
        if (col.isAutoIncrement) def += " AUTOINCREMENT";
        if (col.isNotNull && !col.isPrimaryKey) def += " NOT NULL";
        if (col.isUnique && !col.isPrimaryKey) def += " UNIQUE";
        if (col.defaultValue !== null) def += ` DEFAULT ${col.defaultValue}`;
        return def;
      });
      createStmt += columnDefs.join(",\n");
      createStmt += "\n);";
      statements.push(createStmt);
    }
  }

  // Find removed tables
  for (const table of currentTables) {
    if (!targetTableNames.has(table.name)) {
      changes.push(`- Drop table: ${table.name}`);
      statements.push(`DROP TABLE "${table.name}";`);
    }
  }

  // Find modified tables (simplified - just detects column changes)
  for (const targetTable of targetTables) {
    const currentTable = currentTables.find((t) => t.name === targetTable.name);
    if (currentTable) {
      const currentColNames = new Set(currentTable.columns.map((c) => c.name));
      const targetColNames = new Set(targetTable.columns.map((c) => c.name));

      // New columns
      for (const col of targetTable.columns) {
        if (!currentColNames.has(col.name)) {
          changes.push(`+ Add column: ${targetTable.name}.${col.name}`);
          let alterStmt = `ALTER TABLE "${targetTable.name}" ADD COLUMN "${col.name}" ${col.type}`;
          if (col.isNotNull && col.defaultValue !== null) {
            alterStmt += ` NOT NULL DEFAULT ${col.defaultValue}`;
          } else if (col.defaultValue !== null) {
            alterStmt += ` DEFAULT ${col.defaultValue}`;
          }
          statements.push(alterStmt + ";");
        }
      }

      // Removed columns (SQLite doesn't support DROP COLUMN easily)
      for (const col of currentTable.columns) {
        if (!targetColNames.has(col.name)) {
          changes.push(
            `- Drop column: ${currentTable.name}.${col.name} (requires table rebuild)`,
          );
        }
      }
    }
  }

  return {
    statements,
    summary: changes.length > 0 ? changes.join("\n") : "No changes detected",
  };
}

/**
 * Get migration status for a database
 */
export interface MigrationInfo {
  hasMigrationsTable: boolean;
  appliedMigrations: { id: number; hash: string; created_at: string }[];
}

export async function getMigrationStatus(
  databaseId: string,
  env: Env,
): Promise<MigrationInfo> {
  try {
    // Check if drizzle migrations table exists
    const tableCheck = await executeD1Query(
      databaseId,
      "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'",
      env,
    );

    if ((tableCheck.results as unknown[]).length === 0) {
      return {
        hasMigrationsTable: false,
        appliedMigrations: [],
      };
    }

    // Get applied migrations
    const migrations = await executeD1Query(
      databaseId,
      "SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY id DESC",
      env,
    );

    return {
      hasMigrationsTable: true,
      appliedMigrations: migrations.results as {
        id: number;
        hash: string;
        created_at: string;
      }[],
    };
  } catch (error) {
    logWarning(
      `Failed to get migration status: ${error instanceof Error ? error.message : String(error)}`,
      {
        module: "drizzle",
        operation: "migration_status",
        databaseId,
      },
    );

    return {
      hasMigrationsTable: false,
      appliedMigrations: [],
    };
  }
}
