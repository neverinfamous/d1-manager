/**
 * SQL Context Parser for autocomplete
 * Analyzes SQL text and cursor position to determine what type of suggestions to show
 */

import { TABLE_CONTEXT_KEYWORDS, COLUMN_CONTEXT_KEYWORDS } from "./sqlKeywords";

/** Type of suggestion to show */
export type SuggestionType = "keyword" | "table" | "column";

/** Result of parsing SQL context */
export interface SqlContext {
  /** Type of suggestion to show */
  type: SuggestionType;
  /** The current word being typed (for filtering) */
  currentWord: string;
  /** Start position of the current word in the text */
  wordStart: number;
  /** If suggesting columns, which table(s) to suggest from */
  tableNames: string[];
  /** If suggesting columns after a dot (e.g., users.na), the specific table */
  dotTable: string | null;
}

/**
 * Characters that delimit words in SQL
 */
const WORD_DELIMITERS = new Set([
  " ",
  "\t",
  "\n",
  "\r",
  "(",
  ")",
  ",",
  ";",
  "=",
  "<",
  ">",
  "!",
  "+",
  "-",
  "*",
  "/",
  "'",
  '"',
  "`",
]);

/**
 * Get the word being typed at the cursor position
 */
function getCurrentWord(
  sql: string,
  cursorPos: number,
): { word: string; start: number } {
  let start = cursorPos;

  // Walk backwards to find word start
  while (start > 0) {
    const char = sql[start - 1];
    if (!char || WORD_DELIMITERS.has(char)) {
      // Check for dot notation (table.column)
      if (char === ".") {
        // Include the dot and table name
        start--;
        const prevChar = sql[start - 1];
        while (
          start > 0 &&
          prevChar !== undefined &&
          !WORD_DELIMITERS.has(prevChar)
        ) {
          start--;
        }
      }
      break;
    }
    start--;
  }

  return {
    word: sql.slice(start, cursorPos),
    start,
  };
}

/**
 * Get the previous keyword before the current position
 */
function getPreviousKeyword(sql: string, pos: number): string | null {
  // Skip current word
  while (pos > 0) {
    const prevChar = sql[pos - 1];
    if (prevChar === undefined || WORD_DELIMITERS.has(prevChar)) break;
    pos--;
  }

  // Skip whitespace
  while (pos > 0) {
    const prevChar = sql[pos - 1];
    if (prevChar === undefined || !/\s/.test(prevChar)) break;
    pos--;
  }

  // Find the previous word
  const end = pos;
  while (pos > 0) {
    const prevChar = sql[pos - 1];
    if (prevChar === undefined || WORD_DELIMITERS.has(prevChar)) break;
    pos--;
  }

  if (pos === end) return null;

  return sql.slice(pos, end).toUpperCase();
}

/**
 * Extract table names referenced in a SQL query
 * Looks for tables after FROM, JOIN, UPDATE, INTO, etc.
 */
export function extractTablesFromQuery(sql: string): string[] {
  const tables: string[] = [];

  // Patterns to find table references
  const patterns = [
    /\bFROM\s+(\w+)/gi,
    /\bJOIN\s+(\w+)/gi,
    /\bINTO\s+(\w+)/gi,
    /\bUPDATE\s+(\w+)/gi,
    /\bTABLE\s+(\w+)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    // Reset lastIndex for each pattern
    pattern.lastIndex = 0;
    while ((match = pattern.exec(sql)) !== null) {
      const tableName = match[1];
      if (tableName && !tables.includes(tableName)) {
        // Don't include SQL keywords that might be caught
        if (!isKeyword(tableName.toUpperCase())) {
          tables.push(tableName);
        }
      }
    }
  }

  // Also look for table aliases (e.g., "FROM users u" or "FROM users AS u")
  const aliasPattern = /\b(?:FROM|JOIN)\s+(\w+)\s+(?:AS\s+)?(\w+)/gi;
  let aliasMatch;
  while ((aliasMatch = aliasPattern.exec(sql)) !== null) {
    const tableName = aliasMatch[1];
    if (
      tableName &&
      !tables.includes(tableName) &&
      !isKeyword(tableName.toUpperCase())
    ) {
      tables.push(tableName);
    }
  }

  return tables;
}

/**
 * Check if a word is a SQL keyword
 */
function isKeyword(word: string): boolean {
  const keywords = new Set([
    "SELECT",
    "FROM",
    "WHERE",
    "JOIN",
    "ON",
    "AND",
    "OR",
    "AS",
    "LEFT",
    "RIGHT",
    "INNER",
    "OUTER",
    "CROSS",
    "NATURAL",
    "ORDER",
    "BY",
    "GROUP",
    "HAVING",
    "LIMIT",
    "OFFSET",
    "INSERT",
    "UPDATE",
    "DELETE",
    "INTO",
    "VALUES",
    "SET",
    "CREATE",
    "DROP",
    "ALTER",
    "TABLE",
    "INDEX",
    "VIEW",
  ]);
  return keywords.has(word);
}

