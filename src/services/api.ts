const WORKER_API = import.meta.env.VITE_WORKER_API || window.location.origin

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
}

// Read replication types
export type ReadReplicationMode = 'auto' | 'disabled'

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
  private async handleResponse(response: Response): Promise<Response> {
    // Check for authentication errors
    if (response.status === 401 || response.status === 403) {
      console.error('[API] Authentication error:', response.status);
      // Clear any cached data
      localStorage.clear();
      sessionStorage.clear();
      
      // Throw error with status to trigger logout in app
      throw new Error(`Authentication error: ${response.status}`);
    }
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    return response;
  }

  /**
   * List all D1 databases
   */
  async listDatabases(): Promise<D1Database[]> {
    const response = await fetch(`${WORKER_API}/api/databases`, 
      this.getFetchOptions()
    )
    
    await this.handleResponse(response);
    
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
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error || error.message || `Failed to set read replication: ${response.statusText}`)
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
  ): Promise<{ skipped?: Array<{ databaseId: string; name: string; reason: string; details?: string[] }> }> {
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
        result: { [key: string]: string }
        skipped?: Array<{ databaseId: string; name: string; reason: string; details?: string[] }>
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
        if (exports[db.uuid]) {
          zip.file(`${db.name}.sql`, exports[db.uuid])
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
      
      return { skipped: data.skipped }
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
        const error = await response.json().catch(() => ({ error: 'Unknown error' }))
        // Use details field if available (e.g., for FTS5 errors), otherwise use error field
        const errorMessage = error.details || error.error || error.message || `Rename failed: ${response.statusText}`
        throw new Error(errorMessage)
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
   * Get foreign keys for a specific table
   */
  async getTableForeignKeys(
    databaseId: string,
    tableName: string
  ): Promise<Array<{
    column: string;
    refTable: string;
    refColumn: string;
    onDelete: string | null;
    onUpdate: string | null;
  }>> {
    const response = await fetch(
      `${WORKER_API}/api/tables/${databaseId}/foreign-keys/${encodeURIComponent(tableName)}`,
      { credentials: 'include' }
    )
    
    if (!response.ok) {
      throw new Error(`Failed to get table foreign keys: ${response.statusText}`)
    }
    
    const data = await response.json()
    return data.result?.foreignKeys || []
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
export const getTableForeignKeys = (databaseId: string, tableName: string) => api.getTableForeignKeys(databaseId, tableName)
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

// Undo/Rollback API
export const getUndoHistory = async (databaseId: string): Promise<UndoHistoryEntry[]> => {
  const response = await fetch(`${WORKER_API}/api/undo/${databaseId}/history`, {
    credentials: 'include'
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to get undo history: ${response.status}`)
  }
  
  const data = await response.json() as { history: UndoHistoryEntry[], success: boolean }
  return data.history
}

export const restoreUndo = async (databaseId: string, undoId: number): Promise<string> => {
  const response = await fetch(`${WORKER_API}/api/undo/${databaseId}/restore/${undoId}`, {
    method: 'POST',
    credentials: 'include'
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error', details: '' }))
    throw new Error(error.details || error.error || `Failed to restore: ${response.status}`)
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
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to clear undo history: ${response.status}`)
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
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to delete rows: ${response.status}`)
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

// Cascade Impact Simulation API
export const simulateCascadeImpact = async (
  databaseId: string,
  targetTable: string,
  whereClause?: string
): Promise<CascadeSimulationResult> => {
  const response = await fetch(`${WORKER_API}/api/tables/${databaseId}/simulate-cascade`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({ targetTable, whereClause })
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to simulate cascade: ${response.status}`)
  }
  
  const data = await response.json() as { result: CascadeSimulationResult, success: boolean }
  return data.result
}

// Foreign key graph data types
export interface ForeignKeyGraphNode {
  id: string
  label: string
  columns: Array<{name: string; type: string; isPK: boolean}>
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

/**
 * Get all foreign keys for a database
 */
export const getAllForeignKeys = async (databaseId: string): Promise<ForeignKeyGraph> => {
  const response = await fetch(`${WORKER_API}/api/tables/${databaseId}/foreign-keys`, {
    method: 'GET',
    credentials: 'include'
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to get foreign keys: ${response.status}`)
  }
  
  const data = await response.json() as { result: ForeignKeyGraph, success: boolean }
  return data.result
}

/**
 * Get circular dependencies in a database
 */
export const getCircularDependencies = async (databaseId: string): Promise<CircularDependencyCycle[]> => {
  const response = await fetch(`${WORKER_API}/api/tables/${databaseId}/circular-dependencies`, {
    method: 'GET',
    credentials: 'include'
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to get circular dependencies: ${response.status}`)
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
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to simulate foreign key: ${response.status}`)
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
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to add foreign key: ${response.status}`)
  }
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
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to modify foreign key: ${response.status}`)
  }
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
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to delete foreign key: ${response.status}`)
  }
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
 * List all FTS5 tables in a database
 */
export const listFTS5Tables = async (databaseId: string): Promise<FTS5TableInfo[]> => {
  const response = await fetch(`${WORKER_API}/api/fts5/${databaseId}/list`, {
    method: 'GET',
    credentials: 'include'
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to list FTS5 tables: ${response.status}`)
  }
  
  const data = await response.json() as { result: FTS5TableInfo[], success: boolean }
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
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to create FTS5 table: ${response.status}`)
  }
  
  const data = await response.json() as { result: { tableName: string; created: boolean }, success: boolean }
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
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to create FTS5 from table: ${response.status}`)
  }
  
  const data = await response.json() as { 
    result: { ftsTableName: string; created: boolean; triggersCreated: boolean }, 
    success: boolean 
  }
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
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to get FTS5 config: ${response.status}`)
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
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to delete FTS5 table: ${response.status}`)
  }
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
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to rebuild FTS5 index: ${response.status}`)
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
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to optimize FTS5 index: ${response.status}`)
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
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to search FTS5 table: ${response.status}`)
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
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to get FTS5 stats: ${response.status}`)
  }
  
  const data = await response.json() as { result: FTS5Stats, success: boolean }
  return data.result
}

// Constraint validation types
export interface ConstraintViolation {
  id: string
  type: 'foreign_key' | 'not_null' | 'unique'
  severity: 'critical' | 'warning' | 'info'
  table: string
  column?: string
  affectedRows: number
  details: string
  fixable: boolean
  fixStrategies?: Array<'delete' | 'set_null' | 'manual'>
  metadata?: {
    parentTable?: string
    parentColumn?: string
    fkId?: number
    duplicateValue?: string
  }
}

export interface ValidationReport {
  database: string
  timestamp: string
  totalViolations: number
  violationsByType: {
    foreign_key: number
    not_null: number
    unique: number
  }
  violations: ConstraintViolation[]
  isHealthy: boolean
}

export interface FixResult {
  violationId: string
  success: boolean
  rowsAffected: number
  error?: string
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
  existingIndexes: Array<{
    tableName: string
    indexes: Array<{
      name: string
      columns: string[]
      unique: boolean
    }>
  }>
  statistics: {
    totalRecommendations: number
    tablesWithoutIndexes: number
    averageQueryEfficiency?: number
  }
}

/**
 * Validate all constraints in a database
 */
export const validateConstraints = async (databaseId: string): Promise<ValidationReport> => {
  const response = await fetch(`${WORKER_API}/api/constraints/${databaseId}/validate`, {
    method: 'POST',
    credentials: 'include'
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to validate constraints: ${response.status}`)
  }
  
  const data = await response.json() as { result: ValidationReport, success: boolean }
  return data.result
}

