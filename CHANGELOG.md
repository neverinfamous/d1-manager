# Changelog

All notable changes to the D1 Database Manager project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2025-11-07

### Added
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
- **Database Rename Error Handling** - Enhanced error messages with multi-line support for detailed verification failures
- **FTS5 Detection** - Added immediate detection and blocking of rename attempts for databases containing FTS5 virtual tables

### Fixed
- **FTS5 Export Limitation** - Database rename now properly detects and blocks databases with FTS5 (Full-Text Search) tables
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

