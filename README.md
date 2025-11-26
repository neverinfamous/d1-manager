# D1 Database Manager for Cloudflare

[![GitHub](https://img.shields.io/badge/GitHub-neverinfamous/d1--manager-blue?logo=github)](https://github.com/neverinfamous/d1-manager)
[![Docker Pulls](https://img.shields.io/docker/pulls/writenotenow/d1-manager)](https://hub.docker.com/r/writenotenow/d1-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
![Version](https://img.shields.io/badge/version-v1.0.0-green)
![Status](https://img.shields.io/badge/status-Production%2FStable-brightgreen)
[![Security](https://img.shields.io/badge/Security-Enhanced-green.svg)](https://github.com/neverinfamous/d1-manager/blob/main/SECURITY.md)
[![CodeQL](https://img.shields.io/badge/CodeQL-Passing-brightgreen.svg)](https://github.com/neverinfamous/d1-manager/security/code-scanning)
[![Type Safety](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://github.com/neverinfamous/d1-manager)

**Last Updated:** November 26, 2025 | **Version:** 1.0.0
**Tech Stack:** React 19.2.0 | Vite 7.1.12 | TypeScript 5.9.3 | Tailwind CSS | shadcn/ui | Cloudflare Workers + Zero Trust

A modern, full-featured web application for managing Cloudflare D1 databases with enterprise-grade authentication via Cloudflare Access (Zero Trust). Similar in design and functionality to the R2 Bucket Manager, providing capabilities beyond the standard Cloudflare dashboard.

**🎯 [Try the Live Demo](https://d1.adamic.tech/)** - See D1 Database Manager in action

**📰 [Read the v1.0.0 Release Article](https://adamic.tech/articles/2025-11-02-d1-manager-v1-0-0)** - Learn more about features, architecture, and deployment

**📖 [View the Wiki](https://github.com/neverinfamous/d1-manager/wiki)** - Comprehensive documentation and guides

---

## 🎯 Features

### Database Management
- **List & Browse** - View all D1 databases with metadata (created date, size, table count)
- **Create Database** - Interactive dialog for creating new databases
- **Rename Database** - Rename databases with migration-based approach (see details below)
- **Delete Database** - Remove databases with confirmation
- **Bulk Operations** - Select multiple databases for batch operations
  - **Multi-Select** - Checkbox on each database card with "Select All" option
  - **Bulk Download** - Export multiple databases as a single ZIP file of SQL dumps
  - **Bulk Delete** - Delete multiple databases with progress tracking
  - **Upload Database** - Import SQL files to create new databases or update existing ones
- **Database Cards** - Beautiful cards showing database information and quick actions

#### Table Operations
- **Browse Tables** - View all tables in a database with search functionality
- **Table Schema** - Detailed column information with types, primary keys, constraints
- **Table Data** - Paginated table browser (50 rows per page)
- **Row-Level Filtering** - Advanced type-aware filtering with server-side SQL WHERE clauses
  - **Type-Aware Operators** - TEXT (contains, equals, starts/ends with, IN), INTEGER/REAL (=, >, <, ≥, ≤, BETWEEN, IN), NULL checks
  - **Advanced Operators** - BETWEEN for ranges, IN for multiple values, NOT BETWEEN, NOT IN
  - **OR Logic** - Combine filters with AND or OR operators for complex queries
  - **Filter Bar UI** - Inline filters above table with dynamic inputs per operator type
  - **Filter Presets** - Built-in templates (last 7/30 days, ranges) and custom saved presets
  - **URL Persistence** - Filters stored in query params for shareable filtered views
  - **SQL Injection Protection** - Proper escaping and parameterization for all operators
  - **Active Indicators** - Badge count, highlighted inputs, "(filtered)" label, logic operator badges
- **Visual Schema Designer** - Create tables with visual column builder
  - Define column names and types (TEXT, INTEGER, REAL, BLOB, etc.)
  - Set primary keys and NOT NULL constraints
  - Add default values
  - Live SQL preview
  - Validation and error handling
- **Table CRUD Operations** - Complete table management capabilities
  - **Rename Table** - Individual rename button on each table card with validation
  - **Delete Table** - Drop tables with confirmation dialog and dependency analysis
  - **Clone Table** - Duplicate table structure, data, and indexes with custom names
  - **Export Table** - Download tables as SQL or CSV format
- **Bulk Table Operations** - Multi-select operations for efficiency
  - **Multi-Select** - Checkbox on each table card with "Select All" option
  - **Bulk Clone** - Clone multiple tables with suggested names (e.g., `table_copy`)
  - **Bulk Export** - Export multiple tables as SQL/CSV in a ZIP archive
  - **Bulk Delete** - Delete multiple tables with progress tracking and dependency analysis
- **Column Management** - Advanced schema modification capabilities
  - **Add Column** - Add new columns to existing tables with type, constraints, and defaults
  - **Rename Column** - Rename columns using ALTER TABLE RENAME COLUMN
  - **Modify Column** - Change column type, NOT NULL constraints, and default values (uses table recreation)
  - **Drop Column** - Remove columns from tables (uses ALTER TABLE DROP COLUMN)
- **Table Dependencies Viewer** - Foreign key relationship analysis before deletion
  - **Outbound Dependencies** - Shows tables this table references
  - **Inbound Dependencies** - Shows tables that reference this table
  - **Cascade Impact** - Displays ON DELETE behavior (CASCADE, RESTRICT, SET NULL, etc.)
  - **Row Count Estimates** - Shows number of rows affected by cascade operations
  - **Confirmation Required** - Mandatory acknowledgment checkbox when dependencies exist
  - **Per-Table View** - Collapsible accordion in bulk operations for detailed impact analysis
- **Cascade Impact Simulator** - Interactive visualization of DELETE operation impacts
  - **Interactive Graph Visualization** - ReactFlow-powered dependency graph with color-coded nodes
  - **Theoretical Simulation** - Non-destructive analysis with recursive traversal and circular dependency detection
  - **Detailed Impact Analysis** - Total affected rows, cascade depth, table-by-table breakdown
  - **Multi-Format Export** - CSV, JSON, Text, and PDF reports with visual graph
  - **Available** - In delete dialogs for both rows (TableView) and tables (DatabaseView)

#### Query Console
- **SQL Editor** - Execute custom SQL queries with syntax highlighting
- **Results Display** - Formatted table output with column headers and execution metrics
- **Keyboard Shortcuts** - Ctrl+Enter (Cmd+Enter on Mac) to execute
- **Skip Validation** - Optional checkbox to bypass validation for DROP/DELETE operations
- **Query Management** - Save, load, and manage frequently used queries
- **CSV Export** - Export query results directly to CSV files
- **History Tracking** - Automatic query execution history (backend ready)

#### User Experience
- **Dark/Light/System Themes** - Automatic theme switching with persistence
- **Responsive Design** - Works on desktop, tablet, and mobile
- **Beautiful UI** - Modern interface using shadcn/ui components
- **Navigation** - Seamless navigation between databases, tables, and query console
- **Search & Filter** - Search tables by name in database view, filter rows with type-aware operators

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- npm
- [Cloudflare account](https://dash.cloudflare.com/sign-up) (for production deployment)

### Local Development

1. **Clone the repository:**

   ```bash
   git clone https://github.com/yourusername/d1-manager.git
   ```

2. **Navigate to the project directory:**

   ```bash
   cd d1-manager
   ```

3. **Install dependencies:**

   ```bash
   npm install
   ```

4. **Set up environment:**

   ```bash
   cp .env.example .env
   ```

   The defaults work for local development. Edit if needed.

5. **Run development servers (requires 2 terminal windows):**
   
   **Terminal 1 - Frontend (Vite):**
   
   ```bash
   npm run dev
   ```
   
   Runs on: `http://localhost:5173`

   **Terminal 2 - Worker API (Wrangler):**
   
   ```bash
   npx wrangler dev --config wrangler.dev.toml --local
   ```
   
   Runs on: `http://localhost:8787`

6. **Access the app:**

   Open `http://localhost:5173` in your browser

### Local Development Features

- ✅ **No Authentication** - Auth disabled for localhost
- ✅ **Mock D1 Data** - Returns sample databases, tables, and query results
- ✅ **No Secrets Required** - Works without Cloudflare API keys
- ✅ **Hot Reload** - Frontend and backend auto-reload on changes
- ✅ **Full UI Testing** - All features testable without production setup

---

## 📋 Project Structure

```
d1-manager/
├── src/                          # Frontend source
│   ├── components/               # React components
│   │   ├── DatabaseView.tsx      # Database table list
│   │   ├── TableView.tsx         # Table data browser
│   │   ├── QueryConsole.tsx      # SQL query executor
│   │   ├── SchemaDesigner.tsx    # Visual table creator
│   │   ├── ThemeToggle.tsx       # Theme switcher
│   │   └── ui/                   # shadcn/ui components
│   ├── contexts/                 # React contexts
│   │   └── ThemeContext.tsx      # Theme management
│   ├── hooks/                    # Custom React hooks
│   │   └── useTheme.ts           # Theme hook
│   ├── services/                 # API & Auth services
│   │   ├── api.ts                # API client
│   │   └── auth.ts               # Authentication
│   ├── App.tsx                   # Main app with routing
│   ├── main.tsx                  # React entry point
│   └── index.css                 # Tailwind CSS + themes
├── worker/                       # Cloudflare Worker
│   ├── routes/                   # API route handlers
│   │   ├── databases.ts          # Database CRUD
│   │   ├── tables.ts             # Table operations
│   │   └── queries.ts            # Query execution
│   ├── utils/                    # Utilities
│   │   ├── auth.ts               # JWT validation
│   │   ├── cors.ts               # CORS headers
│   │   └── helpers.ts            # Helper functions
│   ├── types/                    # TypeScript types
│   ├── index.ts                  # Worker entry point
│   └── schema.sql                # Metadata DB schema
├── wrangler.toml.example         # Production config template
├── wrangler.dev.toml             # Development config
├── tailwind.config.js            # Tailwind configuration
├── components.json               # shadcn/ui config
├── VERSION                       # Version number (1.0.0)
└── package.json
```

---

## 🔧 API Endpoints

### Databases
- `GET /api/databases` - List all D1 databases
- `POST /api/databases` - Create a new database
- `POST /api/databases/:dbId/rename` - Rename a database (migration-based)
- `DELETE /api/databases/:dbId` - Delete a database
- `GET /api/databases/:dbId/info` - Get database information
- `POST /api/databases/export` - Export multiple databases (returns SQL content for ZIP creation)
- `POST /api/databases/import` - Import SQL file to create new or update existing database

### Tables
- `GET /api/tables/:dbId/list` - List all tables in a database
- `GET /api/tables/:dbId/schema/:tableName` - Get table schema (columns, types)
- `GET /api/tables/:dbId/data/:tableName` - Get table data with pagination and filtering
  - Query params: `limit`, `offset`, `filter_<column>`, `filterValue_<column>`
  - Filter types: contains, equals, notEquals, gt, gte, lt, lte, isNull, isNotNull, startsWith, endsWith
- `GET /api/tables/:dbId/indexes/:tableName` - Get table indexes
- `GET /api/tables/:dbId/dependencies?tables=table1,table2` - Get foreign key dependencies for tables
- `POST /api/tables/:dbId/create` - Create a new table
- `DELETE /api/tables/:dbId/:tableName` - Drop a table
- `PATCH /api/tables/:dbId/:tableName/rename` - Rename a table
- `POST /api/tables/:dbId/:tableName/clone` - Clone a table (structure, data, and indexes)
- `GET /api/tables/:dbId/:tableName/export?format=sql|csv` - Export table as SQL or CSV

#### Column Operations
- `POST /api/tables/:dbId/:tableName/columns/add` - Add a new column to a table
- `PATCH /api/tables/:dbId/:tableName/columns/:columnName/rename` - Rename a column
- `PATCH /api/tables/:dbId/:tableName/columns/:columnName/modify` - Modify column type/constraints
- `DELETE /api/tables/:dbId/:tableName/columns/:columnName` - Drop a column

### Queries
- `POST /api/query/:dbId/execute` - Execute a SQL query
- `POST /api/query/:dbId/batch` - Execute multiple queries in a batch
- `GET /api/query/:dbId/history` - Get query execution history

### Foreign Keys
- `GET /api/tables/:dbId/foreign-keys` - Get all foreign keys for a database (returns graph structure with nodes and edges)
- `POST /api/tables/:dbId/foreign-keys/add` - Add a new foreign key constraint
  - Body: `{ sourceTable, sourceColumn, targetTable, targetColumn, onDelete, onUpdate, constraintName? }`
- `PATCH /api/tables/:dbId/foreign-keys/:constraintName` - Modify foreign key ON DELETE/ON UPDATE behavior
  - Body: `{ onDelete?, onUpdate? }`
- `DELETE /api/tables/:dbId/foreign-keys/:constraintName` - Remove a foreign key constraint

### Index Analyzer
- `GET /api/indexes/:dbId/analyze` - Analyze database and return index recommendations based on schema and query patterns

---

## 🎨 Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.2.0 | UI library |
| TypeScript | 5.9.3 | Type safety |
| Vite | 7.1.12 | Build tool & dev server |
| Tailwind CSS | 3.4.18 | Utility-first CSS framework |
| shadcn/ui | Latest | Pre-built component library |
| Lucide React | Latest | Icon library |
| ReactFlow | Latest | Interactive graph visualization |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Cloudflare Workers | Runtime API | Serverless edge compute |
| Cloudflare D1 | Latest | SQLite-compatible database |
| Cloudflare Access | Zero Trust | Enterprise authentication |
| TypeScript | 5.9.3 | Type safety |

---

## 🌓 Theme Support

D1 Database Manager supports three theme modes:

- **System** (default) - Automatically follows your OS/browser preference
- **Light** - Force light mode
- **Dark** - Force dark mode

Click the theme toggle button in the header to cycle through modes. Your preference is saved and persists across sessions.

---

## 📝 Development Notes

### Protected System Databases

D1 Manager automatically hides and protects system metadata databases from all operations to prevent accidental corruption of dependent applications:

- **Pattern-based Protection** - Any database ending with `-metadata` or `-metadata-dev` is automatically protected
- **Protected Databases** - Includes `d1-manager-metadata` (query history, saved queries, undo history), `kv-manager-metadata` (KV Manager tags and audit logs), and similar system databases
- **What's Blocked** - Database list visibility, info requests, delete, rename, export, table operations, and query execution
- **Error Response** - Returns 403 Forbidden with clear message: "This database is used by system applications and cannot be accessed"
- **Cross-Application Safety** - Prevents users from breaking KV Manager, D1 Manager, and other applications in the Cloudflare ecosystem

**Benefits:**
- Safeguards the demo site where multiple applications coexist
- Prevents accidental corruption of critical application data
- Future-proof protection for new system databases
- Users protected from self-inflicted damage across all installations

### Mock Data in Local Development

The Worker automatically detects localhost requests and returns mock data including sample databases (`dev-database`, `test-database`), tables (`users`, `posts`, `comments`), realistic schemas, query results, and simulated export/import operations. This allows full UI testing without Cloudflare credentials.

### Bulk Operations

The D1 Manager supports efficient bulk operations on both databases and tables with multi-select checkboxes, progress tracking, and ZIP archive generation.

#### Database Operations
- **Multi-select** with "Select All" option and visual selection indicators
- **Bulk Optimize** - Run ANALYZE on multiple databases with progress tracking
  - **ANALYZE** (PRAGMA optimize) - Updates query statistics for better query performance
  - Sequential execution with per-operation progress indicators
  - Error reporting per database
  - Note: VACUUM is not available via D1 REST API (D1 automatically manages space reclamation)
  - For manual VACUUM: `wrangler d1 execute <database-name> --remote --command="VACUUM"`
- **Bulk Download** - ZIP archive of SQL dumps using D1's export API
- **Bulk Delete** - Sequential deletion with progress tracking and error reporting
- **Upload/Import** - Create new databases or import into existing ones (up to 5GB SQL files)

#### Table Operations  
- **Multi-select** with visual selection feedback
- **Bulk Clone** - Duplicate tables with custom names, including structure, data, and indexes
- **Bulk Export** - SQL or CSV format, single file or ZIP archive for multiple tables
- **Bulk Delete** - Sequential deletion with dependency analysis (see below)

### Table Dependencies Viewer

The D1 Manager includes a comprehensive foreign key dependency viewer that analyzes relationships before table deletion, preventing accidental data loss from cascade operations.

**How It Works:**

When you attempt to delete a table (single or bulk), the system automatically:
1. Analyzes all foreign key relationships using `PRAGMA foreign_key_list()`
2. Identifies both inbound and outbound dependencies
3. Calculates row counts for impact assessment
4. Displays cascade behavior (CASCADE, RESTRICT, SET NULL, etc.)
5. Requires explicit confirmation if dependencies exist

**Dependency Types:**

- **Outbound Dependencies** - Tables that this table references via foreign keys
  - Shows which tables would be affected if related data is deleted
  - Displays the referring column name
  - Shows ON DELETE behavior

- **Inbound Dependencies** - Tables that reference this table via foreign keys
  - Critical for understanding cascade impact
  - Highlights potential data loss (e.g., "Deleting will cascade to 152 rows")
  - Color-coded by severity: CASCADE (yellow), RESTRICT (red), SET NULL (blue)

**User Interface:**

- **Single Table Delete** - Dependencies displayed directly in the dialog with clear warnings
- **Bulk Delete** - Collapsible accordion showing per-table dependencies with badge counts
- **Confirmation Checkbox** - Mandatory acknowledgment: "I understand that deleting this table will affect dependent tables"
- **Smart Validation** - Delete button disabled until confirmation checkbox is checked (only when dependencies exist)

**Example Warning:**
```
⚠ Table comments references posts (ON DELETE CASCADE). Deleting will cascade to 152 rows.
```

**Benefits:**

- Prevents accidental data loss from cascade deletions
- Makes foreign key constraints visible before destructive operations
- Helps understand database schema relationships
- Provides row count impact for informed decisions
- Works seamlessly in both local development (mock data) and production

### Cascade Impact Simulator

The D1 Manager includes a comprehensive **Cascade Impact Simulator** that provides an interactive visualization of DELETE operations before execution, offering unprecedented transparency into foreign key relationships and cascade impacts.

**Key Features:**

- **Interactive Graph Visualization** - ReactFlow-powered dependency graph with color-coded nodes:
  - 🔴 Red nodes - Source tables/rows being deleted
  - 🟡 Yellow nodes - CASCADE operations (data will be deleted)
  - 🔵 Blue nodes - SET NULL operations (foreign keys will be nullified)
  - ⚪ Gray nodes - RESTRICT/NO ACTION (no automatic changes)
  
- **Theoretical Simulation** - Non-destructive analysis that:
  - Performs recursive graph traversal to identify all affected tables
  - Detects circular dependency chains
  - Implements depth limiting to prevent infinite loops
  - Calculates theoretical impact without modifying data
  
- **Detailed Impact Analysis** - Comprehensive reporting including:
  - Total affected rows across all tables
  - Maximum cascade depth in the dependency chain
  - Table-by-table breakdown with row counts and actions
  - Warning system with severity levels (Info, Warning, Critical)
  - Visual indicators for each operation type
  
- **Multi-Format Export** - Generate reports in multiple formats:
  - **CSV** - Spreadsheet-compatible data for analysis
  - **JSON** - Structured data for programmatic use
  - **Text** - Human-readable summary report
  - **PDF** - Professional report with embedded graph visualization

**Access Points:**

- **Table Delete Dialogs** - Available when deleting tables in DatabaseView
- **Row Delete Operations** - Available when deleting rows with foreign key constraints in TableView
- **Single & Bulk Operations** - Works for both individual and multi-select deletions

**Use Cases:**

- Preview the full impact of deleting a table or row before committing
- Understand complex foreign key relationships visually
- Generate documentation of database dependencies
- Audit cascade operations for compliance requirements
- Train team members on database schema relationships

**Example Scenarios:**

1. **Deleting a User** - See all related orders, comments, and sessions that will be affected
2. **Dropping a Parent Table** - Visualize the cascade to all child tables
3. **Bulk Deletions** - Understand the combined impact of removing multiple entities
4. **Circular Dependencies** - Identify and understand circular foreign key chains

**Technical Details:**

The simulator uses `PRAGMA foreign_key_list()` to extract relationship metadata, then builds a directed graph representing the dependency structure. It recursively traverses the graph, simulating DELETE operations and tracking affected rows at each level. The visualization uses ReactFlow for interactive node manipulation, zooming, and panning. Export functionality leverages jsPDF for PDF generation with embedded canvas snapshots of the graph.

### Column Management

Comprehensive schema modification from the table view with always-visible action buttons on each column row.

**Operations:**
- **Add Column** - Define name, type (TEXT/INTEGER/REAL/BLOB/NUMERIC), constraints, and default values
- **Rename Column** - Fast operation using `ALTER TABLE RENAME COLUMN` (SQLite 3.25.0+)
- **Modify Type/Constraints** - Uses table recreation method with automatic data migration
- **Delete Column** - Uses `ALTER TABLE DROP COLUMN` (SQLite 3.35.0+), validates for single-column tables

**Important Notes:**
- Modifying column types uses table recreation (temporary duplication), which may result in data loss for incompatible conversions
- Indexes are preserved during operations
- Backup recommended before destructive changes
- All operations validate for conflicts before execution

### Database Renaming

Migration-based approach with automatic export/import since D1 doesn't natively support renaming.

**Process:** Validates name → Creates new database → Exports data → Imports → **Verifies integrity** → Deletes original

**Safety Features:**
- **FTS5 Detection** - Automatically blocks rename for databases with FTS5 tables (D1 export API limitation)
- **Integrity Verification** - Validates table count, row counts, and schema structure before deleting original
- **Automatic Rollback** - Deletes new database and preserves original if verification fails
- Backup warning with one-click download button
- Mandatory confirmation checkbox
- Real-time progress tracking with verification step
- Name validation (3-63 chars, lowercase a-z, 0-9, hyphens, no leading/trailing hyphens)

**Limitations:**
- **Cannot rename databases with FTS5 tables** - Cloudflare D1's export API does not support virtual tables (FTS5)
- Temporary duplication during migration counts toward quota
- Always backup first before attempting rename

**Verification Process:**
The system automatically verifies data integrity after import by comparing:
- Table counts between source and target
- Row counts for each table
- Schema structure (column counts)

If any verification fails, the new database is automatically deleted and the original remains untouched.

### Authentication & Development

- **Production:** Cloudflare Access JWT validation with Zero Trust integration (GitHub OAuth, etc.)
- **Local Development:** Auth bypassed for localhost, mock data for testing

---

## 🚀 Production Deployment

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed
- Domain managed by Cloudflare (optional - can use workers.dev subdomain)

### Setup Steps

1. **Configure Wrangler:**

   ```bash
   cp wrangler.toml.example wrangler.toml
   ```

   Edit `wrangler.toml` with your settings:
   - Update `name` to your Worker name
   - Set `routes` for custom domains (or remove for workers.dev)
   - Configure D1 database binding

2. **Authenticate with Cloudflare:**

   ```bash
   npx wrangler login
   ```

3. **Create D1 Database for Metadata:**

   ```bash
   npx wrangler d1 create d1-manager-metadata
   ```

   Copy the `database_id` into `wrangler.toml` under `[[d1_databases]]`

4. **Initialize Database Schema:**

   ```bash
   npx wrangler d1 execute d1-manager-metadata --remote --file=worker/schema.sql
   ```

   **Note for existing users upgrading:** If you're upgrading from an earlier version, run this command again to add new tables (like `undo_history` for the rollback feature). Existing tables won't be affected.

5. **Set Up Cloudflare Access (Zero Trust):**
   - Navigate to [Cloudflare Zero Trust](https://one.dash.cloudflare.com/)
   - Set up GitHub OAuth under **Settings → Authentication**
   - Create a new Access Application for your domain(s)
   - Configure policies (e.g., allow GitHub users from your org)
   - Copy the **Application Audience (AUD) tag**

6. **Create API Token:**
   - Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
   - Click **Create Token** → **Create Custom Token**
   - Name it: `D1-Manager-Token`
   - Permissions:
     - **Account** → **D1** → **Edit**
   - Click **Continue to summary** → **Create Token**
   - Copy the token immediately (it won't be shown again)

7. **Set Worker Secrets:**

   Set your Cloudflare Account ID:
   
   ```bash
   npx wrangler secret put ACCOUNT_ID
   ```

   Set your API Token (from step 6):
   
   ```bash
   npx wrangler secret put API_KEY
   ```

   Set your Cloudflare Access team domain:
   
   ```bash
   npx wrangler secret put TEAM_DOMAIN
   ```

   Set your Application Audience tag (from step 5):
   
   ```bash
   npx wrangler secret put POLICY_AUD
   ```

8. **Update Environment for Production:**
   
   Edit `.env` to comment out the local development API. For production, leave `VITE_WORKER_API` commented so it uses `window.location.origin`.

9. **Build the frontend:**

   ```bash
   npm run build
   ```

10. **Deploy to Cloudflare:**

    ```bash
    npx wrangler deploy
    ```

### Deployment Domains

After deployment, your D1 Manager will be available at:
- **Workers.dev:** `https://your-worker-name.your-account.workers.dev`
- **Custom Domain:** `https://yourdomain.com` (if configured in `wrangler.toml`)

### Verification

1. Navigate to your deployed URL
2. You should be redirected to GitHub OAuth login (via Cloudflare Access)
3. After authentication, you'll see your production D1 databases

### Troubleshooting

**"Failed to list databases" Error:**

- Verify all secrets are set correctly:

  ```bash
  npx wrangler secret list
  ```

- Ensure API token has **D1 Edit** permissions (not just Read)
- Check that `ACCOUNT_ID` matches your Cloudflare account
- Use **API Token** (not Global API Key) for authentication

**Authentication Loop:**
- Verify `TEAM_DOMAIN` is correct (include `https://`)
- Check `POLICY_AUD` matches your Access application
- Ensure your GitHub account is allowed in Access policies

**Mock Data in Production:**

- Check that `.env` does NOT have `VITE_WORKER_API=http://localhost:8787`
- Rebuild and redeploy:

  ```bash
  npm run build
  ```

  ```bash
  npx wrangler deploy
  ```

**Migration Wizard Notes:**
- DEFAULT values (e.g., `datetime('now')`) are not preserved during migration
- Column structure, types, constraints, and all data are migrated correctly
- This is intentional to avoid SQL syntax issues with complex default expressions

For more help, see [Cloudflare Workers Troubleshooting](https://developers.cloudflare.com/workers/troubleshooting/).

### Upgrading from Previous Versions

If you're upgrading an existing installation, run the following commands to add new features:

**1. Update the schema (adds Job History tables):**

```bash
npx wrangler d1 execute d1-manager-metadata --remote --file=worker/schema.sql
```

**2. Rebuild and redeploy:**

```bash
npm run build
```

```bash
npx wrangler deploy
```

> **Note:** The schema file uses `CREATE TABLE IF NOT EXISTS`, so running it multiple times is safe and won't affect existing data.

---

## 📋 Roadmap

### ✅ Completed Features
- Database list, create, rename, delete with migration-based approach
- Table browsing with search and schema viewer
- Table data viewer with pagination and type-aware filtering
- SQL query console with execution, history, and CSV export
- Visual schema designer for table creation
- Dark/Light/System theme support
- Local development with mock data
- Cross-database search capabilities
- Visual query builder with saved queries
- Database comparison with detailed schema diffs
- Migration wizard for database-to-database transfers
- Backup/Restore UI (ready for Time Travel API integration)
- Analytics dashboard structure
- Multi-database operations (bulk download, delete, upload)
- Complete table management with multi-select, rename, delete, clone, and export
- Full column management (add, rename, modify, delete columns)
- Table dependencies viewer with foreign key relationship analysis
- Cascade Impact Simulator - Interactive graph visualization with ReactFlow, multi-format export (CSV/JSON/Text/PDF), and theoretical impact analysis
- **Undo/Rollback System** - Restore dropped tables, columns, or deleted rows
  - **10-Operation History** - Keeps last 10 destructive operations per database
  - **Automatic Snapshots** - Captures full table schemas, indexes, and data before DROP operations
  - **Per-Database** - Undo history stored in metadata database with proper indexing
  - **Global Undo Button** - Badge count in header shows available undo operations
  - **Detailed History Dialog** - View all past operations with timestamps and descriptions
  - **Supported Operations**: Table drops, column drops, row deletes
  - **Smart Restoration** - Detects conflicts and provides clear warnings before restoring
- **Foreign Key Visualizer/Editor** - Interactive graph-based relationship management
  - **Dual Layout System** - Switch between hierarchical (dagre) and force-directed layouts
  - **Interactive Graph** - ReactFlow-powered visualization with pan, zoom, and minimap
  - **Add Foreign Keys** - Create new foreign key constraints with validation
  - **Modify Constraints** - Edit ON DELETE and ON UPDATE behaviors
  - **Delete Constraints** - Remove foreign key relationships
  - **Type Validation** - Automatic column type compatibility checking
  - **Orphan Detection** - Prevents adding FKs that would violate referential integrity
  - **Color-Coded Edges** - Visual distinction between CASCADE, RESTRICT, SET NULL, and NO ACTION
  - **Table Filtering** - Focus on specific tables and their relationships
  - **Column Display** - Shows table columns with types and primary key indicators
  - **Accessible Tab** - Integrated as "Relationships" tab alongside Tables and Query Builder
- **FTS5 Virtual Table Management** - Full-text search with SQLite FTS5
  - **Visual Schema Designer** - Create FTS5 tables with interactive column builder
  - **Table Converter** - Convert existing tables to FTS5 with external content support
  - **Multiple Tokenizers** - Unicode61, Porter, Trigram, and ASCII tokenization
  - **Advanced Configuration** - Diacritic handling, separators, token characters, case sensitivity
  - **Prefix Indexing** - Enable autocomplete with configurable prefix lengths
  - **Dedicated Search Interface** - Advanced search UI with BM25 ranking and highlighting
  - **Search Operators** - AND, OR, NOT, NEAR, phrase matching, column filters
  - **Performance Metrics** - Execution time, efficiency, rows scanned with recommendations
  - **Index Maintenance** - Rebuild and optimize operations with statistics
  - **Sync Triggers** - Auto-generate triggers for external content tables
  - **Full-Text Search Tab** - Dedicated FTS5 management interface in database view
- **Constraint Validator** - Detect and fix data integrity violations
  - **Full Database Scans** - Validate all FK, NOT NULL, and UNIQUE constraints
  - **Automatic Pre-Operation Checks** - Warn before destructive operations
  - **Orphan Detection** - Find records with broken foreign key references
  - **NOT NULL Violations** - Identify NULL values in NOT NULL columns
  - **UNIQUE Violations** - Detect duplicate values in unique columns
  - **Guided Fix Workflow** - Apply fixes with explicit user confirmation
  - **Fix Strategies** - Delete orphans or set to NULL with impact preview
  - **Dedicated Tab** - Integrated as "Constraints" tab in database view
- **Index Analyzer** - Intelligent index recommendations for optimal performance
  - **Schema Analysis** - Detect foreign keys, unique constraints, and commonly queried column types
  - **Query Pattern Detection** - Analyze query history to identify frequently filtered/joined columns
  - **Priority Scoring** - High/Medium/Low recommendations based on query frequency and impact
  - **Estimated Impact** - Clear explanations of expected performance improvements
  - **One-Click Creation** - Generate and execute CREATE INDEX statements instantly
  - **Existing Index Display** - View all current indexes organized by table
  - **Statistics Dashboard** - Total recommendations, tables without indexes, query efficiency metrics
  - **Performance Tab** - Dedicated index analysis interface in database view
- **ER Relationship Diagram** - Visual entity-relationship diagram generator
  - **Dual View Mode** - Toggle between Foreign Key Editor and ER Diagram in Relationships tab
  - **Visual Schema Display** - Tables with primary keys (🔑) and foreign keys (🔗)
  - **Interactive Navigation** - Click tables to navigate to data view
  - **Multiple Layouts** - Hierarchical and force-directed graph layouts
  - **Multi-Format Export** - Export as PNG image, SVG vector, or JSON data
  - **Relationship Visualization** - Color-coded edges for CASCADE, RESTRICT, SET NULL
  - **Read-Only Mode** - Focus on understanding schema without accidental edits
  - **Zoom & Pan** - ReactFlow controls with minimap for large schemas
- **Advanced Row Filters** - Enhanced filtering with OR logic, BETWEEN, IN operators, and presets
  - **OR Logic** - Combine filters with AND or OR operators for complex query conditions
  - **BETWEEN Operator** - Range queries for numeric and date columns (e.g., age BETWEEN 18 AND 65)
  - **IN Operator** - Filter by multiple specific values (e.g., status IN ('active', 'pending'))
  - **NOT BETWEEN/NOT IN** - Inverse range and list operations
  - **Filter Presets** - Built-in templates (last 7/30 days, this month/year, ranges 0-100, positive values)
  - **Custom Presets** - Save and manage your own filter combinations in localStorage
  - **Multi-Value Input** - Comma-separated list input with 100-value limit for performance
  - **Dynamic UI** - Two inputs for BETWEEN, textarea for IN, AND/OR toggle buttons
  - **SQL Injection Protection** - All new operators properly escaped and validated
- **Foreign Key Navigation** - Direct navigation between dependent tables with breadcrumbs
  - **Clickable FK Values** - Foreign key columns display as interactive links with visual indicators
  - **Auto-Filtering** - Automatically applies filters when navigating via FK relationships
  - **Breadcrumb Trail** - Shows navigation path (Database > Table1 > Table2 > Table3)
  - **Smart Navigation** - Click to jump to referenced tables or use breadcrumbs to go back
  - **Keyboard Shortcuts** - Alt+Left for back navigation through table history
  - **Visual Indicators** - FK columns highlighted with link icons and tooltips showing references
- **Circular Dependency Detector** - Proactive schema analysis and cycle detection
  - **DFS Algorithm** - Depth-first search with path tracking for cycle detection
  - **Severity Classification** - Low/Medium/High based on cycle length and CASCADE presence
  - **Interactive Visualization** - ReactFlow graph showing only circular dependency chains
  - **Pre-Add Validation** - Warns before adding FKs that would create cycles
  - **Breaking Suggestions** - Recommends which constraints to modify
  - **Dedicated Tab** - "Circular Dependencies" tab in database view with cycle count
  - **Visual Indicators** - Highlight cycles button in Foreign Key Visualizer with pulsing animation
  - **Acknowledgment Required** - Checkbox to proceed with FK creation despite cycle warning
- **Job History** - Track and monitor bulk operations
  - **Operation Tracking** - View all bulk operations (export, import, delete, rename, optimize)
  - **Status Badges** - Color-coded status (queued, running, completed, failed, cancelled)
  - **Advanced Filtering** - Filter by status, operation type, database, date range, job ID, errors
  - **Event Timeline** - Detailed progress milestones and error details for each job
  - **Job Details Dialog** - Click any job to view full event history with timestamps
  
## Planned Features

### 1. Dependency Export
Export schema relationships as JSON or documentation files
- Useful for audits and documentation

### 2. Force Delete Mode
Developer-only toggle to bypass FK constraints (with audit logging)
- Low-value, niche power-user feature for controlled environments

---

## 🤝 Contributing

Contributions are welcome! This project follows the same patterns as the R2 Bucket Manager.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

MIT License - see LICENSE file for details

---

## 📞 Support

- 🐛 **Bug Reports:** [GitHub Issues](https://github.com/yourusername/d1-manager/issues)
- 💡 **Feature Requests:** [GitHub Discussions](https://github.com/yourusername/d1-manager/discussions)

---

## 📚 Additional Resources

- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare Access Documentation](https://developers.cloudflare.com/cloudflare-one/policies/access/)
- [React 19 Documentation](https://react.dev/)
- [Tailwind CSS Documentation](https://tailwindcss.com/)
- [shadcn/ui Documentation](https://ui.shadcn.com/)
- [D1 Manager Wiki](https://github.com/neverinfamous/d1-manager/wiki)

---

**Made with ❤️ for the Cloudflare community**
