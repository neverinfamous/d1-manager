/**
 * Health API Service
 *
 * Client-side API for the D1 Manager Health Dashboard.
 * Includes 2-minute TTL caching following the D1 Manager standards.
 */

const WORKER_API = import.meta.env.VITE_WORKER_API || window.location.origin;

// ============================================
// Types
// ============================================

/**
 * Database with low backup coverage
 */
export interface LowBackupDatabase {
  id: string;
  name: string;
  hasScheduledBackup: boolean;
  lastBackupAt: string | null;
  daysSinceBackup: number | null;
}

/**
 * Failed backup information
 */
export interface FailedBackupInfo {
  databaseId: string;
  databaseName: string;
  scheduleId: string;
  failedAt: string;
  jobId: string | null;
}

/**
 * Database replication status
 */
export interface ReplicationInfo {
  id: string;
  name: string;
  replicationMode: "auto" | "disabled";
}

/**
 * Health summary response
 */
export interface HealthSummary {
  databases: {
    total: number;
    withReplication: number;
  };
  storage: {
    totalBytes: number;
    avgPerDatabase: number;
  };
  backups: {
    scheduled: number;
    enabled: number;
    lastFailedCount: number;
    orphanedCount: number;
  };
  recentJobs: {
    last24h: number;
    last7d: number;
    failedLast24h: number;
  };
  lowBackupDatabases: LowBackupDatabase[];
  failedBackups: FailedBackupInfo[];
  replicationDisabled: ReplicationInfo[];
}

// ============================================
// Cache
// ============================================

interface HealthCacheEntry {
  data: HealthSummary;
  timestamp: number;
}

let healthCache: HealthCacheEntry | null = null;
const HEALTH_CACHE_TTL = 120000; // 2 minutes (same as metrics)

function getCachedHealth(): HealthSummary | null {
  if (healthCache && Date.now() - healthCache.timestamp < HEALTH_CACHE_TTL) {
    return healthCache.data;
  }
  return null;
}

function setCachedHealth(data: HealthSummary): void {
  healthCache = { data, timestamp: Date.now() };
}

/**
 * Invalidate health cache
 * Call after operations that affect health metrics
 */
export function invalidateHealthCache(): void {
  healthCache = null;
}

// ============================================
// API Functions
// ============================================

/**
 * Get health summary with caching
 * @param skipCache - Set true to bypass cache (e.g., on manual refresh)
 */
export async function getHealthSummary(
  skipCache = false,
): Promise<HealthSummary> {
  // Check cache first
  if (!skipCache) {
    const cached = getCachedHealth();
    if (cached) {
      return cached;
    }
  }

  const response = await fetch(`${WORKER_API}/api/health`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    // Handle common HTTP status codes with meaningful messages
    if (response.status === 429) {
      throw new Error(
        "Rate limit exceeded. Please wait a moment and try again.",
      );
    }
    if (response.status === 503) {
      throw new Error(
        "Service temporarily unavailable. Please try again shortly.",
      );
    }
    if (response.status === 504) {
      throw new Error("Request timeout. Please try again.");
    }
    throw new Error(`Failed to get health summary: ${response.statusText}`);
  }

  const data = (await response.json()) as HealthSummary;

  // Cache the result
  setCachedHealth(data);

  return data;
}
