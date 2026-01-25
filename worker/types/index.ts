// Cloudflare Workers types are provided by @cloudflare/workers-types
// Custom extensions only below

export interface Env {
  ASSETS?: Fetcher;
  METADATA: D1Database;
  BACKUP_BUCKET?: R2Bucket;
  BACKUP_DO?: DurableObjectNamespace;
  AI?: Ai; // Workers AI binding for AI Search (AutoRAG)
  CF_EMAIL: string;
  API_KEY: string;
  ACCOUNT_ID: string;
  TEAM_DOMAIN: string;
  POLICY_AUD: string;
}

// CORS headers type
export type CorsHeaders = Record<string, string>;

export const CF_API = "https://api.cloudflare.com/client/v4";

// D1 Database types from Cloudflare REST API
export interface D1DatabaseInfo {
  uuid: string;
  name: string;
  version: string;
  created_at: string;
  file_size?: number;
  num_tables?: number;
  read_replication?: {
    mode: "auto" | "disabled";
  };
}

// Read Replication types
export type ReadReplicationMode = "auto" | "disabled";

export interface ReadReplicationConfig {
  mode: ReadReplicationMode;
}

// Query serving metadata (from D1 result meta)
export interface QueryServingInfo {
  served_by_region?: string;
  served_by_primary?: boolean;
}

// Table schema types
export interface TableInfo {
  name: string;
  type: "table" | "view" | "shadow" | "virtual";
  ncol: number;
  wr: number;
  strict: number;
}

export interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

