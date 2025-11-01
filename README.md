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
  - **Delete Table** - Drop tables with confirmation dialog
  - **Clone Table** - Duplicate table structure, data, and indexes with custom names
  - **Export Table** - Download tables as SQL or CSV format
- **Bulk Table Operations** - Multi-select operations for efficiency
  - **Multi-Select** - Checkbox on each table card with "Select All" option
  - **Bulk Clone** - Clone multiple tables with suggested names (e.g., `table_copy`)
  - **Bulk Export** - Export multiple tables as SQL/CSV in a ZIP archive
  - **Bulk Delete** - Delete multiple tables with progress tracking
- **Column Management** - Advanced schema modification capabilities
  - **Add Column** - Add new columns to existing tables
  - **Rename Column** - Rename columns with ALTER TABLE
  - **Modify Column** - Change column type, constraints, and defaults
  - **Drop Column** - Remove columns from tables

#### Query Console
- **SQL Editor** - Execute custom SQL queries against any database
- **Results Display** - Formatted table output with column headers
- **Execution Metrics** - Shows execution time and row count
- **Keyboard Shortcuts** - Ctrl+Enter to execute queries
- **History** - Query history tracking (backend ready)

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

The Worker automatically detects localhost requests and returns mock data:
- **Sample Databases:** `dev-database`, `test-database`
- **Sample Tables:** `users`, `posts`, `comments`
- **Sample Schema:** Realistic column structures
- **Query Results:** Formatted response data
- **Export Operations:** Returns mock SQL content
- **Import Operations:** Simulates database creation/import

This allows full UI testing without connecting to actual Cloudflare D1 databases.

### Bulk Operations

The D1 Manager supports bulk operations on both databases and tables:

#### Database Bulk Operations

**To use database bulk operations:**
1. Click checkboxes on database cards to select databases (or use "Select All")
2. Selected databases show a blue ring border
3. Action buttons appear in the toolbar:
   - **Download Selected** - Exports databases as SQL files in a ZIP archive
   - **Delete Selected** - Deletes multiple databases with confirmation
   - **Upload Database** - Import SQL files (always visible)

**Download Process:**
- Uses D1's polling export API to generate SQL dumps
- Creates a timestamped ZIP file containing all selected databases
- Progress tracking from preparation through download completion

**Upload Process:**
- Accepts `.sql` files up to 5GB
- Two modes:
  - **Create New Database** - Creates a new database from SQL file
  - **Import into Existing** - Imports SQL into selected existing database
- Automatically refreshes database list after successful upload

**Delete Process:**
- Shows confirmation dialog with list of databases to delete
- Sequential deletion with progress tracking
- Reports any failures while continuing with remaining databases

#### Table Bulk Operations

**To use table bulk operations:**
1. Navigate to a database's table view
2. Click checkboxes on table cards to select tables (or use "Select All")
3. Selected tables show a blue ring border
4. Action buttons appear in the toolbar:
   - **Clone Selected** - Duplicate multiple tables with custom names
   - **Export Selected** - Export tables as SQL or CSV files
   - **Delete Selected** - Delete multiple tables with confirmation

**Clone Process:**
- Opens dialog to specify new names for each cloned table
- Suggested names pre-filled (e.g., `users_copy`)
- Copies table structure, data, and indexes
- Progress tracking for multiple tables
- Automatically refreshes table list after completion

**Export Process:**
- Choose between SQL (structure + data) or CSV (data only) format
- Single table: Downloads immediately
- Multiple tables: Creates ZIP file with all exports
- Real-time progress tracking
- Timestamped filenames

**Delete Process:**
- Shows confirmation dialog with list of tables to delete
- Sequential deletion with progress tracking
- Reports any failures while continuing with remaining tables
- Cannot be undone - use with caution

### Database Renaming

The D1 Manager includes a database rename feature that uses a migration-based approach since Cloudflare's D1 API does not natively support renaming databases.

**How It Works:**

The rename operation performs the following steps automatically:
1. **Validates** the new database name for uniqueness and Cloudflare naming requirements
2. **Creates** a new database with the desired name
3. **Exports** all data from the original database using D1's export API
4. **Imports** the exported data into the new database
5. **Verifies** the import was successful
6. **Deletes** the original database upon successful migration

**Important Safety Features:**

- ⚠️ **Backup Warning** - The UI prominently warns users to download a backup before renaming
- 📥 **One-Click Backup** - Convenient "Download Backup Now" button in the rename dialog
- ✅ **Confirmation Checkbox** - Users must acknowledge they have backed up the database
- 🔄 **Progress Tracking** - Real-time progress updates throughout the migration process
- 🔙 **Automatic Rollback** - If any step fails, the new database is automatically deleted
- 📝 **Validation** - Name validation ensures compliance with Cloudflare's requirements

**Best Practices:**

1. **Always backup first** - Download a backup of your database before renaming
2. **Choose off-peak times** - Rename during low-traffic periods if possible
3. **Test with small databases** - If unsure, test the rename process with a small test database first
4. **Monitor the process** - Watch the progress indicators to ensure smooth operation
5. **Verify after rename** - Check that all tables and data are present in the renamed database

**Limitations:**

- **Migration time** - Large databases may take several minutes to migrate
- **Temporary duplication** - Both databases exist briefly during the migration (counts toward quota)
- **No rollback after deletion** - Once the original database is deleted, the rename cannot be undone
- **Downtime** - Applications using the database should be updated to use the new name after renaming

**Database Naming Requirements:**

- Must be 3-63 characters long
- Can only contain lowercase letters (a-z), numbers (0-9), and hyphens (-)
- Cannot start or end with a hyphen
- Must be unique across your Cloudflare account

**What Happens If Rename Fails:**

If the rename operation fails at any step:
- The original database remains untouched
- The new database (if created) is automatically deleted
- A detailed error message explains what went wrong
- You can retry the operation after addressing the issue

**Recovery from Partial Failure:**

If the original database was deleted but you need to recover:
1. The new database with the desired name should still exist with all your data
2. If you downloaded a backup (as recommended), you can import it to a new database
3. Contact Cloudflare support if you need assistance with data recovery

### Authentication

- **Production:** Cloudflare Access JWT validation on every API request
- **Local Development:** Authentication bypassed for `localhost` requests
- **Zero Trust Integration:** Supports GitHub OAuth and other identity providers

### MCP Servers

This project was built using the following Model Context Protocol (MCP) servers:
- **desktop-commander** - File operations, terminal commands, and local development
- **shadcn** - UI component installation and configuration
- **cloudflare-docs** - D1 API documentation and best practices
- **cloudflare-bindings** - Testing with real Cloudflare D1 databases

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
  - Column management (add, rename, modify, drop)

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
