import type {
  Env,
  MonitoringThreshold,
  WebhookEventType,
  D1AnalyticsResult,
} from "../types";
import {
  buildAnalyticsQuery,
  executeGraphQLQuery,
} from "./analytics";
import { logInfo, logError } from "./error-logger";
import {
  triggerWebhooks,
  createThresholdBreachPayload,
  createAnalyticsUnavailablePayload,
} from "./webhooks";

const ANALYTICS_SENTINEL_ID = "__global__";
const ANALYTICS_SENTINEL_TYPE = "analytics_unavailable";

export async function processMonitoring(env: Env): Promise<void> {
  const isLocalDev = !env.ACCOUNT_ID || !env.API_KEY;

  if (isLocalDev) {
    logInfo("Skipping monitoring evaluation in local dev mode", {
      module: "monitoring",
      operation: "process",
    });
    return;
  }

  try {
    // 1. Fetch all enabled thresholds
    const { results: thresholds } = await env.METADATA.prepare(
      `SELECT * FROM monitoring_thresholds WHERE enabled = 1`,
    ).all<MonitoringThreshold>();

    if (thresholds.length === 0) {
      return;
    }

    const { results: sentinels } = await env.METADATA.prepare(
      `SELECT * FROM monitoring_thresholds WHERE database_id = ? AND metric_type = ?`,
    ).bind(ANALYTICS_SENTINEL_ID, ANALYTICS_SENTINEL_TYPE).all<MonitoringThreshold>();
    
    const sentinel = sentinels[0];

    // 2. Fetch analytics (hourly window for check)
    // Analytics are normally fetched for the past 24h, but we can just use 1h for monitoring or 24h depending on how thresholds are defined.
    // The issue says "hourly cron handler". Let's fetch 24h window for generic stats, or 1h for volume?
    const end = new Date();
    const start = new Date(end.getTime() - 60 * 60 * 1000);
    const startStr = start.toISOString().split(".")[0] + "Z";
    const endStr = end.toISOString().split(".")[0] + "Z";

    const query = buildAnalyticsQuery(env.ACCOUNT_ID, startStr, endStr);
    const analytics = await executeGraphQLQuery(env, query, isLocalDev);

    if (analytics == null) {
      if (sentinel !== undefined && sentinel.enabled === 1) {
        const newFailures = sentinel.consecutive_failures + 1;
        await env.METADATA.prepare(
          `UPDATE monitoring_thresholds SET consecutive_failures = ?, updated_at = datetime('now') WHERE id = ?`,
        ).bind(newFailures, sentinel.id).run();

        if (newFailures >= sentinel.threshold_value && !isCoolingDown(sentinel)) {
          const payload = createAnalyticsUnavailablePayload(newFailures, sentinel.last_alert_at);
          await triggerWebhooks(env, "analytics_unavailable", payload, isLocalDev);

          await env.METADATA.prepare(
            `UPDATE monitoring_thresholds SET last_alert_at = datetime('now') WHERE id = ?`,
          ).bind(sentinel.id).run();
        }
      }
      return;
    }

    if (sentinel !== undefined && sentinel.enabled === 1 && sentinel.consecutive_failures > 0) {
      await env.METADATA.prepare(
        `UPDATE monitoring_thresholds SET consecutive_failures = 0, last_alert_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      ).bind(sentinel.id).run();
    }

    const accounts = analytics.viewer.accounts;
    const account = accounts[0];
    if (account === undefined) return;

    for (const threshold of thresholds) {
      if (threshold.database_id === ANALYTICS_SENTINEL_ID) continue;

      try {
        const currentValue = extractMetricValue(account, threshold);
        if (currentValue === null) continue;

        // Update last_value
        await env.METADATA.prepare(
          `UPDATE monitoring_thresholds SET last_value = ?, updated_at = datetime('now') WHERE id = ?`,
        ).bind(currentValue, threshold.id).run();

        const breached = isBreached(currentValue, threshold.threshold_value, threshold.comparison);

        if (breached && !isCoolingDown(threshold)) {
          const eventType = getEventType(threshold.metric_type);
          if (!eventType) continue;

          const payload = createThresholdBreachPayload(
            threshold.database_id,
            threshold.database_name,
            threshold.metric_type,
            currentValue,
            threshold.threshold_value,
            threshold.comparison,
            getUnit(threshold.metric_type),
          );

          await triggerWebhooks(env, eventType, payload, isLocalDev);

          await env.METADATA.prepare(
            `UPDATE monitoring_thresholds SET last_alert_at = datetime('now') WHERE id = ?`,
          ).bind(threshold.id).run();
        }
      } catch (err) {
        void logError(
          env,
          `Failed to evaluate threshold ${threshold.id}`,
          { module: "monitoring", operation: "evaluate", metadata: { error: String(err) } },
          isLocalDev,
        );
      }
    }
  } catch (err) {
    void logError(
      env,
      `Monitoring processor failed: ${String(err)}`,
      { module: "monitoring", operation: "process" },
      isLocalDev,
    );
  }
}

function isCoolingDown(threshold: MonitoringThreshold): boolean {
  if (!threshold.last_alert_at) return false;
  const cooldownMs = threshold.cooldown_hours * 60 * 60 * 1000;
  const lastAlert = new Date(threshold.last_alert_at + "Z").getTime();
  return Date.now() - lastAlert < cooldownMs;
}

function isBreached(current: number, target: number, op: string): boolean {
  switch (op) {
    case "gt": return current > target;
    case "gte": return current >= target;
    case "lt": return current < target;
    case "lte": return current <= target;
    default: return false;
  }
}

function extractMetricValue(account: D1AnalyticsResult["viewer"]["accounts"][0], threshold: MonitoringThreshold): number | null {
  const dbId = threshold.database_id;

  switch (threshold.metric_type) {
    case "storage_usage": {
      if (threshold.storage_limit_bytes == null || threshold.storage_limit_bytes === 0) return null;
      const storageMatch = account.d1StorageAdaptiveGroups?.find(
        (g) => g.dimensions.databaseId === dbId,
      );
      if (!storageMatch) return 0;
      const sizeBytes = storageMatch.max.databaseSizeBytes ?? 0;
      return (sizeBytes / threshold.storage_limit_bytes) * 100;
    }
    case "query_latency": {
      const analyticsMatch = account.d1AnalyticsAdaptiveGroups.find(
        (g) => g.dimensions.databaseId === dbId,
      );
      if (!analyticsMatch) return 0;
      return analyticsMatch.quantiles?.queryBatchTimeMsP90 ?? 0;
    }
    case "error_rate": {
      // Aggregate from d1QueriesAdaptiveGroups where queryDurationMs is abnormally high
      // Or if rowsRead=0 and rowsWritten=0 for certain queries (fallback heuristic)
      const queryStats = account.d1QueriesAdaptiveGroups;
      if (!queryStats || queryStats.length === 0) return 0;
      
      let total = 0;
      let failed = 0;
      for (const q of queryStats) {
        total += q.count ?? 0;
        // Basic heuristic: if queryDurationMs is extremely high, assume timeout/error.
        // D1 limit is usually strict. We use >10000ms as an error indicator or 0 rows returned.
        // Actually, the analytics dataset doesn't have a reliable 'error' field.
        // We will sum queries that took longer than 10s.
        if (q.avg?.queryDurationMs !== undefined && q.avg.queryDurationMs > 10000) {
          failed += q.count ?? 0;
        }
      }
      return total > 0 ? (failed / total) * 100 : 0;
    }
    case "row_volume": {
      const analyticsMatch = account.d1AnalyticsAdaptiveGroups.find(
        (g) => g.dimensions.databaseId === dbId,
      );
      if (!analyticsMatch) return 0;
      return (analyticsMatch.sum.rowsRead ?? 0) + (analyticsMatch.sum.rowsWritten ?? 0);
    }
    default:
      return null;
  }
}

function getEventType(metricType: string): WebhookEventType | null {
  switch (metricType) {
    case "storage_usage": return "threshold_storage_usage";
    case "query_latency": return "threshold_query_latency";
    case "error_rate": return "threshold_error_rate";
    case "row_volume": return "threshold_row_volume";
    default: return null;
  }
}

function getUnit(metricType: string): string {
  switch (metricType) {
    case "storage_usage": return "%";
    case "query_latency": return "ms";
    case "error_rate": return "%";
    case "row_volume": return "rows";
    default: return "";
  }
}
