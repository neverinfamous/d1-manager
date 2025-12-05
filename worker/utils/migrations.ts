/**
 * Database Migration System
 * 
 * Provides automated schema migrations for the D1 Manager metadata database.
 * Tracks applied migrations in the schema_version table and applies pending
 * migrations when triggered by the user via the UI upgrade banner.
 */

import { logInfo, logError, logWarning } from './error-logger';

// ============================================
// Types
// ============================================

export interface Migration {
  version: number;
  name: string;
  description: string;
  sql: string;
}

export interface MigrationStatus {
  currentVersion: number;
  latestVersion: number;
  pendingMigrations: Migration[];
  appliedMigrations: AppliedMigration[];
  isUpToDate: boolean;
}

export interface AppliedMigration {
  version: number;
  migration_name: string;
  applied_at: string;
}

export interface MigrationResult {
  success: boolean;
  migrationsApplied: number;
  currentVersion: number;
  errors: string[];
}

// ============================================
// Migration Registry
// ============================================

/**
 * All migrations in order. Each migration should be idempotent where possible
 * (using IF NOT EXISTS, etc.) to handle edge cases gracefully.
 * 
 * IMPORTANT: Never modify existing migrations. Always add new ones.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    description: 'Base schema with databases, query_history, saved_queries, undo_history',
    sql: `
      -- Track managed databases
      CREATE TABLE IF NOT EXISTS databases (
        database_id TEXT PRIMARY KEY,
        database_name TEXT NOT NULL,
        first_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Query execution history
      CREATE TABLE IF NOT EXISTS query_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        database_id TEXT NOT NULL,
        query TEXT NOT NULL,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        duration_ms REAL,
        rows_affected INTEGER,
        error TEXT,
        user_email TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_query_history_database ON query_history(database_id, executed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_query_history_user ON query_history(user_email, executed_at DESC);

      -- Saved queries
      CREATE TABLE IF NOT EXISTS saved_queries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        database_id TEXT,
        query TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_email TEXT,
        UNIQUE(name, user_email)
      );

      CREATE INDEX IF NOT EXISTS idx_saved_queries_user ON saved_queries(user_email);
      CREATE INDEX IF NOT EXISTS idx_saved_queries_database ON saved_queries(database_id);

      -- Undo history for rollback operations
      CREATE TABLE IF NOT EXISTS undo_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        database_id TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        target_table TEXT NOT NULL,
        target_column TEXT,
        description TEXT NOT NULL,
        snapshot_data TEXT NOT NULL,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_email TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_undo_history_database ON undo_history(database_id, executed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_undo_history_user ON undo_history(user_email, executed_at DESC);
    `
  },
  {
    version: 2,
    name: 'job_history',
    description: 'Add bulk_jobs and job_audit_events tables for job history tracking',
    sql: `
      -- Bulk operation jobs (for tracking bulk operations)
      CREATE TABLE IF NOT EXISTS bulk_jobs (
        job_id TEXT PRIMARY KEY,
        database_id TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        status TEXT NOT NULL,
        total_items INTEGER,
        processed_items INTEGER,
        error_count INTEGER,
        percentage REAL DEFAULT 0,
        started_at DATETIME,
        completed_at DATETIME,
        user_email TEXT,
        metadata TEXT,
        error_message TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_bulk_jobs_status ON bulk_jobs(status, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_bulk_jobs_user ON bulk_jobs(user_email, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_bulk_jobs_database ON bulk_jobs(database_id, started_at DESC);

      -- Job audit events (for tracking job lifecycle events)
      CREATE TABLE IF NOT EXISTS job_audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        user_email TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        details TEXT,
        FOREIGN KEY (job_id) REFERENCES bulk_jobs(job_id)
      );

      CREATE INDEX IF NOT EXISTS idx_job_audit_events_job_id ON job_audit_events(job_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_job_audit_events_user ON job_audit_events(user_email, timestamp DESC);

      -- Time Travel bookmark history
      CREATE TABLE IF NOT EXISTS bookmark_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        database_id TEXT NOT NULL,
        database_name TEXT,
        bookmark TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        description TEXT,
        captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_email TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_bookmark_history_database ON bookmark_history(database_id, captured_at DESC);
      CREATE INDEX IF NOT EXISTS idx_bookmark_history_user ON bookmark_history(user_email, captured_at DESC);
    `
  },
  {
    version: 3,
    name: 'color_tags',
    description: 'Add database_colors and table_colors tables for visual organization',
    sql: `
      -- Database color tags
      CREATE TABLE IF NOT EXISTS database_colors (
        database_id TEXT PRIMARY KEY,
        color TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_by TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_database_colors_updated ON database_colors(updated_at DESC);

      -- Table color tags
      CREATE TABLE IF NOT EXISTS table_colors (
        database_id TEXT NOT NULL,
        table_name TEXT NOT NULL,
        color TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_by TEXT,
        PRIMARY KEY (database_id, table_name)
      );

      CREATE INDEX IF NOT EXISTS idx_table_colors_database ON table_colors(database_id);
      CREATE INDEX IF NOT EXISTS idx_table_colors_updated ON table_colors(updated_at DESC);
    `
  },
  {
    version: 4,
    name: 'webhooks',
    description: 'Add webhooks table for external observability notifications',
    sql: `
      -- Webhook configurations for event notifications
      CREATE TABLE IF NOT EXISTS webhooks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        secret TEXT,
        events TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled);
    `
  },
  {
    version: 5,
    name: 'scheduled_backups',
    description: 'Add scheduled_backups table for automated R2 backup schedules',
    sql: `
      -- Scheduled backup configurations
      CREATE TABLE IF NOT EXISTS scheduled_backups (
        id TEXT PRIMARY KEY,
        database_id TEXT NOT NULL,
        database_name TEXT NOT NULL,
        schedule TEXT NOT NULL,
        day_of_week INTEGER,
        day_of_month INTEGER,
        hour INTEGER DEFAULT 0,
        enabled INTEGER DEFAULT 1,
        last_run_at TEXT,
        next_run_at TEXT,
        last_job_id TEXT,
        last_status TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        created_by TEXT,
        UNIQUE(database_id)
      );

      CREATE INDEX IF NOT EXISTS idx_scheduled_backups_next_run 
        ON scheduled_backups(enabled, next_run_at);

      CREATE INDEX IF NOT EXISTS idx_scheduled_backups_database 
        ON scheduled_backups(database_id);
    `
  }
];

// ============================================
// Migration Functions
// ============================================

/**
 * Ensures the schema_version table exists.
 * This is called before any migration checks.
 */
