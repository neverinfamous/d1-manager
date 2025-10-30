// Cloudflare Workers types
declare global {
  interface D1Database {
    prepare(query: string): D1PreparedStatement;
    dump(): Promise<ArrayBuffer>;
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
    exec(query: string): Promise<D1ExecResult>;
  }

  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = unknown>(colName?: string): Promise<T | null>;
    run<T = unknown>(): Promise<D1Result<T>>;
    all<T = unknown>(): Promise<D1Result<T>>;
    raw<T = unknown>(): Promise<T[]>;
  }

  interface D1Result<T = unknown> {
    results: T[];
    success: boolean;
    meta: {
      served_by?: string;
      duration?: number;
      changes?: number;
      last_row_id?: number;
      changed_db?: boolean;
      size_after?: number;
      rows_read?: number;
      rows_written?: number;
    };
  }

  interface D1ExecResult {
    count: number;
    duration: number;
  }

  interface Fetcher {
    fetch(request: Request | string): Promise<Response>;
  }

  interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
  }
}

export interface Env {
  ASSETS: Fetcher
  METADATA: D1Database
  CF_EMAIL: string
  API_KEY: string
  ACCOUNT_ID: string
  TEAM_DOMAIN: string
  POLICY_AUD: string
}

export const CF_API = 'https://api.cloudflare.com/client/v4';

// D1 Database types from Cloudflare REST API
export interface D1DatabaseInfo {
  uuid: string;
  name: string;
  version: string;
  created_at: string;
  file_size?: number;
  num_tables?: number;
}

// Table schema types
export interface TableInfo {
  name: string;
  type: 'table' | 'view' | 'shadow' | 'virtual';
  ncol: number;
  wr: number;
  strict: number;
}

export interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

export interface IndexInfo {
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

// Query history types
export interface QueryHistoryEntry {
  id: number;
  database_id: string;
  query: string;
  executed_at: string;
  duration_ms?: number;
  rows_affected?: number;
  error?: string;
}

// Saved query types
export interface SavedQuery {
  id: number;
  name: string;
  description?: string;
  database_id?: string;
  query: string;
  created_at: string;
  updated_at: string;
}

