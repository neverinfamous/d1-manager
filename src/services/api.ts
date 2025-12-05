const WORKER_API = import.meta.env.VITE_WORKER_API || window.location.origin

// Generic API response type for type-safe JSON parsing
interface ApiResponse<T = unknown> {
  result?: T
  success?: boolean
  error?: string
  message?: string
  meta?: Record<string, unknown>
}

// Error response type for non-ok responses
interface ApiErrorResponse {
  error?: string
  message?: string
  details?: string
  errors?: { message?: string }[]
}

// Helper function to safely parse error response
async function parseErrorResponse(response: Response): Promise<ApiErrorResponse> {
  // Handle common HTTP status codes with meaningful messages
  if (response.status === 429) {
    return { error: 'Rate limited (429). Please wait a moment and try again.' }
  }
  if (response.status === 503) {
    return { error: 'Service temporarily unavailable (503). Please try again.' }
  }
  if (response.status === 504) {
    return { error: 'Request timeout (504). The operation took too long.' }
  }
  
  try {
    const data = await response.json() as ApiErrorResponse
    // Prefer message over error for more detailed error info
    if (data.message && !data.error) {
      data.error = data.message
    }
    return data
  } catch {
    // If JSON parsing fails, return status-based error
    return { error: `Request failed with status ${response.status}` }
  }
}

// Database types
export interface D1Database {
  uuid: string
  name: string
  version: string
  created_at: string
  file_size?: number
  num_tables?: number
  read_replication?: {
    mode: 'auto' | 'disabled'
  }
  fts5_count?: number  // Number of FTS5 tables, if any
}

// Read replication types
export type ReadReplicationMode = 'auto' | 'disabled'

// Database color types for visual organization
export type DatabaseColor = 
  | 'red' | 'red-light' | 'red-dark'
  | 'orange' | 'orange-light' | 'amber'
  | 'yellow' | 'yellow-light' | 'lime'
  | 'green' | 'green-light' | 'emerald'
  | 'teal' | 'cyan' | 'sky'
  | 'blue' | 'blue-light' | 'indigo'
  | 'purple' | 'violet' | 'fuchsia'
  | 'pink' | 'rose' | 'pink-light'
  | 'gray' | 'slate' | 'zinc'
  | null

// Table types
export interface TableInfo {
  name: string
  type: 'table' | 'view' | 'shadow' | 'virtual'
  ncol: number
  wr: number
  strict: number
  row_count?: number
}

export interface ColumnInfo {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
  // Extended info (may not always be available)
  unique?: boolean
  hidden?: number // 0=normal, 1=hidden (for generated columns), 2=virtual, 3=stored
  generatedExpression?: string
  checkConstraint?: string
}

export interface IndexInfo {
  seq: number
  name: string
  unique: number
  origin: string
  partial: number
}

// Filter types for row-level filtering
export interface FilterCondition {
  type: 'contains' | 'equals' | 'notEquals' | 'gt' | 'gte' | 'lt' | 'lte' | 
        'isNull' | 'isNotNull' | 'startsWith' | 'endsWith' | 
        'between' | 'notBetween' | 'in' | 'notIn'
  value?: string | number
  value2?: string | number // For BETWEEN operators
  values?: (string | number)[] // For IN operators
  logicOperator?: 'AND' | 'OR' // For combining with next filter
}

// Foreign key dependency types
export interface ForeignKeyDependency {
  table: string
  column: string
  onDelete: string | null
  onUpdate: string | null
  rowCount: number
}

export interface TableDependencies {
  outbound: ForeignKeyDependency[]
  inbound: ForeignKeyDependency[]
}

export type TableDependenciesResponse = Record<string, TableDependencies>

// Query types
export interface QueryResult<T = Record<string, unknown>> {
  results: T[]
  meta?: {
    duration?: number
    rows_read?: number
    rows_written?: number
    changes?: number
    last_row_id?: number
    served_by_region?: string
    served_by_primary?: boolean
  }
  success: boolean
}

export interface QueryHistoryEntry {
  id: number
  database_id: string
  query: string
  executed_at: string
  duration_ms?: number
  rows_affected?: number
  error?: string
}

// Undo history types
export interface UndoHistoryEntry {
  id: number
  database_id: string
  operation_type: 'DROP_TABLE' | 'DROP_COLUMN' | 'DELETE_ROW'
  target_table: string
  target_column?: string
  description: string
  executed_at: string
  user_email?: string
}

// Metrics types
export type MetricsTimeRange = '24h' | '7d' | '30d'

export interface MetricsDataPoint {
  date: string
  databaseId: string
  readQueries: number
  writeQueries: number
  rowsRead: number
  rowsWritten: number
  queryBatchTimeMsP50?: number | undefined
  queryBatchTimeMsP90?: number | undefined
  queryBatchResponseBytes?: number | undefined
}

export interface StorageDataPoint {
  date: string
  databaseId: string
  databaseSizeBytes: number
}

export interface DatabaseMetricsSummary {
  databaseId: string
  databaseName?: string | undefined
  totalReadQueries: number
  totalWriteQueries: number
  totalRowsRead: number
  totalRowsWritten: number
  avgLatencyMs?: number | undefined
  p90LatencyMs?: number | undefined
  currentSizeBytes?: number | undefined
}

export interface MetricsSummary {
  timeRange: MetricsTimeRange
  startDate: string
  endDate: string
  totalReadQueries: number
  totalWriteQueries: number
  totalRowsRead: number
  totalRowsWritten: number
  avgLatencyMs?: number | undefined
  totalStorageBytes: number
  databaseCount: number
}

export interface MetricsResponse {
  summary: MetricsSummary
  byDatabase: DatabaseMetricsSummary[]
  timeSeries: MetricsDataPoint[]
  storageSeries: StorageDataPoint[]
}

// Optimize result types
class APIService {
  /**
   * Get fetch options with credentials and cache control
   */
  private getFetchOptions(init?: RequestInit): RequestInit {
    // Always include credentials so cookies are sent automatically
    // Add cache control to prevent stale auth tokens
    return {
      ...init,
      credentials: 'include',
      cache: 'no-store'
    }
  }

  /**
   * Handle API response and check for authentication errors
   */
  private handleResponse(response: Response): Response {
    // Check for authentication errors
    if (response.status === 401 || response.status === 403) {
      // Clear any cached data
      localStorage.clear();
      sessionStorage.clear();
      
      // Throw error with status to trigger logout in app
      throw new Error(`Authentication error: ${String(response.status)}`);
    }
    
    // Provide user-friendly error messages for common issues
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Cloudflare limits API requests - please wait a moment and try again.');
    }
    
    if (response.status === 503) {
      throw new Error('Service temporarily unavailable. Cloudflare may be experiencing issues - please try again shortly.');
    }
    
    if (response.status === 504) {
      throw new Error('Request timed out. The database may be under heavy load - please try again.');
    }
    
    if (!response.ok) {
      throw new Error(`API error: ${String(response.status)} ${response.statusText}`);
    }
    
