# D1 Database Manager - Release Notes

## Unreleased - Post-1.0.0 Enhancements
**Status:** In Production (v1.0.0 codebase with continuous improvements)

These features have been implemented and deployed since the initial v1.0.0 release, representing significant enhancements to the platform without requiring a formal version bump.

---

### 🎉 Major New Features

#### Cascade Impact Simulator
- **Interactive Graph Visualization** - ReactFlow-powered dependency graph with color-coded nodes
  - 🔴 Red nodes for source tables/rows being deleted
  - 🟡 Yellow nodes for CASCADE operations (data will be deleted)
  - 🔵 Blue nodes for SET NULL operations (foreign keys will be nullified)
  - ⚪ Gray nodes for RESTRICT/NO ACTION (no automatic changes)
- **Theoretical Simulation** - Non-destructive analysis with recursive traversal and circular dependency detection
- **Detailed Impact Analysis** - Total affected rows, maximum cascade depth, table-by-table breakdown
- **Multi-Format Export** - CSV, JSON, Text, and PDF reports with embedded graph visualization
- **Integrated Access** - Available in delete dialogs for both rows (TableView) and tables (DatabaseView)

#### Undo/Rollback System
- **10-Operation History** - Keeps last 10 destructive operations per database with automatic cleanup
- **Automatic Snapshots** - Captures full table schemas, indexes, and data before DROP operations
- **Per-Database Storage** - Undo history stored in metadata database with proper indexing
- **Global Undo Button** - Header badge showing available undo operation count across all databases
- **Detailed History Dialog** - View all past operations with timestamps, descriptions, and affected tables
- **Supported Operations** - Table drops, column drops, and row deletes with full data restoration
- **Smart Restoration** - Detects naming conflicts and provides clear warnings before restoring
- **Automatic Expiration** - Maintains only the most recent 10 operations to prevent unbounded growth

#### Foreign Key Visualizer/Editor
- **Dual Layout System** - Switch between hierarchical (dagre) and force-directed graph layouts
- **Interactive Graph** - ReactFlow-powered visualization with pan, zoom, and minimap navigation
- **Add Foreign Keys** - Create new foreign key constraints with comprehensive validation
- **Modify Constraints** - Edit ON DELETE and ON UPDATE behaviors for existing relationships
- **Delete Constraints** - Remove foreign key relationships with impact preview
- **Type Validation** - Automatic column type compatibility checking before constraint creation
- **Orphan Detection** - Prevents adding foreign keys that would violate referential integrity
- **Color-Coded Edges** - Visual distinction between CASCADE, RESTRICT, SET NULL, and NO ACTION behaviors
- **Table Filtering** - Focus view on specific tables and their immediate relationships
- **Column Display** - Shows table columns with data types and primary key indicators (🔑)
- **Dedicated Tab** - Integrated as "Relationships" tab alongside Tables and Query Builder

#### FTS5 Virtual Table Management
- **Visual Schema Designer** - Create FTS5 full-text search tables with interactive column builder
- **Table Converter** - Convert existing tables to FTS5 with external content support for syncing
- **Multiple Tokenizers** - Unicode61, Porter (stemming), Trigram (fuzzy search), and ASCII
- **Advanced Configuration** - Diacritic handling, custom separators, token characters, case sensitivity
- **Prefix Indexing** - Enable autocomplete functionality with configurable prefix lengths (2-4 characters)
- **Dedicated Search Interface** - Advanced search UI with BM25 ranking and result highlighting
- **Search Operators** - Full support for AND, OR, NOT, NEAR, phrase matching, and column-specific filters
- **Performance Metrics** - Execution time, search efficiency, rows scanned with optimization recommendations
- **Index Maintenance** - Rebuild and optimize operations with detailed statistics
- **Sync Triggers** - Auto-generate INSERT/UPDATE/DELETE triggers for external content tables
- **Full-Text Search Tab** - Dedicated FTS5 management interface in database view

