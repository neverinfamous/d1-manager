# Changelog

All notable changes to the D1 Database Manager project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2025-11-30

### Added
- **Database Search Filter** - Quickly find databases by name with the new search box on the database list page
- **Query Console Enhancements** - Major UX improvements for the SQL query editor:
  - **SQL Autocomplete** - Auto-pairing for brackets `()`, `{}`, `[]` and quotes `'`, `"`
  - **Smart Indentation** - Enter key maintains indentation, increases after opening brackets or SQL keywords
  - **Tab Key Support** - Tab inserts 2 spaces instead of changing focus; Shift+Tab to unindent
  - **Smart Backspace** - Deletes matching pairs when cursor is inside empty brackets/quotes
  - **Real-time Validation** - Live syntax checking with visual feedback (green checkmark or red error icon)
  - **Validation Indicators** - Red border and error message when SQL has syntax issues
  - **Copy Button** - Copy query to clipboard with "Copied!" feedback
  - **Clear Button** - Reset query, error, and results with one click
  - **Quick Queries Dropdown** - 21 SQL templates organized into 4 groups:
    - Information (7): Show tables, schema, indexes, foreign keys, CREATE statements
    - Select Data (5): Basic SELECT, COUNT, WHERE, LIKE, JOIN queries
    - Modify Data (3): INSERT, UPDATE, DELETE templates
    - Table Management (6): CREATE/DROP/ALTER TABLE, indexes
  - Templates use ALL_CAPS placeholders for easy double-click selection
  - Grouped dropdown with alternating background shading
- **Improved Error Messages** - Query errors now show actual D1/SQLite error details instead of generic "Query execution failed"

### Changed
- **TypeScript Strictest Mode** - Achieved full compliance with TypeScript's strictest compiler options
  - `exactOptionalPropertyTypes: true` - Enforces proper handling of optional properties (no explicit `undefined` assignment)
  - `noUncheckedIndexedAccess: true` - All array/object index access returns `T | undefined`, requiring explicit null checks
  - Zero errors across both frontend (React) and backend (Cloudflare Worker) codebases
  - Improved type safety for API responses, state management, and dynamic data access patterns
- **Query Console UI** - Various usability improvements:
  - Empty input field by default (no pre-filled query to erase)
  - Larger text for "Allow destructive queries" checkbox and hint text
  - Database name now shows with "Database:" label prefix
  - Renamed checkbox from "Skip validation" to "Allow destructive queries (DROP, DELETE, TRUNCATE)"
  - Updated hint text: "Auto-pairs brackets and quotes • Tab for indent • Ctrl+Enter to execute"

### Fixed
- **Insert Row NOT NULL Constraint** - Fixed insert failing with "NOT NULL constraint failed" for columns with default values
  - When a NOT NULL column has a default value and the user leaves it empty, the column is now omitted from the INSERT
  - SQLite then correctly applies the default value instead of trying to insert NULL
  - Previously, empty fields for NOT NULL columns with defaults would fail because NULL was explicitly inserted
- **WAF-Blocked Request Error Handling** - Improved error messages when Cloudflare WAF blocks requests
  - 403 Forbidden responses now show: "Request blocked by security rules" with helpful context
  - Previously showed confusing "Unexpected token '<'" JSON parse error when WAF returned HTML error page
  - Also improved handling for 401 Unauthorized responses
- **Table Deletion Failing** - Fixed tables unable to be deleted due to "Currently processing a long-running export" error
  - Root cause: Pre-operation bookmark capture was calling the D1 Export API which triggered database locks
  - Disabled automatic bookmark capture before destructive operations (DROP TABLE, DROP COLUMN, DELETE rows)
  - D1 Time Travel still works - it's managed by Cloudflare automatically at the platform level
  - Undo snapshots (table data capture) still work for UI-based restore functionality
- **Cascade Impact Simulator** - Removed white Controls and MiniMap boxes that didn't match dark theme
- **Database Rename** - Fixed rename operation failing with "Database operation failed" error
  - D1 import API now requires multi-step process: init upload → upload to R2 → ingest → poll
  - Added proper handling for immediate export completion (small databases)
  - Export now correctly detects `signed_url` in all response formats
