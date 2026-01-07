# D1 Database Manager

Last Updated January 7, 2026 - Production/Stable v2.2.0

[![GitHub](https://img.shields.io/badge/GitHub-neverinfamous/d1--manager-blue?logo=github)](https://github.com/neverinfamous/d1-manager)
[![Docker Pulls](https://img.shields.io/docker/pulls/writenotenow/d1-manager)](https://hub.docker.com/r/writenotenow/d1-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
![Version](https://img.shields.io/badge/version-v2.2.0-green)
![Status](https://img.shields.io/badge/status-Production%2FStable-brightgreen)
[![Security](https://img.shields.io/badge/Security-Enhanced-green.svg)](https://github.com/neverinfamous/d1-manager/blob/main/SECURITY.md)
[![CodeQL](https://img.shields.io/badge/CodeQL-Passing-brightgreen.svg)](https://github.com/neverinfamous/d1-manager/security/code-scanning)
[![Type Safety](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://github.com/neverinfamous/d1-manager)

This Docker image provides a modern, full-featured web application for managing Cloudflare D1 databases with enterprise-grade authentication via Cloudflare Access (Zero Trust). Run D1 Database Manager in Docker for development, testing, or self-hosted deployments.

**[Live Demo Site](https://d1.adamic.tech/)** • **[GitHub](https://github.com/neverinfamous/d1-manager)** • **[Wiki](https://github.com/neverinfamous/d1-manager/wiki)** • **[Changelog](https://github.com/neverinfamous/d1-manager/wiki/Changelog)** • **[Release Article](https://adamic.tech/articles/d1-manager)**

## Tech Stack

**Frontend**: React 19.2.3 | Vite 7.3.1 | TypeScript 5.9.3 | Tailwind CSS 4.1.17 | shadcn/ui

**Backend**: Cloudflare Workers + KV + D1 + R2 + Durable Objects + Zero Trust

---

## 🎯 Features

### Database Management
- Create, rename, clone, delete, and optimize databases
- **Export Database** - SQL/JSON/CSV formats with portable schema + data
- **Import Database** - SQL/JSON/CSV/ZIP with create new or update existing
- **Quick Actions** - Icon buttons on each database card for instant access to all operations
- **Bulk Operations** - Multi-select for batch export (SQL/JSON/CSV), optimize, and delete
- **Clone Database** - Multi-step wizard with selective table cloning and granular options
- **Grid/List View Toggle** - Switch between card grid and compact sortable table view
- **Copyable Database IDs** - Click to copy database IDs with visual feedback
- **Expanded Color Picker** - 27 colors organized by hue family for visual organization
- **R2 Backup/Restore + Unified Hub** *(Cloudflare Workers only)* - Manual backups, undo history, and R2 snapshots in one dialog with multi-select, backup counts, and orphaned-backup visibility
- **Scheduled R2 Backups** *(Cloudflare Workers only)* - Per-database daily/weekly/monthly schedules with cron triggers, next-run tracking, and enable/disable controls
- **Safety Backups** *(Cloudflare Workers only)* - Delete, rename, and STRICT mode operations automatically create R2 backups before proceeding
- **Automated Migration System** - Auto-detects and applies schema upgrades with one-click "Upgrade Now" banner
- **Database search filter & job history** - Quickly find databases and audit all operations with full date/time and duration tracking

### Table Operations
- Visual schema designer with STRICT mode and generated column support
- Clone, export (SQL/CSV/JSON), import (CSV/JSON/SQL), and bulk operations
- Column management (add, modify, rename, delete) with UNIQUE constraint support
- Foreign key dependency analysis
- **Quick Actions** - Icon buttons on each table card for instant access to all operations
- **Import Data** - Import CSV, JSON, or SQL into new or existing tables with duplicate handling (Fail/Replace/Skip) and auto-add missing columns
- **STRICT Mode** - Create new tables with STRICT mode or convert existing tables with automatic type mapping and validation
- **Generated Columns** - Create STORED or VIRTUAL computed columns with expression editor
- **Table-level R2 Backup/Restore** *(Cloudflare Workers only)* - Backup or restore individual tables directly from table cards (Grid and List views)
- **Grid/List View Toggle** - Switch between card grid and compact sortable table view (list view is default)
- **Row search filter + table search** - Quickly filter visible rows and find tables
- **Table Row Counts** - See row counts on table cards (formatted with locale separators)
- **Table color tags** - Assign colors for visual organization

### Query Console
- **Tabbed interface** - Query, SQL Diff, Drizzle ORM, and Query Builder in dedicated tabs
- **Drizzle ORM Console** - Introspect schemas, view migration status/history, generate SQL, push changes (with dry-run), and export TypeScript schema
- **SQL Formatter** - One-click formatting with SQLite-aware sql-formatter library
- **SQL Autocomplete Toggle** - Turn suggestions on/off with preference persisted to localStorage
- **Rich editor** - Syntax highlighting, line numbers, find/replace, hover docs, inline error squiggles, and word wrap toggle
- **SQL Diff Editor** - Compare queries side-by-side with syntax highlighting
- **Visual Query Builder** - Build queries interactively with editable SQL output and "Send to Editor" integration
- Query history and saved queries
- CSV export

### Advanced Features
- NEW! **AI Search Integration** *(Cloudflare Workers only)* - Semantic search over database schemas and data using Cloudflare AI Search (AutoRAG). Export databases to R2 for indexing, then query with natural language or get AI-generated SQL suggestions
- **Unified Backup & Restore Hub** *(Cloudflare Workers only)* - Undo history and R2 backups in one dialog with bulk restore/download/delete, backup counts, source tags, and orphaned-backup visibility
- **Scheduled R2 Backups** *(Cloudflare Workers only)* - Daily/weekly/monthly schedules with per-database controls, next-run previews, last-run status, and job history integration
- **Foreign Key Visualizer & ER Diagram** - Interactive graphs with fullscreen mode, export (PNG/SVG/JSON), alphabetized dropdowns, and dual layouts (hierarchical/force-directed)
- **Cascade Impact Simulator** - Preview DELETE cascades before execution with optimized dependency checks and multi-format export (CSV/JSON/Text/PDF)
- **Circular Dependency Detector** - DFS-based cycle detection with severity classification and breaking suggestions
- **Undo/Rollback with safeguards** - Automatic undo snapshots for destructive operations (R2 backups available on Cloudflare Workers deployments)
- **FTS5 Full-Text Search** - Manage virtual tables, convert to/from regular tables, dedicated FTS5 search mode in main Search tab, and quick actions on FTS5 table cards
- **Index Analyzer** - Smart index recommendations plus "Create All Indexes" one-click apply with progress tracking
- **Metrics Dashboard** - Query volume (reads/writes), P90 latency, rows read, and storage trends via GraphQL Analytics with time range selector (24h/7d/30d)
- NEW! **Health Dashboard** - System health score, backup coverage alerts, failed backup tracking, and replication status overview
- **Time Travel** - View bookmarks, checkpoint history, manual checkpoint capture, and CLI restore commands
- **Read Replication** - Enable/disable global read replicas with D1 Sessions API info
- **Constraint Validator** - Validate foreign key, NOT NULL, and UNIQUE constraints across database with guided fix workflow

### Webhook Notifications
- **Event-driven webhooks** - Send HTTP notifications on key database events
- **Configurable events** - database_create, database_delete, database_export, database_import, job_failed, batch_complete
- **HMAC signatures** - Optional secret-based request signing for security
- **Test webhooks** - Verify endpoint connectivity before going live
- **Centralized Error Logging** - Structured logging with module-prefixed error codes, automatic webhook notifications for critical errors

### User Experience
- Dark/Light/System themes
- Responsive design
- **Sticky Navigation** - Main navigation stays fixed at top with backdrop blur
- **Jump to Top Button** - Floating button on long pages (Job History, Search)
- **Header Quick Links** - Direct access to Cloudflare Dashboard, D1 Docs, Wiki, and SQLite Docs
- **Error Support Links** - All error messages include "Report this error" mailto link
- **Enhanced Input Validation** - SQLite reserved word checking, constraint validation, and helpful suggestions

### Performance
- **Dramatically improved load times** - ER Diagram loads with single API call instead of N+1 calls
- **Client-side caching** - 5-minute TTL for tables, schemas, FKs, indexes, FTS5, Time Travel, and Replication data
- **Unified cache** - All relationship views share single cache entry for instant tab switching
- **Metrics caching** - 2-minute TTL per time range for instant dashboard revisits
- **Parallel batch processing** - Index Analyzer processes 5 tables at a time with parallel queries
- **Smart cache invalidation** - Caches automatically cleared on data modifications

---

## 🚀 Quick Start

### 1. Set Up Metadata Database

The D1 Manager requires a metadata database for query history, saved queries, and undo history.

```bash
npx wrangler login
```

```bash
npx wrangler d1 create d1-manager-metadata
```

```bash
git clone https://github.com/neverinfamous/d1-manager.git
```

```bash
cd d1-manager
```

```bash
npx wrangler d1 execute d1-manager-metadata --remote --file=worker/schema.sql
```

### 2. Get Cloudflare Credentials

| Credential | Where to Find |
|------------|---------------|
| `ACCOUNT_ID` | Dashboard URL: `dash.cloudflare.com/{ACCOUNT_ID}/...` |
| `API_KEY` | [API Tokens](https://dash.cloudflare.com/profile/api-tokens) → Create Token → **D1 Edit** permission |
| `TEAM_DOMAIN` | [Zero Trust](https://one.dash.cloudflare.com/) → Settings → Custom Pages |
| `POLICY_AUD` | Zero Trust → Access → Applications → Your App → AUD tag |

### 3. Run Container

```bash
docker pull writenotenow/d1-manager:latest
```

```bash
docker run -d \
  -p 8080:8080 \
  -e ACCOUNT_ID=your_cloudflare_account_id \
  -e API_KEY=your_cloudflare_api_token \
  -e TEAM_DOMAIN=https://yourteam.cloudflareaccess.com \
  -e POLICY_AUD=your_cloudflare_access_aud_tag \
  --name d1-manager \
  writenotenow/d1-manager:latest
```

Open **http://localhost:8080**

---

## ⬆️ Upgrading

### 1. Update Schema

**Automated Migrations (Recommended)**

D1 Manager includes an automated migration system:
1. Update the container to the latest version
2. Open the app - a banner will appear if schema updates are needed
3. Click "Upgrade Now" to apply migrations automatically

The app detects pending migrations and handles legacy installations gracefully.

**Manual Schema Update (Alternative)**

If you prefer manual control:

```bash
npx wrangler d1 execute d1-manager-metadata --remote --file=worker/schema.sql
```

Or apply individual migrations:

```bash
npx wrangler d1 execute d1-manager-metadata --remote --file=worker/migrations/002_add_color_tags.sql
```

| Migration | When to Run |
|-----------|-------------|
| `001_add_job_history.sql` | If you don't have job history tables yet |
| `002_add_color_tags.sql` | If you don't have color tags yet |
| `003_add_error_message_column.sql` | If you have job history but no error_message column |
| `004_add_webhooks.sql` | If you don't have the webhooks table yet |

> **Note:** New installations should use the automated migration system or `schema.sql`.

### Docker vs Cloudflare Workers Features

**Docker deployments do not require Durable Object configuration.** The Durable Object binding (used for R2 backups in Cloudflare Workers deployments) is not applicable to Docker containers.

| Feature | Docker | Cloudflare Workers |
|---------|--------|-------------------|
| Database management | ✅ | ✅ |
| Query console | ✅ | ✅ |
| Download/Import backups | ✅ | ✅ |
| R2 cloud backups | ❌ | ✅ (requires Durable Object) |
| Scheduled R2 backups | ❌ | ✅ (requires Durable Object + cron) |
| Backup before delete/rename | ❌ | ✅ (requires Durable Object) |

If you see documentation about Durable Objects or `BACKUP_DO` bindings, those apply only to Cloudflare Workers deployments. Docker users can safely ignore those sections.

For R2 backup features, deploy to Cloudflare Workers instead. See the main [README.md](README.md) for Workers deployment instructions.

### 2. Update Container

```bash
docker pull writenotenow/d1-manager:latest
```

```bash
docker stop d1-manager && docker rm d1-manager
```

```bash
docker run -d \
  -p 8080:8080 \
  -e ACCOUNT_ID=your_account_id \
  -e API_KEY=your_api_token \
  -e TEAM_DOMAIN=https://yourteam.cloudflareaccess.com \
  -e POLICY_AUD=your_aud_tag \
  --name d1-manager \
  --restart unless-stopped \
  writenotenow/d1-manager:latest
```

---

## 🐋 Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  d1-manager:
    image: writenotenow/d1-manager:latest
    container_name: d1-manager
    ports:
      - "8080:8080"
    environment:
      - ACCOUNT_ID=${ACCOUNT_ID}
      - API_KEY=${API_KEY}
      - TEAM_DOMAIN=${TEAM_DOMAIN}
      - POLICY_AUD=${POLICY_AUD}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

Create `.env`:

```env
ACCOUNT_ID=your_cloudflare_account_id
API_KEY=your_cloudflare_api_token
TEAM_DOMAIN=https://yourteam.cloudflareaccess.com
POLICY_AUD=your_cloudflare_access_aud_tag
```

Run:

```bash
docker-compose up -d
```

Upgrade:

```bash
docker-compose pull && docker-compose up -d
```

---

## 📋 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ACCOUNT_ID` | ✅ | Cloudflare Account ID |
| `API_KEY` | ✅ | API Token with D1 Edit permission |
| `TEAM_DOMAIN` | ✅ | `https://yourteam.cloudflareaccess.com` |
| `POLICY_AUD` | ✅ | Cloudflare Access Application AUD tag |
| `PORT` | ❌ | Port (default: `8080`) |
| `NODE_ENV` | ❌ | Environment (default: `production`) |

> **Note:** R2 Backup/Restore is only available when deploying to Cloudflare Workers (not Docker). Docker deployments can still use the Download/Import functionality for local backups.

---

## 📊 Container Info

| Property | Value |
|----------|-------|
| Base Image | `node:18-alpine` |
| Size | ~150MB |
| Architectures | `linux/amd64`, `linux/arm64` |
| Port | `8080` |
| User | Non-root (`node`) |
| Health Endpoint | `/health` |

---

## 🏷️ Available Tags

| Tag | Description |
|-----|-------------|
| `latest` | Latest stable release |
| `v2.2.0` | Specific version (recommended for production) |
| `v2.1.0` | Previous stable release |
| `sha-XXXXXX` | Commit SHA for reproducible builds |

---

## 🔧 Building from Source

```bash
git clone https://github.com/neverinfamous/d1-manager.git
```

```bash
cd d1-manager
```

```bash
docker build -t d1-manager:local .
```

```bash
docker run -d -p 8080:8080 \
  -e ACCOUNT_ID=your_account_id \
  -e API_KEY=your_api_token \
  -e TEAM_DOMAIN=https://yourteam.cloudflareaccess.com \
  -e POLICY_AUD=your_aud_tag \
  d1-manager:local
```

---

## 🐞 Troubleshooting

### Container Won't Start

```bash
docker logs d1-manager
```

Common causes:
- Missing environment variables
- Port already in use

### Authentication Failures

- Verify `TEAM_DOMAIN` includes `https://`
- Confirm `POLICY_AUD` matches your Access application
- Check API token has **D1 Edit** permission

### Database Operations Fail

Test your API token:

```bash
curl -X GET "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database" \
  -H "Authorization: Bearer ${API_KEY}"
```

📚 **More solutions:** [Wiki - Troubleshooting](https://github.com/neverinfamous/d1-manager/wiki/Troubleshooting)

---

## 📚 Additional Resources

- **[Wiki Documentation](https://github.com/neverinfamous/d1-manager/wiki)**
- **[GitHub Repository](https://github.com/neverinfamous/d1-manager)**
- **[Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)**
- **[Cloudflare Access Docs](https://developers.cloudflare.com/cloudflare-one/policies/access/)**

---

## 📞 Support

- 🐛 **Bug Reports:** [GitHub Issues](https://github.com/neverinfamous/d1-manager/issues)
- 💬 **Discussions:** [GitHub Discussions](https://github.com/neverinfamous/d1-manager/discussions)
- 📧 **Email:** admin@adamic.tech

---

## 📄 License

MIT License - see [LICENSE](https://github.com/neverinfamous/d1-manager/blob/main/LICENSE)

---

**Made with ❤️ for the Cloudflare and Docker communities**