    return response;
  }

  /**
   * List all D1 databases (with caching)
   */
  async listDatabases(skipCache = false): Promise<D1Database[]> {
    // Check cache first
    if (!skipCache) {
      const cached = getCachedDatabaseList()
      if (cached) {
        return cached
      }
    }

    const response = await fetch(`${WORKER_API}/api/databases`, 
      this.getFetchOptions()
    )
    
    this.handleResponse(response);
    
    const data = await response.json() as ApiResponse<D1Database[]>
    const result = data.result ?? []
    
    // Cache the result
    setCachedDatabaseList(result)
    
    return result
  }

  /**
   * Get database info (cached for 5 minutes)
   */
  async getDatabaseInfo(databaseId: string, skipCache = false): Promise<D1Database> {
    // Check cache first
    if (!skipCache) {
      const cached = getDatabaseInfoCache(databaseId)
      if (cached) {
        return cached
      }
    }
    
    const response = await fetch(`${WORKER_API}/api/databases/${databaseId}/info`, {
      credentials: 'include'
    })
    
    if (!response.ok) {
      // Provide user-friendly error messages for common issues
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Cloudflare limits API requests - please wait a moment and try again.')
      }
      if (response.status === 503) {
        throw new Error('Service temporarily unavailable. Cloudflare may be experiencing issues - please try again shortly.')
      }
      if (response.status === 504) {
        throw new Error('Request timed out. The database may be under heavy load - please try again.')
      }
      throw new Error(`Failed to get database info: ${response.statusText}`)
    }
    
    const data = await response.json() as ApiResponse<D1Database>
    if (!data.result) throw new Error('No result in response')
    
    // Cache the result
    setDatabaseInfoCache(databaseId, data.result)
    
    return data.result
  }

  /**
   * Set read replication mode for a database
   * @param databaseId - Database UUID
   * @param mode - 'auto' to enable read replication, 'disabled' to disable
   */
  async setReadReplication(databaseId: string, mode: ReadReplicationMode): Promise<D1Database> {
    const response = await fetch(`${WORKER_API}/api/databases/${databaseId}/replication`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ mode })
    })
    
    if (!response.ok) {
      const error = await parseErrorResponse(response)
      throw new Error(error.error ?? error.message ?? `Failed to set read replication: ${response.statusText}`)
    }
    
    const data = await response.json() as ApiResponse<D1Database>
    if (!data.result) throw new Error('No result in response')
    
    // Invalidate and update cache with new data
    invalidateDatabaseInfoCache(databaseId)
    setDatabaseInfoCache(databaseId, data.result)
    
    return data.result
  }

  /**
   * Create a new database
   */
  async createDatabase(name: string, location?: string): Promise<D1Database> {
    const response = await fetch(`${WORKER_API}/api/databases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ name, location })
    })
    
    if (!response.ok) {
      throw new Error(`Failed to create database: ${response.statusText}`)
    }
    
    const data = await response.json() as ApiResponse<D1Database>
    if (!data.result) throw new Error('No result in response')
    
    // Invalidate database list cache after creation
    invalidateDatabaseListCache()
    
    return data.result
  }

  /**
   * Delete a database
   */
  async deleteDatabase(databaseId: string): Promise<void> {
    const response = await fetch(`${WORKER_API}/api/databases/${databaseId}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    
    if (!response.ok) {
      throw new Error(`Failed to delete database: ${response.statusText}`)
    }
    
    // Invalidate caches after deletion
    invalidateDatabaseListCache()
    invalidateDatabaseInfoCache(databaseId)
  }

  /**
   * Delete multiple databases
   */
  async deleteDatabases(
    databaseIds: string[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<{ succeeded: string[], failed: { id: string, error: string }[] }> {
    const succeeded: string[] = []
    const failed: { id: string, error: string }[] = []
    
    for (let i = 0; i < databaseIds.length; i++) {
      const dbId = databaseIds[i]
      if (!dbId) continue
      try {
        await this.deleteDatabase(dbId)
        succeeded.push(dbId)
      } catch (err) {
        failed.push({
          id: dbId,
          error: err instanceof Error ? err.message : 'Unknown error'
        })
      }
      onProgress?.(i + 1, databaseIds.length)
    }
    
    return { succeeded, failed }
  }

  /**
   * Export multiple databases as a ZIP file
   */
  async exportDatabases(
    databases: { uuid: string, name: string }[],
    onProgress?: (progress: number) => void
  ): Promise<{ skipped?: { databaseId: string; name: string; reason: string; details?: string[] }[] }> {
    try {
      onProgress?.(10)
      
      // Call the export endpoint
      const response = await fetch(`${WORKER_API}/api/databases/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          databaseIds: databases.map(db => db.uuid)
        })
      })
      
      if (!response.ok) {
        throw new Error(`Failed to export databases: ${response.statusText}`)
      }
      
      onProgress?.(50)
      
      const data = await response.json() as { 
        result: Record<string, string>
        skipped?: { databaseId: string; name: string; reason: string; details?: string[] }[]
        success: boolean 
      }
      
      if (!data.success) {
        throw new Error('Export operation failed')
      }
      
      onProgress?.(70)
      
      // Create a ZIP file using JSZip
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      
      // Add each database's SQL export to the ZIP
      const exports = data.result
      let fileCount = 0
      for (const db of databases) {
        const sqlExport = exports[db.uuid]
        if (sqlExport) {
          zip.file(`${db.name}.sql`, sqlExport)
          fileCount++
        }
      }
      
      onProgress?.(90)
      
      // Only generate ZIP if we have files
      if (fileCount > 0) {
        // Generate the ZIP file
        const blob = await zip.generateAsync({ type: 'blob' })
        
        // Download the ZIP file
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
        link.download = `d1-databases-${timestamp}.zip`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
      }
      
      onProgress?.(100)
      
      return data.skipped ? { skipped: data.skipped } : {}
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to export databases')
    }
  }

  /**
   * Import a database from SQL file or raw SQL content
   */
  async importDatabase(
    source: File | string,
    options: {
      createNew?: boolean
      databaseName?: string
      targetDatabaseId?: string
    }
  ): Promise<D1Database | undefined> {
    try {
      let sqlContent: string
      
      if (typeof source === 'string') {
        // Direct SQL content
        sqlContent = source
        
        // Basic validation for SQL content
        if (!sqlContent.trim()) {
          throw new Error('SQL content cannot be empty')
        }
      } else {
        // File upload
        // Validate it's a SQL file
        if (!source.name.endsWith('.sql')) {
          throw new Error('Only .sql files are supported')
        }
        
        // Check file size (5GB limit)
        const maxSize = 5 * 1024 * 1024 * 1024 // 5GB
        if (source.size > maxSize) {
          throw new Error('File size exceeds 5GB limit')
        }
        
        // Read the SQL file content
        sqlContent = await source.text()
      }
      
      // Call the import endpoint
      const response = await fetch(`${WORKER_API}/api/databases/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          sqlContent,
          createNew: options.createNew,
          databaseName: options.databaseName,
          targetDatabaseId: options.targetDatabaseId
        })
      })
      
      if (!response.ok) {
        const error = await parseErrorResponse(response)
        throw new Error(error.error ?? `Import failed: ${response.statusText}`)
      }
      
      const data = await response.json() as ApiResponse<D1Database>
      return data.result
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to import database')
    }
  }

  /**
   * Rename a database (migration-based approach)
   */
  async renameDatabase(
    databaseId: string,
    newName: string,
    onProgress?: (
      step: 'validating' | 'creating' | 'exporting' | 'importing' | 'verifying' | 'deleting' | 'completed',
      progress: number
    ) => void
  ): Promise<D1Database> {
    try {
      onProgress?.('validating', 10)
      
      // Call the rename endpoint
      const response = await fetch(`${WORKER_API}/api/databases/${databaseId}/rename`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ newName })
      })
      
      if (!response.ok) {
        const error = await parseErrorResponse(response)
        // Use details field if available (e.g., for FTS5 errors), otherwise use error field
        const errorMessage = error.details ?? error.error ?? error.message ?? `Rename failed: ${response.statusText}`
        throw new Error(errorMessage)
      }
      
      onProgress?.('completed', 100)
      
      const data = await response.json() as { result: D1Database & { oldId: string }, success: boolean }
      
      if (!data.success) {
        throw new Error('Rename operation failed')
      }
      
      // Invalidate caches after rename
      invalidateDatabaseListCache()
      invalidateDatabaseInfoCache(databaseId)
      
      return data.result
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to rename database')
    }
  }

  /**
   * Optimize multiple databases (PRAGMA optimize via backend for job tracking)
   */
  async optimizeDatabases(
    databaseIds: string[],
    onProgress?: (completed: number, total: number, operation: string) => void
  ): Promise<{ 
    succeeded: { id: string; name: string }[], 
    failed: { id: string; name: string; error: string }[] 
  }> {
    onProgress?.(0, databaseIds.length, 'Starting optimization...')
    
    const response = await fetch(`${WORKER_API}/api/databases/optimize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ databaseIds })
    })
    
    if (!response.ok) {
      const error = await parseErrorResponse(response)
      throw new Error(error.message ?? error.error ?? `Failed to optimize databases: ${String(response.status)}`)
    }
    
    const data = await response.json() as {
      result: {
        succeeded: { id: string; name: string }[];
        failed: { id: string; name: string; error: string }[];
      };
      success: boolean;
    }
    
    onProgress?.(databaseIds.length, databaseIds.length, 'Optimization complete')
    
    return data.result
  }

  /**
   * Clone a database (export + create + import)
   */
  async cloneDatabase(
    sourceDatabaseId: string,
    _sourceDatabaseName: string,
    newDatabaseName: string,
    onProgress?: (
      step: 'exporting' | 'creating' | 'importing' | 'completed',
      progress: number
    ) => void
  ): Promise<D1Database> {
    try {
      onProgress?.('exporting', 10)
      
      // Step 1: Export the source database
      const exportResponse = await fetch(`${WORKER_API}/api/databases/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          databaseIds: [sourceDatabaseId]
        })
      })
      
      if (!exportResponse.ok) {
        const error = await parseErrorResponse(exportResponse)
        throw new Error(error.message ?? error.error ?? `Export failed: ${String(exportResponse.status)}`)
      }
      
      const exportData = await exportResponse.json() as { 
        result: Record<string, string>
        skipped?: { databaseId: string; name: string; reason: string; details?: string[] }[]
        success: boolean 
      }
      
      // Check if database was skipped (e.g., FTS5 tables)
      if (exportData.skipped?.length) {
        const skipped = exportData.skipped[0]
        if (skipped?.reason === 'fts5') {
          throw new Error(`Cannot clone database with FTS5 tables: ${skipped.details?.join(', ') ?? 'FTS5 tables detected'}`)
        }
        if (skipped) {
          throw new Error(`Cannot export database: ${skipped.reason}`)
        }
      }
      
      const sqlContent = exportData.result[sourceDatabaseId]
      if (!sqlContent) {
        throw new Error('Export returned no data')
      }
      
      onProgress?.('creating', 40)
      
      // Step 2: Create new database
      const createResponse = await fetch(`${WORKER_API}/api/databases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          name: newDatabaseName
        })
      })
      
      if (!createResponse.ok) {
        const error = await parseErrorResponse(createResponse)
        throw new Error(error.message ?? error.error ?? `Failed to create database: ${String(createResponse.status)}`)
      }
      
      const createData = await createResponse.json() as { result: D1Database }
      const newDatabase = createData.result
      
      onProgress?.('importing', 60)
      
      // Step 3: Import SQL content into the new database
      const importResponse = await fetch(`${WORKER_API}/api/databases/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          sqlContent,
          createNew: false,
          targetDatabaseId: newDatabase.uuid
        })
      })
      
      if (!importResponse.ok) {
        // Try to delete the created database if import fails
        await fetch(`${WORKER_API}/api/databases/${newDatabase.uuid}`, {
          method: 'DELETE',
          credentials: 'include'
        }).catch(() => {
          // Ignore cleanup errors
        })
        
        const error = await parseErrorResponse(importResponse)
        throw new Error(error.message ?? error.error ?? `Import failed: ${String(importResponse.status)}`)
      }
      
      onProgress?.('completed', 100)
      
      return newDatabase
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to clone database')
    }
  }

  /**
   * List tables in a database
   * Results are cached for 30 seconds to enable instant tab switching
   */
  async listTables(databaseId: string, skipCache = false): Promise<TableInfo[]> {
    // Check cache first (unless explicitly skipped)
    if (!skipCache) {
      const cached = getTableListCache(databaseId)
      if (cached) {
        return cached
      }
    }
    
    const response = await fetch(`${WORKER_API}/api/tables/${databaseId}/list`, {
      credentials: 'include'
    })
    
    if (!response.ok) {
      throw new Error(`Failed to list tables: ${response.statusText}`)
    }
    
    const data = await response.json() as ApiResponse<TableInfo[]>
    const result = data.result ?? []
    
    // Cache the result
    setTableListCache(databaseId, result)
    
    return result
  }

  /**
   * Get table schema (with caching)
   */
  async getTableSchema(databaseId: string, tableName: string, skipCache = false): Promise<ColumnInfo[]> {
    // Check cache first
    if (!skipCache) {
      const cached = getCachedTableSchema(databaseId, tableName)
      if (cached) {
        return cached
      }
    }

    const response = await fetch(
      `${WORKER_API}/api/tables/${databaseId}/schema/${encodeURIComponent(tableName)}`,
      { credentials: 'include' }
    )
    
    if (!response.ok) {
      throw new Error(`Failed to get table schema: ${response.statusText}`)
    }
    
    const data = await response.json() as ApiResponse<ColumnInfo[]>
    const result = data.result ?? []
    
    // Cache the result
    setCachedTableSchema(databaseId, tableName, result)
    
    return result
  }

  /**
   * Get table data (paginated)
   */
  async getTableData<T = Record<string, unknown>>(
    databaseId: string,
    tableName: string,
    limit = 100,
    offset = 0,
    filters?: Record<string, FilterCondition>
  ): Promise<QueryResult<T>> {
    // Build URL with filter parameters
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    params.set('offset', String(offset))
    
    // Add filter parameters if provided
    if (filters) {
      for (const [columnName, filter] of Object.entries(filters)) {
        params.set(`filter_${columnName}`, filter.type)
        const val = filter.value
        // Check for defined value that isn't an empty string
        if (val !== undefined) {
          const strVal = String(val)
          if (strVal !== '') {
            params.set(`filterValue_${columnName}`, strVal)
          }
        }
      }
    }
    
    const response = await fetch(
      `${WORKER_API}/api/tables/${databaseId}/data/${encodeURIComponent(tableName)}?${params.toString()}`,
      { credentials: 'include' }
    )
    
    if (!response.ok) {
      throw new Error(`Failed to get table data: ${response.statusText}`)
    }
    
    interface TableDataResponse {
      result?: T[]
      meta?: QueryResult<T>['meta']
      success?: boolean
    }
    const data = await response.json() as TableDataResponse
    const result: QueryResult<T> = {
      results: data.result ?? [],
      success: data.success ?? false
    }
    if (data.meta) {
      result.meta = data.meta
    }
    return result
  }

  /**
   * Get table indexes
   */
  async getTableIndexes(databaseId: string, tableName: string): Promise<IndexInfo[]> {
    const response = await fetch(
      `${WORKER_API}/api/tables/${databaseId}/indexes/${encodeURIComponent(tableName)}`,
      { credentials: 'include' }
    )
    
    if (!response.ok) {
      throw new Error(`Failed to get table indexes: ${response.statusText}`)
    }
    
    const data = await response.json() as ApiResponse<IndexInfo[]>
    return data.result ?? []
  }

  /**
   * Get foreign keys for a specific table (with caching)
   */
  async getTableForeignKeys(
    databaseId: string,
    tableName: string,
    skipCache = false
  ): Promise<{
    column: string;
    refTable: string;
    refColumn: string;
    onDelete: string | null;
    onUpdate: string | null;
  }[]> {
    // Check cache first
    if (!skipCache) {
      const cached = getCachedTableFK(databaseId, tableName)
      if (cached) {
        return cached
      }
    }

    const response = await fetch(
      `${WORKER_API}/api/tables/${databaseId}/foreign-keys/${encodeURIComponent(tableName)}`,
      { credentials: 'include' }
    )
    
    if (!response.ok) {
      throw new Error(`Failed to get table foreign keys: ${response.statusText}`)
    }
    
    interface ForeignKeyResult { foreignKeys: { column: string; refTable: string; refColumn: string; onDelete: string | null; onUpdate: string | null }[] }
    const data = await response.json() as ApiResponse<ForeignKeyResult>
    const result = data.result?.foreignKeys ?? []
    
    // Cache the result
    setCachedTableFK(databaseId, tableName, result)
    
    return result
  }

  /**
   * Get table dependencies (foreign key relationships) with caching
   */
  async getTableDependencies(
    databaseId: string,
    tableNames: string[],
    skipCache = false
  ): Promise<TableDependenciesResponse> {
    // Check cache first (unless skipCache is true)
    if (!skipCache) {
      const cached = getCachedTableDependencies(databaseId, tableNames)
      if (cached) {
        return cached
      }
    }

    const tablesParam = tableNames.map(t => encodeURIComponent(t)).join(',')
    const response = await fetch(
      `${WORKER_API}/api/tables/${databaseId}/dependencies?tables=${tablesParam}`,
      { credentials: 'include' }
    )
    
    if (!response.ok) {
      throw new Error(`Failed to get table dependencies: ${response.statusText}`)
    }
    
    const data = await response.json() as ApiResponse<TableDependenciesResponse>
    const result = data.result ?? {}
    
    // Cache the result
    setCachedTableDependencies(databaseId, tableNames, result)
    
    return result
  }

  /**
   * Rename a table
   */
  async renameTable(databaseId: string, tableName: string, newName: string): Promise<TableInfo> {
    const response = await fetch(
      `${WORKER_API}/api/tables/${databaseId}/${encodeURIComponent(tableName)}/rename`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ newName })
      }
    )
    
    if (!response.ok) {
      const error = await parseErrorResponse(response)
      throw new Error(error.error ?? `Failed to rename table: ${response.statusText}`)
    }
    
    const data = await response.json() as ApiResponse<TableInfo>
    if (!data.result) throw new Error('No result in response')
    
    // Invalidate cache since table list changed
    invalidateTableListCache(databaseId)
    
    return data.result
  }

  /**
   * Delete a table
   */
  async deleteTable(databaseId: string, tableName: string): Promise<void> {
    const response = await fetch(
      `${WORKER_API}/api/tables/${databaseId}/${encodeURIComponent(tableName)}`,
      {
        method: 'DELETE',
        credentials: 'include'
      }
    )
    
    if (!response.ok) {
      throw new Error(`Failed to delete table: ${response.statusText}`)
    }
    
    // Invalidate caches since table list and relationships changed
    invalidateTableListCache(databaseId)
    invalidateCascadeCache(databaseId)
    invalidateTableDependenciesCache(databaseId)
    invalidateFkCache(databaseId)
  }

  /**
   * Add a column to a table
   */
  async addColumn(
    databaseId: string,
    tableName: string,
    columnDef: {
      name: string
      type: string
      notnull?: boolean
      unique?: boolean
      defaultValue?: string
      isGenerated?: boolean
      generatedExpression?: string
      generatedType?: 'STORED' | 'VIRTUAL'
    }
  ): Promise<ColumnInfo[]> {
    const response = await fetch(
      `${WORKER_API}/api/tables/${databaseId}/${encodeURIComponent(tableName)}/columns/add`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(columnDef)
      }
    )
    
    if (!response.ok) {
      const error = await parseErrorResponse(response)
      throw new Error(error.error ?? `Failed to add column: ${response.statusText}`)
    }
    
    const data = await response.json() as ApiResponse<ColumnInfo[]>
    
    // Invalidate schema cache
    invalidateTableSchemaCache(databaseId, tableName)
    
    return data.result ?? []
  }

  /**
   * Rename a column in a table
   */
  async renameColumn(
    databaseId: string,
    tableName: string,
    oldName: string,
    newName: string
  ): Promise<void> {
    const response = await fetch(
      `${WORKER_API}/api/tables/${databaseId}/${encodeURIComponent(tableName)}/columns/${encodeURIComponent(oldName)}/rename`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ newName })
      }
    )
    
    if (!response.ok) {
      const error = await parseErrorResponse(response)
      throw new Error(error.error ?? `Failed to rename column: ${response.statusText}`)
    }
    
    // Invalidate schema cache
    invalidateTableSchemaCache(databaseId, tableName)
  }

  /**
   * Modify a column's type and constraints (requires table recreation)
   */
  async modifyColumn(
    databaseId: string,
    tableName: string,
    columnName: string,
    updates: {
      type?: string
      notnull?: boolean
      defaultValue?: string
    }
  ): Promise<ColumnInfo[]> {
    const response = await fetch(
      `${WORKER_API}/api/tables/${databaseId}/${encodeURIComponent(tableName)}/columns/${encodeURIComponent(columnName)}/modify`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(updates)
      }
    )
    
    if (!response.ok) {
      const error = await parseErrorResponse(response)
      throw new Error(error.error ?? `Failed to modify column: ${response.statusText}`)
    }
    
    const data = await response.json() as ApiResponse<ColumnInfo[]>
    
    // Invalidate schema cache
    invalidateTableSchemaCache(databaseId, tableName)
    
    return data.result ?? []
  }

  /**
   * Delete a column from a table (requires table recreation)
   */
  async deleteColumn(
    databaseId: string,
    tableName: string,
    columnName: string
  ): Promise<void> {
    const response = await fetch(
      `${WORKER_API}/api/tables/${databaseId}/${encodeURIComponent(tableName)}/columns/${encodeURIComponent(columnName)}`,
      {
        method: 'DELETE',
        credentials: 'include'
      }
    )
    
    if (!response.ok) {
      const error = await parseErrorResponse(response)
      throw new Error(error.error ?? `Failed to delete column: ${response.statusText}`)
    }
    
    // Invalidate schema cache
    invalidateTableSchemaCache(databaseId, tableName)
  }

  /**
   * Delete multiple tables
   */
  async deleteTables(
    databaseId: string,
    tableNames: string[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<{ succeeded: string[], failed: { name: string, error: string }[] }> {
    const succeeded: string[] = []
    const failed: { name: string, error: string }[] = []
    
    for (let i = 0; i < tableNames.length; i++) {
      const tableName = tableNames[i]
      if (!tableName) continue
      try {
        await this.deleteTable(databaseId, tableName)
        succeeded.push(tableName)
      } catch (err) {
        failed.push({
          name: tableName,
          error: err instanceof Error ? err.message : 'Unknown error'
        })
      }
      onProgress?.(i + 1, tableNames.length)
    }
    
    return { succeeded, failed }
  }

  /**
   * Clone a table
   */
  async cloneTable(databaseId: string, tableName: string, newName: string): Promise<TableInfo> {
    const response = await fetch(
      `${WORKER_API}/api/tables/${databaseId}/${encodeURIComponent(tableName)}/clone`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ newName })
      }
    )
    
    if (!response.ok) {
      const error = await parseErrorResponse(response)
      throw new Error(error.error ?? `Failed to clone table: ${response.statusText}`)
    }
    
    const data = await response.json() as ApiResponse<TableInfo>
    if (!data.result) throw new Error('No result in response')
    
    // Invalidate cache since table list changed
    invalidateTableListCache(databaseId)
    
    return data.result
  }

  /**
   * Clone multiple tables
   */
  async cloneTables(
    databaseId: string,
    tables: { name: string, newName: string }[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<{ succeeded: { oldName: string, newName: string }[], failed: { name: string, error: string }[] }> {
    const succeeded: { oldName: string, newName: string }[] = []
    const failed: { name: string, error: string }[] = []
    
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i]
      if (!table) continue
      try {
        await this.cloneTable(databaseId, table.name, table.newName)
        succeeded.push({ oldName: table.name, newName: table.newName })
      } catch (err) {
        failed.push({
          name: table.name,
          error: err instanceof Error ? err.message : 'Unknown error'
        })
      }
      onProgress?.(i + 1, tables.length)
    }
    
    return { succeeded, failed }
  }

  /**
   * Check if a table is compatible with STRICT mode conversion
   * Returns detailed information about potential blockers and warnings
   */
  async checkStrictCompatibility(databaseId: string, tableName: string): Promise<{
    compatible: boolean
    isAlreadyStrict: boolean
    isVirtualTable: boolean
    hasGeneratedColumns: boolean
    hasForeignKeys: boolean
    generatedColumns: { name: string; type: string; generatedType: string }[]
    foreignKeys: { fromColumns: string[]; toTable: string; toColumns: string[]; onUpdate: string; onDelete: string }[]
    warnings: string[]
    blockers: string[]
  }> {
    const response = await fetch(
      `${WORKER_API}/api/tables/${databaseId}/${encodeURIComponent(tableName)}/strict-check`,
      {
        method: 'GET',
        credentials: 'include'
      }
    )
    
    if (!response.ok) {
      const error = await parseErrorResponse(response)
      throw new Error(error.error ?? `Failed to check STRICT compatibility: ${response.statusText}`)
    }
    
    const data = await response.json() as ApiResponse<{
      compatible: boolean
      isAlreadyStrict: boolean
      isVirtualTable: boolean
      hasGeneratedColumns: boolean
      hasForeignKeys: boolean
      generatedColumns: { name: string; type: string; generatedType: string }[]
      foreignKeys: { fromColumns: string[]; toTable: string; toColumns: string[]; onUpdate: string; onDelete: string }[]
      warnings: string[]
      blockers: string[]
    }>
    if (!data.result) throw new Error('No result in response')
    
    return data.result
  }

  /**
   * Convert a table to STRICT mode
   * This recreates the table with STRICT mode enabled
   */
  async convertToStrict(databaseId: string, tableName: string): Promise<TableInfo> {
    const response = await fetch(
      `${WORKER_API}/api/tables/${databaseId}/${encodeURIComponent(tableName)}/strict`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      }
    )
    
    if (!response.ok) {
      const error = await parseErrorResponse(response)
      throw new Error(error.error ?? `Failed to convert table to STRICT: ${response.statusText}`)
    }
    
    const data = await response.json() as ApiResponse<TableInfo>
    if (!data.result) throw new Error('No result in response')
    
    // Invalidate cache since table metadata changed
    invalidateTableListCache(databaseId)
    
    return data.result
  }

  /**
   * Export a single table
   */
  async exportTable(databaseId: string, tableName: string, format: 'sql' | 'csv' | 'json' = 'sql'): Promise<void> {
    try {
      const response = await fetch(
        `${WORKER_API}/api/tables/${databaseId}/${encodeURIComponent(tableName)}/export?format=${format}`,
        { credentials: 'include' }
      )
      
      if (!response.ok) {
        throw new Error(`Failed to export table: ${response.statusText}`)
      }
      
      const data = await response.json() as { result: { content: string, filename: string }, success: boolean }
      
      if (!data.success) {
        throw new Error('Export operation failed')
      }
      
      // Download the file
      const mimeType = format === 'csv' ? 'text/csv' : format === 'json' ? 'application/json' : 'text/plain'
      const blob = new Blob([data.result.content], { type: mimeType })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = data.result.filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to export table')
    }
  }

  /**
   * Export multiple tables as a ZIP file
   */
  async exportTables(
    databaseId: string,
    tableNames: string[],
    format: 'sql' | 'csv' | 'json' = 'sql',
    onProgress?: (progress: number) => void
  ): Promise<void> {
    try {
      onProgress?.(10)
      
      // Fetch all table exports
      const exports: { name: string, content: string }[] = []
      
      for (let i = 0; i < tableNames.length; i++) {
        const tableName = tableNames[i]
        if (!tableName) continue
        const response = await fetch(
          `${WORKER_API}/api/tables/${databaseId}/${encodeURIComponent(tableName)}/export?format=${format}`,
          { credentials: 'include' }
        )
        
        if (!response.ok) {
          throw new Error(`Failed to export table ${tableName}: ${response.statusText}`)
        }
        
        const data = await response.json() as { result: { content: string, filename: string }, success: boolean }
        
        if (!data.success) {
          throw new Error(`Export operation failed for table ${tableName}`)
        }
        
        exports.push({
          name: data.result.filename,
          content: data.result.content
        })
        
        onProgress?.(10 + (i + 1) / tableNames.length * 60)
      }
      
      onProgress?.(70)
      
      // Create a ZIP file using JSZip
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      
      // Add each table's export to the ZIP
      for (const exp of exports) {
        zip.file(exp.name, exp.content)
      }
      
      onProgress?.(90)
      
      // Generate the ZIP file
      const blob = await zip.generateAsync({ type: 'blob' })
      
      // Download the ZIP file
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
      link.download = `tables-export-${timestamp}.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      
      onProgress?.(100)
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to export tables')
    }
  }

  /**
   * Execute a SQL query
   */
  async executeQuery<T = Record<string, unknown>>(
    databaseId: string,
    query: string,
    params?: unknown[],
    skipValidation?: boolean
  ): Promise<QueryResult<T>> {
    const response = await fetch(`${WORKER_API}/api/query/${databaseId}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ query, params, skipValidation })
    })
    
    if (!response.ok) {
      // Handle cases where response might not be JSON (e.g., Cloudflare WAF blocking)
      let errorMessage = 'Query execution failed'
      
      // Check for specific HTTP status codes first
      if (response.status === 403) {
        errorMessage = 'Request blocked by security rules. If you\'re testing SQL injection, this is expected - Cloudflare WAF is protecting your database.'
      } else if (response.status === 401) {
        errorMessage = 'Authentication required. Please log in again.'
      } else {
        // Try to parse JSON error response
        try {
          interface D1ErrorResponse {
            error?: string
            message?: string
            errors?: { code?: number; message?: string; error?: string }[]
          }
          const error = await response.json() as D1ErrorResponse
          if (error.error) {
            errorMessage = error.error
          } else if (error.message) {
            errorMessage = error.message
          } else if (error.errors && error.errors.length > 0) {
            // D1 API error format: { errors: [{ code: 7500, message: "..." }] }
            const d1Error = error.errors[0]
            errorMessage = d1Error?.message ?? d1Error?.error ?? 'Unknown D1 error'
            // Clean up common D1 error suffixes
            errorMessage = errorMessage.replace(/: SQLITE_ERROR$/, '').replace(/: SQLITE_AUTH$/, '')
          }
        } catch {
          // Response wasn't JSON (e.g., HTML error page from CDN/WAF)
          errorMessage = `Request failed: ${String(response.status)} ${response.statusText}`
        }
      }
      throw new Error(errorMessage)
    }
    
    const data = await response.json() as ApiResponse<QueryResult<T>>
    if (!data.result) throw new Error('No result in response')
    return data.result
  }

  /**
   * Execute batch queries
   */
  async executeBatch(
    databaseId: string,
    queries: { query: string; params?: unknown[] }[]
  ): Promise<QueryResult[]> {
    const response = await fetch(`${WORKER_API}/api/query/${databaseId}/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ queries })
    })
    
    if (!response.ok) {
      throw new Error(`Batch query failed: ${response.statusText}`)
    }
    
    const data = await response.json() as ApiResponse<QueryResult[]>
    return data.result ?? []
  }

  /**
   * Get query history
   */
  async getQueryHistory(databaseId: string, limit = 10): Promise<QueryHistoryEntry[]> {
    const response = await fetch(
      `${WORKER_API}/api/query/${databaseId}/history?limit=${String(limit)}`,
      { credentials: 'include' }
    )
    
    if (!response.ok) {
      throw new Error(`Failed to get query history: ${response.statusText}`)
    }
    
    const data = await response.json() as ApiResponse<QueryHistoryEntry[]>
    return data.result ?? []
  }

  /**
   * Get all database colors
   */
  async getDatabaseColors(): Promise<Record<string, DatabaseColor>> {
    const response = await fetch(
      `${WORKER_API}/api/databases/colors`,
      this.getFetchOptions()
    )
    
    this.handleResponse(response)
    
    const data = await response.json() as ApiResponse<Record<string, DatabaseColor>>
    return data.result ?? {}
  }

  /**
   * Update database color
   */
  async updateDatabaseColor(databaseId: string, color: DatabaseColor): Promise<void> {
    const response = await fetch(
      `${WORKER_API}/api/databases/${databaseId}/color`,
      this.getFetchOptions({
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ color })
      })
    )
    
    if (!response.ok) {
      const data = await parseErrorResponse(response) as ApiErrorResponse & { requiresUpgrade?: boolean }
      
      // Check if upgrade is required
      if (data.requiresUpgrade) {
        throw new Error('Database colors feature requires a schema upgrade. See the upgrade instructions in the README.')
      }
      
      throw new Error(data.message ?? data.error ?? `Failed to update color: ${String(response.status)}`)
    }
  }

  /**
   * Get all table colors for a database
   */
  async getTableColors(databaseId: string): Promise<Record<string, DatabaseColor>> {
    const response = await fetch(
      `${WORKER_API}/api/tables/${databaseId}/colors`,
      this.getFetchOptions()
    )
    
    this.handleResponse(response)
    
    const data = await response.json() as ApiResponse<Record<string, DatabaseColor>>
    return data.result ?? {}
  }

  /**
   * Update table color
   */
  async updateTableColor(databaseId: string, tableName: string, color: DatabaseColor): Promise<void> {
    const response = await fetch(
      `${WORKER_API}/api/tables/${databaseId}/${encodeURIComponent(tableName)}/color`,
      this.getFetchOptions({
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ color })
      })
    )
    
    if (!response.ok) {
      const data = await parseErrorResponse(response) as ApiErrorResponse & { requiresUpgrade?: boolean }
      
      // Check if upgrade is required
      if (data.requiresUpgrade) {
        throw new Error('Table colors feature requires a schema upgrade. See the upgrade instructions in the README.')
      }
      
      throw new Error(data.message ?? data.error ?? `Failed to update table color: ${String(response.status)}`)
    }
  }
}

export const api = new APIService()

// Export individual methods for convenience
export const listTables = (databaseId: string, skipCache = false): Promise<TableInfo[]> => api.listTables(databaseId, skipCache)
export const getTableSchema = (databaseId: string, tableName: string, skipCache = false): Promise<ColumnInfo[]> => api.getTableSchema(databaseId, tableName, skipCache)
export const getTableForeignKeys = (databaseId: string, tableName: string, skipCache = false): Promise<{ column: string; refTable: string; refColumn: string; onDelete: string | null; onUpdate: string | null }[]> => api.getTableForeignKeys(databaseId, tableName, skipCache)
export const getTableData = <T = Record<string, unknown>>(
  databaseId: string, 
  tableName: string, 
  limit?: number, 
  offset?: number,
  filters?: Record<string, FilterCondition>
): Promise<QueryResult<T>> => api.getTableData<T>(databaseId, tableName, limit, offset, filters)
export const executeQuery = <T = Record<string, unknown>>(
  databaseId: string, 
  query: string, 
  params?: unknown[], 
  skipValidation?: boolean
): Promise<QueryResult<T>> => api.executeQuery<T>(databaseId, query, params, skipValidation)
export const createDatabase = (name: string, location?: string): Promise<D1Database> => api.createDatabase(name, location)

// Saved queries API
export interface SavedQuery {
  id: number
  name: string
  description?: string
  database_id?: string
  query: string
  created_at: string
  updated_at: string
  user_email: string
}

export const getSavedQueries = async (databaseId?: string): Promise<SavedQuery[]> => {
  const url = databaseId 
    ? `${WORKER_API}/api/saved-queries?database_id=${encodeURIComponent(databaseId)}`
    : `${WORKER_API}/api/saved-queries`
  
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include'
  })
  
  if (!response.ok) {
    throw new Error(`Failed to fetch saved queries: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: SavedQuery[], success: boolean }
  return data.result
}

