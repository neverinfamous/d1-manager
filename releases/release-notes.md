# D1 Database Manager - Release Notes

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

#### Foreign Key Management (v1.1.0)
- Visual relationship graph and editor
- Cascade impact simulator with multi-level preview
- Force delete mode for advanced users
- Quick navigation links to dependent tables
- Relationship documentation export
- Circular dependency detector

#### Full-Text Search (v1.2.0)
- FTS5 virtual table management
- Search index creation wizard
- Tokenizer configuration (porter, unicode61, trigram)
- Query builder with MATCH syntax
- Search result highlighting
- Performance metrics and ranking

#### Other Enhancements (v1.x)
- Undo/Rollback last operation
- Index analyzer with suggestions
- Advanced row filters (OR logic, BETWEEN, IN clause)
- Filter presets and saved filters
- Time Travel API integration for backups
- Analytics dashboard with usage metrics
- Cross-database search improvements

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

