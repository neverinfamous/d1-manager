/**
 * Drizzle API Service
 *
 * Frontend API functions for Drizzle ORM operations including schema
 * introspection, migration management, and schema validation.
 */

const WORKER_API = import.meta.env.VITE_WORKER_API || window.location.origin;

// Cache for introspection results (5 minute TTL)
const introspectionCache = new Map<
  string,
  { data: IntrospectionResult; timestamp: number }
>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Rate limit retry configuration
const RETRY_DELAYS = [2000, 4000, 8000]; // Exponential backoff

/**
 * Drizzle column definition
 */
export interface DrizzleColumn {
  name: string;
  type: string;
  drizzleType: string;
  isPrimaryKey: boolean;
  isAutoIncrement: boolean;
  isNotNull: boolean;
  defaultValue: string | null;
  isUnique: boolean;
}

/**
 * Drizzle table definition
 */
export interface DrizzleTable {
  name: string;
  columns: DrizzleColumn[];
  primaryKey: string[];
  foreignKeys: {
    columns: string[];
    references: { table: string; columns: string[] };
    onDelete?: string;
    onUpdate?: string;
  }[];
  indexes: {
    name: string;
    columns: string[];
    isUnique: boolean;
  }[];
}

/**
 * Schema introspection result
 */
export interface IntrospectionResult {
  success: boolean;
  schema?: string;
  tables?: DrizzleTable[];
  error?: string;
}

/**
 * Migration info
 */
export interface MigrationInfo {
  hasMigrationsTable: boolean;
  appliedMigrations: {
    id: number;
    hash: string;
    created_at: string;
  }[];
}

/**
 * Schema validation result
 */
export interface SchemaValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Push result for individual statement
 */
export interface PushStatementResult {
  statement: string;
  success: boolean;
  error?: string;
}

/**
 * Push operation result
 */
export interface PushResult {
  results?: PushStatementResult[];
  executedStatements: number;
  totalStatements: number;
  allSucceeded: boolean;
  dryRun?: boolean;
  message?: string;
}

/**
 * Migration preview result
 */
export interface MigrationPreview {
  currentTables: string[];
  preview: string;
  statements: string[];
}

/**
 * Schema difference type
 */
export type SchemaDiffType =
  | "table_add"
  | "table_drop"
  | "column_add"
  | "column_drop"
  | "column_modify";

/**
 * Single schema difference
 */
export interface SchemaDiff {
  type: SchemaDiffType;
  tableName: string;
  columnName?: string;
  sql: string;
  warning?: string;
}

/**
 * Schema comparison result
 */
export interface SchemaComparisonResult {
  uploadedTables: string[];
  currentTables: string[];
  differences: SchemaDiff[];
  sqlStatements: string[];
  summary: string;
  warnings: string[];
  parseErrors: string[];
}

/**
 * API error response
 */
interface ApiErrorResponse {
  error?: string;
  message?: string;
}

/**
 * Helper to sleep for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper to make API requests with retry logic for rate limits
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryCount = 0,
): Promise<Response> {
  const response = await fetch(url, options);

  // Retry on rate limit or temporary errors
  if (
    (response.status === 429 ||
      response.status === 503 ||
      response.status === 504) &&
    retryCount < RETRY_DELAYS.length
  ) {
    const delay = RETRY_DELAYS[retryCount];
    if (delay !== undefined) {
      await sleep(delay);
      return fetchWithRetry(url, options, retryCount + 1);
    }
  }

  return response;
}

/**
 * Parse error response from API
 */