export const createSavedQuery = async (
  name: string,
  query: string,
  description?: string,
  databaseId?: string
): Promise<SavedQuery> => {
  const response = await fetch(`${WORKER_API}/api/saved-queries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({
      name,
      query,
      description,
      database_id: databaseId
    })
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response) as { error?: string; message?: string }
    throw new Error(error.message ?? error.error ?? `Failed to save query: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: SavedQuery, success: boolean }
  return data.result
}

export const updateSavedQuery = async (
  id: number,
  updates: {
    name?: string
    query?: string
    description?: string
  }
): Promise<SavedQuery> => {
  const response = await fetch(`${WORKER_API}/api/saved-queries/${String(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(updates)
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to update query: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: SavedQuery, success: boolean }
  return data.result
}

export const deleteSavedQuery = async (id: number): Promise<void> => {
  const response = await fetch(`${WORKER_API}/api/saved-queries/${String(id)}`, {
    method: 'DELETE',
    credentials: 'include'
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to delete query: ${String(response.status)}`)
  }
}

// Undo/Rollback API
export const getUndoHistory = async (databaseId: string): Promise<UndoHistoryEntry[]> => {
  const response = await fetch(`${WORKER_API}/api/undo/${databaseId}/history`, {
    credentials: 'include'
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to get undo history: ${String(response.status)}`)
  }
  
  const data = await response.json() as { history: UndoHistoryEntry[], success: boolean }
  return data.history
}

export const restoreUndo = async (databaseId: string, undoId: number): Promise<string> => {
  const response = await fetch(`${WORKER_API}/api/undo/${databaseId}/restore/${String(undoId)}`, {
    method: 'POST',
    credentials: 'include'
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.details ?? error.error ?? `Failed to restore: ${String(response.status)}`)
  }
  
  const data = await response.json() as { message: string, success: boolean }
  return data.message
}

export const clearUndoHistory = async (databaseId: string): Promise<number> => {
  const response = await fetch(`${WORKER_API}/api/undo/${databaseId}/clear`, {
    method: 'DELETE',
    credentials: 'include'
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to clear undo history: ${String(response.status)}`)
  }
  
  const data = await response.json() as { cleared: number, success: boolean }
  return data.cleared
}