export interface IndexInfo {
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

// Query history types
export interface QueryHistoryEntry {
  id: number;
  database_id: string;
  query: string;
  executed_at: string;
  duration_ms?: number;
  rows_affected?: number;
  error?: string;
}

// Saved query types
export interface SavedQuery {
  id: number;
  name: string;
  description?: string;
  database_id?: string;
  query: string;
  created_at: string;
  updated_at: string;
}

// Undo history types
export interface UndoHistoryEntry {
  id: number;
  database_id: string;
  operation_type: "DROP_TABLE" | "DROP_COLUMN" | "DELETE_ROW";
  target_table: string;
  target_column?: string;
  description: string;
  snapshot_data: string;
  executed_at: string;
  user_email?: string;
}

export interface UndoSnapshot {
  operation_type: "DROP_TABLE" | "DROP_COLUMN" | "DELETE_ROW";
  tableSchema?: {
    createStatement: string;
    indexes: string[];
    data: Record<string, unknown>[];
  };
  columnData?: {
    columnName: string;
    columnType: string;
    notNull: boolean;
    defaultValue: string | null;
    position: number;
    rowData: Record<string, unknown>[];
  };
  rowData?: {
    whereClause: string;
    rows: Record<string, unknown>[];
  };
}

// Constraint validation types
export interface ConstraintViolation {
  id: string;
  type: "foreign_key" | "not_null" | "unique";
  severity: "critical" | "warning" | "info";
  table: string;
  column?: string;
  affectedRows: number;
  details: string;
  fixable: boolean;
  fixStrategies?: ("delete" | "set_null" | "manual")[];
  metadata?: {
    parentTable?: string;
    parentColumn?: string;
    fkId?: number;
    duplicateValue?: string;
  };
}

export interface ValidationReport {
  database: string;
  timestamp: string;
  totalViolations: number;
  violationsByType: {
    foreign_key: number;
    not_null: number;
    unique: number;
  };
  violations: ConstraintViolation[];
  isHealthy: boolean;
}

export interface FixResult {
  violationId: string;
  success: boolean;
  rowsAffected: number;
  error?: string;
}

// Index Analyzer types
export interface IndexRecommendation {
  tableName: string;
  columnName: string;
  indexType: "single" | "composite";
  compositeColumns?: string[];
  priority: "high" | "medium" | "low";
  rationale: string;
  estimatedImpact: string;
  suggestedSQL: string;
}

export interface IndexAnalysisResult {
  recommendations: IndexRecommendation[];
  existingIndexes: {
    tableName: string;
    indexes: {
      name: string;
      columns: string[];
      unique: boolean;
    }[];
  }[];
  statistics: {
    totalRecommendations: number;
    tablesWithoutIndexes: number;
    averageQueryEfficiency?: number;
  };
}

// ============================================
// Webhook Types
// ============================================

/**
 * Webhook event types for D1 Manager
 *
 * 13-event webhook engine for granular external integrations.
 * Aligned with KV Manager webhook architecture for fleet consistency.
 */
export type WebhookEventType =
  // Database lifecycle
  | "database_create"
  | "database_delete"
  // Table DDL operations
  | "table_create"
  | "table_delete"
  | "table_update"
  // R2 snapshot lifecycle
  | "backup_complete"
  | "restore_complete"
  // Data transfer operations
  | "import_complete"
  | "export_complete"
  // DDL query execution
  | "schema_change"
  // Bulk operations
  | "bulk_delete_complete"
  // Job lifecycle
  | "job_failed"
  | "batch_complete"
  // Backward-compatible aliases (legacy)
  | "database_export"
  | "database_import";

/**
 * Webhook record from D1 metadata database
 */
export interface Webhook {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  events: string; // JSON array of WebhookEventType
  enabled: number;
  created_at: string;
  updated_at: string;
}

/**
 * Webhook payload sent to endpoints
 */
export interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Result of sending a webhook
 */
export interface WebhookResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

// ============================================
// Error Logging Types
// ============================================

/**
 * Error severity levels
 */
export type ErrorSeverity = "error" | "warning" | "info";

/**
 * Context for structured error logging
 */
export interface ErrorContext {
  module: string; // e.g., 'databases', 'tables', 'queries'
  operation: string; // e.g., 'create', 'delete', 'export'
  databaseId?: string;
  databaseName?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Structured error for logging and webhook payloads
 */
export interface StructuredError {
  timestamp: string;
  level: ErrorSeverity;
  code: string; // e.g., 'DB_CREATE_FAILED', 'EXPORT_TIMEOUT'
  message: string;
  context: ErrorContext;
  stack?: string | undefined;
}

// ============================================
// R2 Backup Types
// ============================================

/**
 * Source of the backup - tracks what operation triggered the backup
 */
export type R2BackupSource =
  | "manual" // User-initiated from database card
  | "rename_database" // Before database rename operation
  | "strict_mode" // Before enabling STRICT mode on table
  | "fts5_convert" // Before converting FTS5 to regular table
  | "column_modify" // Before modifying column type/constraints
  | "table_export" // Single table export to R2
  | "table_backup" // Table backup from operations like Modify Column
  | "scheduled"; // Automated scheduled backup

/**
 * Metadata stored with R2 backup objects
 */
export interface R2BackupMetadata {
  databaseId: string;
  databaseName: string;
  source: R2BackupSource;
  timestamp: number;
  size: number;
  bookmark?: string | undefined;
  tableName?: string | undefined; // For table-specific backups
  tableFormat?: "sql" | "csv" | "json" | undefined; // For table exports
  userEmail?: string | undefined;
}

/**
 * R2 backup list item returned to frontend
 */
export interface R2BackupListItem {
  path: string;
  databaseId: string;
  databaseName: string;
  source: R2BackupSource;
  timestamp: number;
  size: number;
  uploaded: string;
  tableName?: string | undefined;
  tableFormat?: "sql" | "csv" | "json" | undefined;
  backupType: "database" | "table";
}

/**
 * Job progress for backup/restore operations
 */
export interface BackupJobProgress {
  jobId: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: {
    percentage: number;
    step: string;
  };
  error?: string;
  result?: {
    backupPath?: string;
    size?: number;
  };
}

/**
 * Parameters for backup to R2
 */
export interface R2BackupParams {
  databaseId: string;
  databaseName: string;
  source: R2BackupSource;
  userEmail?: string;
}

/**
 * Parameters for table backup to R2
 */
export interface R2TableBackupParams {
  databaseId: string;
  databaseName: string;
  tableName: string;
  format: "sql" | "csv" | "json";
  source: R2BackupSource;
  userEmail?: string;
}

/**
 * Parameters for restore from R2
 */
export interface R2RestoreParams {
  databaseId: string;
  backupPath: string;
  userEmail?: string;
}

/**
 * API response for backup job creation
 */
export interface BackupJobResponse {
  job_id: string;
  status: "queued";
}

// ============================================
// Migration Types
// ============================================

/**
 * Database migration definition
 */
export interface Migration {
  version: number;
  name: string;
  description: string;
  sql: string;
}

/**
 * Status of the migration system
 */
export interface MigrationStatus {
  currentVersion: number;
  latestVersion: number;
  pendingMigrations: Migration[];
  appliedMigrations: AppliedMigration[];
  isUpToDate: boolean;
}

/**
 * Record of an applied migration
 */
export interface AppliedMigration {
  version: number;
  migration_name: string;
  applied_at: string;
}

/**
 * Result of applying migrations
 */
export interface MigrationResult {
  success: boolean;
  migrationsApplied: number;
  currentVersion: number;
  errors: string[];
}

/**
 * Legacy installation detection result
 */
export interface LegacyInstallationInfo {
  isLegacy: boolean;
  existingTables: string[];
  suggestedVersion: number;
}

// ============================================
// D1 Metrics Types (GraphQL Analytics API)
// ============================================

/**
 * Time range for metrics queries
 */
export type MetricsTimeRange = "24h" | "7d" | "30d";

/**
 * Raw metrics data point from GraphQL API
 */
export interface MetricsDataPoint {
  date: string;
  databaseId: string;
  readQueries: number;
  writeQueries: number;
  rowsRead: number;
  rowsWritten: number;
  queryBatchTimeMsP50?: number | undefined;
  queryBatchTimeMsP90?: number | undefined;
  queryBatchResponseBytes?: number | undefined;
}

/**
 * Storage metrics from GraphQL API
 */
export interface StorageDataPoint {
  date: string;
  databaseId: string;
  databaseSizeBytes: number;
}

/**
 * Aggregated metrics for a database
 */
export interface DatabaseMetricsSummary {
  databaseId: string;
  databaseName?: string | undefined;
  totalReadQueries: number;
  totalWriteQueries: number;
  totalRowsRead: number;
  totalRowsWritten: number;
  avgLatencyMs?: number | undefined;
  p90LatencyMs?: number | undefined;
  currentSizeBytes?: number | undefined;
}

/**
 * Account-wide metrics summary
 */
export interface MetricsSummary {
  timeRange: MetricsTimeRange;
  startDate: string;
  endDate: string;
  totalReadQueries: number;
  totalWriteQueries: number;
  totalRowsRead: number;
  totalRowsWritten: number;
  avgLatencyMs?: number | undefined;
  totalStorageBytes: number;
  databaseCount: number;
}

/**
 * Full metrics response
 */
export interface MetricsResponse {
  summary: MetricsSummary;
  byDatabase: DatabaseMetricsSummary[];
  timeSeries: MetricsDataPoint[];
  storageSeries: StorageDataPoint[];
  queryInsights?: QueryInsight[];
}

/**
 * Query insight from d1QueriesAdaptiveGroups
 * Provides slow query detection and analysis
 */
export interface QueryInsight {
  queryHash: string;
  queryString: string;
  databaseId: string;
  databaseName?: string | undefined;
  totalTimeMs: number;
  avgTimeMs: number;
  executionCount: number;
  rowsRead: number;
  rowsWritten: number;
}

/**
 * GraphQL API response structure
 */
export interface GraphQLResponse<T> {
  data?: T;
  errors?: {
    message: string;
    path?: string[];
    extensions?: Record<string, unknown>;
  }[];
}

// ============================================
// Scheduled Backup Types
// ============================================

/**
 * Scheduled backup frequency options
 */
export type ScheduledBackupSchedule = "daily" | "weekly" | "monthly";

/**
 * Scheduled backup configuration record from D1 metadata database
 */
export interface ScheduledBackup {
  id: string;
  database_id: string;
  database_name: string;
  schedule: ScheduledBackupSchedule;
  day_of_week: number | null; // 0-6 for weekly (0=Sunday)
  day_of_month: number | null; // 1-28 for monthly
  hour: number; // 0-23 UTC
  enabled: number; // 0 or 1
  last_run_at: string | null;
  next_run_at: string | null;
  last_job_id: string | null;
  last_status: "success" | "failed" | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * Input for creating/updating a scheduled backup
 */
export interface ScheduledBackupInput {
  database_id: string;
  database_name: string;
  schedule: ScheduledBackupSchedule;
  day_of_week?: number;
  day_of_month?: number;
  hour?: number;
  enabled?: boolean;
}

/**
 * D1 Analytics GraphQL query result
 */
export interface D1AnalyticsResult {
  viewer: {
    accounts: {
      d1AnalyticsAdaptiveGroups: {
        sum: {
          readQueries: number;
          writeQueries: number;
          rowsRead: number;
          rowsWritten: number;
          queryBatchResponseBytes?: number;
        };
        quantiles?: {
          queryBatchTimeMsP50?: number;
          queryBatchTimeMsP90?: number;
        };
        avg?: {
          queryBatchTimeMs?: number;
        };
        dimensions: {
          date: string;
          databaseId: string;
        };
      }[];
      d1StorageAdaptiveGroups?: {
        max: {
          databaseSizeBytes: number;
        };
        dimensions: {
          date: string;
          databaseId: string;
        };
      }[];
      d1QueriesAdaptiveGroups?: {
        sum: {
          queryDurationMs: number;
          rowsRead: number;
          rowsWritten: number;
          rowsReturned: number;
        };
        avg?: {
          queryDurationMs?: number;
          rowsRead?: number;
          rowsWritten?: number;
          rowsReturned?: number;
        };
        count: number;
        dimensions: {
          query: string;
        };
      }[];
    }[];
  };
}

// ============================================
// AI Search Types
// ============================================

/**
 * AI Search instance information
 */
export interface AISearchInstance {
  name: string;
  description?: string;
  created_at?: string;
  modified_at?: string;
  status?: "active" | "indexing" | "paused" | "error";
  data_source?: {
    type: "r2" | "website";
    bucket_name?: string;
    domain?: string;
  };
  vectorize_index?: string;
  embedding_model?: string;
  generation_model?: string;
}

/**
 * Result from listing AI Search instances
 */
export interface AISearchInstancesListResult {
  rags: AISearchInstance[];
}

/**
 * D1 database compatibility analysis for AI Search
 */
export interface AISearchCompatibility {
  databaseId: string;
  databaseName: string;
  totalTables: number;
  totalRows: number;
  exportableContent: {
    schemaSize: number;
    dataSize: number;
    relationshipCount: number;
  };
  lastExport?: string;
  exportPath?: string;
}

/**
 * AI Search export status
 */
export interface AISearchExportStatus {
  databaseId: string;
  status: "pending" | "running" | "completed" | "failed";
  progress?: {
    tablesProcessed: number;
    totalTables: number;
    currentTable?: string;
  };
  exportPath?: string;
  error?: string;
  completedAt?: string;
}

/**
 * AI Search query request
 */
export interface AISearchQueryRequest {
  query: string;
  rewrite_query?: boolean;
  max_num_results?: number;
  score_threshold?: number;
  reranking?: {
    enabled: boolean;
    model?: string;
  };
  stream?: boolean;
}

/**
 * AI Search result item
 */
export interface AISearchResult {
  file_id: string;
  filename: string;
  score: number;
  attributes?: {
    modified_date?: number;
    folder?: string;
  };
  content: {
    id: string;
    type: string;
    text: string;
  }[];
}

/**
 * AI Search response
 */
export interface AISearchResponse {
  response?: string; // AI-generated response (for ai-search endpoint)
  data: AISearchResult[];
  has_more: boolean;
  next_page: string | null;
}

/**
 * AI Search sync trigger response
 */
export interface AISearchSyncResponse {
  success: boolean;
  message?: string;
  job_id?: string;
}

/**
 * Create AI Search instance request body
 */
export interface CreateAISearchBody {
  name: string;
  description?: string;
  bucketName: string;
  embeddingModel?: string;
  generationModel?: string;
}
