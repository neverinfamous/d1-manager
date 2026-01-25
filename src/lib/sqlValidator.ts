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
 * Result of identifier validation
 */
export interface IdentifierValidationResult {
  isValid: boolean;
  error?: string;
  suggestion?: string;
}

/**
 * SQLite reserved words that cannot be used as unquoted identifiers
 */
const SQLITE_RESERVED_WORDS = new Set([
  "ABORT",
  "ACTION",
  "ADD",
  "AFTER",
  "ALL",
  "ALTER",
  "ALWAYS",
  "ANALYZE",
  "AND",
  "AS",
  "ASC",
  "ATTACH",
  "AUTOINCREMENT",
  "BEFORE",
  "BEGIN",
  "BETWEEN",
  "BY",
  "CASCADE",
  "CASE",
  "CAST",
  "CHECK",
  "COLLATE",
  "COLUMN",
  "COMMIT",
  "CONFLICT",
  "CONSTRAINT",
  "CREATE",
  "CROSS",
  "CURRENT",
  "CURRENT_DATE",
  "CURRENT_TIME",
  "CURRENT_TIMESTAMP",
  "DATABASE",
  "DEFAULT",
  "DEFERRABLE",
  "DEFERRED",
  "DELETE",
  "DESC",
  "DETACH",
  "DISTINCT",
  "DO",
  "DROP",
  "EACH",
  "ELSE",
  "END",
  "ESCAPE",
  "EXCEPT",
  "EXCLUDE",
  "EXCLUSIVE",
  "EXISTS",
  "EXPLAIN",
  "FAIL",
  "FILTER",
  "FIRST",
  "FOLLOWING",
  "FOR",
  "FOREIGN",
  "FROM",
  "FULL",
  "GENERATED",
  "GLOB",
  "GROUP",
  "GROUPS",
  "HAVING",
  "IF",
  "IGNORE",
  "IMMEDIATE",
  "IN",
  "INDEX",
  "INDEXED",
  "INITIALLY",
  "INNER",
  "INSERT",
  "INSTEAD",
  "INTERSECT",
  "INTO",
  "IS",
  "ISNULL",
  "JOIN",
  "KEY",
  "LAST",
  "LEFT",
  "LIKE",
  "LIMIT",
  "MATCH",
  "MATERIALIZED",
  "NATURAL",
  "NO",
  "NOT",
  "NOTHING",
  "NOTNULL",
  "NULL",
  "NULLS",
  "OF",
  "OFFSET",
  "ON",
  "OR",
  "ORDER",
  "OTHERS",
  "OUTER",
  "OVER",
  "PARTITION",
  "PLAN",
  "PRAGMA",
  "PRECEDING",
  "PRIMARY",
  "QUERY",
  "RAISE",
  "RANGE",
  "RECURSIVE",
  "REFERENCES",
  "REGEXP",
  "REINDEX",
  "RELEASE",
  "RENAME",
  "REPLACE",
  "RESTRICT",
  "RETURNING",
  "RIGHT",
  "ROLLBACK",
  "ROW",
  "ROWS",
  "SAVEPOINT",
  "SELECT",
  "SET",
  "TABLE",
  "TEMP",
  "TEMPORARY",
  "THEN",
  "TIES",
  "TO",
  "TRANSACTION",
  "TRIGGER",
  "UNBOUNDED",
  "UNION",
  "UNIQUE",
  "UPDATE",
  "USING",
  "VACUUM",
  "VALUES",
  "VIEW",
  "VIRTUAL",
  "WHEN",
  "WHERE",
  "WINDOW",
  "WITH",
  "WITHOUT",
]);

/**
 * Validate a SQL identifier (table name, column name)
 */
