import type { Env, MonitoringThreshold, MonitoringThresholdInput } from "../types";
// Removed unused imports

type CorsHeaders = HeadersInit;

function jsonHeaders(corsHeaders: CorsHeaders): Headers {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json");
  return headers;
}

function generateId(): string {
  return `mon_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

function jsonResponse(
  data: unknown,
  corsHeaders: CorsHeaders,
  status = 200,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: jsonHeaders(corsHeaders),
  });
}

function errorResponse(
  message: string,
  corsHeaders: CorsHeaders,
  status = 500,
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: jsonHeaders(corsHeaders),
  });
}

export async function handleMonitoringRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean,
  _userEmail: string | null,
): Promise<Response | null> {
  const method = request.method;
  
  if (method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // GET /api/monitoring
  if (method === "GET" && url.pathname === "/api/monitoring") {
    const databaseId = url.searchParams.get("databaseId");
    let query = `SELECT * FROM monitoring_thresholds`;
    const params: string[] = [];

    if (databaseId) {
      query += ` WHERE database_id = ?`;
      params.push(databaseId);
    }
    
    query += ` ORDER BY created_at DESC`;

    try {
      if (isLocalDev) {
        return jsonResponse({ thresholds: [] }, corsHeaders);
      }
      
      const { results } = await env.METADATA.prepare(query)
        .bind(...params)
        .all<MonitoringThreshold>();

      return jsonResponse({ thresholds: results }, corsHeaders);
    } catch (err) {
      return errorResponse(`Failed to fetch thresholds: ${String(err)}`, corsHeaders);
    }
  }

  // GET /api/monitoring/:id
  if (method === "GET" && (/^\/api\/monitoring\/mon_[a-z0-9_]+$/.exec(url.pathname))) {
    const id = url.pathname.split("/").pop();
    if (!id) return errorResponse("Missing ID", corsHeaders, 400);

    try {
      if (isLocalDev) return errorResponse("Not implemented in local dev", corsHeaders, 404);

      const { results } = await env.METADATA.prepare(
        `SELECT * FROM monitoring_thresholds WHERE id = ?`,
      )
        .bind(id)
        .all<MonitoringThreshold>();

      if (results.length === 0) {
        return errorResponse("Threshold not found", corsHeaders, 404);
      }
      return jsonResponse({ threshold: results[0] }, corsHeaders);
    } catch (err) {
      return errorResponse(`Failed to fetch threshold: ${String(err)}`, corsHeaders);
    }
  }

  // POST /api/monitoring/trigger
  if (method === "POST" && url.pathname === "/api/monitoring/trigger") {
    try {
      if (isLocalDev) return errorResponse("Not implemented in local dev", corsHeaders, 404);
      
      const { processMonitoring } = await import("../utils/monitoring-processor");
      await processMonitoring(env);
      return jsonResponse({ success: true, message: "Monitoring evaluation triggered successfully" }, corsHeaders, 200);
    } catch (err) {
      return errorResponse(`Failed to trigger monitoring: ${String(err)}`, corsHeaders);
    }
  }

  // POST /api/monitoring
  if (method === "POST" && url.pathname === "/api/monitoring") {
    try {
      const input = (await request.json()) as MonitoringThresholdInput;
      const id = generateId();
      
      if (!input.database_id || !input.database_name || !input.metric_type || typeof input.threshold_value !== 'number') {
        return errorResponse("Missing required fields", corsHeaders, 400);
      }

      if (input.metric_type === "storage_usage" && (input.storage_limit_bytes == null || input.storage_limit_bytes === 0)) {
        return errorResponse("Storage usage metric requires storage_limit_bytes", corsHeaders, 400);
      }

      const enabled = input.enabled !== false ? 1 : 0;
      const cooldown = input.cooldown_hours ?? 6;
      const comparison = input.comparison ?? "gt";

      if (isLocalDev) return jsonResponse({ threshold: { id, ...input } }, corsHeaders, 201);

      await env.METADATA.prepare(
        `INSERT INTO monitoring_thresholds (
          id, database_id, database_name, metric_type, threshold_value, comparison, cooldown_hours, storage_limit_bytes, enabled
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        input.database_id,
        input.database_name,
        input.metric_type,
        input.threshold_value,
        comparison,
        cooldown,
        input.storage_limit_bytes ?? null,
        enabled
      ).run();

      const { results } = await env.METADATA.prepare(`SELECT * FROM monitoring_thresholds WHERE id = ?`).bind(id).all<MonitoringThreshold>();
      return jsonResponse({ threshold: results[0] }, corsHeaders, 201);
    } catch (err) {
      return errorResponse(`Failed to create threshold: ${String(err)}`, corsHeaders);
    }
  }

  // PUT /api/monitoring/:id
  if (method === "PUT" && (/^\/api\/monitoring\/mon_[a-z0-9_]+$/.exec(url.pathname))) {
    const id = url.pathname.split("/").pop();
    if (!id) return errorResponse("Missing ID", corsHeaders, 400);

    try {
      const input = (await request.json()) as Partial<MonitoringThresholdInput>;
      if (isLocalDev) return jsonResponse({ threshold: { id, ...input } }, corsHeaders);

      const { results: existing } = await env.METADATA.prepare(`SELECT * FROM monitoring_thresholds WHERE id = ?`).bind(id).all<MonitoringThreshold>();
      if (existing.length === 0) return errorResponse("Not found", corsHeaders, 404);

      const current = existing[0];
      if (!current) return errorResponse("Not found", corsHeaders, 404);
      
      const metricType = input.metric_type ?? current.metric_type;
      const storageLimit = input.storage_limit_bytes !== undefined ? input.storage_limit_bytes : current.storage_limit_bytes;

      if (metricType === "storage_usage" && (storageLimit == null || storageLimit === 0)) {
        return errorResponse("Storage usage metric requires storage_limit_bytes", corsHeaders, 400);
      }

      await env.METADATA.prepare(
        `UPDATE monitoring_thresholds SET 
          metric_type = ?, threshold_value = ?, comparison = ?, cooldown_hours = ?, storage_limit_bytes = ?, enabled = ?, updated_at = datetime('now')
        WHERE id = ?`
      ).bind(
        metricType,
        input.threshold_value ?? current.threshold_value,
        input.comparison ?? current.comparison,
        input.cooldown_hours ?? current.cooldown_hours,
        storageLimit ?? null,
        input.enabled !== undefined ? (input.enabled ? 1 : 0) : current.enabled,
        id
      ).run();

      const { results } = await env.METADATA.prepare(`SELECT * FROM monitoring_thresholds WHERE id = ?`).bind(id).all<MonitoringThreshold>();
      return jsonResponse({ threshold: results[0] }, corsHeaders);
    } catch (err) {
      return errorResponse(`Failed to update threshold: ${String(err)}`, corsHeaders);
    }
  }

  // DELETE /api/monitoring/:id
  if (method === "DELETE" && (/^\/api\/monitoring\/mon_[a-z0-9_]+$/.exec(url.pathname))) {
    const id = url.pathname.split("/").pop();
    if (!id) return errorResponse("Missing ID", corsHeaders, 400);

    try {
      if (isLocalDev) return new Response(null, { status: 204, headers: corsHeaders });
      await env.METADATA.prepare(`DELETE FROM monitoring_thresholds WHERE id = ?`).bind(id).run();
      return new Response(null, { status: 204, headers: corsHeaders });
    } catch (err) {
      return errorResponse(`Failed to delete threshold: ${String(err)}`, corsHeaders);
    }
  }

  // POST /api/monitoring/:id/test
  if (method === "POST" && (/^\/api\/monitoring\/mon_[a-z0-9_]+\/test$/.exec(url.pathname))) {
    return jsonResponse({
      success: true,
      breached: false,
      current_value: 0,
      message: "Test executed (mock)",
    }, corsHeaders);
  }

  // POST /api/monitoring/defaults/:databaseId
  if (method === "POST" && (/^\/api\/monitoring\/defaults\/[a-z0-9-]+$/.exec(url.pathname))) {
    const dbId = url.pathname.split("/").pop();
    if (!dbId) return errorResponse("Missing database ID", corsHeaders, 400);
    
    try {
      const input = await request.json() as { database_name: string, storage_limit_bytes: number };
      if (!input.database_name || !input.storage_limit_bytes) {
        return errorResponse("Missing database_name or storage_limit_bytes", corsHeaders, 400);
      }
      
      const defaults = [
        { metric_type: "storage_usage", threshold_value: 80, comparison: "gt", cooldown_hours: 6 },
        { metric_type: "query_latency", threshold_value: 200, comparison: "gt", cooldown_hours: 6 },
        { metric_type: "error_rate", threshold_value: 5, comparison: "gt", cooldown_hours: 6 },
        { metric_type: "row_volume", threshold_value: 1000000, comparison: "gt", cooldown_hours: 12 },
      ];
      
      const created = [];
      for (const def of defaults) {
        const id = generateId();
        await env.METADATA.prepare(
          `INSERT INTO monitoring_thresholds (
            id, database_id, database_name, metric_type, threshold_value, comparison, cooldown_hours, storage_limit_bytes, enabled
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          id, dbId, input.database_name, def.metric_type, def.threshold_value, def.comparison, def.cooldown_hours,
          def.metric_type === "storage_usage" ? input.storage_limit_bytes : null,
          1
        ).run();
        
        const { results } = await env.METADATA.prepare(`SELECT * FROM monitoring_thresholds WHERE id = ?`).bind(id).all<MonitoringThreshold>();
        if (results.length > 0) created.push(results[0]);
      }
      return jsonResponse({ thresholds: created }, corsHeaders, 201);
    } catch (err) {
      return errorResponse(`Failed to create defaults: ${String(err)}`, corsHeaders);
    }
  }

  return null;
}
