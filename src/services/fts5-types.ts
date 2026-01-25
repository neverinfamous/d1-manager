/**
 * FTS5 Frontend Type Definitions
 *
 * Type definitions for FTS5 features in the frontend application.
 * Mirrors backend types with additional UI-specific types.
 */

export type TokenizerType = "unicode61" | "porter" | "trigram" | "ascii";

export interface TokenizerParameters {
  // Unicode61 options
  remove_diacritics?: number; // 0, 1, or 2 (default: 1)
  categories?: string; // Space-separated list of Unicode categories
  tokenchars?: string; // Additional characters to consider as tokens
  separators?: string; // Characters to treat as separators

  // Porter stemmer options (inherits from unicode61)
  // No additional options beyond unicode61

  // Trigram options
  case_sensitive?: number; // 0 or 1 (default: 0)
}

export interface TokenizerConfig {
  type: TokenizerType;
  parameters?: TokenizerParameters;
}

export interface PrefixIndexConfig {
  enabled: boolean;
  lengths?: number[]; // e.g., [2, 3, 4] for prefix lengths
}

export interface ColumnWeight {
  column: string;
  weight: number; // Multiplier for ranking (default: 1.0)
}

export interface FTS5TableConfig {
  tableName: string;
  columns: string[]; // Content columns to index
  tokenizer: TokenizerConfig;
  prefixIndex?: PrefixIndexConfig;
  columnWeights?: ColumnWeight[];
  contentTable?: string; // External content table (for external content FTS5)
  contentRowId?: string; // ROWID column name in content table
  unindexed?: string[]; // Columns to store but not index
}

export interface FTS5TableInfo {
  name: string;
  type: "fts5";
  columns: string[];
  tokenizer: TokenizerConfig;
  contentTable?: string;
  rowCount: number;
  indexSize?: number; // Size in bytes
  prefixIndex?: PrefixIndexConfig;
}

export interface FTS5SearchParams {
  query: string; // FTS5 MATCH query
  columns?: string[]; // Search in specific columns only
  limit?: number;
  offset?: number;
  rankingFunction?: "bm25" | "bm25custom";
  // BM25 parameters (only for bm25custom)
  bm25_k1?: number; // Term frequency saturation (default: 1.2)
  bm25_b?: number; // Length normalization (default: 0.75)
  includeSnippet?: boolean;
  snippetOptions?: {
    startMark?: string; // Default: '<mark>'
    endMark?: string; // Default: '</mark>'
    ellipsis?: string; // Default: '...'
    tokenCount?: number; // Tokens per snippet (default: 32)
  };
}

export interface FTS5SearchResult {
  row: Record<string, unknown>;
  rank: number;
  snippet?: string; // HTML snippet with highlights
}

export interface FTS5SearchResponse {
  results: FTS5SearchResult[];
  total: number;
  executionTime: number; // milliseconds
  meta?: {
    rowsScanned?: number;
    tokenizerUsed?: string;
  };
}

export interface FTS5Stats {
  tableName: string;
  rowCount: number;
  indexSize: number; // bytes
  averageRowSize: number; // bytes
  lastOptimize?: string; // timestamp
  fragmentation?: number; // percentage (0-100)
}

export interface FTS5CreateFromTableParams {
  sourceTable: string;
  ftsTableName: string;
  columns: string[]; // Columns to index
  tokenizer: TokenizerConfig;
  prefixIndex?: PrefixIndexConfig;
  externalContent?: boolean; // If true, use source as content table
  createTriggers?: boolean; // Auto-sync triggers (for external content)
}

// UI-specific types

export interface TokenizerPreset {
  type: TokenizerType;
  label: string;
  description: string;
  defaultParameters?: TokenizerParameters;
}

export const TOKENIZER_PRESETS: TokenizerPreset[] = [
  {
    type: "unicode61",
    label: "Unicode61 (Default)",
    description:
      "Unicode-aware tokenization with diacritic handling. Best for international text.",
    defaultParameters: {
      remove_diacritics: 1,
    },
  },
  {
    type: "porter",
    label: "Porter Stemmer",
    description:
      'English word stemming (e.g., "running" → "run"). Best for English text search.',
    defaultParameters: {
      remove_diacritics: 1,
    },
  },
  {
    type: "trigram",
    label: "Trigram",
    description:
      "Character n-gram tokenization. Best for fuzzy/substring matching and CJK languages.",
    defaultParameters: {
      case_sensitive: 0,
    },
  },
  {
    type: "ascii",
    label: "ASCII",
    description:
      "Simple ASCII-only tokenization. Fastest but limited to ASCII characters.",
  },
];

export interface FTS5FormState {
  tableName: string;
  selectedColumns: string[];
  tokenizer: TokenizerConfig;
  prefixIndexEnabled: boolean;
  prefixLengths: string; // Comma-separated numbers
  contentTable?: string;
  externalContent: boolean;
  createTriggers: boolean;
  showAdvancedTokenizer: boolean;
}

export interface SearchFormState {
  query: string;
  selectedColumns: string[];
  limit: number;
  rankingFunction: "bm25" | "bm25custom";
  bm25_k1: number;
  bm25_b: number;
  includeSnippet: boolean;
  snippetTokenCount: number;
}

// Validation helper types

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Search operator helpers

export interface SearchOperator {
  label: string;
  value: string;
  description: string;
  example: string;
}

export const SEARCH_OPERATORS: SearchOperator[] = [
  {
    label: "AND",
    value: "AND",
    description: "Both terms must appear",
    example: "apple AND orange",
  },
  {
    label: "OR",
    value: "OR",
    description: "Either term can appear",
    example: "apple OR orange",
  },
  {
    label: "NOT",
    value: "NOT",
    description: "Exclude term",
    example: "apple NOT orange",
  },
  {
    label: "NEAR",
    value: "NEAR",
    description: "Terms within 10 tokens",
    example: "apple NEAR orange",
  },
  {
    label: "Phrase",
    value: '""',
    description: "Exact phrase match",
    example: '"red apple"',
  },
  {
    label: "Prefix",
    value: "*",
    description: "Prefix wildcard",
    example: "appl*",
  },
  {
    label: "Column",
    value: "{column}:",
    description: "Search in specific column",
    example: "{title}: apple",
  },
];
