# D1 Database Manager for Cloudflare

**Last Updated:** October 30, 2025 | **Version:** 2.0.0  
**Tech Stack:** React 19.2.0 | Vite 7.1.12 | TypeScript 5.9.3 | Tailwind CSS | shadcn/ui | Cloudflare Workers + Zero Trust

A modern, full-featured web application for managing Cloudflare D1 databases with enterprise-grade authentication via Cloudflare Access (Zero Trust). Similar in design and functionality to the R2 Bucket Manager, providing capabilities beyond the standard Cloudflare dashboard.

---

## 🎯 Features

### ✅ Phase 1 - Basic Functionality (Complete)

#### Database Management
- **List & Browse** - View all D1 databases with metadata (created date, size, table count)
- **Create Database** - Interactive dialog for creating new databases
- **Delete Database** - Remove databases (placeholder UI)
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
- `DELETE /api/databases/:dbId` - Delete a database
- `GET /api/databases/:dbId/info` - Get database information

### Tables
- `GET /api/tables/:dbId/list` - List all tables in a database
- `GET /api/tables/:dbId/schema/:tableName` - Get table schema (columns, types)
- `GET /api/tables/:dbId/data/:tableName` - Get table data (supports pagination)
- `GET /api/tables/:dbId/indexes/:tableName` - Get table indexes
- `POST /api/tables/:dbId/create` - Create a new table
- `DELETE /api/tables/:dbId/:tableName` - Drop a table
- `PATCH /api/tables/:dbId/:tableName/rename` - Rename a table

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

This allows full UI testing without connecting to actual Cloudflare D1 databases.

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

*(Coming Soon)*

To deploy to Cloudflare Workers:

1. Configure `wrangler.toml` (see `wrangler.toml.example`)
2. Set up Cloudflare Access with GitHub OAuth
3. Create D1 databases and update bindings
4. Deploy: `npm run build && npx wrangler deploy`

Full deployment guide coming in Phase 2.

---

## 📋 Roadmap

### ✅ Phase 1 - Basic Functionality (COMPLETE)
- ✅ Database list, create, delete
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