// Row delete with undo API
export const deleteRowsWithUndo = async (
  databaseId: string,
  tableName: string,
  whereClause: string,
  description?: string
): Promise<number> => {
  const response = await fetch(`${WORKER_API}/api/tables/${databaseId}/${encodeURIComponent(tableName)}/rows/delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({ whereClause, description })
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to delete rows: ${String(response.status)}`)
  }
  
  const data = await response.json() as { rowsDeleted: number, success: boolean }
  return data.rowsDeleted
}

// Cascade Impact Simulation Types
export interface CascadePath {
  id: string
  sourceTable: string
  targetTable: string
  action: string
  depth: number
  affectedRows: number
  column: string
}

export interface AffectedTable {
  tableName: string
  action: string
  rowsBefore: number
  rowsAfter: number
  depth: number
}

export interface CascadeWarning {
  type: string
  message: string
  severity: 'low' | 'medium' | 'high'
}

export interface CascadeConstraint {
  table: string
  message: string
}

export interface CircularDependency {
  tables: string[]
  message: string
}

export interface CascadeSimulationResult {
  targetTable: string
  whereClause?: string
  totalAffectedRows: number
  maxDepth: number
  cascadePaths: CascadePath[]
  affectedTables: AffectedTable[]
  warnings: CascadeWarning[]
  constraints: CascadeConstraint[]
  circularDependencies: CircularDependency[]
}

// Cascade Impact Simulation API (with caching)
export const simulateCascadeImpact = async (
  databaseId: string,
  targetTable: string,
  whereClause?: string,
  skipCache = false
): Promise<CascadeSimulationResult> => {
  // Check cache first (unless skipCache is true)
  if (!skipCache) {
    const cached = getCachedCascadeSimulation(databaseId, targetTable, whereClause)
    if (cached) {
      return cached
    }
  }

  const response = await fetch(`${WORKER_API}/api/tables/${databaseId}/simulate-cascade`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({ targetTable, whereClause })
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to simulate cascade: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: CascadeSimulationResult, success: boolean }
  
  // Cache the result
  setCachedCascadeSimulation(databaseId, targetTable, whereClause, data.result)
  
  return data.result
}

// Foreign key graph data types
export interface ForeignKeyGraphNode {
  id: string
  label: string
  columns: {name: string; type: string; isPK: boolean}[]
  rowCount: number
}

export interface ForeignKeyGraphEdge {
  id: string
  source: string
  target: string
  sourceColumn: string
  targetColumn: string
  onDelete: string
  onUpdate: string
}

export interface ForeignKeyGraph {
  nodes: ForeignKeyGraphNode[]
  edges: ForeignKeyGraphEdge[]
}

/**
 * Circular dependency cycle information
 */
export interface CircularDependencyCycle {
  tables: string[]
  path: string
  severity: 'low' | 'medium' | 'high'
  cascadeRisk: boolean
  restrictPresent: boolean
  constraintNames: string[]
  message: string
}

