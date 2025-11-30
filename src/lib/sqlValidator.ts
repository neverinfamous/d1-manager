/**
 * SQL syntax validation utilities
 * Provides real-time validation feedback for SQL queries
 */

/**
 * Result of SQL validation
 */
export interface SqlValidationResult {
  /** Whether the SQL is syntactically valid */
  isValid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Position of the error (character index) */
  errorPosition?: number;
}

/**
 * Check for unmatched parentheses
 */
function checkParentheses(sql: string): SqlValidationResult {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let lastOpenPos = -1;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const prevChar = i > 0 ? sql[i - 1] : '';

    // Handle escape sequences
    if (prevChar === '\\') continue;

    // Track string literals
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    // Only count parentheses outside of strings
    if (!inSingleQuote && !inDoubleQuote) {
      if (char === '(') {
        if (depth === 0) lastOpenPos = i;
        depth++;
      } else if (char === ')') {
        depth--;
        if (depth < 0) {
          return {
            isValid: false,
            error: 'Unexpected closing parenthesis',
            errorPosition: i,
          };
        }
      }
    }
  }

  if (depth > 0) {
    return {
      isValid: false,
      error: `Unclosed parenthesis (${depth} opening without closing)`,
      errorPosition: lastOpenPos,
    };
  }

  return { isValid: true };
}

/**
 * Check for unclosed string literals
 */
function checkStringLiterals(sql: string): SqlValidationResult {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let singleQuoteStart = -1;
  let doubleQuoteStart = -1;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const prevChar = i > 0 ? sql[i - 1] : '';

    // Handle escape sequences
    if (prevChar === '\\') continue;

    // Handle doubled quotes as escape (SQL standard)
    if (char === "'" && !inDoubleQuote) {
      // Check for escaped quote ''
      if (inSingleQuote && i + 1 < sql.length && sql[i + 1] === "'") {
        i++; // Skip the next quote
        continue;
      }
      if (!inSingleQuote) {
        singleQuoteStart = i;
      }
      inSingleQuote = !inSingleQuote;
    } else if (char === '"' && !inSingleQuote) {
      // Check for escaped quote ""
      if (inDoubleQuote && i + 1 < sql.length && sql[i + 1] === '"') {
        i++; // Skip the next quote
        continue;
      }
      if (!inDoubleQuote) {
        doubleQuoteStart = i;
      }
      inDoubleQuote = !inDoubleQuote;
    }
  }

  if (inSingleQuote) {
    return {
      isValid: false,
      error: 'Unclosed single quote',
      errorPosition: singleQuoteStart,
    };
  }

  if (inDoubleQuote) {
    return {
      isValid: false,
      error: 'Unclosed double quote',
      errorPosition: doubleQuoteStart,
    };
  }

  return { isValid: true };
}

/**
 * Check for basic SQL structure issues
 */
function checkBasicStructure(sql: string): SqlValidationResult {
  const trimmed = sql.trim();
  
  // Empty query is valid (user might still be typing)
  if (!trimmed) {
    return { isValid: true };
  }

  // Common incomplete patterns (using case-insensitive regex)
  const incompletePatterns = [
    { pattern: /^SELECT\s*$/i, error: 'SELECT requires column list or *' },
    { pattern: /^SELECT\s+.+\s+FROM\s*$/i, error: 'FROM requires table name' },
    { pattern: /^INSERT\s+INTO\s*$/i, error: 'INSERT INTO requires table name' },
    { pattern: /^INSERT\s+INTO\s+\w+\s*$/i, error: 'INSERT requires VALUES or column list' },
    { pattern: /^UPDATE\s*$/i, error: 'UPDATE requires table name' },
    { pattern: /^UPDATE\s+\w+\s*$/i, error: 'UPDATE requires SET clause' },
    { pattern: /^UPDATE\s+\w+\s+SET\s*$/i, error: 'SET requires column assignments' },
    { pattern: /^DELETE\s*$/i, error: 'DELETE requires FROM clause' },
    { pattern: /^DELETE\s+FROM\s*$/i, error: 'DELETE FROM requires table name' },
    { pattern: /^CREATE\s*$/i, error: 'CREATE requires TABLE, INDEX, or other object type' },
    { pattern: /^CREATE\s+TABLE\s*$/i, error: 'CREATE TABLE requires table name' },
    { pattern: /^DROP\s*$/i, error: 'DROP requires TABLE, INDEX, or other object type' },
    { pattern: /^DROP\s+TABLE\s*$/i, error: 'DROP TABLE requires table name' },
    { pattern: /^ALTER\s*$/i, error: 'ALTER requires TABLE or other object type' },
    { pattern: /^ALTER\s+TABLE\s*$/i, error: 'ALTER TABLE requires table name' },
    { pattern: /WHERE\s*$/i, error: 'WHERE requires a condition' },
    { pattern: /AND\s*$/i, error: 'AND requires a condition' },
    { pattern: /OR\s*$/i, error: 'OR requires a condition' },
    { pattern: /ORDER\s+BY\s*$/i, error: 'ORDER BY requires column name' },
    { pattern: /GROUP\s+BY\s*$/i, error: 'GROUP BY requires column name' },
    { pattern: /JOIN\s*$/i, error: 'JOIN requires table name' },
    { pattern: /ON\s*$/i, error: 'ON requires join condition' },
    { pattern: /=\s*$/i, error: 'Comparison operator requires a value' },
    { pattern: /!=\s*$/i, error: 'Comparison operator requires a value' },
    { pattern: /<>\s*$/i, error: 'Comparison operator requires a value' },
    { pattern: />\s*$/i, error: 'Comparison operator requires a value' },
    { pattern: /<\s*$/i, error: 'Comparison operator requires a value' },
    { pattern: />=\s*$/i, error: 'Comparison operator requires a value' },
    { pattern: /<=\s*$/i, error: 'Comparison operator requires a value' },
    { pattern: /LIKE\s*$/i, error: 'LIKE requires a pattern' },
    { pattern: /IN\s*$/i, error: 'IN requires a value list' },
    { pattern: /BETWEEN\s*$/i, error: 'BETWEEN requires a range' },
    { pattern: /VALUES\s*$/i, error: 'VALUES requires a value list' },
    { pattern: /SET\s*$/i, error: 'SET requires column assignments' },
  ];

  for (const { pattern, error } of incompletePatterns) {
    if (pattern.test(trimmed)) {
      return {
        isValid: false,
        error,
        errorPosition: trimmed.length - 1,
      };
    }
  }

  // Check for trailing comma (common mistake)
  if (/,\s*$/.test(trimmed) && !trimmed.endsWith('(')) {
    return {
      isValid: false,
      error: 'Unexpected trailing comma',
      errorPosition: trimmed.lastIndexOf(','),
    };
  }

  return { isValid: true };
}

/**
 * Validate SQL query syntax
 * Returns validation result with error details if invalid
 */
export function validateSql(sql: string): SqlValidationResult {
  // Check string literals first (affects parentheses parsing)
  const stringCheck = checkStringLiterals(sql);
  if (!stringCheck.isValid) {
    return stringCheck;
  }

  // Check parentheses balance
  const parenCheck = checkParentheses(sql);
  if (!parenCheck.isValid) {
    return parenCheck;
  }

  // Check basic structure
  const structureCheck = checkBasicStructure(sql);
  if (!structureCheck.isValid) {
    return structureCheck;
  }

  return { isValid: true };
}

