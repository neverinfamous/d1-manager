# D1 Database Manager for Cloudflare

Last Updated January 7, 2026 - Production/Stable v2.1.0

[![GitHub](https://img.shields.io/badge/GitHub-neverinfamous/d1--manager-blue?logo=github)](https://github.com/neverinfamous/d1-manager)
[![Docker Pulls](https://img.shields.io/docker/pulls/writenotenow/d1-manager)](https://hub.docker.com/r/writenotenow/d1-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
![Version](https://img.shields.io/badge/version-v2.1.0-green)
![Status](https://img.shields.io/badge/status-Production%2FStable-brightgreen)
[![Security](https://img.shields.io/badge/Security-Enhanced-green.svg)](https://github.com/neverinfamous/d1-manager/blob/main/SECURITY.md)
[![CodeQL](https://img.shields.io/badge/CodeQL-Passing-brightgreen.svg)](https://github.com/neverinfamous/d1-manager/security/code-scanning)
[![Type Safety](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://github.com/neverinfamous/d1-manager)

This Docker image provides a modern, full-featured web application for managing Cloudflare D1 databases with enterprise-grade authentication via Cloudflare Access (Zero Trust). Run D1 Database Manager in Docker for development, testing, or self-hosted deployments.

**[Live Demo](https://d1.adamic.tech/)** • **[Docker](https://hub.docker.com/r/writenotenow/d1-manager)** • **[Wiki](https://github.com/neverinfamous/d1-manager/wiki)** • **[Changelog](https://github.com/neverinfamous/d1-manager/wiki/Changelog)** • **[Release Article](https://adamic.tech/articles/d1-manager)**

## Tech Stack

**Frontend**: React 19.2.3 | Vite 7.3.0 | TypeScript 5.9.3 | Tailwind CSS 4.1.17 | shadcn/ui

**Backend**: Cloudflare Workers + KV + D1 + R2 + Durable Objects + Zero Trust

---

## 🎯 Features

### Database Management
- Create, rename, clone, delete, download, and optimize databases
- **Quick Actions** - Icon buttons on each database card for instant access to all operations
- **Bulk Operations** - Multi-select for batch download, optimize, and delete
- **Import Database** - Upload SQL files or paste SQL content directly
- **Clone Database** - Multi-step wizard with selective table cloning and granular options
- **Grid/List View Toggle** - Switch between card grid and compact sortable table view
- **Copyable Database IDs** - Click to copy database IDs with visual feedback
- **Expanded Color Picker** - 27 colors organized by hue family for visual organization
- **R2 Backup/Restore + Unified Hub** - Manual backups, undo history, and R2 snapshots in one tabbed dialog with multi-select, backup counts, and orphaned-backup visibility
- **Scheduled R2 Backups** - Per-database daily/weekly/monthly schedules with cron triggers, next-run tracking, and enable/disable controls
- **Safety Backups** - Delete, rename, and STRICT mode operations automatically create R2 backups before proceeding
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
- **Table-level R2 Backup/Restore** - Backup or restore individual tables directly from table cards (Grid and List views)
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
- NEW! **AI Search Integration** - Semantic search over database schemas and data using Cloudflare AI Search (AutoRAG). Export databases to R2 for indexing, then query with natural language or get AI-generated SQL suggestions
- **Unified Backup & Restore Hub** - Undo history and R2 backups in one dialog with bulk restore/download/delete, backup counts, source tags, and orphaned-backup visibility
- **Scheduled R2 Backups** - Daily/weekly/monthly schedules with per-database controls, next-run previews, last-run status, and job history integration
- **Foreign Key Visualizer & ER Diagram** - Interactive graphs with fullscreen mode, export (PNG/SVG/JSON), alphabetized dropdowns, and dual layouts (hierarchical/force-directed)
- **Cascade Impact Simulator** - Preview DELETE cascades before execution with optimized dependency checks and multi-format export (CSV/JSON/Text/PDF)
- **Circular Dependency Detector** - DFS-based cycle detection with severity classification and breaking suggestions
- **Undo/Rollback with safeguards** - Automatic undo snapshots or R2 backups for all destructive operations (delete database/table, rename, STRICT mode, FTS5 convert, modify column)
- **FTS5 Full-Text Search** - Manage virtual tables, convert to/from regular tables, dedicated FTS5 search mode in main Search tab, and quick actions on FTS5 table cards
- **Index Analyzer** - Smart index recommendations plus "Create All Indexes" one-click apply with optional R2 backup and progress tracking
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

📚 **Full documentation:** [Wiki](https://github.com/neverinfamous/d1-manager/wiki)

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Cloudflare account](https://dash.cloudflare.com/sign-up) (for production)

### Local Development

   ```bash
git clone https://github.com/neverinfamous/d1-manager.git
   ```

   ```bash
   cd d1-manager
   ```

   ```bash
   npm install
   ```

   ```bash
   cp .env.example .env
   ```

**Start the servers (2 terminals):**
   
Terminal 1 - Frontend:
   
   ```bash
   npm run dev
   ```
   
Terminal 2 - Worker API:
   
   ```bash
   npx wrangler dev --config wrangler.dev.toml --local
   ```
   
Open **http://localhost:5173** - no auth required, mock data included.

---

## 🔧 Production Deployment

### 1. Authenticate with Cloudflare

   ```bash
   npx wrangler login
   ```

### 2. Create Metadata Database

   ```bash
   npx wrangler d1 create d1-manager-metadata
   ```

   ```bash
   npx wrangler d1 execute d1-manager-metadata --remote --file=worker/schema.sql
   ```

### 3. Configure Wrangler

```bash
cp wrangler.toml.example wrangler.toml
```

Edit `wrangler.toml` with your `database_id` from step 2.

### 4. Set Up R2 Backup Bucket (Optional)

To enable database backups to R2 storage:

```bash
npx wrangler r2 bucket create d1-manager-backups
```

The `wrangler.toml.example` already includes the R2 and Durable Object configuration needed for backups. Features include:
- Backup databases to R2 before rename, STRICT mode, or FTS5 conversion operations
- Manual backup/restore from database cards
- Full backup history with restore capability

### 5. Set Up Cloudflare Access

1. Go to [Cloudflare Zero Trust](https://one.dash.cloudflare.com/)
2. Configure authentication (GitHub OAuth, etc.)
3. Create an Access Application for your domain
4. Copy the **Application Audience (AUD) tag**

### 6. Create API Token

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Create Custom Token with **Account → D1 → Edit** permission

### 7. Set Secrets
   
   ```bash
   npx wrangler secret put ACCOUNT_ID
   ```
   
   ```bash
   npx wrangler secret put API_KEY
   ```
   
   ```bash
   npx wrangler secret put TEAM_DOMAIN
   ```
   
   ```bash
   npx wrangler secret put POLICY_AUD
   ```

### 8. Deploy

  ```bash
  npm run build
  ```

  ```bash
  npx wrangler deploy
  ```

---

## ⬆️ Upgrading

### Automated Schema Migrations (Recommended)

D1 Manager includes an automated migration system. When you upgrade to a new version:

1. **Deploy the new version** - The app will automatically detect pending migrations
2. **Click "Upgrade Now"** - A banner appears if schema updates are needed
3. **Done!** - Migrations are applied safely with rollback on failure

The app automatically handles:
- Fresh installations (applies all migrations)
- Legacy installations (detects existing tables and marks appropriate migrations as applied)
- Incremental upgrades (only applies new migrations)

### Manual Schema Update (Alternative)

If you prefer manual control, run the full schema refresh:

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
| `005_add_scheduled_backups.sql` | If you don't have the scheduled_backups table yet |

> **Note:** New installations should use the automated migration system or `schema.sql`.

### Binding Requirements

When upgrading, check if new wrangler.toml bindings are required:

| Version | Required Bindings |
|---------|-------------------|
| v1.0.0 | `METADATA` (D1 database) |
| v1.1.0 | Same as v1.0.0 |
| v1.2.0+ | `METADATA` (D1), `BACKUP_BUCKET` (R2, optional), `BACKUP_DO` (Durable Object, optional) |
| v2.0.0 | Same as v1.2.0 (optional cron trigger for scheduled backups) |
| v2.1.0 | Same as v2.0.0 (optional `[ai]` binding for AI Search) |

### ⚠️ Important: Durable Object Setup for R2 Backups

**If you want R2 backup features** (backup before delete/rename, scheduled backups, restore from R2), you must add a Durable Object binding to your `wrangler.toml`. The Durable Object handles long-running backup operations that exceed Worker CPU limits.

**If you skip this step**, the app will work normally but R2 backup/restore features will be unavailable. You can still use Download/Import for manual backups.

**Upgrading from v1.0.0 or v1.1.x to v2.0.0:**

1. **Add the following to your `wrangler.toml`:**

```toml
# R2 bucket for backups
[[r2_buckets]]
binding = "BACKUP_BUCKET"
bucket_name = "d1-manager-backups"

# Durable Object for async backup operations (REQUIRED for R2 backups)
# The Durable Object handles large backup operations that exceed Worker limits
[[durable_objects.bindings]]
name = "BACKUP_DO"
class_name = "BackupDO"
script_name = "d1-manager"

# Migration tag tells Cloudflare to create the Durable Object class
# This MUST be included on first deploy with Durable Objects
[[migrations]]
tag = "v2_backup_do"
new_classes = ["BackupDO"]
```

2. **Create the R2 bucket:**

```bash
npx wrangler r2 bucket create d1-manager-backups
```

3. **Deploy to apply the Durable Object migration:**

```bash
npx wrangler deploy
```

> **Note:** The `[[migrations]]` block with `tag = "v2_backup_do"` is required on your **first deploy** after adding the Durable Object. Cloudflare uses this to initialize the Durable Object class. You can remove it from `wrangler.toml` after the first successful deploy, but keeping it is harmless.

**Optional: Add scheduled backups**

To enable automated scheduled backups, also add the cron trigger:

```toml
[triggers]
crons = ["0 * * * *"]  # Runs hourly to check for due backups
```

### Redeploy

```bash
git pull origin main
```

```bash
npm install
```

```bash
npm run build
```

```bash
npx wrangler deploy
```

---

## 🐳 Docker

```bash
docker pull writenotenow/d1-manager:latest
```

```bash
docker run -d -p 8080:8080 \
  -e ACCOUNT_ID=your_account_id \
  -e API_KEY=your_api_token \
  -e TEAM_DOMAIN=https://yourteam.cloudflareaccess.com \
  -e POLICY_AUD=your_aud_tag \
  writenotenow/d1-manager:latest
```

See [DOCKER_README.md](DOCKER_README.md) for complete Docker instructions.

---

## 📋 API Reference

| Endpoint | Description |
|----------|-------------|
| `GET /api/databases` | List databases |
| `POST /api/databases` | Create database |
| `DELETE /api/databases/:dbId` | Delete database |
| `PUT /api/databases/:dbId/replication` | Set read replication mode |
| `GET /api/tables/:dbId/list` | List tables |
| `GET /api/tables/:dbId/foreign-keys` | Get FK graph with optional schemas and cycles |
| `POST /api/tables/:dbId/:tableName/strict-check` | Validate STRICT mode compatibility |
| `POST /api/query/:dbId/execute` | Execute SQL |
| `GET /api/webhooks` | List configured webhooks |
| `POST /api/webhooks` | Create a new webhook |
| `PUT /api/webhooks/:id` | Update a webhook |
| `DELETE /api/webhooks/:id` | Delete a webhook |
| `POST /api/webhooks/:id/test` | Send a test webhook |
| `GET /api/migrations/status` | Get migration status |
| `POST /api/migrations/apply` | Apply pending migrations |
| `GET /api/metrics` | Get D1 analytics (query volume, latency, storage) |
| `GET /api/scheduled-backups` | List all scheduled backups |
| `POST /api/scheduled-backups` | Create or update a scheduled backup |
| `DELETE /api/scheduled-backups/:dbId` | Delete a scheduled backup |
| `POST /api/drizzle/:dbId/introspect` | Introspect database and generate Drizzle schema |
| `GET /api/drizzle/:dbId/migrations` | Get Drizzle migration status |
| `POST /api/drizzle/:dbId/push` | Push schema changes to database (supports dry-run) |
| `POST /api/drizzle/:dbId/check` | Validate schema against database state |
| `GET /api/drizzle/:dbId/export` | Export Drizzle schema as TypeScript file |
| `GET /api/r2-backup/orphaned` | List backups from deleted databases |
| `DELETE /api/r2-backup/:databaseId/bulk` | Bulk delete R2 backups |

📚 **Full API docs:** [Wiki - API Reference](https://github.com/neverinfamous/d1-manager/wiki/API-Reference)

---

## 📊 External Logging Integration

D1 Manager supports integration with external observability platforms via Cloudflare's native OpenTelemetry export. This allows you to send traces and logs to services like Grafana Cloud, Datadog, Honeycomb, Sentry, and Axiom.

### Option 1: OpenTelemetry Export (Recommended)

Cloudflare Workers natively supports exporting OpenTelemetry-compliant traces and logs to any OTLP endpoint.

**Step 1: Create a destination in Cloudflare Dashboard**

1. Go to [Workers Observability](https://dash.cloudflare.com/?to=/:account/workers-and-pages/observability/pipelines)
2. Click **Add destination**
3. Configure your provider's OTLP endpoint and authentication headers

**Common OTLP Endpoints:**

| Provider | Traces Endpoint | Logs Endpoint |
|----------|-----------------|---------------|
| Grafana Cloud | `https://otlp-gateway-{region}.grafana.net/otlp/v1/traces` | `https://otlp-gateway-{region}.grafana.net/otlp/v1/logs` |
| Honeycomb | `https://api.honeycomb.io/v1/traces` | `https://api.honeycomb.io/v1/logs` |
| Axiom | `https://api.axiom.co/v1/traces` | `https://api.axiom.co/v1/logs` |
| Sentry | `https://{HOST}/api/{PROJECT_ID}/integration/otlp/v1/traces` | `https://{HOST}/api/{PROJECT_ID}/integration/otlp/v1/logs` |
| Datadog | Coming soon | `https://otlp.{SITE}.datadoghq.com/v1/logs` |

**Step 2: Update wrangler.toml**

```toml
[observability]
enabled = true

[observability.traces]
enabled = true
destinations = ["your-traces-destination"]

[observability.logs]
enabled = true
destinations = ["your-logs-destination"]
```

### Option 2: Application Webhooks

Use the built-in webhook system to send event notifications to any HTTP endpoint (Slack, Discord, custom services).

Configure webhooks in the UI under the **Webhooks** tab.

📚 **Full observability docs:** [Wiki - Observability](https://github.com/neverinfamous/d1-manager/wiki/Observability)

---

## 🛠️ Tech Stack

| Frontend | Backend |
|----------|---------|
| React 19.2.0 | Cloudflare Workers |
| TypeScript 5.9.3 | Cloudflare D1 |
| Vite 7.2.4 | Cloudflare Access |
| Tailwind CSS + shadcn/ui | Cloudflare R2 + Durable Objects |

---

## 🐞 Troubleshooting

**"Failed to list databases"**
- Verify `ACCOUNT_ID` is correct
- Ensure API token has **D1 Edit** permission (not just Read)

**Authentication loop**
- Check `TEAM_DOMAIN` includes `https://`
- Verify `POLICY_AUD` matches your Access application

📚 **More solutions:** [Wiki - Troubleshooting](https://github.com/neverinfamous/d1-manager/wiki/Troubleshooting)

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

📚 **Guidelines:** [Wiki - Contributing Guide](https://github.com/neverinfamous/d1-manager/wiki/Contributing-Guide)

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 📞 Support

- 🐛 **Bug Reports:** [GitHub Issues](https://github.com/neverinfamous/d1-manager/issues)
- 💡 **Feature Requests:** [GitHub Discussions](https://github.com/neverinfamous/d1-manager/discussions)
- 📧 **Email:** admin@adamic.tech

---

**Made with ❤️ for the Cloudflare community**