export function validateIdentifier(
  name: string,
  type: "table" | "column" = "column",
): IdentifierValidationResult {
  const trimmed = name.trim();

  if (!trimmed) {
    return {
      isValid: false,
      error: `${type === "table" ? "Table" : "Column"} name is required`,
    };
  }

  // Check for valid identifier pattern
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    if (/^\d/.test(trimmed)) {
      return {
        isValid: false,
        error: `${type === "table" ? "Table" : "Column"} name cannot start with a number`,
        suggestion: `Try: _${trimmed} or ${trimmed.replace(/^\d+/, "")}`,
      };
    }
    if (/\s/.test(trimmed)) {
      return {
        isValid: false,
        error: `${type === "table" ? "Table" : "Column"} name cannot contain spaces`,
        suggestion: `Try: ${trimmed.replace(/\s+/g, "_")}`,
      };
    }
    if (/[^a-zA-Z0-9_]/.test(trimmed)) {
      const invalidChars = trimmed.match(/[^a-zA-Z0-9_]/g)?.join(", ") ?? "";
      return {
        isValid: false,
        error: `Invalid characters: ${invalidChars}. Only letters, numbers, and underscores allowed`,
        suggestion: `Try: ${trimmed.replace(/[^a-zA-Z0-9_]/g, "_")}`,
      };
    }
  }

  // Check for reserved words
  if (SQLITE_RESERVED_WORDS.has(trimmed.toUpperCase())) {
    return {
      isValid: false,
      error: `"${trimmed}" is a SQLite reserved word`,
      suggestion: `Try: ${trimmed}_col or my_${trimmed.toLowerCase()}`,
    };
  }

  // Check length (SQLite technically supports very long names but let's be reasonable)
  if (trimmed.length > 128) {
    return {
      isValid: false,
      error: `${type === "table" ? "Table" : "Column"} name is too long (max 128 characters)`,
    };
  }

  return { isValid: true };
}

/**
 * Validate NOT NULL constraint with default value requirement
 */
export function validateNotNullConstraint(
  notnull: boolean,
  defaultValue: string,
  hasExistingRows: boolean,
  isGenerated: boolean,
): IdentifierValidationResult {
  if (notnull && !isGenerated && hasExistingRows && !defaultValue.trim()) {
    return {
      isValid: false,
      error:
        "NOT NULL columns require a default value when the table already has rows",
      suggestion:
        "Either provide a default value or remove the NOT NULL constraint",
    };
  }
  return { isValid: true };
}

/**
 * Validate a default value for type compatibility (basic check)
 */
export function validateDefaultValue(
  defaultValue: string,
  columnType: string,
): IdentifierValidationResult {
  const trimmed = defaultValue.trim();
  if (!trimmed) return { isValid: true };

  const upperType = columnType.toUpperCase();
  const upperDefault = trimmed.toUpperCase();

  // Allow special keywords for any type
  if (
    upperDefault === "NULL" ||
    upperDefault === "CURRENT_TIMESTAMP" ||
    upperDefault === "CURRENT_DATE" ||
    upperDefault === "CURRENT_TIME"
  ) {
    return { isValid: true };
  }

  // Check numeric types
  if (
    upperType.includes("INT") ||
    upperType === "REAL" ||
    upperType === "NUMERIC"
  ) {
    if (
      isNaN(Number(trimmed)) &&
      !trimmed.startsWith("'") &&
      !trimmed.startsWith('"')
    ) {
      return {
        isValid: false,
        error: `Default value "${trimmed}" doesn't appear to be a valid number for ${columnType}`,
        suggestion: `Use a numeric value or quote it if it's text: '${trimmed}'`,
      };
    }
  }

  return { isValid: true };
}

/**
 * Validate a generated column expression (basic syntax check)
 */
export function validateGeneratedExpression(
  expression: string,
): IdentifierValidationResult {
  const trimmed = expression.trim();

  if (!trimmed) {
    return {
      isValid: false,
      error: "Generated column expression is required",
    };
  }

  // Check for balanced parentheses
  let depth = 0;
  for (const char of trimmed) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (depth < 0) {
      return {
        isValid: false,
        error:
          "Expression has unbalanced parentheses (too many closing parentheses)",
      };
    }
  }

  if (depth > 0) {
    return {
      isValid: false,
      error:
        "Expression has unbalanced parentheses (missing closing parenthesis)",
    };
  }

  // Check for common dangerous patterns
  if (/;\s*(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)/i.test(trimmed)) {
    return {
      isValid: false,
      error: "Expression cannot contain multiple SQL statements",
    };
  }

  return { isValid: true };
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
    const prevChar = i > 0 ? sql[i - 1] : "";

    // Handle escape sequences
    if (prevChar === "\\") continue;

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
      if (char === "(") {
        if (depth === 0) lastOpenPos = i;
        depth++;
      } else if (char === ")") {
        depth--;
        if (depth < 0) {
          return {
            isValid: false,
            error: "Unexpected closing parenthesis",
            errorPosition: i,
          };
        }
      }
    }
  }

  if (depth > 0) {
    return {
      isValid: false,
      error: `Unclosed parenthesis (${String(depth)} opening without closing)`,
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
    const prevChar = i > 0 ? sql[i - 1] : "";

    // Handle escape sequences
    if (prevChar === "\\") continue;

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
      error: "Unclosed single quote",
      errorPosition: singleQuoteStart,
    };
  }

  if (inDoubleQuote) {
    return {
      isValid: false,
      error: "Unclosed double quote",
      errorPosition: doubleQuoteStart,
    };
  }

  return { isValid: true };
}

