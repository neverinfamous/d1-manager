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

