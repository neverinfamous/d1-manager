# D1 Database Manager for Cloudflare

[![GitHub](https://img.shields.io/badge/GitHub-neverinfamous/d1--manager-blue?logo=github)](https://github.com/neverinfamous/d1-manager)
[![Docker Pulls](https://img.shields.io/docker/pulls/writenotenow/d1-manager)](https://hub.docker.com/r/writenotenow/d1-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
![Version](https://img.shields.io/badge/version-v1.0.0-green)
![Status](https://img.shields.io/badge/status-Production%2FStable-brightgreen)
[![Security](https://img.shields.io/badge/Security-Enhanced-green.svg)](https://github.com/neverinfamous/d1-manager/blob/main/SECURITY.md)
[![CodeQL](https://img.shields.io/badge/CodeQL-Passing-brightgreen.svg)](https://github.com/neverinfamous/d1-manager/security/code-scanning)
[![Type Safety](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://github.com/neverinfamous/d1-manager)

This Docker image provides a modern, full-featured web application for managing Cloudflare D1 databases with enterprise-grade authentication via Cloudflare Access (Zero Trust). Run D1 Database Manager in Docker for development, testing, or self-hosted deployments.

**[Live Demo](https://d1.adamic.tech/)** • **[Wiki Documentation](https://github.com/neverinfamous/d1-manager/wiki)** • **[Docker Hub](https://hub.docker.com/r/writenotenow/d1-manager)**

---

## 🎯 Features

### Database Management
- Create, rename, delete, download, optimize, and upload databases
- Bulk operations with multi-select
- Upload/import SQL files
- **✨ Job history tracking** - Track all database operations with detailed history

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
- **Time Travel** - View bookmarks, checkpoint history, and CLI restore commands

### User Experience
- Dark/Light/System themes
- Responsive design

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

### 4. Set Up Cloudflare Access

1. Go to [Cloudflare Zero Trust](https://one.dash.cloudflare.com/)
2. Configure authentication (GitHub OAuth, etc.)
3. Create an Access Application for your domain
4. Copy the **Application Audience (AUD) tag**

### 5. Create API Token

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Create Custom Token with **Account → D1 → Edit** permission

### 6. Set Secrets
   
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

### 7. Deploy

  ```bash
  npm run build
  ```

  ```bash
  npx wrangler deploy
  ```

---

## ⬆️ Upgrading

### Update Schema (Required for New Features)

Run this after pulling updates to add new tables (safe to run multiple times):

```bash
npx wrangler d1 execute d1-manager-metadata --remote --file=worker/schema.sql
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
| `GET /api/tables/:dbId/list` | List tables |
| `POST /api/query/:dbId/execute` | Execute SQL |

📚 **Full API docs:** [Wiki - API Reference](https://github.com/neverinfamous/d1-manager/wiki/API-Reference)

---

## 🛠️ Tech Stack

| Frontend | Backend |
|----------|---------|
| React 19.2.0 | Cloudflare Workers |
| TypeScript 5.9.3 | Cloudflare D1 |
| Vite 7.1.12 | Cloudflare Access |
| Tailwind CSS + shadcn/ui | |

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
