// Cloudflare Workers types are provided by @cloudflare/workers-types
// Custom extensions only below

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

// Undo history types
export interface UndoHistoryEntry {
  id: number;
  database_id: string;
  operation_type: 'DROP_TABLE' | 'DROP_COLUMN' | 'DELETE_ROW';
  target_table: string;
  target_column?: string;
  description: string;
  snapshot_data: string;
  executed_at: string;
  user_email?: string;
}

export interface UndoSnapshot {
  operation_type: 'DROP_TABLE' | 'DROP_COLUMN' | 'DELETE_ROW';
  tableSchema?: {
    createStatement: string;
    indexes: string[];
    data: Record<string, unknown>[];
  };
  columnData?: {
    columnName: string;
    columnType: string;
    notNull: boolean;
    defaultValue: string | null;
    position: number;
    rowData: Record<string, unknown>[];
  };
  rowData?: {
    whereClause: string;
    rows: Record<string, unknown>[];
  };
}

// Constraint validation types
export interface ConstraintViolation {
  id: string;
  type: 'foreign_key' | 'not_null' | 'unique';
  severity: 'critical' | 'warning' | 'info';
  table: string;
  column?: string;
  affectedRows: number;
  details: string;
  fixable: boolean;
  fixStrategies?: Array<'delete' | 'set_null' | 'manual'>;
  metadata?: {
    parentTable?: string;
    parentColumn?: string;
    fkId?: number;
    duplicateValue?: string;
  };
}

export interface ValidationReport {
  database: string;
  timestamp: string;
  totalViolations: number;
  violationsByType: {
    foreign_key: number;
    not_null: number;
    unique: number;
  };
  violations: ConstraintViolation[];
  isHealthy: boolean;
}

export interface FixResult {
  violationId: string;
  success: boolean;
  rowsAffected: number;
  error?: string;
}

// Index Analyzer types
export interface IndexRecommendation {
  tableName: string;
  columnName: string;
  indexType: 'single' | 'composite';
  compositeColumns?: string[];
  priority: 'high' | 'medium' | 'low';
  rationale: string;
  estimatedImpact: string;
  suggestedSQL: string;
}

export interface IndexAnalysisResult {
  recommendations: IndexRecommendation[];
  existingIndexes: Array<{
    tableName: string;
    indexes: Array<{
      name: string;
      columns: string[];
      unique: boolean;
    }>;
  }>;
  statistics: {
    totalRecommendations: number;
    tablesWithoutIndexes: number;
    averageQueryEfficiency?: number;
  };
}