/**
 * Result of simulating a foreign key addition
 */
export interface SimulateForeignKeyResult {
  wouldCreateCycle: boolean
  cycle?: CircularDependencyCycle
}

// Extended FK graph response that includes cycles and optionally full schemas
export interface ForeignKeyGraphWithCycles extends ForeignKeyGraph {
  cycles?: CircularDependencyCycle[]
  schemas?: Record<string, ColumnInfo[]>
}

// Simple in-memory cache for table list to enable instant tab switching
// Cache is cleared when table modifications are made (create, delete, rename, etc.)
const tableListCache = new Map<string, { data: TableInfo[]; timestamp: number }>()
const TABLE_LIST_CACHE_TTL = 300000 // 5 minutes - long TTL since we invalidate on modifications

function getTableListCache(databaseId: string): TableInfo[] | null {
  const cached = tableListCache.get(databaseId)
  if (cached && Date.now() - cached.timestamp < TABLE_LIST_CACHE_TTL) {
    return cached.data
  }
  return null
}

function setTableListCache(databaseId: string, data: TableInfo[]): void {
  tableListCache.set(databaseId, { data, timestamp: Date.now() })
}

/**
 * Invalidate table list cache for a database
 * Call this after any operation that modifies the table list
 */
export function invalidateTableListCache(databaseId: string): void {
  tableListCache.delete(databaseId)
}

// Simple in-memory cache for FK data to avoid redundant fetches
// Cache is cleared when FK modifications are made
const fkCache = new Map<string, { data: ForeignKeyGraphWithCycles; timestamp: number }>()
const FK_CACHE_TTL = 300000 // 5 minutes - long TTL since we invalidate on modifications

function getFkCacheKey(databaseId: string, includeCycles: boolean, includeSchemas: boolean): string {
  const flags: string[] = []
  if (includeCycles) flags.push('cycles')
  if (includeSchemas) flags.push('schemas')
  return `${databaseId}:${flags.length > 0 ? flags.join('+') : 'basic'}`
}

function getCachedFkData(databaseId: string, includeCycles: boolean, includeSchemas: boolean): ForeignKeyGraphWithCycles | null {
  const key = getFkCacheKey(databaseId, includeCycles, includeSchemas)
  const cached = fkCache.get(key)
  if (cached && Date.now() - cached.timestamp < FK_CACHE_TTL) {
    return cached.data
  }
  return null
}

function setCachedFkData(databaseId: string, includeCycles: boolean, includeSchemas: boolean, data: ForeignKeyGraphWithCycles): void {
  const key = getFkCacheKey(databaseId, includeCycles, includeSchemas)
  fkCache.set(key, { data, timestamp: Date.now() })
}

/**
 * Invalidate FK cache for a database (call after FK modifications)
 */
export function invalidateFkCache(databaseId: string): void {
  for (const key of fkCache.keys()) {
    if (key.startsWith(`${databaseId}:`)) {
      fkCache.delete(key)
    }
  }
}

/**
 * Helper to delay execution (for retry backoff)
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Get all foreign keys for a database
 * @param includeCycles - If true, includes cycle detection in response (saves an API call)
 * Includes retry with exponential backoff for rate limit (429) errors
 */
/**
 * Get all foreign keys for a database with optional cycle detection and full schemas
 * @param databaseId - The database ID
 * @param includeCycles - Include circular dependency detection (for FK Editor)
 * @param includeSchemas - Include full column schemas for each table (for ER Diagram - avoids N+1 queries)
 */
export const getAllForeignKeys = async (
  databaseId: string, 
  includeCycles = false,
  includeSchemas = false
): Promise<ForeignKeyGraphWithCycles> => {
  // Check cache first
  const cached = getCachedFkData(databaseId, includeCycles, includeSchemas)
  if (cached) {
    return cached
  }
  
  // Build query params
  const params = new URLSearchParams()
  if (includeCycles) params.set('includeCycles', 'true')
  if (includeSchemas) params.set('includeSchemas', 'true')
  const queryString = params.toString()
  const url = `${WORKER_API}/api/tables/${databaseId}/foreign-keys${queryString ? `?${queryString}` : ''}`
  
  // Retry with exponential backoff for rate limits
  const maxRetries = 3
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 2s, 4s, 8s
      const backoffMs = Math.min(2000 * Math.pow(2, attempt - 1), 8000)
      await delay(backoffMs)
    }
    
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include'
    })
    
    // Handle rate limit with retry
    if (response.status === 429) {
      lastError = new Error('Rate limited (429). Please wait a moment and try again.')
      continue // Retry after backoff
    }
    
    if (!response.ok) {
      const error = await parseErrorResponse(response)
      throw new Error(error.error ?? `Failed to get foreign keys: ${String(response.status)}`)
    }
    
    const data = await response.json() as { result: ForeignKeyGraphWithCycles, success: boolean }
    
    // Cache the result
    setCachedFkData(databaseId, includeCycles, includeSchemas, data.result)
    
    return data.result
  }
  
  // All retries exhausted
  throw lastError ?? new Error('Failed to get foreign keys after multiple retries')
}

/**
 * Get circular dependencies in a database
 * NOTE: For new code, prefer getAllForeignKeys(dbId, true) to get both FK graph and cycles in one call
 */