async function parseErrorResponse(response: Response): Promise<string> {
  if (response.status === 429) {
    return "Rate limited (429). Please wait a moment and try again.";
  }
  if (response.status === 503) {
    return "Service temporarily unavailable (503). Please try again.";
  }
  if (response.status === 504) {
    return "Request timeout (504). The operation took too long.";
  }

  try {
    const data = (await response.json()) as ApiErrorResponse;
    return (
      data.error ??
      data.message ??
      `Request failed with status ${response.status}`
    );
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

/**
 * Introspect a D1 database and generate Drizzle schema
 */
export async function introspectDatabase(
  databaseId: string,
  skipCache = false,
): Promise<IntrospectionResult> {
  // Check cache first
  if (!skipCache) {
    const cached = introspectionCache.get(databaseId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }

  const response = await fetchWithRetry(
    `${WORKER_API}/api/drizzle/${databaseId}/introspect`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    },
  );

  if (!response.ok) {
    const errorMessage = await parseErrorResponse(response);
    return { success: false, error: errorMessage };
  }

  const data = (await response.json()) as {
    result: IntrospectionResult;
    success: boolean;
  };

  if (data.success && data.result !== undefined) {
    // Cache the result
    introspectionCache.set(databaseId, {
      data: data.result,
      timestamp: Date.now(),
    });
    return data.result;
  }

  return { success: false, error: "Unknown error during introspection" };
}

/**
 * Validate Drizzle schema syntax
 */
export async function validateSchema(
  databaseId: string,
  schema: string,
): Promise<SchemaValidation> {
  const response = await fetchWithRetry(
    `${WORKER_API}/api/drizzle/${databaseId}/validate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ schema }),
    },
  );

  if (!response.ok) {
    const errorMessage = await parseErrorResponse(response);
    return { valid: false, errors: [errorMessage] };
  }

  const data = (await response.json()) as {
    result: SchemaValidation;
    success: boolean;
  };
  return data.result ?? { valid: false, errors: ["Unknown validation error"] };
}

/**
 * Get migration status for a database
 */
export async function getMigrationStatus(
  databaseId: string,
): Promise<MigrationInfo> {
  const response = await fetchWithRetry(
    `${WORKER_API}/api/drizzle/${databaseId}/migrations`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  if (!response.ok) {
    const errorMessage = await parseErrorResponse(response);
    throw new Error(errorMessage);
  }

  const data = (await response.json()) as {
    result: MigrationInfo;
    success: boolean;
  };
  return data.result ?? { hasMigrationsTable: false, appliedMigrations: [] };
}

/**
 * Generate migration preview
 */
export async function generateMigrationPreview(
  databaseId: string,
): Promise<MigrationPreview> {
  const response = await fetchWithRetry(
    `${WORKER_API}/api/drizzle/${databaseId}/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    },
  );

  if (!response.ok) {
    const errorMessage = await parseErrorResponse(response);
    throw new Error(errorMessage);
  }

  const data = (await response.json()) as {
    result: MigrationPreview;
    success: boolean;
  };
  return (
    data.result ?? { currentTables: [], preview: "No changes", statements: [] }
  );
}

/**
 * Check schema against database
 */
export async function checkSchema(
  databaseId: string,
  schema?: string,
): Promise<{
  databaseSchema: IntrospectionResult;
  schemaValidation: SchemaValidation | null;
  tableCount: number;
}> {
  const response = await fetchWithRetry(
    `${WORKER_API}/api/drizzle/${databaseId}/check`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ schema }),
    },
  );

  if (!response.ok) {
    const errorMessage = await parseErrorResponse(response);
    throw new Error(errorMessage);
  }

  const data = (await response.json()) as {
    result: {
      databaseSchema: IntrospectionResult;
      schemaValidation: SchemaValidation | null;
      tableCount: number;
    };
    success: boolean;
  };

  return (
    data.result ?? {
      databaseSchema: { success: false, error: "Unknown error" },
      schemaValidation: null,
      tableCount: 0,
    }
  );
}

/**
 * Push schema changes to database
 */