#### Constraint Validator
- **Full Database Scans** - Validate all foreign key, NOT NULL, and UNIQUE constraints across database
- **Automatic Pre-Operation Checks** - Warns before destructive operations that might violate constraints
- **Orphan Detection** - Find records with broken foreign key references (referencing non-existent rows)
- **NOT NULL Violations** - Identify NULL values in columns with NOT NULL constraints
- **UNIQUE Violations** - Detect duplicate values in columns with UNIQUE constraints
- **Guided Fix Workflow** - Apply constraint fixes with explicit user confirmation and impact preview
- **Fix Strategies** - Multiple options: delete orphaned rows or set foreign keys to NULL
- **Dedicated Tab** - Integrated as "Constraints" tab in database view for easy access

#### Index Analyzer
- **Schema Analysis** - Automatically detects foreign keys, unique constraints, and commonly queried column types
- **Query Pattern Detection** - Analyzes query history to identify frequently filtered, joined, or sorted columns
- **Priority Scoring** - High/Medium/Low recommendations based on query frequency and expected impact
- **Estimated Impact** - Clear explanations of expected performance improvements for each recommendation
- **One-Click Creation** - Generate and execute CREATE INDEX statements instantly from recommendations
- **Existing Index Display** - View all current indexes organized by table with usage information
- **Statistics Dashboard** - Total recommendations, tables without indexes, query efficiency metrics
- **Performance Tab** - Dedicated index analysis interface in database view

#### Circular Dependency Detector
- **DFS Algorithm** - Depth-first search with path tracking for comprehensive cycle detection
- **Severity Classification** - Categorizes cycles as Low/Medium/High based on length and CASCADE presence
- **Interactive Visualization** - ReactFlow graph showing only tables involved in circular dependencies
- **Pre-Add Validation** - Warns before adding foreign keys that would create circular dependencies
- **Breaking Suggestions** - Recommends which constraints to modify or remove to break cycles
- **Dedicated Tab** - "Circular Dependencies" tab in database view with automatic cycle scanning
- **FK Visualizer Integration** - Highlight cycles button with badge count and pulsing animation
- **Acknowledgment Required** - Mandatory checkbox to proceed with FK creation despite cycle warning
- **Cycle Details** - Shows dependency path, risk indicators, and CASCADE/RESTRICT presence

#### ER Relationship Diagram
- **Dual View Mode** - Toggle between Foreign Key Editor and ER Diagram within Relationships tab
- **Visual Schema Display** - Tables showing primary keys (🔑) and foreign keys (🔗) with data types
- **Interactive Navigation** - Click on any table to navigate directly to its data view
- **Multiple Layouts** - Switch between hierarchical (top-down) and force-directed (organic) layouts
- **Multi-Format Export** - Export diagrams as PNG images, SVG vectors, or JSON data
- **Relationship Visualization** - Color-coded edges showing CASCADE, RESTRICT, SET NULL behaviors
- **Read-Only Mode** - Focus on understanding schema structure without accidental edits
- **Zoom & Pan Controls** - ReactFlow controls with minimap for navigating large database schemas

#### Advanced Row Filters
- **OR Logic** - Combine filters with AND or OR operators for complex query conditions
- **BETWEEN Operator** - Range queries for numeric and date columns (e.g., `age BETWEEN 18 AND 65`)
- **IN Operator** - Filter by multiple specific values (e.g., `status IN ('active', 'pending', 'suspended')`)
- **NOT BETWEEN/NOT IN** - Inverse range and list operations for exclusion queries
- **Filter Presets** - Built-in templates including:
  - Time-based: last 7 days, last 30 days, this month, this year
  - Numeric ranges: 0-100, positive values, negative values
  - Custom: save your own filter combinations
- **Custom Presets** - Save and manage frequently used filter combinations in localStorage
- **Multi-Value Input** - Comma-separated list input with 100-value limit for performance
- **Dynamic UI** - Automatically shows appropriate inputs (two inputs for BETWEEN, textarea for IN)
- **SQL Injection Protection** - All operators properly escaped and validated before query execution
- **Visual Indicators** - AND/OR toggle buttons, active filter badges, highlighted inputs