/**
 * Valid SQL statement keywords that can start a statement
 */
const VALID_STATEMENT_KEYWORDS = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "CREATE",
  "DROP",
  "ALTER",
  "PRAGMA",
  "EXPLAIN",
  "VACUUM",
  "ANALYZE",
  "REINDEX",
  "ATTACH",
  "DETACH",
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
  "SAVEPOINT",
  "RELEASE",
  "WITH",
  "REPLACE",
];

/**
 * Core SQL keywords that must be spelled correctly
 */
const CORE_KEYWORDS: Record<string, string[]> = {
  // Each key is the correct spelling, values are common misspellings to detect
  SELECT: ["SELEC", "SELET", "SELCT", "SLECT", "SEELCT", "SLEECT"],
  FROM: ["FOM", "FORM", "FRIM", "FRMO", "FRM"],
  WHERE: ["WERE", "WHRE", "WHER", "WEHRE"],
  INSERT: ["INSER", "INSRT", "INSET", "INSRET"],
  INTO: ["ITNO", "INT", "INTOO"],
  UPDATE: ["UPDAT", "UPADTE", "UPDAE", "UPDTE"],
  DELETE: ["DELET", "DELEET", "DELEET", "DELTE"],
  CREATE: ["CREAT", "CRATE", "CRAETE"],
  TABLE: ["TABEL", "TABL", "TALBE"],
  INDEX: ["INDX", "IDNEX", "INDE"],
  VALUES: ["VALS", "VALEUS", "VALUESS"],
  ORDER: ["ORDR", "ORDE", "OERDER"],
  GROUP: ["GRUOP", "GROP", "GROPU"],
  HAVING: ["HAVNG", "HAVIN"],
  JOIN: ["JION", "JOING"],
  LEFT: ["LETF", "LEF"],
  RIGHT: ["RGIHT", "RIGH"],
  INNER: ["INNR", "INER"],
  OUTER: ["OUTR", "OTER"],
  AND: ["AN", "ADN"],
  NOT: ["NO", "NTO"],
  NULL: ["NUL", "NILL"],
  LIKE: ["LIK", "LIEK"],
  BETWEEN: ["BETWEN", "BEETWEEN"],
  EXISTS: ["EXSITS", "EXIS"],
  LIMIT: ["LIMT", "LIMI"],
  OFFSET: ["OFSET", "OFFSE"],
  SET: ["SE", "ST"],
  DROP: ["DRO", "DORP"],
  ALTER: ["ALTE", "ALTR"],
  ADD: ["AD"],
  COLUMN: ["COLUM", "COULMN"],
  PRIMARY: ["PRIMRY", "PRMARY"],
  FOREIGN: ["FOREING", "FOREGIN"],
  REFERENCES: ["REFERNCES", "REFERECNES"],
  CASCADE: ["CASCDE", "CASACDE"],
  DISTINCT: ["DISTINT", "DISINCT"],
  AS: [],
  ON: [],
  BY: [],
  IN: [],
  IS: [],
  OR: [],
};

/**
 * Check for misspelled SQL keywords
 */