export async function pushSchemaChanges(
  databaseId: string,
  statements: string[],
  dryRun = false,
): Promise<PushResult> {
  const response = await fetchWithRetry(
    `${WORKER_API}/api/drizzle/${databaseId}/push`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ statements, dryRun }),
    },
  );

  if (!response.ok) {
    const errorMessage = await parseErrorResponse(response);
    throw new Error(errorMessage);
  }

  // Response type varies between dry run and actual push
  interface DryRunResult {
    statements: string[];
    dryRun: boolean;
    message: string;
  }

  interface ActualPushResult {
    results: PushStatementResult[];
    executedStatements: number;
    totalStatements: number;
    allSucceeded: boolean;
  }

  const data = (await response.json()) as {
    result: DryRunResult | ActualPushResult;
    success: boolean;
  };

  // Handle dry run response - normalize to PushResult format
  if (data.success && "dryRun" in data.result && data.result.dryRun) {
    return {
      executedStatements: 0,
      totalStatements: statements.length,
      allSucceeded: true,
      dryRun: true,
      message: data.result.message,
    };
  }

  // Handle actual push response
  const result = data.result as ActualPushResult;

  // Invalidate cache on successful push
  if (data.success && result.allSucceeded) {
    introspectionCache.delete(databaseId);
  }

  return {
    results: result.results,
    executedStatements: result.executedStatements ?? 0,
    totalStatements: result.totalStatements ?? statements.length,
    allSucceeded: result.allSucceeded ?? false,
  };
}

/**
 * Apply migration to database
 */
export async function applyMigration(
  databaseId: string,
  statements: string[],
  hash: string,
  dryRun = false,
): Promise<{
  migrationApplied: boolean;
  hash: string;
  executedStatements?: number;
  skipped?: boolean;
  message?: string;
}> {
  const response = await fetchWithRetry(
    `${WORKER_API}/api/drizzle/${databaseId}/migrate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ statements, hash, dryRun }),
    },
  );

  if (!response.ok) {
    const errorMessage = await parseErrorResponse(response);
    throw new Error(errorMessage);
  }

  const data = (await response.json()) as {
    result: {
      migrationApplied: boolean;
      hash: string;
      executedStatements?: number;
      skipped?: boolean;
      message?: string;
    };
    success: boolean;
  };

  // Invalidate cache on successful migration
  if (data.success && data.result?.migrationApplied) {
    introspectionCache.delete(databaseId);
  }

  return (
    data.result ?? {
      migrationApplied: false,
      hash,
    }
  );
}

/**
 * Export schema as TypeScript file (triggers download)
 */
export async function exportSchema(databaseId: string): Promise<void> {
  const response = await fetchWithRetry(
    `${WORKER_API}/api/drizzle/${databaseId}/export`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  if (!response.ok) {
    const errorMessage = await parseErrorResponse(response);
    throw new Error(errorMessage);
  }

  // Get the schema content
  const schema = await response.text();

  // Create blob and download
  const blob = new Blob([schema], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "schema.ts";
  document.body.appendChild(link);
  link.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Compare uploaded schema with current database
 */
export async function compareSchemas(
  databaseId: string,
  schemaContent: string,
): Promise<SchemaComparisonResult> {
  const response = await fetchWithRetry(
    `${WORKER_API}/api/drizzle/${databaseId}/compare`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ schemaContent }),
    },
  );

  if (!response.ok) {
    const errorMessage = await parseErrorResponse(response);
    throw new Error(errorMessage);
  }

  const data = (await response.json()) as {
    result: SchemaComparisonResult;
    success: boolean;
  };

  return (
    data.result ?? {
      uploadedTables: [],
      currentTables: [],
      differences: [],
      sqlStatements: [],
      summary: "Comparison failed",
      warnings: [],
      parseErrors: ["Unknown error"],
    }
  );
}

/**
 * Clear introspection cache for a database
 */
export function clearIntrospectionCache(databaseId?: string): void {
  if (databaseId) {
    introspectionCache.delete(databaseId);
  } else {
    introspectionCache.clear();
  }
}
