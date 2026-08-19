/**
 * Metric types for threshold monitoring
 */
export type MonitoringMetricType =
  | "storage_usage"
  | "query_latency"
  | "error_rate"
  | "row_volume"
  | "analytics_unavailable";

/**
 * Comparison operators for threshold evaluation
 */
export type ThresholdComparison = "gt" | "lt" | "gte" | "lte";

/**
 * Monitoring threshold record
 */
export interface MonitoringThreshold {
  id: string;
  database_id: string;
  database_name: string;
  metric_type: MonitoringMetricType;
  threshold_value: number;
  comparison: ThresholdComparison;
  cooldown_hours: number;
  storage_limit_bytes: number | null;
  enabled: number;
  last_alert_at: string | null;
  last_value: number | null;
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
}

/**
 * Input for creating/updating a monitoring threshold
 */
export interface MonitoringThresholdInput {
  database_id: string;
  database_name: string;
  metric_type: MonitoringMetricType;
  threshold_value: number;
  comparison?: ThresholdComparison;
  cooldown_hours?: number;
  storage_limit_bytes?: number | null;
  enabled?: boolean;
}

export interface MonitoringThresholdResponse {
  threshold: MonitoringThreshold;
}

export interface MonitoringThresholdsResponse {
  thresholds: MonitoringThreshold[];
}

export interface MonitoringTestResult {
  success: boolean;
  breached: boolean;
  current_value: number | null;
  message: string;
}

// Display constants
export const METRIC_TYPE_LABELS: Record<MonitoringMetricType, string> = {
  storage_usage: "Storage Usage",
  query_latency: "P90 Latency",
  error_rate: "Error Rate",
  row_volume: "Row Volume",
  analytics_unavailable: "Analytics API Availability",
};

export const METRIC_TYPE_UNITS: Record<MonitoringMetricType, string> = {
  storage_usage: "%",
  query_latency: "ms",
  error_rate: "%",
  row_volume: "rows",
  analytics_unavailable: "failures",
};

export const METRIC_TYPE_DESCRIPTIONS: Record<MonitoringMetricType, string> = {
  storage_usage: "Alert when database storage exceeds a percentage of the configured limit.",
  query_latency: "Alert when the P90 query latency exceeds a specific duration.",
  error_rate: "Alert when the percentage of failed queries exceeds a specific limit.",
  row_volume: "Alert when the total rows read and written exceed a specific count.",
  analytics_unavailable: "Alert when the Cloudflare Analytics API cannot be reached.",
};

// Default thresholds for the Quick Setup feature
export const DEFAULT_THRESHOLDS: Omit<MonitoringThresholdInput, "database_id" | "database_name" | "storage_limit_bytes">[] = [
  {
    metric_type: "storage_usage",
    threshold_value: 80,
    comparison: "gt",
    cooldown_hours: 6,
    enabled: true,
  },
  {
    metric_type: "query_latency",
    threshold_value: 200,
    comparison: "gt",
    cooldown_hours: 6,
    enabled: true,
  },
  {
    metric_type: "error_rate",
    threshold_value: 5,
    comparison: "gt",
    cooldown_hours: 6,
    enabled: true,
  },
  {
    metric_type: "row_volume",
    threshold_value: 1000000,
    comparison: "gt",
    cooldown_hours: 12,
    enabled: true,
  },
];