export async function ensureSchemaVersionTable(db: D1Database): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      migration_name TEXT NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
}

/**
 * Gets the current schema version from the database.
 * Returns 0 if no migrations have been applied yet.
 */
export async function getCurrentVersion(db: D1Database): Promise<number> {
  try {
    const result = await db.prepare(
      'SELECT MAX(version) as version FROM schema_version'
    ).first<{ version: number | null }>();
    
    return result?.version ?? 0;
  } catch {
    // Table might not exist yet
    return 0;
  }
}

/**
 * Gets all applied migrations from the database.
 */
export async function getAppliedMigrations(db: D1Database): Promise<AppliedMigration[]> {
  try {
    const result = await db.prepare(
      'SELECT version, migration_name, applied_at FROM schema_version ORDER BY version ASC'
    ).all<AppliedMigration>();
    
    return result.results;
  } catch {
    return [];
  }
}

/**
 * Gets the migration status including current version and pending migrations.
 */
export async function getMigrationStatus(db: D1Database): Promise<MigrationStatus> {
  await ensureSchemaVersionTable(db);
  
  const currentVersion = await getCurrentVersion(db);
  const appliedMigrations = await getAppliedMigrations(db);
  const lastMigration = MIGRATIONS[MIGRATIONS.length - 1];
  const latestVersion = lastMigration?.version ?? 0;
  
  const pendingMigrations = MIGRATIONS.filter(m => m.version > currentVersion);
  
  return {
    currentVersion,
    latestVersion,
    pendingMigrations,
    appliedMigrations,
    isUpToDate: currentVersion >= latestVersion
  };
}

/**
 * Applies all pending migrations in order.
 * Returns the result of the migration process.
 */