/**
 * Validate constraints for a specific table
 */
export const validateTableConstraints = async (
  databaseId: string,
  tableName: string
): Promise<ValidationReport> => {
  const response = await fetch(`${WORKER_API}/api/constraints/${databaseId}/validate-table`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({ tableName })
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to validate table constraints: ${response.status}`)
  }
  
  const data = await response.json() as { result: ValidationReport, success: boolean }
  return data.result
}

/**
 * Apply fixes to constraint violations
 */
export const fixViolations = async (
  databaseId: string,
  violations: string[],
  fixStrategy: 'delete' | 'set_null'
): Promise<FixResult[]> => {
  const response = await fetch(`${WORKER_API}/api/constraints/${databaseId}/fix`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({ violations, fixStrategy })
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to fix violations: ${response.status}`)
  }
  
  const data = await response.json() as { result: FixResult[], success: boolean }
  return data.result
}

/**
 * Analyze indexes and get recommendations
 */
export const analyzeIndexes = async (databaseId: string): Promise<IndexAnalysisResult> => {
  const response = await fetch(`${WORKER_API}/api/indexes/${databaseId}/analyze`, {
    method: 'GET',
    credentials: 'include'
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to analyze indexes: ${response.status}`)
  }
  
  const data = await response.json() as IndexAnalysisResult & { success: boolean }
  return {
    recommendations: data.recommendations,
    existingIndexes: data.existingIndexes,
    statistics: data.statistics
  }
}

/**
 * Create an index using the suggested SQL
 */
export const createIndex = async (databaseId: string, sql: string): Promise<void> => {
  const response = await fetch(`${WORKER_API}/api/query/${databaseId}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({ query: sql, skipValidation: true })
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to create index: ${response.status}`)
  }
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
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to get job list: ${response.status}`)
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
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to get job events: ${response.status}`)
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
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to get job status: ${response.status}`)
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
 * Get current bookmark for a database
 * Bookmarks represent the current state of the database for Time Travel
 */
export const getCurrentBookmark = async (databaseId: string): Promise<BookmarkInfo> => {
  const response = await fetch(
    `${WORKER_API}/api/time-travel/${databaseId}/bookmark`,
    {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    }
  )
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to get bookmark: ${response.status}`)
  }
  
  const data = await response.json() as { result: BookmarkInfo, success: boolean }
  return data.result
}

/**
 * Get bookmark history for a database
 * Shows saved checkpoints from before destructive operations
 */
export const getBookmarkHistory = async (
  databaseId: string,
  limit?: number
): Promise<BookmarkHistoryEntry[]> => {
  const params = new URLSearchParams()
  if (limit) params.set('limit', limit.toString())
  
  const url = `${WORKER_API}/api/time-travel/${databaseId}/history${params.toString() ? `?${params.toString()}` : ''}`
  
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store'
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to get bookmark history: ${response.status}`)
  }
  
  const data = await response.json() as BookmarkHistoryResponse
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
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to capture bookmark: ${response.status}`)
  }
  
  const data = await response.json() as { result: BookmarkInfo, success: boolean }
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
    `${WORKER_API}/api/time-travel/${databaseId}/history/${bookmarkId}`,
    {
      method: 'DELETE',
      credentials: 'include'
    }
  )
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to delete bookmark: ${response.status}`)
  }
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

