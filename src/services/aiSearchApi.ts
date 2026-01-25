/**
 * AI Search API Service
 *
 * Client-side API for D1 Manager AI Search integration.
 * Enables semantic search over database schemas and data.
 */

const WORKER_API = import.meta.env.VITE_WORKER_API || window.location.origin;

// ============================================
// Types
// ============================================

/**
 * AI Search compatibility analysis result
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
 * AI Search instance
 */
export interface AISearchInstance {
  id: string;
  description?: string;
  created_at?: string;
  status?: "active" | "indexing" | "paused" | "error" | "waiting";
  source?: string; // R2 bucket name
  type?: "r2" | "website";
  data_source?: {
    type: "r2" | "website";
    bucket_name?: string;
  };
}

/**
 * AI Search result item
 */
export interface AISearchResult {
  file_id: string;
  filename: string;
  score: number;
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
  response?: string;
  data: AISearchResult[];
  has_more: boolean;
  next_page: string | null;
}

/**
 * Export result
 */
export interface ExportResult {
  success: boolean;
  message: string;
  exportPath: string;
  filesExported: string[];
  note?: string;
}

// ============================================
// Cache
// ============================================

interface CompatibilityCacheEntry {
  data: AISearchCompatibility;
  timestamp: number;
}

const compatibilityCache = new Map<string, CompatibilityCacheEntry>();
const CACHE_TTL = 60000; // 1 minute

function getCachedCompatibility(
  databaseId: string,
): AISearchCompatibility | null {
  const entry = compatibilityCache.get(databaseId);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  return null;
}

function setCachedCompatibility(
  databaseId: string,
  data: AISearchCompatibility,
): void {
  compatibilityCache.set(databaseId, { data, timestamp: Date.now() });
}

/**
 * Invalidate compatibility cache for a database
 */
export function invalidateCompatibilityCache(databaseId: string): void {
  compatibilityCache.delete(databaseId);
}

// ============================================
// API Functions
// ============================================

/**
 * Get AI Search compatibility analysis for a database
 */
export async function getCompatibility(
  databaseId: string,
  skipCache = false,
): Promise<AISearchCompatibility> {
  if (!skipCache) {
    const cached = getCachedCompatibility(databaseId);
    if (cached) return cached;
  }

  const response = await fetch(
    `${WORKER_API}/api/ai-search/compatibility/${encodeURIComponent(databaseId)}`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to get compatibility: ${response.statusText}`);
  }

  const data = (await response.json()) as AISearchCompatibility;
  setCachedCompatibility(databaseId, data);
  return data;
}

/**
 * Export database to R2 for AI Search indexing
 */
export async function exportDatabase(
  databaseId: string,
  databaseName: string,
): Promise<ExportResult> {
  const response = await fetch(
    `${WORKER_API}/api/ai-search/export/${encodeURIComponent(databaseId)}`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ databaseName }),
    },
  );

  if (!response.ok) {
    const error = (await response.json()) as {
      error?: string;
      message?: string;
    };
    throw new Error(error.message ?? error.error ?? "Export failed");
  }

  const result = (await response.json()) as ExportResult;

  // Invalidate cache after export
  invalidateCompatibilityCache(databaseId);

  return result;
}

/**
 * List AI Search instances
 */
export async function listInstances(): Promise<{
  instances: AISearchInstance[];
  error?: string;
  dashboardUrl?: string;
}> {
  const response = await fetch(`${WORKER_API}/api/ai-search/instances`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Failed to list instances: ${response.statusText}`);
  }

  return (await response.json()) as {
    instances: AISearchInstance[];
    error?: string;
    dashboardUrl?: string;
  };
}

/**
 * Trigger sync for an AI Search instance
 */
export async function syncInstance(
  instanceName: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  const response = await fetch(
    `${WORKER_API}/api/ai-search/instances/${encodeURIComponent(instanceName)}/sync`,
    {
      method: "POST",
      credentials: "include",
    },
  );

  return (await response.json()) as {
    success: boolean;
    message?: string;
    error?: string;
  };
}

/**
 * Perform semantic search
 */
export async function semanticSearch(
  instanceName: string,
  query: string,
  options: {
    maxResults?: number;
    scoreThreshold?: number;
  } = {},
): Promise<AISearchResponse> {
  const response = await fetch(
    `${WORKER_API}/api/ai-search/${encodeURIComponent(instanceName)}/search`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        max_num_results: options.maxResults ?? 10,
        score_threshold: options.scoreThreshold,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Search failed: ${response.statusText}`);
  }

  return (await response.json()) as AISearchResponse;
}

/**
 * Perform AI-powered search with generated response
 */
export async function aiSearch(
  instanceName: string,
  query: string,
  options: {
    maxResults?: number;
    scoreThreshold?: number;
  } = {},
): Promise<AISearchResponse> {
  const response = await fetch(
    `${WORKER_API}/api/ai-search/${encodeURIComponent(instanceName)}/ai-search`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        max_num_results: options.maxResults ?? 10,
        score_threshold: options.scoreThreshold,
        stream: false,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`AI Search failed: ${response.statusText}`);
  }

  return (await response.json()) as AISearchResponse;
}

/**
 * Get Cloudflare dashboard URL for AI Search
 */
export async function getDashboardUrl(): Promise<{
  url: string;
  accountId: string;
}> {
  const response = await fetch(`${WORKER_API}/api/ai-search/dashboard-url`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    return {
      url: "https://dash.cloudflare.com/?to=/:account/ai/ai-search",
      accountId: "unknown",
    };
  }

  return (await response.json()) as { url: string; accountId: string };
}