export const getCircularDependencies = async (databaseId: string): Promise<CircularDependencyCycle[]> => {
  // Try to get from combined endpoint first (may already be cached)
  // Check both with and without schemas since either might have cycles
  const cachedWithSchemas = getCachedFkData(databaseId, true, true)
  if (cachedWithSchemas?.cycles) {
    return cachedWithSchemas.cycles
  }
  const cachedWithoutSchemas = getCachedFkData(databaseId, true, false)
  if (cachedWithoutSchemas?.cycles) {
    return cachedWithoutSchemas.cycles
  }
  
  const response = await fetch(`${WORKER_API}/api/tables/${databaseId}/circular-dependencies`, {
    method: 'GET',
    credentials: 'include'
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to get circular dependencies: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: CircularDependencyCycle[], success: boolean }
  return data.result
}

/**
 * Simulate adding a foreign key to check if it would create a circular dependency
 */
export const simulateAddForeignKey = async (
  databaseId: string,
  sourceTable: string,
  targetTable: string
): Promise<SimulateForeignKeyResult> => {
  const response = await fetch(`${WORKER_API}/api/tables/${databaseId}/foreign-keys/simulate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({ sourceTable, targetTable })
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to simulate foreign key: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: SimulateForeignKeyResult, success: boolean }
  return data.result
}

/**
 * Add a foreign key constraint
 */
export const addForeignKey = async (
  databaseId: string,
  params: {
    sourceTable: string
    sourceColumn: string
    targetTable: string
    targetColumn: string
    onDelete: string
    onUpdate: string
    constraintName?: string
  }
): Promise<void> => {
  const response = await fetch(`${WORKER_API}/api/tables/${databaseId}/foreign-keys/add`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(params)
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response) as { error?: string; message?: string }
    throw new Error(error.message ?? error.error ?? `Failed to add foreign key: ${String(response.status)}`)
  }
  
  // Invalidate all FK-related caches after modification
  invalidateFkCache(databaseId)
  invalidateCascadeCache(databaseId)
  invalidateTableDependenciesCache(databaseId)
}

/**
 * Modify a foreign key constraint
 */
export const modifyForeignKey = async (
  databaseId: string,
  constraintName: string,
  params: {
    onDelete?: string
    onUpdate?: string
  }
): Promise<void> => {
  const response = await fetch(`${WORKER_API}/api/tables/${databaseId}/foreign-keys/${encodeURIComponent(constraintName)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(params)
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response) as { error?: string; message?: string }
    throw new Error(error.message ?? error.error ?? `Failed to modify foreign key: ${String(response.status)}`)
  }
  
  // Invalidate all FK-related caches after modification
  invalidateFkCache(databaseId)
  invalidateCascadeCache(databaseId)
  invalidateTableDependenciesCache(databaseId)
}

/**
 * Delete a foreign key constraint
 */
export const deleteForeignKey = async (
  databaseId: string,
  constraintName: string
): Promise<void> => {
  const response = await fetch(`${WORKER_API}/api/tables/${databaseId}/foreign-keys/${encodeURIComponent(constraintName)}`, {
    method: 'DELETE',
    credentials: 'include'
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response) as { error?: string; message?: string }
    throw new Error(error.message ?? error.error ?? `Failed to delete foreign key: ${String(response.status)}`)
  }
  
  // Invalidate all FK-related caches after modification
  invalidateFkCache(databaseId)
  invalidateCascadeCache(databaseId)
  invalidateTableDependenciesCache(databaseId)
}

// FTS5 API Methods
import type {
  FTS5TableConfig,
  FTS5TableInfo,
  FTS5SearchParams,
  FTS5SearchResponse,
  FTS5Stats,
  FTS5CreateFromTableParams,
} from './fts5-types'

/**
 * List all FTS5 tables in a database (cached for 5 minutes)
 */
export const listFTS5Tables = async (databaseId: string, skipCache = false): Promise<FTS5TableInfo[]> => {
  // Check cache first
  if (!skipCache) {
    const cached = getFTS5Cache(databaseId)
    if (cached) {
      return cached
    }
  }
  
  const response = await fetch(`${WORKER_API}/api/fts5/${databaseId}/list`, {
    method: 'GET',
    credentials: 'include'
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to list FTS5 tables: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: FTS5TableInfo[], success: boolean }
  
  // Cache the result
  setFTS5Cache(databaseId, data.result)
  
  return data.result
}

/**
 * Create a new FTS5 virtual table
 */
export const createFTS5Table = async (
  databaseId: string,
  config: FTS5TableConfig
): Promise<{ tableName: string; created: boolean }> => {
  const response = await fetch(`${WORKER_API}/api/fts5/${databaseId}/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(config)
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to create FTS5 table: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: { tableName: string; created: boolean }, success: boolean }
  
  // Invalidate FTS5 cache
  invalidateFTS5Cache(databaseId)
  
  return data.result
}

/**
 * Create FTS5 table from existing table
 */
export const createFTS5FromTable = async (
  databaseId: string,
  params: FTS5CreateFromTableParams
): Promise<{ ftsTableName: string; created: boolean; triggersCreated: boolean }> => {
  const response = await fetch(`${WORKER_API}/api/fts5/${databaseId}/create-from-table`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(params)
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to create FTS5 from table: ${String(response.status)}`)
  }
  
  const data = await response.json() as { 
    result: { ftsTableName: string; created: boolean; triggersCreated: boolean }, 
    success: boolean 
  }
  
  // Invalidate FTS5 cache
  invalidateFTS5Cache(databaseId)
  
  return data.result
}

/**
 * Get FTS5 table configuration
 */
export const getFTS5Config = async (
  databaseId: string,
  tableName: string
): Promise<Partial<FTS5TableConfig>> => {
  const response = await fetch(`${WORKER_API}/api/fts5/${databaseId}/${encodeURIComponent(tableName)}/config`, {
    method: 'GET',
    credentials: 'include'
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to get FTS5 config: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: Partial<FTS5TableConfig>, success: boolean }
  return data.result
}

/**
 * Delete FTS5 table
 */
export const deleteFTS5Table = async (
  databaseId: string,
  tableName: string
): Promise<void> => {
  const response = await fetch(`${WORKER_API}/api/fts5/${databaseId}/${encodeURIComponent(tableName)}`, {
    method: 'DELETE',
    credentials: 'include'
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to delete FTS5 table: ${String(response.status)}`)
  }
  
  // Invalidate FTS5 cache
  invalidateFTS5Cache(databaseId)
}

/**
 * Convert FTS5 table to regular table
 */
export const convertFTS5ToTable = async (
  databaseId: string,
  ftsTableName: string,
  options: {
    newTableName?: string
    deleteOriginal?: boolean
  } = {}
): Promise<{ tableName: string; rowsCopied: number; originalDeleted: boolean }> => {
  const response = await fetch(`${WORKER_API}/api/fts5/${databaseId}/${encodeURIComponent(ftsTableName)}/convert-to-table`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(options)
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to convert FTS5 to table: ${String(response.status)}`)
  }
  
  const data = await response.json() as { 
    result: { tableName: string; rowsCopied: number; originalDeleted: boolean }, 
    success: boolean 
  }
  
  // Invalidate cache since table list changed (new table created, possibly original deleted)
  invalidateTableListCache(databaseId)
  
  return data.result
}

/**
 * Rebuild FTS5 index
 */
export const rebuildFTS5Index = async (
  databaseId: string,
  tableName: string
): Promise<{ rebuilt: boolean }> => {
  const response = await fetch(`${WORKER_API}/api/fts5/${databaseId}/${encodeURIComponent(tableName)}/rebuild`, {
    method: 'POST',
    credentials: 'include'
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to rebuild FTS5 index: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: { rebuilt: boolean }, success: boolean }
  return data.result
}

/**
 * Optimize FTS5 index
 */
export const optimizeFTS5 = async (
  databaseId: string,
  tableName: string
): Promise<{ optimized: boolean }> => {
  const response = await fetch(`${WORKER_API}/api/fts5/${databaseId}/${encodeURIComponent(tableName)}/optimize`, {
    method: 'POST',
    credentials: 'include'
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to optimize FTS5 index: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: { optimized: boolean }, success: boolean }
  return data.result
}

/**
 * Search FTS5 table
 */
export const searchFTS5 = async (
  databaseId: string,
  tableName: string,
  params: FTS5SearchParams
): Promise<FTS5SearchResponse> => {
  const response = await fetch(`${WORKER_API}/api/fts5/${databaseId}/${encodeURIComponent(tableName)}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(params)
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to search FTS5 table: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: FTS5SearchResponse, success: boolean }
  return data.result
}

/**
 * Get FTS5 table statistics
 */
export const getFTS5Stats = async (
  databaseId: string,
  tableName: string
): Promise<FTS5Stats> => {
  const response = await fetch(`${WORKER_API}/api/fts5/${databaseId}/${encodeURIComponent(tableName)}/stats`, {
    method: 'GET',
    credentials: 'include'
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to get FTS5 stats: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: FTS5Stats, success: boolean }
  return data.result
}

// Index Analyzer types
export interface IndexRecommendation {
  tableName: string
  columnName: string
  indexType: 'single' | 'composite'
  compositeColumns?: string[]
  priority: 'high' | 'medium' | 'low'
  rationale: string
  estimatedImpact: string
  suggestedSQL: string
}

export interface IndexAnalysisResult {
  recommendations: IndexRecommendation[]
  existingIndexes: {
    tableName: string
    indexes: {
      name: string
      columns: string[]
      unique: boolean
    }[]
  }[]
  statistics: {
    totalRecommendations: number
    tablesWithoutIndexes: number
    averageQueryEfficiency?: number
  }
}

// Simple in-memory cache for index analysis results
const indexAnalysisCache = new Map<string, { data: IndexAnalysisResult; timestamp: number }>()
const INDEX_ANALYSIS_CACHE_TTL = 300000 // 5 minutes - long TTL since we invalidate on modifications

// Simple in-memory cache for FTS5 tables
const fts5Cache = new Map<string, { data: FTS5TableInfo[]; timestamp: number }>()
const FTS5_CACHE_TTL = 300000 // 5 minutes

function getFTS5Cache(databaseId: string): FTS5TableInfo[] | null {
  const cached = fts5Cache.get(databaseId)
  if (cached && Date.now() - cached.timestamp < FTS5_CACHE_TTL) {
    return cached.data
  }
  return null
}

function setFTS5Cache(databaseId: string, data: FTS5TableInfo[]): void {
  fts5Cache.set(databaseId, { data, timestamp: Date.now() })
}

/**
 * Invalidate FTS5 cache for a database
 */
export function invalidateFTS5Cache(databaseId: string): void {
  fts5Cache.delete(databaseId)
}

// Simple in-memory cache for database info (used by Replication tab)
const databaseInfoCache = new Map<string, { data: D1Database; timestamp: number }>()
const DATABASE_INFO_CACHE_TTL = 300000 // 5 minutes

function getDatabaseInfoCache(databaseId: string): D1Database | null {
  const cached = databaseInfoCache.get(databaseId)
  if (cached && Date.now() - cached.timestamp < DATABASE_INFO_CACHE_TTL) {
    return cached.data
  }
  return null
}

function setDatabaseInfoCache(databaseId: string, data: D1Database): void {
  databaseInfoCache.set(databaseId, { data, timestamp: Date.now() })
}

/**
 * Invalidate database info cache
 */
export function invalidateDatabaseInfoCache(databaseId: string): void {
  databaseInfoCache.delete(databaseId)
}

// Simple in-memory cache for Time Travel data
// Uses flags to track which pieces have been fetched to avoid race conditions
interface TimeTravelCacheData {
  bookmark: BookmarkInfo | null
  bookmarkLoaded: boolean
  history: BookmarkHistoryEntry[]
  historyLoaded: boolean
}
const timeTravelCache = new Map<string, { data: TimeTravelCacheData; timestamp: number }>()
const TIME_TRAVEL_CACHE_TTL = 300000 // 5 minutes

function getTimeTravelCache(databaseId: string): TimeTravelCacheData | null {
  const cached = timeTravelCache.get(databaseId)
  if (cached && Date.now() - cached.timestamp < TIME_TRAVEL_CACHE_TTL) {
    return cached.data
  }
  return null
}

function setTimeTravelCache(databaseId: string, data: Partial<TimeTravelCacheData>): void {
  const existing = getTimeTravelCache(databaseId)
  // Use 'in' operator to check if property was explicitly provided (including null values)
  const merged: TimeTravelCacheData = {
    bookmark: 'bookmark' in data ? (data.bookmark ?? null) : (existing?.bookmark ?? null),
    bookmarkLoaded: 'bookmarkLoaded' in data ? (data.bookmarkLoaded ?? false) : (existing?.bookmarkLoaded ?? false),
    history: 'history' in data ? (data.history ?? []) : (existing?.history ?? []),
    historyLoaded: 'historyLoaded' in data ? (data.historyLoaded ?? false) : (existing?.historyLoaded ?? false)
  }
  timeTravelCache.set(databaseId, { data: merged, timestamp: Date.now() })
}

/**
 * Invalidate Time Travel cache for a database
 */
export function invalidateTimeTravelCache(databaseId: string): void {
  timeTravelCache.delete(databaseId)
}

/**
 * Invalidate index analysis cache for a database (call after creating indexes)
 */
export function invalidateIndexAnalysisCache(databaseId: string): void {
  indexAnalysisCache.delete(databaseId)
}

/**
 * Analyze indexes and get recommendations
 * Results are cached for 60 seconds to avoid redundant API calls
 */
export const analyzeIndexes = async (databaseId: string, skipCache = false): Promise<IndexAnalysisResult> => {
  // Check cache first (unless explicitly skipped)
  if (!skipCache) {
    const cached = indexAnalysisCache.get(databaseId)
    if (cached && Date.now() - cached.timestamp < INDEX_ANALYSIS_CACHE_TTL) {
      return cached.data
    }
  }
  
  const response = await fetch(`${WORKER_API}/api/indexes/${databaseId}/analyze`, {
    method: 'GET',
    credentials: 'include'
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to analyze indexes: ${String(response.status)}`)
  }
  
  const data = await response.json() as IndexAnalysisResult & { success: boolean }
  const result = {
    recommendations: data.recommendations,
    existingIndexes: data.existingIndexes,
    statistics: data.statistics
  }
  
  // Cache the result
  indexAnalysisCache.set(databaseId, { data: result, timestamp: Date.now() })
  
  return result
}

/**
 * Create an index using the suggested SQL
 */
export const createIndex = async (
  databaseId: string, 
  sql: string,
  metadata?: {
    tableName?: string;
    indexName?: string;
    columns?: string[];
  }
): Promise<void> => {
  const response = await fetch(`${WORKER_API}/api/indexes/${databaseId}/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({ 
      sql, 
      tableName: metadata?.tableName,
      indexName: metadata?.indexName,
      columns: metadata?.columns
    })
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response) as { error?: string; message?: string }
    throw new Error(error.message ?? error.error ?? `Failed to create index: ${String(response.status)}`)
  }
  
  // Invalidate cache after creating an index
  invalidateIndexAnalysisCache(databaseId)
}

// Job History Types
export interface JobListItem {
  job_id: string
  database_id: string
  operation_type: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  total_items: number | null
  processed_items: number | null
  error_count: number | null
  percentage: number
  started_at: string
  completed_at: string | null
  user_email: string
  metadata?: string | null
  error_message?: string | null
}

export interface JobListResponse {
  jobs: JobListItem[]
  total: number
  limit: number
  offset: number
}

export interface JobEvent {
  id: number
  job_id: string
  event_type: 'started' | 'progress' | 'completed' | 'failed' | 'cancelled'
  user_email: string
  timestamp: string
  details: string | null
}

export interface JobEventDetails {
  total?: number
  processed?: number
  errors?: number
  percentage?: number
  error_message?: string
  [key: string]: unknown
}

export interface JobEventsResponse {
  job_id: string
  events: JobEvent[]
}

/**
 * Get list of jobs with optional filters
 */
export const getJobList = async (options?: {
  limit?: number
  offset?: number
  status?: string
  operation_type?: string
  database_id?: string
  start_date?: string
  end_date?: string
  job_id?: string
  min_errors?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}): Promise<JobListResponse> => {
  const params = new URLSearchParams()
  if (options?.limit) params.set('limit', options.limit.toString())
  if (options?.offset) params.set('offset', options.offset.toString())
  if (options?.status) params.set('status', options.status)
  if (options?.operation_type) params.set('operation_type', options.operation_type)
  if (options?.database_id) params.set('database_id', options.database_id)
  if (options?.start_date) params.set('start_date', options.start_date)
  if (options?.end_date) params.set('end_date', options.end_date)
  if (options?.job_id) params.set('job_id', options.job_id)
  if (options?.min_errors !== undefined) params.set('min_errors', options.min_errors.toString())
  if (options?.sort_by) params.set('sort_by', options.sort_by)
  if (options?.sort_order) params.set('sort_order', options.sort_order)

  const response = await fetch(
    `${WORKER_API}/api/jobs?${params.toString()}`,
    {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to get job list: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: JobListResponse, success: boolean }
  return data.result
}

/**
 * Get job events (event timeline) for a specific job
 */
export const getJobEvents = async (jobId: string): Promise<JobEventsResponse> => {
  const response = await fetch(
    `${WORKER_API}/api/jobs/${jobId}/events`,
    {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to get job events: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: JobEventsResponse, success: boolean }
  return data.result
}

/**
 * Get job status
 */
export const getJobStatus = async (jobId: string): Promise<JobListItem> => {
  const response = await fetch(
    `${WORKER_API}/api/jobs/${jobId}`,
    {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to get job status: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: JobListItem, success: boolean }
  return data.result
}

// ============================================
// Time Travel Types and API
// ============================================

export interface BookmarkInfo {
  bookmark: string
  capturedAt: string
  databaseId: string
  databaseName?: string
  restoreCommand?: string | null
}

export interface BookmarkHistoryEntry {
  id: number
  database_id: string
  database_name: string | null
  bookmark: string
  operation_type: string
  description: string | null
  captured_at: string
  user_email: string | null
  restoreCommand?: string | null
}

export interface BookmarkHistoryResponse {
  result: BookmarkHistoryEntry[]
  databaseName?: string
  success: boolean
}

/**
 * Get current bookmark for a database (cached for 5 minutes)
 * Bookmarks represent the current state of the database for Time Travel
 */
export const getCurrentBookmark = async (databaseId: string, skipCache = false): Promise<BookmarkInfo> => {
  // Check cache first - use cached data if bookmark has been loaded
  if (!skipCache) {
    const cached = getTimeTravelCache(databaseId)
    if (cached?.bookmarkLoaded && cached.bookmark) {
      return cached.bookmark
    }
  }
  
  const response = await fetch(
    `${WORKER_API}/api/time-travel/${databaseId}/bookmark`,
    {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to get bookmark: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: BookmarkInfo, success: boolean }
  
  // Update cache with bookmark data
  setTimeTravelCache(databaseId, {
    bookmark: data.result,
    bookmarkLoaded: true
  })
  
  return data.result
}

/**
 * Get bookmark history for a database (cached for 5 minutes)
 * Shows saved checkpoints from before destructive operations
 */
export const getBookmarkHistory = async (
  databaseId: string,
  limit?: number,
  skipCache = false
): Promise<BookmarkHistoryEntry[]> => {
  // Check cache first - use cached data if history has been loaded (for default limit)
  if (!skipCache && (!limit || limit === 10)) {
    const cached = getTimeTravelCache(databaseId)
    if (cached?.historyLoaded) {
      return cached.history
    }
  }
  
  const params = new URLSearchParams()
  if (limit) params.set('limit', limit.toString())
  
  const url = `${WORKER_API}/api/time-travel/${databaseId}/history${params.toString() ? `?${params.toString()}` : ''}`
  
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store'
  })
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to get bookmark history: ${String(response.status)}`)
  }
  
  const data = await response.json() as BookmarkHistoryResponse
  
  // Update cache with history data
  setTimeTravelCache(databaseId, {
    history: data.result,
    historyLoaded: true
  })
  
  return data.result
}

/**
 * Manually capture a bookmark (checkpoint) for a database
 */
export const captureBookmark = async (
  databaseId: string,
  description?: string
): Promise<BookmarkInfo> => {
  const response = await fetch(
    `${WORKER_API}/api/time-travel/${databaseId}/capture`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ description })
    }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to capture bookmark: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: BookmarkInfo, success: boolean }
  
  // Invalidate Time Travel cache since new bookmark was captured
  invalidateTimeTravelCache(databaseId)
  
  return data.result
}

