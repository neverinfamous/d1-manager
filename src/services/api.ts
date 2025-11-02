const WORKER_API = import.meta.env.VITE_WORKER_API || window.location.origin

// Database types
export interface D1Database {
  uuid: string
  name: string
  version: string
  created_at: string
  file_size?: number
  num_tables?: number
}

// Table types
export interface TableInfo {
  name: string
  type: 'table' | 'view' | 'shadow' | 'virtual'
  ncol: number
  wr: number
  strict: number
}

export interface ColumnInfo {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
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
        'isNull' | 'isNotNull' | 'startsWith' | 'endsWith'
  value?: string | number
  value2?: string | number // For range filters (future: between operator)
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

// Optimize result types
class APIService {
  /**
   * List all D1 databases
   */
  async listDatabases(): Promise<D1Database[]> {
    const response = await fetch(`${WORKER_API}/api/databases`, {
      credentials: 'include'
    })
    
    if (!response.ok) {
      throw new Error(`Failed to list databases: ${response.statusText}`)
    }
    
    const data = await response.json()
    return data.result || []
  }

  /**
   * Get database info
   */
  async getDatabaseInfo(databaseId: string): Promise<D1Database> {
    const response = await fetch(`${WORKER_API}/api/databases/${databaseId}/info`, {
      credentials: 'include'
    })
    
    if (!response.ok) {
      throw new Error(`Failed to get database info: ${response.statusText}`)
    }
    
    const data = await response.json()
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
    
    const data = await response.json()
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
  }

