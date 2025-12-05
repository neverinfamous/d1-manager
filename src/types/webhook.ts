/**
 * Webhook Types for D1 Manager Frontend
 */

/**
 * Webhook event types available in D1 Manager
 */
export type WebhookEventType =
  | 'database_create'
  | 'database_delete'
  | 'database_export'
  | 'database_import'
  | 'job_failed'
  | 'batch_complete';

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
  database_create: 'Database Created',
  database_delete: 'Database Deleted',
  database_export: 'Database Exported',
  database_import: 'Database Imported',
  job_failed: 'Job Failed',
  batch_complete: 'Batch Operation Complete',
};

/**
 * Event type descriptions for UI display
 */
export const WEBHOOK_EVENT_DESCRIPTIONS: Record<WebhookEventType, string> = {
  database_create: 'Triggered when a new database is created',
  database_delete: 'Triggered when a database is deleted',
  database_export: 'Triggered when a database export completes',
  database_import: 'Triggered when a database import completes',
  job_failed: 'Triggered when any tracked operation fails',
  batch_complete: 'Triggered when a bulk operation completes',
};

/**
 * All available webhook event types
 */
export const ALL_WEBHOOK_EVENTS: WebhookEventType[] = [
  'database_create',
  'database_delete',
  'database_export',
  'database_import',
  'job_failed',
  'batch_complete',
];

