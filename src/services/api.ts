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
    offset: number = 0
  ): Promise<QueryResult<T>> {
    const response = await fetch(
      `${WORKER_API}/api/tables/${databaseId}/data/${encodeURIComponent(tableName)}?limit=${limit}&offset=${offset}`,
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
export const getTableData = <T = Record<string, unknown>>(databaseId: string, tableName: string, limit?: number, offset?: number) => 
  api.getTableData<T>(databaseId, tableName, limit, offset)
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