#### Foreign Key Navigation
- **Clickable FK Values** - Foreign key columns display as interactive links with visual indicators (🔗)
- **Auto-Filtering** - Automatically applies filters when navigating via foreign key relationships
- **Breadcrumb Trail** - Shows complete navigation path (Database > Table1 > Table2 > Table3)
- **Smart Navigation** - Click to jump to referenced tables or use breadcrumbs to navigate back
- **Keyboard Shortcuts** - Alt+Left for back navigation through table browsing history
- **Visual Indicators** - FK columns highlighted with link icons and tooltips showing referenced tables
- **Context Preservation** - Maintains filter state when navigating back through breadcrumb trail

---

### 🔧 API Enhancements

#### New Endpoints
- `GET /api/tables/:dbId/foreign-keys` - Get all foreign keys with graph structure (nodes and edges)
- `POST /api/tables/:dbId/foreign-keys/add` - Add new foreign key constraint with validation
- `PATCH /api/tables/:dbId/foreign-keys/:constraintName` - Modify ON DELETE/ON UPDATE behaviors
- `DELETE /api/tables/:dbId/foreign-keys/:constraintName` - Remove foreign key constraint
- `GET /api/indexes/:dbId/analyze` - Analyze database and return index recommendations
- `POST /api/undo/:dbId/list` - List available undo operations for a database
- `POST /api/undo/:dbId/restore/:operationId` - Restore a previous operation

---

### 📈 Roadmap Updates

#### Still Planned
- Circular dependency detector with visual cycle highlighting
- Dependency export as JSON documentation files
- Force delete mode with audit logging for power users
- Time Travel API integration for point-in-time recovery
- Analytics dashboard with comprehensive usage metrics

---

## Version 1.0.0 - Production Stable Release
**Release Date:** November 2, 2025  
**Status:** Production/Stable  

---

## 🎉 Overview

We're excited to announce the first stable release of **D1 Database Manager** - a modern, full-featured web application for managing Cloudflare D1 databases with enterprise-grade authentication. This release represents months of development and testing, bringing powerful database management capabilities beyond the standard Cloudflare dashboard.