export async function applyMigrations(
  db: D1Database,
  isLocalDev = false
): Promise<MigrationResult> {
  const errors: string[] = [];
  let migrationsApplied = 0;
  
  try {
    await ensureSchemaVersionTable(db);
    const currentVersion = await getCurrentVersion(db);
    const pendingMigrations = MIGRATIONS.filter(m => m.version > currentVersion);
    
    if (pendingMigrations.length === 0) {
      logInfo('No pending migrations', { module: 'migrations', operation: 'apply' });
      return {
        success: true,
        migrationsApplied: 0,
        currentVersion,
        errors: []
      };
    }
    
    logInfo(`Applying ${pendingMigrations.length} migration(s)`, {
      module: 'migrations',
      operation: 'apply',
      metadata: { 
        currentVersion, 
        pendingCount: pendingMigrations.length,
        migrations: pendingMigrations.map(m => m.name)
      }
    });
    
    for (const migration of pendingMigrations) {
      try {
        logInfo(`Applying migration ${migration.version}: ${migration.name}`, {
          module: 'migrations',
          operation: 'apply_single',
          metadata: { version: migration.version, name: migration.name }
        });
        
        // Split SQL into individual statements and execute each
        const statements = migration.sql
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0);
        
        for (const statement of statements) {
          await db.prepare(statement).run();
        }
        
        // Record the migration as applied
        await db.prepare(
          'INSERT INTO schema_version (version, migration_name) VALUES (?, ?)'
        ).bind(migration.version, migration.name).run();
        
        migrationsApplied++;
        
        logInfo(`Migration ${migration.version} applied successfully`, {
          module: 'migrations',
          operation: 'apply_single',
          metadata: { version: migration.version, name: migration.name }
        });
        
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        errors.push(`Migration ${migration.version} (${migration.name}): ${errorMessage}`);
        
        void logError(
          { METADATA: db } as Parameters<typeof logError>[0],
          `Failed to apply migration ${migration.version}: ${errorMessage}`,
          {
            module: 'migrations',
            operation: 'apply_single',
            metadata: { version: migration.version, name: migration.name, error: errorMessage }
          },
          isLocalDev
        );
        
        // Stop on first error - don't apply further migrations
        break;
      }
    }
    
    const newVersion = await getCurrentVersion(db);
    
    return {
      success: errors.length === 0,
      migrationsApplied,
      currentVersion: newVersion,
      errors
    };
    
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    errors.push(`Migration system error: ${errorMessage}`);
    
    logWarning(`Migration system error: ${errorMessage}`, {
      module: 'migrations',
      operation: 'apply',
      metadata: { error: errorMessage }
    });
    
    const currentVersion = await getCurrentVersion(db).catch(() => 0);
    
    return {
      success: false,
      migrationsApplied,
      currentVersion,
      errors
    };
  }
}

/**
 * Detects if the database has existing tables but no schema_version tracking.
 * This helps identify installations that predate the migration system.
 */
export async function detectLegacyInstallation(db: D1Database): Promise<{
  isLegacy: boolean;
  existingTables: string[];
  suggestedVersion: number;
}> {
  try {
    // Check for existing tables
    const result = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_version'"
    ).all<{ name: string }>();
    
    const existingTables = result.results.map(r => r.name);
    
    // Check if schema_version exists and has entries
    const versionCheck = await getCurrentVersion(db);
    
    if (versionCheck > 0) {
      // Already tracking versions
      return { isLegacy: false, existingTables, suggestedVersion: versionCheck };
    }
    
    // Detect which migrations have effectively been applied based on existing tables
    let suggestedVersion = 0;
    
    if (existingTables.includes('databases') && existingTables.includes('query_history')) {
      suggestedVersion = 1;
    }
    if (existingTables.includes('bulk_jobs') && existingTables.includes('job_audit_events')) {
      suggestedVersion = 2;
    }
    if (existingTables.includes('database_colors') && existingTables.includes('table_colors')) {
      suggestedVersion = 3;
    }
    if (existingTables.includes('webhooks')) {
      suggestedVersion = 4;
    }
    if (existingTables.includes('scheduled_backups')) {
      suggestedVersion = 5;
    }
    
    return {
      isLegacy: suggestedVersion > 0,
      existingTables,
      suggestedVersion
    };
    
  } catch {
    return { isLegacy: false, existingTables: [], suggestedVersion: 0 };
  }
}

/**
 * Marks migrations as applied without running them.
 * Used for legacy installations that already have the tables.
 */
export async function markMigrationsAsApplied(
  db: D1Database,
  upToVersion: number
): Promise<void> {
  await ensureSchemaVersionTable(db);
  
  const migrationsToMark = MIGRATIONS.filter(m => m.version <= upToVersion);
  
  for (const migration of migrationsToMark) {
    // Check if already marked
    const existing = await db.prepare(
      'SELECT version FROM schema_version WHERE version = ?'
    ).bind(migration.version).first();
    
    if (!existing) {
      await db.prepare(
        'INSERT INTO schema_version (version, migration_name) VALUES (?, ?)'
      ).bind(migration.version, migration.name).run();
      
      logInfo(`Marked migration ${migration.version} as applied (legacy)`, {
        module: 'migrations',
        operation: 'mark_applied',
        metadata: { version: migration.version, name: migration.name }
      });
    }
  }
}