  /**
   * Delete multiple databases
   */
  async deleteDatabases(
    databaseIds: string[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<{ succeeded: string[], failed: Array<{ id: string, error: string }> }> {
    const succeeded: string[] = []
    const failed: Array<{ id: string, error: string }> = []
    
    for (let i = 0; i < databaseIds.length; i++) {
      try {
        await this.deleteDatabase(databaseIds[i])
        succeeded.push(databaseIds[i])
      } catch (err) {
        failed.push({
          id: databaseIds[i],
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
    databases: Array<{ uuid: string, name: string }>,
    onProgress?: (progress: number) => void
  ): Promise<void> {
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
      
      const data = await response.json() as { result: { [key: string]: string }, success: boolean }
      
      if (!data.success) {
        throw new Error('Export operation failed')
      }
      
      onProgress?.(70)
      
      // Create a ZIP file using JSZip
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      
      // Add each database's SQL export to the ZIP
      const exports = data.result
      for (const db of databases) {
        if (exports[db.uuid]) {
          zip.file(`${db.name}.sql`, exports[db.uuid])
        }
      }
      
      onProgress?.(90)
      
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
      
      onProgress?.(100)
    } catch (error) {
      console.error('Database export failed:', error)
      throw new Error(error instanceof Error ? error.message : 'Failed to export databases')
    }
  }

  /**
   * Import a database from SQL file
   */
  async importDatabase(
    file: File,
    options: {
      createNew?: boolean
      databaseName?: string
      targetDatabaseId?: string
    }
  ): Promise<D1Database | void> {
    try {
      // Read the SQL file content
      const sqlContent = await file.text()
      
      // Validate it's a SQL file
      if (!file.name.endsWith('.sql')) {
        throw new Error('Only .sql files are supported')
      }
      
      // Check file size (5GB limit)
      const maxSize = 5 * 1024 * 1024 * 1024 // 5GB
      if (file.size > maxSize) {
        throw new Error('File size exceeds 5GB limit')
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
        const error = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error.error || `Import failed: ${response.statusText}`)
      }
      
      const data = await response.json()
      return data.result
    } catch (error) {
      console.error('Database import failed:', error)
      throw new Error(error instanceof Error ? error.message : 'Failed to import database')
    }
  }

  /**
   * Rename a database (migration-based approach)
   */
  async renameDatabase(
    databaseId: string,
    newName: string,
    onProgress?: (step: string, progress: number) => void
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
        const error = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error.error || error.message || `Rename failed: ${response.statusText}`)
      }
      
      onProgress?.('completed', 100)
      
      const data = await response.json() as { result: D1Database & { oldId: string }, success: boolean }
      
      if (!data.success) {
        throw new Error('Rename operation failed')
      }
      
      return data.result
    } catch (error) {
      console.error('Database rename failed:', error)
      throw new Error(error instanceof Error ? error.message : 'Failed to rename database')
    }
  }

  /**
   * Optimize multiple databases (ANALYZE only - VACUUM not supported via D1 REST API)
   */
  async optimizeDatabases(
    databaseIds: string[],
    onProgress?: (completed: number, total: number, operation: string) => void
  ): Promise<{ 
    succeeded: Array<{ id: string; name: string }>, 
    failed: Array<{ id: string; name: string; error: string }> 
  }> {
    const succeeded: Array<{ id: string; name: string }> = []
    const failed: Array<{ id: string; name: string; error: string }> = []
    
    for (let i = 0; i < databaseIds.length; i++) {
      const dbId = databaseIds[i]
      
      try {
        // Get database name for progress reporting
        const dbInfo = await this.getDatabaseInfo(dbId)
        
        onProgress?.(i + 1, databaseIds.length, `ANALYZE on ${dbInfo.name}`)
        
        // Run PRAGMA optimize via query execution
        await this.executeQuery(dbId, 'PRAGMA optimize')
        
        succeeded.push({
          id: dbId,
          name: dbInfo.name
        })
      } catch (err) {
        const dbInfo = await this.getDatabaseInfo(dbId).catch(() => ({ name: 'Unknown' }))
        failed.push({
          id: dbId,
          name: dbInfo.name,
          error: err instanceof Error ? err.message : 'Unknown error'
        })
      }
    }
    
    return { succeeded, failed }
  }

  /**
   * List tables in a database
   */
  async listTables(databaseId: string): Promise<TableInfo[]> {
    const response = await fetch(`${WORKER_API}/api/tables/${databaseId}/list`, {
      credentials: 'include'
    })
    
    if (!response.ok) {
      throw new Error(`Failed to list tables: ${response.statusText}`)
    }
    
    const data = await response.json()
    return data.result || []
  }

  /**
   * Get table schema
   */
  async getTableSchema(databaseId: string, tableName: string): Promise<ColumnInfo[]> {
    const response = await fetch(
      `${WORKER_API}/api/tables/${databaseId}/schema/${encodeURIComponent(tableName)}`,
      { credentials: 'include' }
    )
    
    if (!response.ok) {
      throw new Error(`Failed to get table schema: ${response.statusText}`)
    }
    
    const data = await response.json()
    return data.result || []
  }

  /**
   * Get table data (paginated)
   */
  async getTableData<T = Record<string, unknown>>(
    databaseId: string,
    tableName: string,
    limit: number = 100,
    offset: number = 0,
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
        if (filter.value !== undefined && filter.value !== null && filter.value !== '') {
          params.set(`filterValue_${columnName}`, String(filter.value))
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
    
    const data = await response.json()
    return {
      results: data.result || [],
      meta: data.meta,
      success: data.success
    }
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
    
    const data = await response.json()
    return data.result || []
  }

  /**
   * Get table dependencies (foreign key relationships)
   */
  async getTableDependencies(
    databaseId: string,
    tableNames: string[]
  ): Promise<TableDependenciesResponse> {
    const tablesParam = tableNames.map(t => encodeURIComponent(t)).join(',')
    const response = await fetch(
      `${WORKER_API}/api/tables/${databaseId}/dependencies?tables=${tablesParam}`,
      { credentials: 'include' }
    )
    
    if (!response.ok) {
      throw new Error(`Failed to get table dependencies: ${response.statusText}`)
    }
    
    const data = await response.json()
    return data.result || {}
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
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error || `Failed to rename table: ${response.statusText}`)
    }
    
    const data = await response.json()
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
      defaultValue?: string
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
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error || `Failed to add column: ${response.statusText}`)
    }
    