/**
 * Delete a bookmark entry from history
 */
export const deleteBookmarkEntry = async (
  databaseId: string,
  bookmarkId: number
): Promise<void> => {
  const response = await fetch(
    `${WORKER_API}/api/time-travel/${databaseId}/history/${String(bookmarkId)}`,
    {
      method: 'DELETE',
      credentials: 'include'
    }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to delete bookmark: ${String(response.status)}`)
  }
  
  // Invalidate Time Travel cache since history changed
  invalidateTimeTravelCache(databaseId)
}

/**
 * Generate CLI restore command for a bookmark
 */
export const generateRestoreCommand = (databaseName: string, bookmark: string): string => {
  return `wrangler d1 time-travel restore ${databaseName} --bookmark=${bookmark}`
}

/**
 * Get Time Travel info command for CLI
 */
export const generateTimeTravelInfoCommand = (databaseName: string): string => {
  return `wrangler d1 time-travel info ${databaseName}`
}

// ============================================
// R2 Backup Types and API Methods
// ============================================

/**
 * Source of the R2 backup - tracks what operation triggered the backup
 */
export type R2BackupSource = 
  | 'manual'           // User-initiated from database card
  | 'rename_database'  // Before database rename operation
  | 'strict_mode'      // Before enabling STRICT mode on table
  | 'fts5_convert'     // Before converting FTS5 to regular table
  | 'column_modify'    // Before modifying column type/constraints
  | 'table_export'     // Single table export to R2
  | 'table_backup'     // Table backup from operations like Modify Column
  | 'scheduled'        // Automated scheduled backup

/**
 * R2 backup list item
 */
export interface R2BackupListItem {
  path: string
  databaseId: string
  databaseName: string
  source: R2BackupSource
  timestamp: number
  size: number
  uploaded: string
  tableName?: string
  tableFormat?: 'sql' | 'csv' | 'json'
  backupType: 'database' | 'table'
}

/**
 * R2 backup job response
 */
export interface R2BackupJobResponse {
  job_id: string
  status: 'queued'
}

/**
 * R2 backup status response
 */
export interface R2BackupStatus {
  configured: boolean
  bucketAvailable: boolean
  doAvailable: boolean
}

/**
 * Check if R2 backups are configured (with caching)
 */
export const getR2BackupStatus = async (skipCache = false): Promise<R2BackupStatus> => {
  // Check cache first (10 min TTL - rarely changes)
  if (!skipCache && r2BackupStatusCache && Date.now() - r2BackupStatusCache.timestamp < R2_STATUS_CACHE_TTL) {
    return r2BackupStatusCache.data
  }

  const response = await fetch(
    `${WORKER_API}/api/r2-backup/status`,
    { credentials: 'include' }
  )
  
  if (!response.ok) {
    const result = { configured: false, bucketAvailable: false, doAvailable: false }
    r2BackupStatusCache = { data: result, timestamp: Date.now() }
    return result
  }
  
  const data = await response.json() as { result: R2BackupStatus, success: boolean }
  
  // Cache the result
  r2BackupStatusCache = { data: data.result, timestamp: Date.now() }
  
  return data.result
}

/**
 * Invalidate R2 backup status cache
 */
export function invalidateR2BackupStatusCache(): void {
  r2BackupStatusCache = null
}

/**
 * List R2 backups for a database
 */
export const listR2Backups = async (databaseId: string): Promise<R2BackupListItem[]> => {
  const response = await fetch(
    `${WORKER_API}/api/r2-backup/${databaseId}/list`,
    { credentials: 'include' }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to list R2 backups: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: R2BackupListItem[], success: boolean }
  return data.result
}

/**
 * Orphaned backup group - backups from deleted databases
 */
export interface OrphanedBackupGroup {
  databaseId: string
  databaseName: string
  backups: R2BackupListItem[]
}

/**
 * List orphaned R2 backups (from deleted databases)
 */
export const listOrphanedR2Backups = async (): Promise<OrphanedBackupGroup[]> => {
  const response = await fetch(
    `${WORKER_API}/api/r2-backup/orphaned`,
    { credentials: 'include' }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to list orphaned backups: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: OrphanedBackupGroup[], success: boolean }
  return data.result
}

/**
 * Delete all R2 backups for a database
 */
export const deleteAllR2Backups = async (databaseId: string): Promise<{ deleted: number; failed: number }> => {
  const response = await fetch(
    `${WORKER_API}/api/r2-backup/${databaseId}/all`,
    { 
      method: 'DELETE',
      credentials: 'include' 
    }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to delete backups: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: { deleted: number; failed: number }, success: boolean }
  return data.result
}

/**
 * Backup database to R2
 */
export const backupToR2 = async (
  databaseId: string,
  databaseName: string,
  source: R2BackupSource = 'manual'
): Promise<R2BackupJobResponse> => {
  const response = await fetch(
    `${WORKER_API}/api/r2-backup/${databaseId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ source, databaseName })
    }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to start R2 backup: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: R2BackupJobResponse, success: boolean }
  return data.result
}

/**
 * Backup table to R2
 */
export const backupTableToR2 = async (
  databaseId: string,
  databaseName: string,
  tableName: string,
  format: 'sql' | 'csv' | 'json' = 'sql',
  source: R2BackupSource = 'table_export'
): Promise<R2BackupJobResponse> => {
  const response = await fetch(
    `${WORKER_API}/api/r2-backup/${databaseId}/table`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ tableName, format, source, databaseName })
    }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to start table backup: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: R2BackupJobResponse, success: boolean }
  return data.result
}

/**
 * Restore database from R2 backup
 */
export const restoreFromR2 = async (
  databaseId: string,
  backupPath: string
): Promise<R2BackupJobResponse> => {
  const response = await fetch(
    `${WORKER_API}/api/r2-restore/${databaseId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ backupPath })
    }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to start restore: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: R2BackupJobResponse, success: boolean }
  return data.result
}

/**
 * Delete an R2 backup
 * @param databaseId - The database ID
 * @param timestamp - The backup timestamp
 * @param path - Optional full path for table backups (required for table backups stored at different paths)
 */
export const deleteR2Backup = async (
  databaseId: string,
  timestamp: number,
  path?: string
): Promise<void> => {
  // Build URL with optional path query param for table backups
  let url = `${WORKER_API}/api/r2-backup/${databaseId}/${String(timestamp)}`
  if (path) {
    url += `?path=${encodeURIComponent(path)}`
  }
  
  const response = await fetch(
    url,
    {
      method: 'DELETE',
      credentials: 'include'
    }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to delete backup: ${String(response.status)}`)
  }
}

/**
 * Bulk delete R2 backups
 */
export interface BulkDeleteResult {
  deleted: number
  failed: number
  errors?: string[]
}

export const bulkDeleteR2Backups = async (
  databaseId: string,
  timestamps: number[]
): Promise<BulkDeleteResult> => {
  const response = await fetch(
    `${WORKER_API}/api/r2-backup/${databaseId}/bulk`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ timestamps })
    }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to bulk delete backups: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: BulkDeleteResult, success: boolean }
  return data.result
}

/**
 * Download an R2 backup file
 */
export const downloadR2Backup = async (
  databaseId: string,
  timestamp: number,
  databaseName: string
): Promise<void> => {
  const response = await fetch(
    `${WORKER_API}/api/r2-backup/${databaseId}/download/${String(timestamp)}`,
    {
      method: 'GET',
      credentials: 'include'
    }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to download backup: ${String(response.status)}`)
  }

  // Get the blob and trigger download
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${databaseName}-backup-${String(timestamp)}.sql`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Get source label for display
 */
export const getR2BackupSourceLabel = (source: R2BackupSource): string => {
  switch (source) {
    case 'manual': return 'Manual Backup'
    case 'rename_database': return 'Before Rename'
    case 'strict_mode': return 'Before STRICT Mode'
    case 'fts5_convert': return 'Before FTS5 Convert'
    case 'column_modify': return 'Before Column Modify'
    case 'table_export': return 'Table Export'
    case 'table_backup': return 'Table Backup'
    case 'scheduled': return 'Scheduled Backup'
    default: return 'Backup'
  }
}

// ============================================
// Scheduled Backup Types
// ============================================

export type ScheduledBackupSchedule = 'daily' | 'weekly' | 'monthly'

export interface ScheduledBackup {
  id: string
  database_id: string
  database_name: string
  schedule: ScheduledBackupSchedule
  day_of_week: number | null
  day_of_month: number | null
  hour: number
  enabled: number
  last_run_at: string | null
  next_run_at: string | null
  last_job_id: string | null
  last_status: 'success' | 'failed' | null
  created_at: string
  updated_at: string
  created_by: string | null
  schedule_description?: string
}

export interface ScheduledBackupInput {
  database_id: string
  database_name: string
  schedule: ScheduledBackupSchedule
  day_of_week?: number
  day_of_month?: number
  hour?: number
  enabled?: boolean
}

// ============================================
// Scheduled Backup API Functions
// ============================================

/**
 * List all scheduled backups
 */
export const listScheduledBackups = async (): Promise<ScheduledBackup[]> => {
  const response = await fetch(
    `${WORKER_API}/api/scheduled-backups`,
    { credentials: 'include' }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to list scheduled backups: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: ScheduledBackup[], success: boolean }
  return data.result
}

/**
 * Get scheduled backup for a specific database
 */
export const getScheduledBackup = async (databaseId: string): Promise<ScheduledBackup | null> => {
  const response = await fetch(
    `${WORKER_API}/api/scheduled-backups/${databaseId}`,
    { credentials: 'include' }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to get scheduled backup: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: ScheduledBackup | null, success: boolean }
  return data.result
}

/**
 * Create or update a scheduled backup
 */
export const saveScheduledBackup = async (input: ScheduledBackupInput): Promise<ScheduledBackup> => {
  const response = await fetch(
    `${WORKER_API}/api/scheduled-backups`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input)
    }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to save scheduled backup: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: ScheduledBackup, success: boolean }
  return data.result
}

/**
 * Delete a scheduled backup
 */
