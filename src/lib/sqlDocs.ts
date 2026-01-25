/**
 * SQL documentation for hover tooltips
 * Provides brief descriptions for SQL keywords, functions, and clauses
 */

export interface SqlDoc {
  /** Brief description */
  description: string;
  /** Syntax example */
  syntax?: string;
  /** Link to more documentation */
  link?: string;
}

/** SQL keyword and function documentation */
export const SQL_DOCS: Record<string, SqlDoc> = {
  // Statements
  SELECT: {
    description: "Retrieves data from one or more tables",
    syntax: "SELECT column1, column2 FROM table",
  },
  INSERT: {
    description: "Adds new rows to a table",
    syntax: "INSERT INTO table (col1, col2) VALUES (val1, val2)",
  },
  UPDATE: {
    description: "Modifies existing rows in a table",
    syntax: "UPDATE table SET column = value WHERE condition",
  },
  DELETE: {
    description: "Removes rows from a table",
    syntax: "DELETE FROM table WHERE condition",
  },
  CREATE: {
    description: "Creates a new database object (table, index, etc.)",
    syntax: "CREATE TABLE name (column definitions)",
  },
  DROP: {
    description: "Removes a database object",
    syntax: "DROP TABLE table_name",
  },
  ALTER: {
    description: "Modifies the structure of a database object",
    syntax: "ALTER TABLE table ADD column type",
  },
  TRUNCATE: {
    description: "Removes all rows from a table (faster than DELETE)",
    syntax: "TRUNCATE TABLE table_name",
  },

  // Clauses
  INTO: {
    description: "Specifies the target table for INSERT operations",
    syntax: "INSERT INTO table_name (columns) VALUES (values)",
  },
  FROM: {
    description: "Specifies the table(s) to query from",
    syntax: "SELECT * FROM table_name",
  },
  WHERE: {
    description: "Filters rows based on a condition",
    syntax: "WHERE column = value",
  },
  "ORDER BY": {
    description: "Sorts the result set by one or more columns",
    syntax: "ORDER BY column ASC|DESC",
  },
  "GROUP BY": {
    description: "Groups rows with the same values for aggregate functions",
    syntax: "GROUP BY column",
  },
  HAVING: {
    description: "Filters groups based on a condition (used with GROUP BY)",
    syntax: "HAVING COUNT(*) > 1",
  },
  LIMIT: {
    description: "Restricts the number of rows returned",
    syntax: "LIMIT count [OFFSET offset]",
  },
  OFFSET: {
    description: "Skips a number of rows before returning results",
    syntax: "LIMIT 10 OFFSET 20",
  },
  AS: {
    description: "Creates an alias for a column or table",
    syntax: "SELECT column AS alias",
  },

  // Joins
  JOIN: {
    description: "Combines rows from two or more tables",
    syntax: "table1 JOIN table2 ON condition",
  },
  "INNER JOIN": {
    description: "Returns rows with matching values in both tables",
    syntax: "table1 INNER JOIN table2 ON condition",
  },
  "LEFT JOIN": {
    description:
      "Returns all rows from the left table and matched rows from the right",
    syntax: "table1 LEFT JOIN table2 ON condition",
  },
  "RIGHT JOIN": {
    description:
      "Returns all rows from the right table and matched rows from the left",
    syntax: "table1 RIGHT JOIN table2 ON condition",
  },
  "CROSS JOIN": {
    description: "Returns the Cartesian product of both tables",
    syntax: "table1 CROSS JOIN table2",
  },
  ON: {
    description: "Specifies the join condition",
    syntax: "JOIN table2 ON table1.id = table2.id",
  },

  // Operators
  AND: {
    description: "Logical AND - both conditions must be true",
    syntax: "condition1 AND condition2",
  },
  OR: {
    description: "Logical OR - either condition can be true",
    syntax: "condition1 OR condition2",
  },
  NOT: {
    description: "Logical NOT - negates a condition",
    syntax: "NOT condition",
  },
  IN: {
    description: "Checks if a value matches any value in a list",
    syntax: "column IN (value1, value2, ...)",
  },
  BETWEEN: {
    description: "Checks if a value is within a range (inclusive)",
    syntax: "column BETWEEN low AND high",
  },
  LIKE: {
    description: "Pattern matching with wildcards (% and _)",
    syntax: "column LIKE 'pattern%'",
  },
  GLOB: {
    description: "Pattern matching with Unix-style wildcards (* and ?)",
    syntax: "column GLOB 'pattern*'",
  },
  IS: {
    description: "Used to test for NULL values",
    syntax: "column IS NULL",
  },
  NULL: {
    description: "Represents a missing or unknown value",
    syntax: "column IS NULL / column IS NOT NULL",
  },
  EXISTS: {
    description: "Tests for the existence of rows in a subquery",
    syntax: "EXISTS (SELECT ...)",
  },
  DISTINCT: {
    description: "Returns only unique values",
    syntax: "SELECT DISTINCT column",
  },
  UNION: {
    description: "Combines results of two queries (removes duplicates)",
    syntax: "SELECT ... UNION SELECT ...",
  },
  "UNION ALL": {
    description: "Combines results of two queries (keeps duplicates)",
    syntax: "SELECT ... UNION ALL SELECT ...",
  },
  INTERSECT: {
    description: "Returns rows that appear in both queries",
    syntax: "SELECT ... INTERSECT SELECT ...",
  },
  EXCEPT: {
    description: "Returns rows from first query not in second query",
    syntax: "SELECT ... EXCEPT SELECT ...",
  },

  // Sorting
  ASC: {
    description: "Sorts in ascending order (A-Z, 0-9)",
    syntax: "ORDER BY column ASC",
  },
  DESC: {
    description: "Sorts in descending order (Z-A, 9-0)",
    syntax: "ORDER BY column DESC",
  },

  // Case
  CASE: {
    description: "Conditional expression (if-then-else)",
    syntax: "CASE WHEN condition THEN result ELSE default END",
  },
  WHEN: {
    description: "Specifies a condition in a CASE expression",
    syntax: "WHEN condition THEN result",
  },
  THEN: {
    description: "Specifies the result when WHEN condition is true",
    syntax: "WHEN condition THEN result",
  },
  ELSE: {
    description: "Default result when no WHEN conditions match",
    syntax: "ELSE default_result END",
  },
  END: {
    description: "Ends a CASE expression",
    syntax: "CASE ... END",
  },

  // Transaction
  BEGIN: {
    description: "Starts a transaction",
    syntax: "BEGIN TRANSACTION",
  },
  COMMIT: {
    description: "Saves all changes made during the transaction",
    syntax: "COMMIT",
  },
  ROLLBACK: {
    description: "Undoes all changes made during the transaction",
    syntax: "ROLLBACK",
  },

  // Values and Data
  VALUES: {
    description: "Specifies values to insert",
    syntax: "INSERT INTO table VALUES (val1, val2)",
  },
  SET: {
    description: "Assigns new values to columns",
    syntax: "UPDATE table SET column = value",
  },
  DEFAULT: {
    description: "Uses the default value for a column",
    syntax: "INSERT INTO table (col) VALUES (DEFAULT)",
  },

  // Database Objects
  TABLE: {
    description: "Refers to a database table structure",
    syntax: "CREATE TABLE name (...) / DROP TABLE name",
  },
  INDEX: {
    description: "Database index for faster queries",
    syntax: "CREATE INDEX name ON table(column)",
  },
  COLUMN: {
    description: "A column in a database table",
    syntax: "ALTER TABLE t ADD COLUMN name TYPE",
  },

  // Control Flow
  IF: {
    description: "Conditional clause (often with EXISTS/NOT EXISTS)",
    syntax: "IF EXISTS / IF NOT EXISTS",
  },
  "IF EXISTS": {
    description: "Only execute if the object exists (prevents errors)",
    syntax: "DROP TABLE IF EXISTS table_name",
  },
  "IF NOT EXISTS": {
    description: "Only execute if the object does not exist (prevents errors)",
    syntax: "CREATE TABLE IF NOT EXISTS table_name",
  },

  // ALTER operations
  ADD: {
    description: "Adds a new column to an existing table",
    syntax: "ALTER TABLE t ADD COLUMN name TYPE",
  },
  RENAME: {
    description: "Renames a table or column",
    syntax: "ALTER TABLE old RENAME TO new",
  },
  TO: {
    description: "Specifies the new name in RENAME operations",
    syntax: "RENAME TO new_name",
  },

  // SQLite/D1 Specific
  PRAGMA: {
    description: "SQLite command for database configuration",
    syntax: "PRAGMA table_info(table_name)",
  },
  EXPLAIN: {
    description: "Shows the query execution plan",
    syntax: "EXPLAIN QUERY PLAN SELECT ...",
  },
  VACUUM: {
    description: "Rebuilds the database file to reclaim space",
    syntax: "VACUUM",
  },
  SQL: {
    description: "Column in sqlite_master containing the CREATE statement",
    syntax: "SELECT sql FROM sqlite_master",
  },
  NAME: {
    description: "Column in sqlite_master containing the object name",
    syntax: "SELECT name FROM sqlite_master",
  },

  // Constraints
  PRIMARY: {
    description: "Marks a column as the primary key (unique identifier)",
    syntax: "column INTEGER PRIMARY KEY",
  },
  KEY: {
    description: "Part of PRIMARY KEY constraint",
    syntax: "PRIMARY KEY / FOREIGN KEY",
  },
  UNIQUE: {
    description: "Ensures all values in a column are different",
    syntax: "column TEXT UNIQUE",
  },
  FOREIGN: {
    description: "Links to a primary key in another table",
    syntax: "FOREIGN KEY (col) REFERENCES other(id)",
  },
  REFERENCES: {
    description: "Specifies the referenced table in a foreign key",
    syntax: "REFERENCES other_table(column)",
  },
  AUTOINCREMENT: {
    description: "Auto-generates increasing integer values",
    syntax: "id INTEGER PRIMARY KEY AUTOINCREMENT",
  },

  // Data Types
  TYPE: {
    description:
      "Specifies the data type of a column, or refers to object type in sqlite_master",
    syntax: 'column TYPE / WHERE type = "table"',
  },
  INTEGER: {
    description: "Whole number data type",
    syntax: "column INTEGER",
  },
  TEXT: {
    description: "String/text data type",
    syntax: "column TEXT",
  },
  REAL: {
    description: "Floating-point number data type",
    syntax: "column REAL",
  },
  BLOB: {
    description: "Binary large object data type",
    syntax: "column BLOB",
  },
  NUMERIC: {
    description: "Numeric data type (integer or real)",
    syntax: "column NUMERIC",
  },
  BOOLEAN: {
    description: "Boolean data type (stored as INTEGER 0 or 1)",
    syntax: "column BOOLEAN",
  },

  // Aggregate Functions
  COUNT: {
    description: "Returns the number of rows",
    syntax: "COUNT(*) or COUNT(column)",
  },
  SUM: {
    description: "Returns the sum of numeric values",
    syntax: "SUM(column)",
  },
  AVG: {
    description: "Returns the average of numeric values",
    syntax: "AVG(column)",
  },
  MAX: {
    description: "Returns the maximum value",
    syntax: "MAX(column)",
  },
  MIN: {
    description: "Returns the minimum value",
    syntax: "MIN(column)",
  },

  // String Functions
  COALESCE: {
    description: "Returns the first non-NULL value",
    syntax: "COALESCE(val1, val2, ...)",
  },
  IFNULL: {
    description: "Returns second value if first is NULL",
    syntax: "IFNULL(value, replacement)",
  },
  LENGTH: {
    description: "Returns the length of a string",
    syntax: "LENGTH(string)",
  },
  SUBSTR: {
    description: "Extracts a substring",
    syntax: "SUBSTR(string, start, length)",
  },
  REPLACE: {
    description: "Replaces occurrences of a substring",
    syntax: "REPLACE(string, 'find', 'replace')",
  },
  LOWER: {
    description: "Converts string to lowercase",
    syntax: "LOWER(string)",
  },
  UPPER: {
    description: "Converts string to uppercase",
    syntax: "UPPER(string)",
  },
  TRIM: {
    description: "Removes leading and trailing whitespace",
    syntax: "TRIM(string)",
  },

  // Date Functions
  CURRENT_TIMESTAMP: {
    description: "Returns the current date and time",
    syntax: "DEFAULT CURRENT_TIMESTAMP",
  },
  DATE: {
    description: "Returns date in YYYY-MM-DD format",
    syntax: "DATE('now') or DATE(timestamp)",
  },
  TIME: {
    description: "Returns time in HH:MM:SS format",
    syntax: "TIME('now') or TIME(timestamp)",
  },
  DATETIME: {
    description: "Returns date and time",
    syntax: "DATETIME('now') or DATETIME(timestamp)",
  },
  STRFTIME: {
    description: "Formats a date/time according to a format string",
    syntax: "STRFTIME('%Y-%m-%d', timestamp)",
  },

  // JSON Functions
  JSON_EXTRACT: {
    description: "Extracts a value from a JSON document",
    syntax: "JSON_EXTRACT(json, '$.path')",
  },
  JSON_INSERT: {
    description: "Inserts a value into a JSON document",
    syntax: "JSON_INSERT(json, '$.path', value)",
  },
  JSON_SET: {
    description: "Sets a value in a JSON document (creates or updates)",
    syntax: "JSON_SET(json, '$.path', value)",
  },
  JSON_REMOVE: {
    description: "Removes a value from a JSON document",
    syntax: "JSON_REMOVE(json, '$.path')",
  },
  JSON_ARRAY: {
    description: "Creates a JSON array",
    syntax: "JSON_ARRAY(val1, val2, ...)",
  },
  JSON_OBJECT: {
    description: "Creates a JSON object",
    syntax: "JSON_OBJECT('key1', val1, 'key2', val2)",
  },
};

/**
 * Get documentation for a SQL keyword or function
 */
export function getSqlDoc(keyword: string): SqlDoc | undefined {
  // Try exact match first
  const upper = keyword.toUpperCase();
  if (SQL_DOCS[upper]) {
    return SQL_DOCS[upper];
  }

  // Try compound keywords
  const compounds = [
    "ORDER BY",
    "GROUP BY",
    "INNER JOIN",
    "LEFT JOIN",
    "RIGHT JOIN",
    "CROSS JOIN",
    "UNION ALL",
  ];
  for (const compound of compounds) {
    if (compound.startsWith(upper) || compound.endsWith(upper)) {
      return SQL_DOCS[compound];
    }
  }

  return undefined;
}