- **Database Upload (JSON)** - Fixed database upload failing when importing JSON format files
- **Foreign Key Visualizer/Editor** - Fixed multiple issues preventing FK operations from working:
  - Fixed edges not rendering between tables (added missing ReactFlow Handle components)
  - Fixed Edit/Delete panel position (moved up to be visible and clickable)
  - Fixed constraint ID parsing for column names containing underscores (e.g., `user_email`)
  - Fixed CREATE TABLE regex to handle quoted table names during FK modification
  - Fixed FK removal regex to properly match constraints with CONSTRAINT prefix and quoted identifiers
  - Removed broken Controls and MiniMap components that caused layout issues
  - Added dashed line styling for ON UPDATE actions in hierarchical layout
  - Added helpful hint: "Click on a line/edge to edit or delete a constraint"
  - Added tooltip for "Add FK" button
  - Conditional button visibility (cycle highlight only shows when FKs exist)
- **ER Diagram** - UI improvements:
  - Removed non-functional SVG export (was just PNG embedded in SVG wrapper)
  - Removed MiniMap component
  - Made Legend larger and more readable
- **Circular Dependency Detector** - UI improvements:
  - Replaced ReactFlow Controls with custom dark-mode compatible buttons
  - Removed MiniMap component
  - Fixed "Open Foreign Key Editor" button navigating to wrong view
- **FTS5 Search** - Fixed regex escaping bug in query sanitizer that caused "Invalid regular expression" errors when searching
- **Porter Stemmer Tokenizer** - Fixed tokenizer constructor error by properly wrapping unicode61 (`porter unicode61` instead of just `porter`)
- **FTS5 "Convert Table" Button** - Button now only appears when there are regular tables to convert AND no existing FTS5 tables (serves as a "get started" action)
- **Advanced Tokenizer Configuration** - Section now properly shows settings for Unicode61, Porter, and Trigram tokenizers, and hides entirely for ASCII (which has no configurable parameters)
- **Accessibility (Convert Table Dialog)** - Fixed form field label associations:
  - "Columns to Index" now uses proper `<fieldset>` with `<legend>`
  - "SQL Preview" now uses `<h4>` heading instead of orphaned label
  - "Tokenizer" group now uses proper `<fieldset>` with `<legend>`
- **Accessibility (FTS5 Schema Designer)** - Fixed "SQL Preview" label to use proper heading element
- **Accessibility (Schema Designer)** - Fixed "SQL Preview" label to use proper heading element

---

## [1.1.0] - 2025-11-27

### Added
- **Read Replication** - Enable/disable global read replicas with D1 Sessions API support
  - View read replication status for each database in database list (globe badge)
  - Enable/disable read replication via dedicated Replication tab
  - See which region served your queries in Query Console (served_by_region, served_by_primary)
  - Educational content about Sessions API for user applications
  - Sessions API wrapper for metadata database operations (sequential consistency)
  - New API endpoint: PUT `/api/databases/:dbId/replication`
  - Comprehensive wiki documentation
- **Time Travel** - View database bookmarks and manage checkpoints for point-in-time recovery
  - Display current database bookmark with copy-to-clipboard functionality
  - Generate CLI restore commands for Wrangler (`wrangler d1 time-travel restore`)
  - Checkpoint history showing bookmarks captured before destructive operations
  - Manual checkpoint creation for on-demand state snapshots
  - Automatic bookmark capture before DROP TABLE, DROP COLUMN, and DELETE operations
  - Retention period information (30 days Paid / 7 days Free)
  - Dedicated "Time Travel" tab in database view
  - New API endpoints: GET/POST `/api/time-travel/:dbId/bookmark`, `/history`, `/capture`
  - Database schema with `bookmark_history` table for persistent storage
- **Job History** - Track and monitor bulk operations with comprehensive job history and event timelines
  - View all bulk operations (export, import, delete, rename, optimize) in a dedicated Job History page
  - Filter jobs by status, operation type, database, date range, job ID, and minimum errors
  - Sort jobs by started time, completed time, total items, or error count
  - View detailed event timeline for each job with progress milestones
  - Job events include timestamps, processed items, errors, and contextual details
  - Automatic tracking of database export/import operations
  - Database schema with `bulk_jobs` and `job_audit_events` tables
  - Migration file for existing installations (`worker/migrations/001_add_job_history.sql`)
