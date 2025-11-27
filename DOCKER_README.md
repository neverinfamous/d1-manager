# D1 Database Manager - Docker

Last Updated November 27, 2025 - Production/Stable v1.1.0

[![GitHub](https://img.shields.io/badge/GitHub-neverinfamous/d1--manager-blue?logo=github)](https://github.com/neverinfamous/d1-manager)
[![Docker Pulls](https://img.shields.io/docker/pulls/writenotenow/d1-manager)](https://hub.docker.com/r/writenotenow/d1-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
![Version](https://img.shields.io/badge/version-v1.1.0-green)
![Status](https://img.shields.io/badge/status-Production%2FStable-brightgreen)
[![Security](https://img.shields.io/badge/Security-Enhanced-green.svg)](https://github.com/neverinfamous/d1-manager/blob/main/SECURITY.md)
[![Type Safety](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://github.com/neverinfamous/d1-manager)

This Docker image provides a modern, full-featured web application for managing Cloudflare D1 databases with enterprise-grade authentication via Cloudflare Access (Zero Trust). Run D1 Database Manager in Docker for development, testing, or self-hosted deployments.

**[Live Demo](https://d1.adamic.tech/)** • **[Wiki](https://github.com/neverinfamous/d1-manager/wiki)** • **[GitHub](https://github.com/neverinfamous/d1-manager)** • **[Changelog](https://github.com/neverinfamous/d1-manager/wiki/Changelog)** • **[Release Article](https://adamic.tech/articles/d1-manager)**

---

## 🎯 Features

### Database Management
- Create, rename, delete, download, optimize, and upload databases
- Bulk operations with multi-select
- Upload/import SQL files
- **NEW ✨Job history tracking** - Track all database operations with detailed history

### Table Operations
- Visual schema designer
- Clone, export (SQL/CSV), and bulk operations
- Column management (add, modify, rename, delete)
- Foreign key dependency analysis

### Query Console
- SQL editor with syntax highlighting
- Query history and saved queries
- CSV export

### Advanced Features
- **Row-Level Filtering** - Type-aware filters with OR logic, BETWEEN, IN operators
- **Foreign Key Visualizer** - Interactive graph with add/modify/delete constraints
- **ER Diagram** - Visual schema documentation with PNG/SVG/JSON export
- **Cascade Impact Simulator** - Preview DELETE cascades before execution
- **Undo/Rollback** - Restore dropped tables, columns, or deleted rows
- **FTS5 Full-Text Search** - Create and manage virtual tables
- **Constraint Validator** - Detect orphans and integrity violations
- **Index Analyzer** - Smart index recommendations
- **NEW ✨Time Travel** - View bookmarks, checkpoint history, and CLI restore commands
- **NEW ✨ Read Replication** - Enable/disable global read replicas with D1 Sessions API info

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

### 1. Update Schema (Required for New Features)

Run this after updating to add new tables (safe to run multiple times):

```bash
npx wrangler d1 execute d1-manager-metadata --remote --file=worker/schema.sql
```

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
| `v1.1.0` | Specific version (recommended for production) |
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
