/**
 * SQL query templates for the Query Console
 * Common queries to help users get started quickly
 *
 * Note: Placeholders use ALL_CAPS to indicate values that need to be replaced
 * Double-click to select a placeholder, then type to replace it
 */

export interface SqlTemplate {
  id: string;
  name: string;
  description: string;
  query: string;
}

export interface SqlTemplateGroup {
  id: string;
  label: string;
  templates: SqlTemplate[];
}

export const sqlTemplateGroups: SqlTemplateGroup[] = [
  {
    id: "info",
    label: "Information",
    templates: [
      {
        id: "show-all-objects",
        name: "Show All Objects",
        description: "List tables, indexes, views, triggers",
        query: `SELECT name, type FROM sqlite_master ORDER BY type, name;`,
      },
      {
        id: "show-tables",
        name: "Show All Tables",
        description: "List all tables in the database",
        query: `SELECT name, type FROM sqlite_master WHERE type='table' ORDER BY name;`,
      },
      {
        id: "show-create-table",
        name: "Show CREATE Statement",
        description: "View the SQL used to create a table",
        query: `SELECT sql FROM sqlite_master WHERE type='table' AND name='TABLE_NAME';`,
      },
      {
        id: "foreign-keys",
        name: "Show Foreign Keys",
        description: "List foreign key relationships",
        query: `PRAGMA foreign_key_list(TABLE_NAME);`,
      },
      {
        id: "show-index-info",
        name: "Show Index Columns",
        description: "View columns in an index",
        query: `PRAGMA index_info(INDEX_NAME);`,
      },
      {
        id: "show-indexes",
        name: "Show Indexes",
        description: "List all indexes on a table",
        query: `PRAGMA index_list(TABLE_NAME);`,
      },
      {
        id: "show-schema",
        name: "Show Table Schema",
        description: "View column definitions for a table",
        query: `PRAGMA table_info(TABLE_NAME);`,
      },
    ],
  },
  {
    id: "select",
    label: "Select Data",
    templates: [
      {
        id: "count-rows",
        name: "Count Rows",
        description: "Count total rows in a table",
        query: `SELECT COUNT(*) AS row_count FROM TABLE_NAME;`,
      },
      {
        id: "select-all",
        name: "Select All Rows",
        description: "Get all rows from a table (limit 100)",
        query: `SELECT * FROM TABLE_NAME LIMIT 100;`,
      },
      {
        id: "select-join",
        name: "Select with JOIN",
        description: "Join two tables together",
        query: `SELECT a.*, b.*
FROM TABLE1 a
LEFT JOIN TABLE2 b ON a.COLUMN = b.COLUMN
LIMIT 100;`,
      },
      {
        id: "select-like",
        name: "Select with LIKE",
        description: "Search with pattern matching",
        query: `SELECT * FROM TABLE_NAME WHERE COLUMN_NAME LIKE '%SEARCH_TERM%' LIMIT 100;`,
      },
      {
        id: "select-where",
        name: "Select with WHERE",
        description: "Filter rows by condition",
        query: `SELECT * FROM TABLE_NAME WHERE COLUMN_NAME = 'VALUE' LIMIT 100;`,
      },
    ],
  },
  {
    id: "modify",
    label: "Modify Data",
    templates: [
      {
        id: "delete-row",
        name: "Delete Rows",
        description: "Requires Allow destructive queries",
        query: `DELETE FROM TABLE_NAME WHERE PRIMARY_KEY = ID_VALUE;`,
      },
      {
        id: "insert-row",
        name: "Insert Row",
        description: "Insert a new row into a table",
        query: `INSERT INTO TABLE_NAME (COLUMN1, COLUMN2) VALUES ('VALUE1', 'VALUE2');`,
      },
      {
        id: "update-row",
        name: "Update Rows",
        description: "Update existing rows",
        query: `UPDATE TABLE_NAME SET COLUMN_NAME = 'NEW_VALUE' WHERE PRIMARY_KEY = ID_VALUE;`,
      },
    ],
  },
  {
    id: "table",
    label: "Table Management",
    templates: [
      {
        id: "add-column",
        name: "Add Column",
        description: "Add a new column to a table",
        query: `ALTER TABLE TABLE_NAME ADD COLUMN COLUMN_NAME DATA_TYPE;`,
      },
      {
        id: "create-index",
        name: "Create Index",
        description: "Create an index for faster queries",
        query: `CREATE INDEX IF NOT EXISTS idx_TABLE_COLUMN ON TABLE_NAME(COLUMN_NAME);`,
      },
      {
        id: "create-table",
        name: "Create Table",
        description: "Create a new table with common columns",
        query: `CREATE TABLE IF NOT EXISTS TABLE_NAME (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);`,
      },
      {
        id: "drop-index",
        name: "Drop Index",
        description: "Requires Allow destructive queries",
        query: `DROP INDEX IF EXISTS INDEX_NAME;`,
      },
      {
        id: "drop-table",
        name: "Drop Table",
        description: "Requires Allow destructive queries",
        query: `DROP TABLE IF EXISTS TABLE_NAME;`,
      },
      {
        id: "rename-table",
        name: "Rename Table",
        description: "Rename an existing table",
        query: `ALTER TABLE OLD_TABLE_NAME RENAME TO NEW_TABLE_NAME;`,
      },
    ],
  },
];

// Flat list for backward compatibility if needed
export const sqlTemplates: SqlTemplate[] = sqlTemplateGroups.flatMap(
  (group) => group.templates,
);