/**
 * Check if cursor is inside a string literal
 */
function isInsideString(sql: string, cursorPos: number): boolean {
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < cursorPos; i++) {
    const char = sql[i];
    const prevChar = i > 0 ? sql[i - 1] : "";

    if (char === "'" && prevChar !== "\\") {
      inSingleQuote = !inSingleQuote;
    } else if (char === '"' && prevChar !== "\\") {
      inDoubleQuote = !inDoubleQuote;
    }
  }

  return inSingleQuote || inDoubleQuote;
}

/**
 * Parse SQL context at cursor position
 * Returns what type of suggestions should be shown
 */
export function parseContext(sql: string, cursorPos: number): SqlContext {
  // Don't suggest inside string literals
  if (isInsideString(sql, cursorPos)) {
    return {
      type: "keyword",
      currentWord: "",
      wordStart: cursorPos,
      tableNames: [],
      dotTable: null,
    };
  }

  const { word, start } = getCurrentWord(sql, cursorPos);
  const currentWord = word;

  // Check for dot notation (table.column)
  if (currentWord.includes(".")) {
    const dotIndex = currentWord.indexOf(".");
    const tableName = currentWord.slice(0, dotIndex);
    const columnPrefix = currentWord.slice(dotIndex + 1);

    return {
      type: "column",
      currentWord: columnPrefix,
      wordStart: start + dotIndex + 1,
      tableNames: [tableName],
      dotTable: tableName,
    };
  }

  // Get the previous keyword to determine context
  const prevKeyword = getPreviousKeyword(sql, start);

  // After table context keywords, suggest tables
  if (prevKeyword && TABLE_CONTEXT_KEYWORDS.has(prevKeyword)) {
    return {
      type: "table",
      currentWord,
      wordStart: start,
      tableNames: [],
      dotTable: null,
    };
  }

  // Extract tables from the ENTIRE query (not just before cursor)
  // This allows column suggestions even when typing SELECT before FROM
  const allTables = extractTablesFromQuery(sql);

  // After column context keywords, suggest columns
  if (prevKeyword && COLUMN_CONTEXT_KEYWORDS.has(prevKeyword)) {
    return {
      type: "column",
      currentWord,
      wordStart: start,
      tableNames: allTables,
      dotTable: null,
    };
  }

  // Check if we're in the SELECT clause (before FROM or after SELECT)
  const beforeCursor = sql.slice(0, start).toUpperCase();
  const lastSelect = beforeCursor.lastIndexOf("SELECT");
  const lastFrom = beforeCursor.lastIndexOf("FROM");
  const lastWhere = beforeCursor.lastIndexOf("WHERE");

  // If SELECT is more recent than FROM, we're in the SELECT clause
  if (lastSelect > lastFrom && lastSelect > lastWhere && lastSelect >= 0) {
    if (allTables.length > 0) {
      return {
        type: "column",
        currentWord,
        wordStart: start,
        tableNames: allTables,
        dotTable: null,
      };
    }
  }

  // Check if we're after ORDER BY or GROUP BY
  const lastOrderBy = beforeCursor.lastIndexOf("ORDER BY");
  const lastGroupBy = beforeCursor.lastIndexOf("GROUP BY");
  if (
    (lastOrderBy > lastFrom && lastOrderBy > lastSelect) ||
    (lastGroupBy > lastFrom && lastGroupBy > lastSelect)
  ) {
    if (allTables.length > 0) {
      return {
        type: "column",
        currentWord,
        wordStart: start,
        tableNames: allTables,
        dotTable: null,
      };
    }
  }

  // Default to keyword suggestions
  return {
    type: "keyword",
    currentWord,
    wordStart: start,
    tableNames: allTables,
    dotTable: null,
  };
}

/**
 * Filter suggestions based on current word prefix
 */
export function filterSuggestions(
  suggestions: string[],
  prefix: string,
  maxResults = 10,
): string[] {
  if (!prefix) {
    return suggestions.slice(0, maxResults);
  }

  const lowerPrefix = prefix.toLowerCase();

  // First, get exact prefix matches
  const prefixMatches = suggestions.filter((s) =>
    s.toLowerCase().startsWith(lowerPrefix),
  );

  // Then, get contains matches (excluding prefix matches)
  const containsMatches = suggestions.filter((s) => {
    const lower = s.toLowerCase();
    return !lower.startsWith(lowerPrefix) && lower.includes(lowerPrefix);
  });

  // Combine, preferring prefix matches
  return [...prefixMatches, ...containsMatches].slice(0, maxResults);
}