function checkKeywordSpelling(sql: string): SqlValidationResult {
  const trimmed = sql.trim();
  if (!trimmed) return { isValid: true };

  // Remove string literals to avoid false positives
  const withoutStrings = trimmed
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""');

  // Tokenize the SQL into words
  const words = withoutStrings
    .split(/[\s,;()=<>!]+/)
    .filter((w) => w.length > 0);

  // Check if the first word is a valid statement keyword
  if (words.length > 0) {
    const firstWord = (words[0] ?? "").toUpperCase();
    const isValidStart = VALID_STATEMENT_KEYWORDS.includes(firstWord);

    // Check if it might be a misspelled keyword
    if (!isValidStart) {
      for (const [correct, misspellings] of Object.entries(CORE_KEYWORDS)) {
        if (misspellings.includes(firstWord)) {
          const pos = trimmed.toUpperCase().indexOf(firstWord);
          return {
            isValid: false,
            error: `Did you mean '${correct}'? Found '${firstWord}'`,
            errorPosition: pos >= 0 ? pos : 0,
          };
        }
      }

      // If it's not a known misspelling, check if it looks like a keyword attempt
      // (uppercase word that's not a valid statement start)
      if (firstWord === firstWord.toUpperCase() && /^[A-Z]+$/.test(firstWord)) {
        return {
          isValid: false,
          error: `Unknown statement type: ${firstWord}`,
          errorPosition: 0,
        };
      }
    }
  }

  // Check all words for misspelled keywords
  let searchPos = 0;
  for (const word of words) {
    const upperWord = word.toUpperCase();

    for (const [correct, misspellings] of Object.entries(CORE_KEYWORDS)) {
      if (misspellings.includes(upperWord)) {
        // Find position in original string
        const pos = withoutStrings.toUpperCase().indexOf(upperWord, searchPos);
        return {
          isValid: false,
          error: `Did you mean '${correct}'? Found '${word}'`,
          errorPosition: pos >= 0 ? pos : searchPos,
        };
      }
    }

    // Move search position forward
    const wordPos = withoutStrings.toUpperCase().indexOf(upperWord, searchPos);
    if (wordPos >= 0) {
      searchPos = wordPos + word.length;
    }
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
    { pattern: /^SELECT\s*$/i, error: "SELECT requires column list or *" },
    { pattern: /^SELECT\s+.+\s+FROM\s*$/i, error: "FROM requires table name" },
    {
      pattern: /^INSERT\s+INTO\s*$/i,
      error: "INSERT INTO requires table name",
    },
    {
      pattern: /^INSERT\s+INTO\s+\w+\s*$/i,
      error: "INSERT requires VALUES or column list",
    },
    { pattern: /^UPDATE\s*$/i, error: "UPDATE requires table name" },
    { pattern: /^UPDATE\s+\w+\s*$/i, error: "UPDATE requires SET clause" },
    {
      pattern: /^UPDATE\s+\w+\s+SET\s*$/i,
      error: "SET requires column assignments",
    },
    { pattern: /^DELETE\s*$/i, error: "DELETE requires FROM clause" },
    {
      pattern: /^DELETE\s+FROM\s*$/i,
      error: "DELETE FROM requires table name",
    },
    {
      pattern: /^CREATE\s*$/i,
      error: "CREATE requires TABLE, INDEX, or other object type",
    },
    {
      pattern: /^CREATE\s+TABLE\s*$/i,
      error: "CREATE TABLE requires table name",
    },
    {
      pattern: /^DROP\s*$/i,
      error: "DROP requires TABLE, INDEX, or other object type",
    },
    { pattern: /^DROP\s+TABLE\s*$/i, error: "DROP TABLE requires table name" },
    {
      pattern: /^ALTER\s*$/i,
      error: "ALTER requires TABLE or other object type",
    },
    {
      pattern: /^ALTER\s+TABLE\s*$/i,
      error: "ALTER TABLE requires table name",
    },
    { pattern: /WHERE\s*$/i, error: "WHERE requires a condition" },
    { pattern: /AND\s*$/i, error: "AND requires a condition" },
    { pattern: /OR\s*$/i, error: "OR requires a condition" },
    { pattern: /ORDER\s+BY\s*$/i, error: "ORDER BY requires column name" },
    { pattern: /GROUP\s+BY\s*$/i, error: "GROUP BY requires column name" },
    { pattern: /JOIN\s*$/i, error: "JOIN requires table name" },
    { pattern: /ON\s*$/i, error: "ON requires join condition" },
    { pattern: /=\s*$/i, error: "Comparison operator requires a value" },
    { pattern: /!=\s*$/i, error: "Comparison operator requires a value" },
    { pattern: /<>\s*$/i, error: "Comparison operator requires a value" },
    { pattern: />\s*$/i, error: "Comparison operator requires a value" },
    { pattern: /<\s*$/i, error: "Comparison operator requires a value" },
    { pattern: />=\s*$/i, error: "Comparison operator requires a value" },
    { pattern: /<=\s*$/i, error: "Comparison operator requires a value" },
    { pattern: /LIKE\s*$/i, error: "LIKE requires a pattern" },
    { pattern: /IN\s*$/i, error: "IN requires a value list" },
    { pattern: /BETWEEN\s*$/i, error: "BETWEEN requires a range" },
    { pattern: /VALUES\s*$/i, error: "VALUES requires a value list" },
    { pattern: /SET\s*$/i, error: "SET requires column assignments" },
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
  if (/,\s*$/.test(trimmed) && !trimmed.endsWith("(")) {
    return {
      isValid: false,
      error: "Unexpected trailing comma",
      errorPosition: trimmed.lastIndexOf(","),
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

  // Check for misspelled keywords
  const keywordCheck = checkKeywordSpelling(sql);
  if (!keywordCheck.isValid) {
    return keywordCheck;
  }

  // Check basic structure
  const structureCheck = checkBasicStructure(sql);
  if (!structureCheck.isValid) {
    return structureCheck;
  }

  return { isValid: true };
}