**🎯 [Live Demo](https://d1.adamic.tech/)** | **🐳 [Docker Hub](https://hub.docker.com/r/writenotenow/d1-manager)** | **📦 [GitHub](https://github.com/neverinfamous/d1-manager)**

---

## ✨ Major Features

### Database Management
- **Complete CRUD Operations** - List, create, rename, and delete D1 databases
- **Migration-Based Renaming** - Safe database renaming with automatic export/import and rollback
- **Database Metadata** - View created date, size, and table count for each database
- **Bulk Operations** - Multi-select databases for batch operations
  - Bulk Download (ZIP archive of SQL dumps)
  - Bulk Delete with progress tracking
  - Bulk Optimize (ANALYZE operations)
- **Upload/Import** - Import SQL files up to 5GB to create or update databases
- **Protected System Database** - Automatic protection of `d1-manager-metadata` internal database

### Advanced Table Operations
- **Complete Table Management** - Browse, create, rename, delete, and clone tables
- **Visual Schema Designer** - Intuitive table creation with column builder
  - Define column names and types (TEXT, INTEGER, REAL, BLOB, NUMERIC)
  - Set primary keys and NOT NULL constraints
  - Add default values
  - Live SQL preview with validation
- **Table Data Browser** - Paginated data viewing (50 rows per page)
- **Bulk Table Operations** - Multi-select for efficient batch processing
  - Bulk Clone with custom naming
  - Bulk Export (SQL/CSV formats in ZIP archives)
  - Bulk Delete with dependency analysis
- **Schema Information** - Detailed column information with types, constraints, and indexes

### Column Management
- **Add Column** - Add new columns with type, constraints, and default values
- **Rename Column** - Fast column renaming using `ALTER TABLE RENAME COLUMN`
- **Modify Column** - Change column type, NOT NULL constraints, and defaults (uses table recreation)
- **Drop Column** - Remove columns using `ALTER TABLE DROP COLUMN`
- **Always-Visible Actions** - Action buttons visible on each column row for quick access
- **Data Migration** - Automatic data migration during schema modifications
- **Index Preservation** - Indexes maintained during operations

### Row-Level Filtering
- **Type-Aware Operators** - Smart filtering based on column data types
  - TEXT: contains, equals, not equals, starts with, ends with
  - INTEGER/REAL: =, >, <, ≥, ≤
  - NULL: is null, is not null
- **Filter Bar UI** - Inline filters above table with one input per column
- **URL Persistence** - Filters stored in query parameters for shareable filtered views
- **SQL Injection Protection** - Proper escaping and parameterization
- **Active Indicators** - Badge count, highlighted inputs, and "(filtered)" labels
- **Server-Side Execution** - Efficient SQL WHERE clause generation

### Foreign Key Dependencies
- **Dependency Viewer** - Comprehensive foreign key relationship analysis before deletion
- **Outbound Dependencies** - Shows tables that this table references
- **Inbound Dependencies** - Shows tables that reference this table (critical for cascade impact)
- **Cascade Behavior Display** - ON DELETE actions (CASCADE, RESTRICT, SET NULL, NO ACTION)
- **Row Count Estimates** - Impact assessment showing affected row counts
- **Mandatory Confirmation** - Required acknowledgment checkbox when dependencies exist
- **Color-Coded Warnings** - CASCADE (yellow), RESTRICT (red), SET NULL (blue)
- **Per-Table View** - Collapsible accordion in bulk operations for detailed analysis

### SQL Query Console
- **Custom Query Execution** - Execute any SQL query with syntax highlighting
- **Results Display** - Formatted table output with column headers and execution metrics
- **Keyboard Shortcuts** - Ctrl+Enter (Cmd+Enter on Mac) to execute queries
- **Skip Validation** - Optional bypass for DROP/DELETE operations
- **Query Management** - Save and load frequently used queries
- **CSV Export** - Export query results directly to CSV files
- **Query History** - Automatic execution history tracking (backend ready)

### User Experience
- **Modern UI** - Beautiful interface built with shadcn/ui components and Tailwind CSS
- **Theme Support** - Dark, Light, and System-aware themes with persistence
- **Responsive Design** - Works seamlessly on desktop, tablet, and mobile devices
- **Intuitive Navigation** - Seamless navigation between databases, tables, and query console
- **Search & Filter** - Search tables by name in database view
- **Progress Tracking** - Real-time progress indicators for long-running operations
- **Error Handling** - Comprehensive error reporting with user-friendly messages

---

## 🔧 Technical Stack

### Frontend
- **React 19.2.0** - Latest React with improved performance and features
- **TypeScript 5.9.3** - Strict type safety throughout the application
- **Vite 7.1.12** - Lightning-fast build tool and dev server
- **Tailwind CSS 3.4.18** - Utility-first CSS framework
- **shadcn/ui** - High-quality, accessible component library
- **Lucide React** - Beautiful icon library

### Backend
- **Cloudflare Workers** - Serverless edge compute for global performance
- **Cloudflare D1** - SQLite-compatible serverless database
- **Cloudflare Access (Zero Trust)** - Enterprise-grade authentication with JWT validation
- **TypeScript 5.9.3** - Type-safe API development

---

## 🚀 Deployment Options

### Cloudflare Workers (Production)
- **Workers.dev Subdomain** - Free subdomain for immediate deployment
- **Custom Domains** - Support for custom domain routing
- **Zero Trust Integration** - GitHub OAuth and other identity providers
- **Edge Deployment** - Global distribution for low latency
- **Automatic Scaling** - Handles traffic spikes automatically

### Docker Container
- **Multi-Architecture Support** - `linux/amd64` and `linux/arm64`
- **Docker Hub** - Available at `writenotenow/d1-manager:latest`
- **Container Size** - ~150MB compressed
- **Health Checks** - Built-in `/health` endpoint
- **Security Hardened** - Non-root user, minimal Alpine base
- **Docker Compose Ready** - Example configurations included
- **Kubernetes Support** - Deployment manifests and secrets management

### Local Development
- **No Authentication** - Auth bypassed for localhost
- **Mock Data** - Sample databases, tables, and query results
- **No Secrets Required** - Works without Cloudflare API keys
- **Hot Module Replacement** - Frontend and backend auto-reload
- **Full UI Testing** - All features testable without production setup

---

## 🔐 Security Features

### Authentication & Authorization
- **Cloudflare Access Integration** - Enterprise Zero Trust authentication
- **JWT Validation** - Secure token verification on all API requests
- **Session Management** - Automatic token refresh and secure session handling
- **Identity Providers** - GitHub OAuth, Google, Azure AD, and more

### API Security
- **CORS Protection** - Proper CORS headers and origin validation
- **SQL Injection Prevention** - Parameterized queries and input sanitization
- **Rate Limiting** - Configurable rate limiting (ready for implementation)
- **API Token Management** - Secure secret storage with Wrangler

### Container Security
- **Non-Root Execution** - Container runs as unprivileged `node` user
- **Minimal Base Image** - Alpine Linux for reduced attack surface
- **Read-Only Filesystem** - Optional read-only root filesystem support
- **Environment-Based Secrets** - No hardcoded credentials
- **Docker Secrets** - Support for Docker Swarm and Kubernetes secrets

---

## 📋 API Endpoints

### Databases
- `GET /api/databases` - List all databases
- `POST /api/databases` - Create new database
- `POST /api/databases/:dbId/rename` - Rename database (migration-based)
- `DELETE /api/databases/:dbId` - Delete database
- `GET /api/databases/:dbId/info` - Get database information
- `POST /api/databases/export` - Export multiple databases
- `POST /api/databases/import` - Import SQL file

### Tables
- `GET /api/tables/:dbId/list` - List all tables
- `GET /api/tables/:dbId/schema/:tableName` - Get table schema
- `GET /api/tables/:dbId/data/:tableName` - Get table data with pagination/filtering
- `GET /api/tables/:dbId/indexes/:tableName` - Get table indexes
- `GET /api/tables/:dbId/dependencies` - Get foreign key dependencies
- `POST /api/tables/:dbId/create` - Create new table
- `DELETE /api/tables/:dbId/:tableName` - Drop table
- `PATCH /api/tables/:dbId/:tableName/rename` - Rename table
- `POST /api/tables/:dbId/:tableName/clone` - Clone table
- `GET /api/tables/:dbId/:tableName/export` - Export table (SQL/CSV)

### Column Operations
- `POST /api/tables/:dbId/:tableName/columns/add` - Add column
- `PATCH /api/tables/:dbId/:tableName/columns/:columnName/rename` - Rename column
- `PATCH /api/tables/:dbId/:tableName/columns/:columnName/modify` - Modify column
- `DELETE /api/tables/:dbId/:tableName/columns/:columnName` - Drop column

### Queries
- `POST /api/query/:dbId/execute` - Execute SQL query
- `POST /api/query/:dbId/batch` - Execute batch queries
- `GET /api/query/:dbId/history` - Get query history

---

## 🎨 User Interface Highlights

### Database View
- **Grid Layout** - Beautiful cards showing database information
- **Quick Actions** - Rename, delete, and download buttons on each card
- **Multi-Select** - Checkbox on each card with "Select All" option
- **Bulk Action Bar** - Appears when databases are selected
- **Search** - Filter databases by name
- **Create Database** - Prominent "+" button with dialog

### Table View
- **Table Grid** - Visual cards for each table with metadata
- **Schema Viewer** - Detailed column information with types and constraints
- **Data Browser** - Paginated table data with 50 rows per page
- **Filter Bar** - Type-aware filters for each column
- **Action Buttons** - Always-visible actions on each column row
- **Multi-Select** - Checkbox selection for bulk operations

### Query Console
- **SQL Editor** - Syntax-highlighted query input
- **Execute Button** - Prominent with keyboard shortcut hint
- **Results Table** - Formatted output with column headers
- **Execution Metrics** - Query time and row count
- **CSV Export** - One-click export of results
- **Query History** - Access previously executed queries

### Theme System
- **System Theme** - Automatically follows OS/browser preference (default)
- **Light Theme** - Clean, bright interface
- **Dark Theme** - Easy on the eyes for night work
- **Theme Toggle** - Header button cycles through modes
- **Persistence** - Theme preference saved and restored

---

## 📦 What's Included

### Source Code
- Complete frontend React application with TypeScript
- Cloudflare Worker backend with API routes
- Comprehensive type definitions
- Development and production configurations
- Example environment files

### Documentation
- **README.md** - Main documentation with quick start and deployment
- **DOCKER_README.md** - Complete Docker deployment guide
- **SECURITY.md** - Security policy and vulnerability reporting
- **CONTRIBUTING.md** - Contribution guidelines (coming soon)
- **LICENSE** - MIT License

### Docker
- Multi-stage Dockerfile for optimal image size
- Docker Compose examples for various scenarios
- Kubernetes deployment manifests
- Health check implementation
- Security best practices

### Development Tools
- Wrangler configuration for local and production deployment
- Vite configuration with optimizations
- Tailwind CSS configuration with custom theme
- shadcn/ui component configuration
- TypeScript strict mode configuration

---

## 🔄 Migration from Beta

This is the first stable release. If you were using development versions:

1. **Update Dependencies:**
   ```bash
   npm install
   ```

2. **Rebuild Application:**
   ```bash
   npm run build
   ```

3. **Redeploy Worker:**
   ```bash
   npx wrangler deploy
   ```

4. **Update Docker Image:**
   ```bash
   docker pull writenotenow/d1-manager:1.0.0
   ```

---

## 🐛 Known Issues

### Limitations
- **Database Renaming** - Uses migration approach (export/import) as D1 doesn't support native renaming
  - Temporary duplication during migration counts toward quota
  - Always backup before renaming
- **DEFAULT Values** - Complex default expressions (e.g., `datetime('now')`) not preserved during column modification
  - Column structure, types, and constraints are preserved
  - Data is migrated correctly
- **VACUUM Operation** - Not available via D1 REST API
  - D1 automatically manages space reclamation
  - Manual VACUUM: `wrangler d1 execute <database-name> --remote --command="VACUUM"`

### Workarounds
- **Large File Imports** - For files larger than 5GB, use Wrangler CLI directly
- **Complex Migrations** - For complex schema changes, use the query console for manual SQL execution

---

## 📚 Getting Started

### Quick Start (Local Development)
```bash
# Clone repository
git clone https://github.com/neverinfamous/d1-manager.git
cd d1-manager

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Terminal 1 - Frontend
npm run dev

# Terminal 2 - Worker API
npx wrangler dev --config wrangler.dev.toml --local

# Access at http://localhost:5173
```

### Quick Start (Docker)
```bash
# Pull and run
docker pull writenotenow/d1-manager:latest

docker run -d \
  -p 8080:8080 \
  -e ACCOUNT_ID=your_cloudflare_account_id \
  -e API_KEY=your_cloudflare_api_token \
  -e TEAM_DOMAIN=https://yourteam.cloudflareaccess.com \
  -e POLICY_AUD=your_cloudflare_access_aud_tag \
  --name d1-manager \
  writenotenow/d1-manager:latest

# Access at http://localhost:8080
```

### Production Deployment (Cloudflare Workers)
```bash
# Configure Wrangler
cp wrangler.toml.example wrangler.toml
# Edit wrangler.toml with your settings

# Create metadata database
npx wrangler d1 create d1-manager-metadata

# Initialize schema
npx wrangler d1 execute d1-manager-metadata --remote --file=worker/schema.sql

# Set secrets
npx wrangler secret put ACCOUNT_ID
npx wrangler secret put API_KEY
npx wrangler secret put TEAM_DOMAIN
npx wrangler secret put POLICY_AUD

# Build and deploy
npm run build
npx wrangler deploy
```

---

## 🚧 Roadmap

### Planned for Future Releases

#### Remaining Enhancements
- **Circular Dependency Detector** - Visual cycle highlighting in foreign key relationships
- **Dependency Export** - Export schema relationships as JSON documentation files
- **Force Delete Mode** - Developer toggle to bypass FK constraints with audit logging
- **Time Travel API Integration** - Point-in-time recovery when Cloudflare releases the feature
- **Analytics Dashboard** - Comprehensive usage metrics and query performance insights
- **Cross-Database Search** - Enhanced search across multiple databases simultaneously

> **Note:** Many features originally planned for v1.1.0 and v1.2.0 have been implemented and are documented in the "Unreleased - Post-1.0.0 Enhancements" section above.

---

## 🤝 Contributing

We welcome contributions from the community! Whether it's bug reports, feature requests, documentation improvements, or code contributions, your help is appreciated.

### How to Contribute
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Reporting Issues
- 🐛 **Bug Reports:** [GitHub Issues](https://github.com/neverinfamous/d1-manager/issues)
- 💡 **Feature Requests:** [GitHub Discussions](https://github.com/neverinfamous/d1-manager/discussions)
- 🔒 **Security Issues:** See [SECURITY.md](https://github.com/neverinfamous/d1-manager/blob/main/SECURITY.md)

---

## 📞 Support & Resources

### Documentation
- **GitHub Repository:** [neverinfamous/d1-manager](https://github.com/neverinfamous/d1-manager)
- **Live Demo:** [d1.adamic.tech](https://d1.adamic.tech/)
- **Docker Hub:** [writenotenow/d1-manager](https://hub.docker.com/r/writenotenow/d1-manager)

### Cloudflare Resources
- [D1 Documentation](https://developers.cloudflare.com/d1/)
- [Workers Documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare Access Documentation](https://developers.cloudflare.com/cloudflare-one/policies/access/)

### Community
- **GitHub Issues:** Bug reports and feature requests
- **GitHub Discussions:** Questions and community support
- **Email:** admin@adamic.tech

---

## 📄 License

D1 Database Manager is released under the **MIT License**. See the [LICENSE](https://github.com/neverinfamous/d1-manager/blob/main/LICENSE) file for details.

---

## 🙏 Acknowledgments

Special thanks to:
- **Cloudflare** - For D1, Workers, and Zero Trust platform
- **React Team** - For React 19 and excellent documentation
- **shadcn** - For the beautiful UI component library
- **Vite Team** - For the blazing-fast build tool
- **Community Contributors** - For feedback, bug reports, and suggestions

---

## 📊 Statistics

- **Total Components:** 50+
- **API Endpoints:** 25+
- **Lines of Code:** 10,000+
- **Dependencies:** Carefully curated and up-to-date
- **Docker Image Size:** ~150MB
- **Supported Platforms:** Web, Docker, Kubernetes
- **Browser Support:** Modern browsers (Chrome, Firefox, Safari, Edge)

---

## 🎯 Version 1.0.0 Highlights

✅ **Complete Database Management** - Full CRUD with migration-based renaming  
✅ **Advanced Table Operations** - Visual schema designer and bulk operations  
✅ **Column Management** - Add, rename, modify, and delete columns  
✅ **Foreign Key Analysis** - Comprehensive dependency viewer  
✅ **Row-Level Filtering** - Type-aware filters with URL persistence  
✅ **SQL Query Console** - Execute queries with history and CSV export  
✅ **Enterprise Authentication** - Cloudflare Access with Zero Trust  
✅ **Docker Support** - Multi-architecture containers with health checks  
✅ **Modern UI/UX** - Dark/Light themes, responsive design  
✅ **Production Ready** - Tested, documented, and deployed  

---

## 📝 Changelog

### [1.0.0] - 2025-11-02

#### Added
- Initial production release
- Complete database management (list, create, rename, delete)
- Advanced table operations with visual schema designer
- Column management (add, rename, modify, delete)
- Foreign key dependency viewer with cascade analysis
- Row-level filtering with type-aware operators
- SQL query console with history and CSV export
- Bulk operations for databases and tables
- Dark/Light/System theme support
- Cloudflare Access (Zero Trust) authentication
- Docker containerization with multi-architecture support
- Comprehensive documentation (README, DOCKER_README, SECURITY)
- Local development environment with mock data
- Production deployment guides for Workers and Docker
- Health check endpoint for monitoring
- Protected system database (d1-manager-metadata)

#### Technical
- React 19.2.0 with TypeScript 5.9.3
- Vite 7.1.12 build system
- Tailwind CSS 3.4.18 with shadcn/ui components
- Cloudflare Workers serverless runtime
- SQLite-compatible D1 database engine
- Multi-stage Docker builds for optimal size
- Kubernetes deployment manifests
- Security hardening and best practices

---

For questions, issues, or feedback, please visit our [GitHub repository](https://github.com/neverinfamous/d1-manager) or reach out to admin@adamic.tech.