    const data = await response.json()
    return data.result
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
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error || `Failed to rename column: ${response.statusText}`)
    }
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
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error || `Failed to modify column: ${response.statusText}`)
    }
    
    const data = await response.json()
    return data.result
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
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error || `Failed to delete column: ${response.statusText}`)
    }
  }

  /**
   * Delete multiple tables
   */
  async deleteTables(
    databaseId: string,
    tableNames: string[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<{ succeeded: string[], failed: Array<{ name: string, error: string }> }> {
    const succeeded: string[] = []
    const failed: Array<{ name: string, error: string }> = []
    
    for (let i = 0; i < tableNames.length; i++) {
      try {
        await this.deleteTable(databaseId, tableNames[i])
        succeeded.push(tableNames[i])
      } catch (err) {
        failed.push({
          name: tableNames[i],
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
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error || `Failed to clone table: ${response.statusText}`)
    }
    
    const data = await response.json()
    return data.result
  }

  /**
   * Clone multiple tables
   */
  async cloneTables(
    databaseId: string,
    tables: Array<{ name: string, newName: string }>,
    onProgress?: (completed: number, total: number) => void
  ): Promise<{ succeeded: Array<{ oldName: string, newName: string }>, failed: Array<{ name: string, error: string }> }> {
    const succeeded: Array<{ oldName: string, newName: string }> = []
    const failed: Array<{ name: string, error: string }> = []
    
    for (let i = 0; i < tables.length; i++) {
      try {
        await this.cloneTable(databaseId, tables[i].name, tables[i].newName)
        succeeded.push({ oldName: tables[i].name, newName: tables[i].newName })
      } catch (err) {
        failed.push({
          name: tables[i].name,
          error: err instanceof Error ? err.message : 'Unknown error'
        })
      }
      onProgress?.(i + 1, tables.length)
    }
    
    return { succeeded, failed }
  }

  /**
   * Export a single table
   */
  async exportTable(databaseId: string, tableName: string, format: 'sql' | 'csv' = 'sql'): Promise<void> {
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
      const blob = new Blob([data.result.content], { type: format === 'csv' ? 'text/csv' : 'text/plain' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = data.result.filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Table export failed:', error)
      throw new Error(error instanceof Error ? error.message : 'Failed to export table')
    }
  }

  /**
   * Export multiple tables as a ZIP file
   */
  async exportTables(
    databaseId: string,
    tableNames: string[],
    format: 'sql' | 'csv' = 'sql',
    onProgress?: (progress: number) => void
  ): Promise<void> {
    try {
      onProgress?.(10)
      
      // Fetch all table exports
      const exports: Array<{ name: string, content: string }> = []
      
      for (let i = 0; i < tableNames.length; i++) {
        const response = await fetch(
          `${WORKER_API}/api/tables/${databaseId}/${encodeURIComponent(tableNames[i])}/export?format=${format}`,
          { credentials: 'include' }
        )
        
        if (!response.ok) {
          throw new Error(`Failed to export table ${tableNames[i]}: ${response.statusText}`)
        }
        
        const data = await response.json() as { result: { content: string, filename: string }, success: boolean }
        
        if (!data.success) {
          throw new Error(`Export operation failed for table ${tableNames[i]}`)
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
      console.error('Tables export failed:', error)
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
      const error = await response.json()
      throw new Error(error.error || error.message || `Query failed: ${response.statusText}`)
    }
    
    const data = await response.json()
    return data.result
  }

  /**
   * Execute batch queries
   */
  async executeBatch(
    databaseId: string,
    queries: Array<{ query: string; params?: unknown[] }>
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
    
    const data = await response.json()
    return data.result || []
  }

  /**
   * Get query history
   */
  async getQueryHistory(databaseId: string, limit: number = 10): Promise<QueryHistoryEntry[]> {
    const response = await fetch(
      `${WORKER_API}/api/query/${databaseId}/history?limit=${limit}`,
      { credentials: 'include' }
    )
    
    if (!response.ok) {
      throw new Error(`Failed to get query history: ${response.statusText}`)
    }
    
    const data = await response.json()
    return data.result || []
  }
}

export const api = new APIService()

// Export individual methods for convenience
export const listTables = (databaseId: string) => api.listTables(databaseId)
export const getTableSchema = (databaseId: string, tableName: string) => api.getTableSchema(databaseId, tableName)
export const getTableData = <T = Record<string, unknown>>(
  databaseId: string, 
  tableName: string, 
  limit?: number, 
  offset?: number,
  filters?: Record<string, FilterCondition>
) => api.getTableData<T>(databaseId, tableName, limit, offset, filters)
export const executeQuery = <T = Record<string, unknown>>(
  databaseId: string, 
  query: string, 
  params?: unknown[], 
  skipValidation?: boolean
) => api.executeQuery<T>(databaseId, query, params, skipValidation)

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
    throw new Error(`Failed to fetch saved queries: ${response.status}`)
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
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to save query: ${response.status}`)
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
  const response = await fetch(`${WORKER_API}/api/saved-queries/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(updates)
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to update query: ${response.status}`)
  }
  
  const data = await response.json() as { result: SavedQuery, success: boolean }
  return data.result
}

export const deleteSavedQuery = async (id: number): Promise<void> => {
  const response = await fetch(`${WORKER_API}/api/saved-queries/${id}`, {
    method: 'DELETE',
    credentials: 'include'
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to delete query: ${response.status}`)
  }
}

