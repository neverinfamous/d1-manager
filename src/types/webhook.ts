/**
 * Webhook Types for D1 Manager Frontend
 *
 * 13-event webhook engine for granular external integrations.
 * Aligned with KV Manager webhook architecture for fleet consistency.
 */

/**
 * Webhook event types available in D1 Manager
 *
 * Core Events:
 * - database_create/delete: Database lifecycle
 * - table_create/delete/update: Table DDL operations
 * - backup_complete/restore_complete: R2 snapshot lifecycle
 * - import_complete/export_complete: Data transfer operations
 * - schema_change: DDL query execution (CREATE/ALTER/DROP)
 * - bulk_delete_complete: Bulk row deletion
 * - job_failed/batch_complete: Job lifecycle
 *
 * Backward Compatibility:
 * - database_export → alias for export_complete
 * - database_import → alias for import_complete
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
 * Webhook from API
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
 * Webhook create/update request
 */
export interface WebhookInput {
  name: string;
  url: string;
  secret?: string | null;
  events: WebhookEventType[];
  enabled?: boolean;
}

/**
 * Webhook test result
 */
export interface WebhookTestResult {
  success: boolean;
  message: string;
  statusCode?: number;
  error?: string;
}

/**
 * API response types
 */
export interface WebhooksResponse {
  webhooks: Webhook[];
}

export interface WebhookResponse {
  webhook: Webhook;
}

/**
 * Event type labels for UI display
 */
export const WEBHOOK_EVENT_LABELS: Record<WebhookEventType, string> = {
  // Database lifecycle
  database_create: "Database Created",
  database_delete: "Database Deleted",
  // Table DDL operations
  table_create: "Table Created",
  table_delete: "Table Deleted",
  table_update: "Table Updated",
  // R2 snapshot lifecycle
  backup_complete: "Backup Complete",
  restore_complete: "Restore Complete",
  // Data transfer operations
  import_complete: "Import Complete",
  export_complete: "Export Complete",
  // DDL query execution
  schema_change: "Schema Changed",
  // Bulk operations
  bulk_delete_complete: "Bulk Delete Complete",
  // Job lifecycle
  job_failed: "Job Failed",
  batch_complete: "Batch Operation Complete",
  // Backward-compatible aliases
  database_export: "Database Exported (Legacy)",
  database_import: "Database Imported (Legacy)",
};

/**
 * Event type descriptions for UI display
 */
export const WEBHOOK_EVENT_DESCRIPTIONS: Record<WebhookEventType, string> = {
  // Database lifecycle
  database_create: "Triggered when a new database is created",
  database_delete: "Triggered when a database is deleted",
  // Table DDL operations
  table_create: "Triggered when a new table is created",
  table_delete: "Triggered when a table is dropped",
  table_update: "Triggered when a table is altered (columns, indexes)",
  // R2 snapshot lifecycle
  backup_complete: "Triggered when an R2 backup snapshot completes",
  restore_complete: "Triggered when a backup is restored from R2",
  // Data transfer operations
  import_complete: "Triggered when a SQL/JSON import completes",
  export_complete: "Triggered when a SQL/JSON export completes",
  // DDL query execution
  schema_change: "Triggered when a DDL query (CREATE/ALTER/DROP) executes",
  // Bulk operations
  bulk_delete_complete: "Triggered when a bulk row deletion completes",
  // Job lifecycle
  job_failed: "Triggered when any tracked operation fails",
  batch_complete: "Triggered when a bulk operation completes",
  // Backward-compatible aliases
  database_export: "Legacy alias for export_complete",
  database_import: "Legacy alias for import_complete",
};

/**
 * All available webhook event types (displayed in UI)
 * Note: Legacy aliases are excluded from UI but still functional
 */
export const ALL_WEBHOOK_EVENTS: WebhookEventType[] = [
  // Database lifecycle
  "database_create",
  "database_delete",
  // Table DDL operations
  "table_create",
  "table_delete",
  "table_update",
  // R2 snapshot lifecycle
  "backup_complete",
  "restore_complete",
  // Data transfer operations
  "import_complete",
  "export_complete",
  // DDL query execution
  "schema_change",
  // Bulk operations
  "bulk_delete_complete",
  // Job lifecycle
  "job_failed",
  "batch_complete",
];

/**
 * Legacy event aliases for backward compatibility
 * Maps old event names to their new equivalents
 */
export const LEGACY_EVENT_ALIASES: Record<string, WebhookEventType> = {
  database_export: "export_complete",
  database_import: "import_complete",
};