- **Circular Dependency Detector** - Proactive schema analysis to identify and warn about circular foreign key chains
  - DFS-based cycle detection algorithm with path tracking and deduplication
  - Severity classification (Low/Medium/High) based on cycle length and CASCADE operations
  - Interactive ReactFlow graph visualization showing only tables in cycles
  - Pre-add validation warns before creating foreign keys that would complete a cycle
  - Breaking suggestions recommend which constraints to modify or remove
  - Dedicated "Circular Dependencies" tab in database view with automatic scanning
  - FK Visualizer integration with highlight cycles button and badge count
  - Pulsing red animation on nodes/edges involved in cycles
  - Mandatory acknowledgment checkbox to proceed despite cycle warnings
  - Backend API endpoints: GET /api/tables/:dbId/circular-dependencies and POST /api/tables/:dbId/foreign-keys/simulate
  - Comprehensive wiki documentation with algorithm explanation and best practices
- **Database Rename Verification** - Comprehensive integrity verification before deleting original database during rename operations
  - Validates table counts match between source and target databases
  - Verifies row counts for all tables
  - Checks schema structure (column counts) for consistency
  - Automatic rollback if verification fails (deletes new database, preserves original)
  - Real-time progress indicator showing verification step

### Changed
- **TypeScript Strict Mode** - Full codebase now passes the most aggressive TypeScript and ESLint strict settings
  - Enabled `exactOptionalPropertyTypes` - Prevents undefined assignment to optional properties
  - Enabled `noUncheckedIndexedAccess` - Array/object index access returns `T | undefined`
  - Fixed 100+ type errors across frontend and worker for full strict compliance
  - All code now properly handles potential undefined values from array access and API responses
- **Database Rename Error Handling** - Enhanced error messages with multi-line support for detailed verification failures
- **FTS5 Detection** - Added immediate detection and blocking of rename attempts for databases containing FTS5 virtual tables

### Fixed
- **Database Export Timeout** - Fixed bulk database export hanging indefinitely when D1 export API returns immediately
  - Export now correctly detects when `signed_url` is already available in the initial response
  - Small databases export instantly instead of unnecessary polling
  - Added proper `output_format: 'polling'` parameter for cases that require polling
- **FTS5 Export Limitation** - Database export now properly detects and blocks databases with FTS5 (Full-Text Search) tables
  - Previously caused confusing timeout errors or empty ZIP downloads
  - Now provides clear UI dialog explaining which databases were skipped and why
  - Lists specific FTS5 table names that prevent export
  - Non-FTS5 databases in the same batch export normally
- **FTS5 Export Limitation (Rename)** - Database rename now properly detects and blocks databases with FTS5 tables
  - Previously caused confusing 2-minute timeout errors
  - Now provides immediate, clear error message explaining D1's export API limitation
  - Lists specific FTS5 tables that prevent export

## [1.0.0] - 2025-11-04

### Added
- Initial production release
- Complete database management (list, create, rename, delete)
- Table operations (browse, create, modify, clone, export, delete)
- Visual Schema Designer with live SQL preview
- Query Console with syntax highlighting and history
- Row-level filtering with type-aware operators (TEXT, INTEGER, REAL, NULL)
- Advanced filter operators (BETWEEN, IN, NOT BETWEEN, NOT IN)
- OR logic for complex filter combinations
- Filter presets (last 7/30 days, ranges, custom saved presets)
- Column management (add, rename, modify, delete)
- Table dependencies viewer with foreign key analysis
- Cascade Impact Simulator with interactive graph visualization
- Bulk database operations (download, delete, optimize)
- Bulk table operations (clone, export, delete)
- Undo/Rollback system for dropped tables, columns, and deleted rows
- Foreign Key Visualizer/Editor with interactive graph
- FTS5 Full-Text Search support
- Constraint Validator for data integrity
- Index Analyzer with intelligent recommendations
- ER Relationship Diagram generator
- Foreign Key Navigation with breadcrumb trail
- Dark/Light/System theme support
- Cloudflare Access authentication integration
- Local development mode with mock data
- Protected system databases (prevents accidental corruption)

### Security
- JWT validation with Cloudflare Access
- Zero Trust authentication
- Protected metadata databases pattern matching
- SQL injection protection for all operators

---

## Release History

For detailed release notes, see [releases/release-notes.md](releases/release-notes.md).

For version-specific documentation, see the [Wiki](https://github.com/neverinfamous/d1-manager/wiki).