export const deleteScheduledBackup = async (databaseId: string): Promise<void> => {
  const response = await fetch(
    `${WORKER_API}/api/scheduled-backups/${databaseId}`,
    {
      method: 'DELETE',
      credentials: 'include'
    }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to delete scheduled backup: ${String(response.status)}`)
  }
}

/**
 * Toggle scheduled backup enabled/disabled
 */
export const toggleScheduledBackup = async (databaseId: string): Promise<ScheduledBackup> => {
  const response = await fetch(
    `${WORKER_API}/api/scheduled-backups/${databaseId}/toggle`,
    {
      method: 'PUT',
      credentials: 'include'
    }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to toggle scheduled backup: ${String(response.status)}`)
  }
  
  const data = await response.json() as { result: ScheduledBackup, success: boolean }
  return data.result
}

// ============================================
// Migration Types
// ============================================

export interface Migration {
  version: number
  name: string
  description: string
}

export interface AppliedMigration {
  version: number
  migration_name: string
  applied_at: string
}

export interface LegacyInstallationInfo {
  isLegacy: boolean
  existingTables: string[]
  suggestedVersion: number
}

export interface MigrationStatus {
  currentVersion: number
  latestVersion: number
  pendingMigrations: Migration[]
  appliedMigrations: AppliedMigration[]
  isUpToDate: boolean
  legacy?: LegacyInstallationInfo
}

export interface MigrationResult {
  success: boolean
  migrationsApplied: number
  currentVersion: number
  errors: string[]
}

// ============================================
// Migration API Functions
// ============================================

/**
 * Get current migration status
 */
export const getMigrationStatus = async (): Promise<MigrationStatus> => {
  const response = await fetch(
    `${WORKER_API}/api/migrations/status`,
    {
      method: 'GET',
      credentials: 'include'
    }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to get migration status: ${String(response.status)}`)
  }
  
  const data = await response.json() as ApiResponse<MigrationStatus>
  if (!data.result) {
    throw new Error('Invalid response from migration status endpoint')
  }
  return data.result
}

/**
 * Apply all pending migrations
 */
export const applyMigrations = async (): Promise<MigrationResult> => {
  const response = await fetch(
    `${WORKER_API}/api/migrations/apply`,
    {
      method: 'POST',
      credentials: 'include'
    }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to apply migrations: ${String(response.status)}`)
  }
  
  const data = await response.json() as ApiResponse<MigrationResult>
  if (!data.result) {
    throw new Error('Invalid response from migration apply endpoint')
  }
  return data.result
}

/**
 * Mark migrations as applied for legacy installations
 */
export const markLegacyMigrations = async (version: number): Promise<{ markedUpTo: number }> => {
  const response = await fetch(
    `${WORKER_API}/api/migrations/mark-legacy`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ version })
    }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to mark legacy migrations: ${String(response.status)}`)
  }
  
  const data = await response.json() as ApiResponse<{ markedUpTo: number }>
  if (!data.result) {
    throw new Error('Invalid response from mark-legacy endpoint')
  }
  return data.result
}

// Simple in-memory cache for metrics data
// Keyed by time range since different ranges have different data
const metricsCache = new Map<string, { data: MetricsResponse; timestamp: number }>()
const METRICS_CACHE_TTL = 120000 // 2 minutes - shorter TTL since metrics update frequently

function getMetricsCache(timeRange: MetricsTimeRange): MetricsResponse | null {
  const cached = metricsCache.get(timeRange)
  if (cached && Date.now() - cached.timestamp < METRICS_CACHE_TTL) {
    return cached.data
  }
  return null
}

function setMetricsCache(timeRange: MetricsTimeRange, data: MetricsResponse): void {
  metricsCache.set(timeRange, { data, timestamp: Date.now() })
}

/**
 * Invalidate metrics cache (call after database modifications)
 */
export function invalidateMetricsCache(): void {
  metricsCache.clear()
}

// ============================================
// Cascade Simulation Cache
// ============================================

interface CascadeCacheEntry {
  data: CascadeSimulationResult
  timestamp: number
}

// Cache keyed by databaseId:tableName:whereClause
const cascadeSimulationCache = new Map<string, CascadeCacheEntry>()
const CASCADE_CACHE_TTL = 300000 // 5 minutes

function getCascadeCacheKey(databaseId: string, tableName: string, whereClause?: string): string {
  return `${databaseId}:${tableName}:${whereClause ?? ''}`
}

function getCachedCascadeSimulation(databaseId: string, tableName: string, whereClause?: string): CascadeSimulationResult | null {
  const key = getCascadeCacheKey(databaseId, tableName, whereClause)
  const cached = cascadeSimulationCache.get(key)
  if (cached && Date.now() - cached.timestamp < CASCADE_CACHE_TTL) {
    return cached.data
  }
  return null
}

function setCachedCascadeSimulation(databaseId: string, tableName: string, whereClause: string | undefined, data: CascadeSimulationResult): void {
  const key = getCascadeCacheKey(databaseId, tableName, whereClause)
  cascadeSimulationCache.set(key, { data, timestamp: Date.now() })
}

/**
 * Invalidate cascade simulation cache for a database
 * Call after table modifications (delete, schema changes, etc.)
 */
export function invalidateCascadeCache(databaseId?: string): void {
  if (databaseId) {
    // Clear all entries for this database
    for (const key of cascadeSimulationCache.keys()) {
      if (key.startsWith(`${databaseId}:`)) {
        cascadeSimulationCache.delete(key)
      }
    }
  } else {
    cascadeSimulationCache.clear()
  }
}

// ============================================
// Table Dependencies Cache
// ============================================

interface TableDependenciesCacheEntry {
  data: TableDependenciesResponse
  timestamp: number
}

// Cache keyed by databaseId:tableNames (sorted)
const tableDependenciesCache = new Map<string, TableDependenciesCacheEntry>()
const TABLE_DEPS_CACHE_TTL = 300000 // 5 minutes

function getTableDepsCacheKey(databaseId: string, tableNames: string[]): string {
  return `${databaseId}:${[...tableNames].sort().join(',')}`
}

function getCachedTableDependencies(databaseId: string, tableNames: string[]): TableDependenciesResponse | null {
  const key = getTableDepsCacheKey(databaseId, tableNames)
  const cached = tableDependenciesCache.get(key)
  if (cached && Date.now() - cached.timestamp < TABLE_DEPS_CACHE_TTL) {
    return cached.data
  }
  return null
}

function setCachedTableDependencies(databaseId: string, tableNames: string[], data: TableDependenciesResponse): void {
  const key = getTableDepsCacheKey(databaseId, tableNames)
  tableDependenciesCache.set(key, { data, timestamp: Date.now() })
}

/**
 * Invalidate table dependencies cache for a database
 * Call after FK modifications
 */
export function invalidateTableDependenciesCache(databaseId?: string): void {
  if (databaseId) {
    for (const key of tableDependenciesCache.keys()) {
      if (key.startsWith(`${databaseId}:`)) {
        tableDependenciesCache.delete(key)
      }
    }
  } else {
    tableDependenciesCache.clear()
  }
}

// ============================================
// Table Schema Cache
// ============================================

interface TableSchemaCacheEntry {
  data: ColumnInfo[]
  timestamp: number
}

// Cache keyed by databaseId:tableName
const tableSchemaCacheMap = new Map<string, TableSchemaCacheEntry>()
const TABLE_SCHEMA_CACHE_TTL = 300000 // 5 minutes

function getTableSchemaCacheKey(databaseId: string, tableName: string): string {
  return `${databaseId}:${tableName}`
}

function getCachedTableSchema(databaseId: string, tableName: string): ColumnInfo[] | null {
  const key = getTableSchemaCacheKey(databaseId, tableName)
  const cached = tableSchemaCacheMap.get(key)
  if (cached && Date.now() - cached.timestamp < TABLE_SCHEMA_CACHE_TTL) {
    return cached.data
  }
  return null
}

function setCachedTableSchema(databaseId: string, tableName: string, data: ColumnInfo[]): void {
  const key = getTableSchemaCacheKey(databaseId, tableName)
  tableSchemaCacheMap.set(key, { data, timestamp: Date.now() })
}

/**
 * Invalidate table schema cache
 * Call after column add/rename/modify/delete
 */
export function invalidateTableSchemaCache(databaseId?: string, tableName?: string): void {
  if (databaseId && tableName) {
    // Invalidate specific table
    const key = getTableSchemaCacheKey(databaseId, tableName)
    tableSchemaCacheMap.delete(key)
  } else if (databaseId) {
    // Invalidate all tables in database
    for (const key of tableSchemaCacheMap.keys()) {
      if (key.startsWith(`${databaseId}:`)) {
        tableSchemaCacheMap.delete(key)
      }
    }
  } else {
    tableSchemaCacheMap.clear()
  }
}

// ============================================
// Table Foreign Keys Cache
// ============================================

interface TableFKCacheEntry {
  data: { column: string; refTable: string; refColumn: string; onDelete: string | null; onUpdate: string | null }[]
  timestamp: number
}

// Cache keyed by databaseId:tableName
const tableFKCacheMap = new Map<string, TableFKCacheEntry>()
const TABLE_FK_CACHE_TTL = 300000 // 5 minutes

function getTableFKCacheKey(databaseId: string, tableName: string): string {
  return `${databaseId}:${tableName}`
}

function getCachedTableFK(databaseId: string, tableName: string): TableFKCacheEntry['data'] | null {
  const key = getTableFKCacheKey(databaseId, tableName)
  const cached = tableFKCacheMap.get(key)
  if (cached && Date.now() - cached.timestamp < TABLE_FK_CACHE_TTL) {
    return cached.data
  }
  return null
}

function setCachedTableFK(databaseId: string, tableName: string, data: TableFKCacheEntry['data']): void {
  const key = getTableFKCacheKey(databaseId, tableName)
  tableFKCacheMap.set(key, { data, timestamp: Date.now() })
}

/**
 * Invalidate table FK cache
 * Call after FK modifications
 */
export function invalidateTableFKCache(databaseId?: string, tableName?: string): void {
  if (databaseId && tableName) {
    const key = getTableFKCacheKey(databaseId, tableName)
    tableFKCacheMap.delete(key)
  } else if (databaseId) {
    for (const key of tableFKCacheMap.keys()) {
      if (key.startsWith(`${databaseId}:`)) {
        tableFKCacheMap.delete(key)
      }
    }
  } else {
    tableFKCacheMap.clear()
  }
}

// ============================================
// R2 Backup Status Cache
// ============================================

let r2BackupStatusCache: { data: R2BackupStatus; timestamp: number } | null = null
const R2_STATUS_CACHE_TTL = 600000 // 10 minutes - rarely changes

// ============================================
// Database List Cache (includes FTS5 count, replication status)
// ============================================

let databaseListCache: { data: D1Database[]; timestamp: number } | null = null
const DATABASE_LIST_CACHE_TTL = 300000 // 5 minutes

function getCachedDatabaseList(): D1Database[] | null {
  if (databaseListCache && Date.now() - databaseListCache.timestamp < DATABASE_LIST_CACHE_TTL) {
    return databaseListCache.data
  }
  return null
}

function setCachedDatabaseList(data: D1Database[]): void {
  databaseListCache = { data, timestamp: Date.now() }
}

/**
 * Invalidate database list cache
 * Call after database create/delete/rename operations
 */
export function invalidateDatabaseListCache(): void {
  databaseListCache = null
}

/**
 * Get D1 database metrics from Cloudflare Analytics (cached for 2 minutes)
 */
export const getMetrics = async (timeRange: MetricsTimeRange = '7d', skipCache = false): Promise<MetricsResponse> => {
  // Check cache first
  if (!skipCache) {
    const cached = getMetricsCache(timeRange)
    if (cached) {
      return cached
    }
  }
  
  const response = await fetch(
    `${WORKER_API}/api/metrics?range=${timeRange}`,
    {
      method: 'GET',
      credentials: 'include'
    }
  )
  
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.error ?? `Failed to get metrics: ${String(response.status)}`)
  }
  
  const data = await response.json() as ApiResponse<MetricsResponse>
  if (!data.result) {
    throw new Error('Invalid response from metrics endpoint')
  }
  
  // Cache the result
  setMetricsCache(timeRange, data.result)
  
  return data.result
}

