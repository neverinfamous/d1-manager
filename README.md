# D1 Database Manager for Cloudflare

**Last Updated:** November 1, 2025 | **Version:** 2.1.0  
**Tech Stack:** React 19.2.0 | Vite 7.1.12 | TypeScript 5.9.3 | Tailwind CSS | shadcn/ui | Cloudflare Workers + Zero Trust

A modern, full-featured web application for managing Cloudflare D1 databases with enterprise-grade authentication via Cloudflare Access (Zero Trust). Similar in design and functionality to the R2 Bucket Manager, providing capabilities beyond the standard Cloudflare dashboard.

---

## 🎯 Features

### ✅ Phase 1 - Basic Functionality (Complete)

#### Database Management
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
- **Search & Filter** - Search tables by name in database view

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- npm
- [Cloudflare account](https://dash.cloudflare.com/sign-up) (for production deployment)

### Local Development

1. **Clone and install:**
   ```bash
   git clone https://github.com/yourusername/d1-manager.git
   cd d1-manager
   npm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   ```
   The defaults work for local development. Edit if needed.

3. **Run development servers (requires 2 terminal windows):**
   
   **Terminal 1 - Frontend (Vite):**
   ```bash
   npm run dev
   ```
   - Runs on: `http://localhost:5173`
   - Hot Module Replacement enabled
   - Watches for file changes automatically

   **Terminal 2 - Worker API (Wrangler):**
   ```bash
   npx wrangler dev --config wrangler.dev.toml --local
   ```
   - Runs on: `http://localhost:8787`
   - Uses mock data (no Cloudflare credentials required)
   - Automatically reloads on code changes

4. **Access the app:**
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
- `GET /api/tables/:dbId/data/:tableName` - Get table data (supports pagination)
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

### Mock Data in Local Development

The Worker automatically detects localhost requests and returns mock data including sample databases (`dev-database`, `test-database`), tables (`users`, `posts`, `comments`), realistic schemas, query results, and simulated export/import operations. This allows full UI testing without Cloudflare credentials.

### Bulk Operations

The D1 Manager supports efficient bulk operations on both databases and tables with multi-select checkboxes, progress tracking, and ZIP archive generation.

#### Database Operations
- **Multi-select** with "Select All" option and visual selection indicators
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
4. Displays cascade behavior (CASCADE, RESTRICT, SET NULL, NO ACTION)
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

**Process:** Validates name → Creates new database → Exports data → Imports → Verifies → Deletes original

**Safety Features:**
- Backup warning with one-click download button
- Mandatory confirmation checkbox
- Real-time progress tracking
- Automatic rollback on failure
- Name validation (3-63 chars, lowercase a-z, 0-9, hyphens, no leading/trailing hyphens)

**Note:** Temporary duplication during migration counts toward quota. Always backup first.

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

2. **Create D1 Database for Metadata:**
   ```bash
   npx wrangler login
   npx wrangler d1 create d1-manager-metadata
   ```
   Copy the `database_id` into `wrangler.toml` under `[[d1_databases]]`

3. **Initialize Database Schema:**
   ```bash
   npx wrangler d1 execute d1-manager-metadata --remote --file=worker/schema.sql
   ```

4. **Set Up Cloudflare Access (Zero Trust):**
   - Navigate to [Cloudflare Zero Trust](https://one.dash.cloudflare.com/)
   - Set up GitHub OAuth under **Settings → Authentication**
   - Create a new Access Application for your domain(s)
   - Configure policies (e.g., allow GitHub users from your org)
   - Copy the **Application Audience (AUD) tag**

5. **Create API Token:**
   - Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
   - Click **Create Token** → **Create Custom Token**
   - Name it: `D1-Manager-Token`
   - Permissions:
     - **Account** → **D1** → **Edit**
   - Click **Continue to summary** → **Create Token**
   - Copy the token immediately (it won't be shown again)

6. **Set Worker Secrets:**
   ```bash
   # Your Cloudflare Account ID (from dashboard URL)
   npx wrangler secret put ACCOUNT_ID

   # API Token with D1 Edit permissions (from step 5)
   npx wrangler secret put API_KEY

   # Cloudflare Access team domain (e.g., https://yourteam.cloudflareaccess.com)
   npx wrangler secret put TEAM_DOMAIN

   # Application Audience tag from Cloudflare Access (from step 4)
   npx wrangler secret put POLICY_AUD
   ```

7. **Update Environment for Production:**
   
   Edit `.env` to comment out the local development API:
   ```env
   # VITE_WORKER_API=http://localhost:8787
   # Uncomment the line above for local development only
   # For production, leave it commented so it uses window.location.origin
   ```

8. **Build and Deploy:**
   ```bash
   npm run build
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
- Verify all secrets are set correctly: `npx wrangler secret list`
- Ensure API token has **D1 Edit** permissions (not just Read)
- Check that `ACCOUNT_ID` matches your Cloudflare account
- Use **API Token** (not Global API Key) for authentication

**Authentication Loop:**
- Verify `TEAM_DOMAIN` is correct (include `https://`)
- Check `POLICY_AUD` matches your Access application
- Ensure your GitHub account is allowed in Access policies

**Mock Data in Production:**
- Check that `.env` does NOT have `VITE_WORKER_API=http://localhost:8787`
- Rebuild frontend: `npm run build && npx wrangler deploy`

**Migration Wizard Notes:**
- DEFAULT values (e.g., `datetime('now')`) are not preserved during migration
- Column structure, types, constraints, and all data are migrated correctly
- This is intentional to avoid SQL syntax issues with complex default expressions

For more help, see [Cloudflare Workers Troubleshooting](https://developers.cloudflare.com/workers/troubleshooting/).

---

## 📋 Roadmap

### ✅ Phase 1 - Basic Functionality (COMPLETE)
- ✅ Database list, create, rename, delete
- ✅ Table browsing with search
- ✅ Table data viewer with pagination
- ✅ SQL query console with execution
- ✅ Visual schema designer for table creation
- ✅ Dark/Light/System theme support
- ✅ Local development with mock data

### ✅ Phase 2 - Advanced Features (COMPLETE)
- ✅ **Cross-database search** - Search text across all databases
- ✅ **Visual query builder** - Build queries visually with saved queries
- ✅ **Database comparison** - Compare schemas with detailed diffs
- ✅ **Migration wizard** - 5-step wizard for database-to-database migrations
- ✅ **Backup/Restore** - UI ready for Time Travel API integration
- ✅ **Analytics** - Dashboard structure prepared for production
- ✅ **Multi-database operations** - Bulk download, delete, and upload capabilities
- ✅ **Table CRUD enhancements** - Complete table management with multi-select
  - Rename, delete, clone, and export tables
  - Bulk operations with progress tracking
  - Export as SQL or CSV with format selection
- ✅ **Column management** - Full schema modification capabilities
  - Add columns with type, constraints, and defaults
  - Rename columns (ALTER TABLE RENAME COLUMN)
  - Modify column types and constraints (table recreation)
  - Delete columns (ALTER TABLE DROP COLUMN)
  - Always-visible action buttons with validation
- ✅ **Table dependencies viewer** - Foreign key relationship analysis before deletion
  - Shows inbound/outbound dependencies with row counts
  - Displays cascade behavior (CASCADE, RESTRICT, SET NULL, etc.)
  - Requires confirmation when dependencies exist
  - Per-table collapsible view in bulk operations

---

## 🔮 Planned Work

### Table Dependencies Enhancements
- **Cascade Impact Simulator** - Preview the exact count of affected rows across the entire dependency chain
  - Real-time calculation of cascading deletions through multiple levels
  - Visual tree showing which rows in which tables will be affected
  - "Dry run" mode to see impact without executing deletion
  - Export impact report as JSON or text summary
  
- **Force Delete Mode** - Advanced developer option to bypass foreign key constraints
  - Explicit toggle: "Enable Force Delete (Ignore Foreign Keys)"
  - Requires developer mode activation in settings
  - Shows additional warning: "⚠️ DANGER: This will leave orphaned references"
  - Uses `PRAGMA foreign_keys = OFF` temporarily during operation
  - Logs all bypassed constraints for audit trail
  
- **Quick Navigation Links** - Navigate to dependent tables directly from dependency viewer
  - "Show dependent table details" links on each dependency
  - Click to open table schema view in current or new tab
  - "View all X rows in [table_name]" link with pre-filtered query
  - Breadcrumb navigation to easily return to original context
  - Keyboard shortcuts for rapid navigation (Ctrl+Click for new tab)

### Other Planned Features
- **Index analyzer** - Suggest missing indexes based on foreign keys
- **Relationship diagram** - Visual graph of table relationships
- **Constraint validator** - Check for orphaned records and broken references
- **Dependency export** - Export schema relationships as documentation
- **Circular dependency detector** - Identify and warn about circular FK chains

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

---

**Made with ❤️ for the Cloudflare community**
