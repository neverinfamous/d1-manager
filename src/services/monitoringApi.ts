import type {
  MonitoringThreshold,
  MonitoringThresholdInput,
  MonitoringThresholdResponse,
  MonitoringThresholdsResponse,
  MonitoringTestResult,
} from "../types/monitoring";

interface ApiError extends Error {
  status?: number;
}

const WORKER_API = import.meta.env.VITE_WORKER_API || window.location.origin;

// 2-minute TTL cache
let thresholdsCache: {
  data: MonitoringThreshold[];
  timestamp: number;
} | null = null;
const CACHE_TTL = 2 * 60 * 1000;

export function invalidateMonitoringCache(): void {
  thresholdsCache = null;
}

/**
 * Handle API responses and throw structured errors
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = "An error occurred";
    try {
      const errorData = await response.json() as { error?: string };
      if (errorData.error) {
        errorMessage = errorData.error;
      }
    } catch {
      // Fallback to text or status text
      const text = await response.text().catch(() => "");
      errorMessage = text || response.statusText || "Unknown error";
    }

    const error = new Error(errorMessage) as ApiError;
    error.status = response.status;
    
    // Provide more helpful messages for common status codes
    if (response.status === 429) {
      error.message = "Rate limit exceeded. Please try again later.";
    } else if (response.status === 503 || response.status === 504) {
      error.message = "Service temporarily unavailable. Please try again later.";
    }
    
    throw error;
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  const resultData = (await response.json()) as T;
  return resultData;
}

/**
 * Fetch all monitoring thresholds (optionally filtered by database)
 */
export async function getMonitoringThresholds(databaseId?: string): Promise<MonitoringThreshold[]> {
  // Use cache if available and not expired (only for unfiltered requests)
  if (!databaseId && thresholdsCache && Date.now() - thresholdsCache.timestamp < CACHE_TTL) {
    return thresholdsCache.data;
  }

  let url = "/api/monitoring";
  if (databaseId) {
    url += `?databaseId=${encodeURIComponent(databaseId)}`;
  }

  const response = await fetch(`${WORKER_API}${url}`, {
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
  });

  const data = await handleResponse<MonitoringThresholdsResponse>(response);
  
  // Update cache for unfiltered requests
  if (!databaseId) {
    thresholdsCache = {
      data: data.thresholds,
      timestamp: Date.now(),
    };
  }
  
  return data.thresholds;
}

/**
 * Fetch a single monitoring threshold
 */
export async function getMonitoringThreshold(id: string): Promise<MonitoringThreshold> {
  const response = await fetch(`${WORKER_API}/api/monitoring/${encodeURIComponent(id)}`, {
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
  });

  const data = await handleResponse<MonitoringThresholdResponse>(response);
  return data.threshold;
}

/**
 * Create a new monitoring threshold
 */
export async function createMonitoringThreshold(input: MonitoringThresholdInput): Promise<MonitoringThreshold> {
  const response = await fetch(`${WORKER_API}/api/monitoring`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    credentials: "include",
  });

  const data = await handleResponse<MonitoringThresholdResponse>(response);
  invalidateMonitoringCache();
  return data.threshold;
}

/**
 * Trigger manual monitoring evaluation
 */
export async function triggerMonitoringCheck(): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${WORKER_API}/api/monitoring/trigger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
  });
  return handleResponse<{ success: boolean; message: string }>(response);
}

/**
 * Update an existing monitoring threshold
 */
export async function updateMonitoringThreshold(id: string, input: Partial<MonitoringThresholdInput>): Promise<MonitoringThreshold> {
  const response = await fetch(`${WORKER_API}/api/monitoring/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    credentials: "include",
  });

  const data = await handleResponse<MonitoringThresholdResponse>(response);
  invalidateMonitoringCache();
  return data.threshold;
}

/**
 * Delete a monitoring threshold
 */
export async function deleteMonitoringThreshold(id: string): Promise<void> {
  const response = await fetch(`${WORKER_API}/api/monitoring/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
  });

  await handleResponse<Record<string, never>>(response);
  invalidateMonitoringCache();
}

/**
 * Test a monitoring threshold against live analytics
 */
export async function testMonitoringThreshold(id: string): Promise<MonitoringTestResult> {
  const response = await fetch(`${WORKER_API}/api/monitoring/${encodeURIComponent(id)}/test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
  });

  return handleResponse<MonitoringTestResult>(response);
}

/**
 * Create default threshold presets for a database (Quick Setup)
 */
export async function createDefaultThresholds(databaseId: string, databaseName: string, storageLimitBytes: number): Promise<MonitoringThreshold[]> {
  const response = await fetch(`${WORKER_API}/api/monitoring/defaults/${encodeURIComponent(databaseId)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      database_name: databaseName,
      storage_limit_bytes: storageLimitBytes,
    }),
    credentials: "include",
  });

  const data = await handleResponse<MonitoringThresholdsResponse>(response);
  invalidateMonitoringCache();
  return data.thresholds;
}
