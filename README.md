# D1 Database Manager for Cloudflare

**Status:** Phase 1 Development (Basic Functionality)  
**Tech Stack:** React 19.2.0 | Vite 7.1.12 | TypeScript 5.9.3 | Tailwind CSS | shadcn/ui | Cloudflare Workers + Zero Trust

A modern web application for managing Cloudflare D1 databases with enterprise-grade authentication via Cloudflare Access (Zero Trust).

## 🎯 Current Status

**Phase 1 - Basic Functionality (In Progress)**

### ✅ Completed Features

#### Backend (Worker API)
- ✅ Cloudflare Workers runtime with modular routing
- ✅ Cloudflare Access Zero Trust authentication
- ✅ Database CRUD operations (list, create, delete, info)
- ✅ Table operations (list, schema, data, indexes)
- ✅ Query execution (execute, batch, history)
- ✅ Metadata database for query history
- ✅ Local development mode with mock D1 data
- ✅ CORS handling for local/production

#### Frontend (React UI)
- ✅ Modern UI with shadcn/ui components
- ✅ Tailwind CSS styling
- ✅ Dark/Light/System theme support
- ✅ Database list view with cards
- ✅ Create database dialog
- ✅ API service with TypeScript types
- ✅ Authentication service

### 🚧 In Progress
- 🔨 Database grid for table browsing
- 🔨 Table browser for row data
- 🔨 SQL query console
- 🔨 Schema designer

### 📋 Planned (Phase 2)
- Cross-database search
- Visual query builder
- Database comparison & migration
- Time Travel backup/restore UI
- Analytics dashboard
- Index management
- Foreign key visualization

## 🚀 Local Development

### Prerequisites
- Node.js 18+
- npm
- Cloudflare account (for production deployment)

### Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` if needed (defaults work for local development)

3. **Run development servers (2 terminals):**
   
   **Terminal 1 - Frontend (Vite):**
   ```bash
   npm run dev
   ```
   Runs on `http://localhost:5173`

   **Terminal 2 - Worker API (Wrangler):**
   ```bash
   npx wrangler dev --config wrangler.dev.toml --local
   ```
   Runs on `http://localhost:8787`

4. **Access the app:**
   Open `http://localhost:5173` in your browser

### Local Development Features

- **No authentication required** - Auth is disabled for localhost
- **Mock D1 data** - Returns sample databases and tables
- **No Cloudflare secrets needed** - Works without API keys
- **Hot Module Replacement** - Frontend auto-reloads on changes
- **Auto-restart** - Worker reloads on code changes

## 📁 Project Structure

```
d1-manager/
├── src/                          # Frontend source
│   ├── components/               # React components
│   │   └── ui/                   # shadcn/ui components
│   ├── contexts/                 # React contexts (Theme)
│   ├── hooks/                    # Custom hooks
│   ├── lib/                      # Utilities
│   ├── services/                 # API & Auth services
│   ├── App.tsx                   # Main app component
│   ├── main.tsx                  # React entry point
│   └── index.css                 # Tailwind CSS
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
├── @/components/ui/              # shadcn components
├── wrangler.toml.example         # Production config
├── wrangler.dev.toml             # Dev config
└── package.json
```

## 🔧 API Endpoints

### Databases
- `GET /api/databases` - List all databases
- `POST /api/databases` - Create database
- `DELETE /api/databases/:dbId` - Delete database
- `GET /api/databases/:dbId/info` - Get database info

### Tables
- `GET /api/tables/:dbId/list` - List tables
- `GET /api/tables/:dbId/schema/:tableName` - Get table schema
- `GET /api/tables/:dbId/data/:tableName` - Get table data (paginated)
- `GET /api/tables/:dbId/indexes/:tableName` - Get table indexes

### Queries
- `POST /api/query/:dbId/execute` - Execute SQL query
- `POST /api/query/:dbId/batch` - Execute batch queries
- `GET /api/query/:dbId/history` - Get query history

## 🎨 Tech Stack Details

### Frontend
- **React 19.2.0** - UI library
- **TypeScript 5.9.3** - Type safety
- **Vite 7.1.12** - Build tool & dev server
- **Tailwind CSS** - Utility-first CSS
- **shadcn/ui** - Pre-built component library
- **Lucide React** - Icon library

### Backend
- **Cloudflare Workers** - Edge compute platform
- **Cloudflare D1** - SQLite database
- **Cloudflare Access** - Zero Trust authentication
- **TypeScript** - Type safety

## 📝 Development Notes

### Mock Data in Local Development
The worker automatically detects localhost and returns mock data:
- Sample databases (dev-database, test-database)
- Sample tables (users, posts, comments)
- Sample query results

### Authentication
- **Production:** Cloudflare Access JWT validation
- **Local:** Authentication bypassed for localhost

### MCP Servers Used
- **desktop-commander** - File operations & commands
- **shadcn** - UI component installation
- **cloudflare-docs** - D1 API documentation reference
- **cloudflare-bindings** - Testing with real D1 databases

## 🚀 Production Deployment

(Documentation to be completed - see wrangler.toml.example for configuration template)

## 📄 License

MIT

## 🤝 Contributing

This project is in active development. Phase 1 (basic functionality) is currently being implemented.

