# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased](https://github.com/neverinfamous/d1-manager/compare/v2.6.7...HEAD)

## [2.6.7](https://github.com/neverinfamous/d1-manager/releases/tag/v2.6.7) - 2026-04-06

### Changed

- Upgraded `vite` to `v8.0.5`.


## [2.6.6](https://github.com/neverinfamous/d1-manager/releases/tag/v2.6.6) - 2026-04-06

### Security

- Added manual patching for `picomatch@4.0.4` in `Dockerfile` to remediate Docker Scout failure on `CVE-2026-33671` traversing from `npm` bundled `tinyglobby` tree.

## [2.6.5](https://github.com/neverinfamous/d1-manager/releases/tag/v2.6.5) - 2026-04-06

### Changed

- **Dependency Updates:**
  - Upgraded `vite` to `v8.0.4` and `@vitejs/plugin-react` to `v6.0.1`, including a refactor of `vite.config.ts` to use functional `manualChunks` definition for Rollup 4 compatibility.
  - Upgraded `typescript` to `v6.0.2` and updated TS `useState`/`useRef` strict inferences in contexts and `aiSearch` usage definitions to resolve deprecation/TypeScript 6 strictness.
  - Upgraded `esbuild` to `v0.28.0`.
  - Upgraded `lucide-react` to `v1.7.0`.

### Security

- Patched Docker build transitive dependencies `tar` to `v7.5.13` to resolve known vulnerabilities.
- Added explicit npm overrides for `flatted` (v3.4.2), `picomatch` (v4.0.4), `tar` (v7.5.13), and `minimatch` (v10.2.5) to secure dependency chains against severe CVEs.

## [2.6.4] - 2026-03-17

### Changed

**Dependency Updates**

- Bump `@types/node` from 25.4.0 to 25.5.0
- Bump `esbuild` from 0.27.3 to 0.27.4
- Bump `@cloudflare/workers-types` and `wrangler`
- Bump `drizzle-kit` from 0.31.9 to 0.31.10
- Bump `jspdf` from 4.2.0 to 4.2.1
- Bump `typescript-eslint` from 8.57.0 to 8.57.1
- Bump `@vitejs/plugin-react` from 5.1.4 to 5.2.0
- Update GitHub Actions dependencies

### Security

- Pin `undici` to `7.24.4` to fix high severity vulnerabilities (GHSA-f269-vfmq-vjvj, GHSA-2mjp-6q6p-2qxm, GHSA-4992-7rv2-5pvq, etc.) in `npm audit`

## [2.6.3] - 2026-03-10

### Changed

- **Dependency Updates**
  - `@cloudflare/workers-types`: 4.20260307.1 → 4.20260310.1 (patch)
  - `@types/node`: 25.3.5 → 25.4.0 (minor)
  - `jose`: 6.2.0 → 6.2.1 (patch)
  - `typescript-eslint`: 8.56.1 → 8.57.0 (minor)
  - `wrangler`: 4.71.0 → 4.72.0 (minor)
  - `tar` override: 7.5.10 → 7.5.11 (patch) — npm + Docker layers
  - GitHub Actions: `docker/setup-buildx-action` (v3 → v4), `docker/login-action` (v3 → v4), `docker/metadata-action` (v5 → v6), `docker/build-push-action` (v6 → v7)

## [2.6.2] - 2026-03-07

### Changed

**Documentation**

- **Changelog Migrated:** Moved `Changelog.md` from the wiki repository into the main project root as `CHANGELOG.md`.
- **README Link Fix:** Fixed broken changelog link in README.md (`shttps://` → `https://`).
- **Updated Changelog Links:** Updated changelog links in README.md and DOCKER_README.md to point to the new root location.

## [2.6.1] - 2026-03-07

### Security

- **GHSA-qffp-2rhf-9h96** (tar path traversal): Updated tar override 7.5.8 → 7.5.10
  - Updated Dockerfile npm CLI tar patching from 7.5.8 → 7.5.10 in both builder and runtime stages

## [2.6.0] - 2026-03-07

### Changed

- **ESLint 10 Migration**: Upgraded from ESLint 9 to ESLint 10
  - Updated `eslint` 9.39.2 → 10.0.1 and `@eslint/js` 9.13.0 → 10.0.1
  - Fixed 8 `preserve-caught-error` violations by adding `{ cause: error }` to re-thrown errors
  - Fixed 6 `no-useless-assignment` violations across 5 files
  - Updated `tsconfig.app.json` target/lib from ES2020 → ES2022 (required for `Error` `cause` option)
  - Added `eslint-plugin-react-hooks` eslint peer dep override (plugin hasn't declared ESLint 10 support yet)
  - Removed `brace-expansion` override (no longer needed; was incompatible with minimatch 10.x)
- **AI Search API Migration**: Migrated from deprecated `env.AI.autorag()` binding to the new `env.AI.aiSearch()` API
  - `autorag(id).search()` → `aiSearch().get(id).search()` with OpenAI-style messages array
  - `autorag(id).aiSearch()` → `aiSearch().get(id).chatCompletions()` for both streaming and non-streaming
  - Search parameters restructured: `query`/`rewrite_query`/`max_num_results`/`ranking_options`/`reranking` → `messages` + `ai_search_options` object
  - Response adapter transforms new `AiSearchSearchResponse` (chunks format) back to frontend-expected shape for backwards compatibility
  - REST API fallback URLs left on legacy `autorag/rags/` paths per Cloudflare guidance
  - Fixed method call syntax: `env.AI.aiSearch` → `env.AI.aiSearch()` to match `@cloudflare/workers-types` method signature, resolving 26 `@typescript-eslint/no-unsafe-*` lint errors
  - Replaced `Parameters<ReturnType<typeof env.AI.aiSearch.get>["search"]>[0]` with direct `AiSearchSearchRequest` type
- **Default Branch Migration**: Renamed default branch from `master` to `main`
  - Updated all GitHub Actions workflow triggers and conditional checks across 4 workflow files
    **CI/CD**

- **Removed Dependabot Auto-Merge Workflow**: Deleted `dependabot-auto-merge.yml` to prevent automatic merging of dependency PRs
  - Dependabot will still open PRs for visibility into available updates
  - Dependencies are now updated manually in batched local sessions to avoid unnecessary Docker deployments
- **Docker Trigger Fix**: Changed Docker publish workflow to trigger only on tag pushes (`tags: ["v*"]`), not on every push to main
  - Prevents duplicate Docker builds when merging PRs
  - Updated `refs/heads/main` conditions to `startsWith(github.ref, 'refs/tags/v')`
  - Updated `{{is_default_branch}}` to `github.event_name != 'pull_request'`
- **VERSION File Removal**: Deleted VERSION file; Docker workflow now reads version directly from `package.json` via `jq` (single source of truth)
  - Fails hard if version extraction fails (no silent `1.0.0` fallback)
    **Dependencies**

- **@radix-ui/react-label**: Updated 2.1.7 → 2.1.8
- **@radix-ui/react-progress**: Updated 1.1.7 → 1.1.8
- **@radix-ui/react-slot**: Updated 1.2.3 → 1.2.4
- **jspdf**: Updated 4.1.0 → 4.2.0
- **lucide-react**: Updated 0.563.0 → 0.577.0
- **sql-formatter**: Updated 15.7.0 → 15.7.2
- **@babel/core**: Updated 7.28.6 → 7.29.0
- **@cloudflare/workers-types**: Updated 4.20260210.0 → 4.20260307.1
- **@tailwindcss/postcss**: Updated 4.1.18 → 4.2.1
- **@tailwindcss/vite**: Updated 4.1.18 → 4.2.1
- **@types/dagre**: Updated 0.7.53 → 0.7.54
- **@types/node**: Updated 25.2.3 → 25.3.5
- **@types/prismjs**: Updated 1.26.5 → 1.26.6
- **@types/react**: Updated 19.2.13 → 19.2.14
- **tailwind-merge**: Updated 3.3.1 → 3.5.0
- **tailwindcss**: Updated 4.1.17 → 4.2.1
- **typescript-eslint**: Updated 8.55.0 → 8.56.1
- **eslint**: Updated 9.39.2 → 10.0.3
- **@eslint/js**: Updated 9.13.0 → 10.0.1
- **eslint-plugin-react-refresh**: Updated 0.5.0 → 0.5.2
- **globals**: Updated 16.4.0 → 17.4.0
- **jose**: Updated 6.1.3 → 6.2.0
- **postcss**: Updated 8.5.6 → 8.5.8
- **wrangler**: Updated 4.64.0 → 4.71.0

### Security

- **GHSA-3ppc-4f35-3m26** (minimatch ReDoS): Resolved all 11 npm audit vulnerabilities
  - ESLint 10 upgrade eliminated eslint-chain minimatch vulnerability (was 10 of 11)
  - Added `@typescript-eslint/typescript-estree` minimatch override ^10.2.1 for remaining transitive dependency
  - Removed `brace-expansion` ^2.0.2 override (incompatible with minimatch 10.x; original vulnerability no longer relevant)
- **GHSA-7r86-cg39-jmmj / GHSA-23c5-xmqv-rm74 / CVE-2026-27903 / CVE-2026-27904** (minimatch ReDoS): Updated minimatch override to ^10.2.4 and promoted to top-level override
  - Addresses combinatorial backtracking via multiple non-adjacent GLOBSTAR segments
  - Addresses catastrophically backtracking regular expressions from nested `*()` extglobs
  - Previous scoped override under `@typescript-eslint/typescript-estree` only covered one transitive path; top-level override covers all consumers (eslint, eslint config-array)
  - Updated Dockerfile npm CLI minimatch patching from 10.2.2 → 10.2.4 in both builder and runtime stages
- **CVE-2026-26960** (tar path traversal): Updated tar override 7.5.7 → 7.5.10 to address additional path traversal vulnerabilities
  - Updated Dockerfile npm CLI tar patching from 7.5.7 → 7.5.8 in both builder and runtime stages
- **GHSA-qffp-2rhf-9h96** (tar path traversal): Updated tar override 7.5.8 → 7.5.10
- **P111 Exact Pinning**: Changed glob (`11.1.0`), tar (`7.5.8`), and minimatch (`10.2.4`) overrides from caret ranges to exact version pins to prevent lockfile drift from Dockerfile patch versions

## [2.5.0] - 2026-02-10

### Changed

- **Node.js 24 LTS Baseline**: Upgraded from Node 22 to Node 24 LTS across all configurations
  - Dockerfile updated to use `node:24-alpine` for both builder and runtime stages
  - GitHub Actions workflows updated to use Node 24.x as primary version
  - `package.json` now includes `engines` field requiring Node.js >=24.0.0
  - README prerequisites updated to specify Node.js 24+ (LTS)
    **Dependencies**

- **@babel/core**: Updated 7.28.6 → 7.29.0
- **@cloudflare/workers-types**: Updated 4.20260114.0 → 4.20260210.0
- **@types/node**: Updated 25.0.8 → 25.2.3
- **@types/react**: Updated 19.2.8 → 19.2.13
- **@vitejs/plugin-react**: Updated 5.1.2 → 5.1.4
- **eslint-plugin-react-refresh**: Updated 0.4.26 → 0.5.0
- **globals**: Updated 17.0.0 → 17.3.0
- **jspdf**: Updated 4.0.0 → 4.1.0
- **react**: Updated 19.2.3 → 19.2.4
- **react-dom**: Updated 19.2.3 → 19.2.4
- **lucide-react**: Updated 0.562.0 → 0.563.0
- **sql-formatter**: Updated 15.6.12 → 15.7.0
- **typescript-eslint**: Updated 8.53.0 → 8.55.0
- **wrangler**: Updated 4.59.1 → 4.64.0
- **esbuild**: Updated 0.25.12 → 0.27.3 (added override to force transitive deps via drizzle-kit)
- **drizzle-kit**: Updated 0.31.8 → 0.31.9
- **tar**: Updated override 7.5.2 → 7.5.7 (CVE-2026-23745, CVE-2026-23950, CVE-2026-24842)
- **@isaacs/brace-expansion**: Added override ^5.0.1 (GHSA-7h2j-956f-4vf2)
  **CI/CD**

- **Fixed Docker Security Gate**: Restructured `docker-publish.yml` to properly gate Docker Hub publishing on security scan results
  - Previous: Platform images were pushed during `build-platform` before security scan ran
  - Now: Images are built in `build-platform` (no push), scanned in `security-scan`, then pushed in new `push-platform` job only after scan passes
  - Ensures no Docker images are published if security vulnerabilities are detected
    **Code Quality**

- **ESLint Remediation**: Eliminated all `eslint-disable` comments from the codebase
  - Applied `useCallback` memoization pattern to 15 React components for proper `react-hooks/exhaustive-deps` compliance
  - Affected components: App, BackupRestoreHub, CloneDatabaseDialog, DatabaseComparison, DatabaseView, DrizzleConsole, ExportDatabaseDialog, FTS5FromTableConverter, FTS5Manager, IndexAnalyzer, JobHistory, JobHistoryDialog, QueryBuilder, R2RestoreDialog, TableView
  - The `react-refresh/only-export-components` rule is handled via `eslint.config.js` configuration (`allowConstantExport: true`)
  - Zero eslint-disable comments remaining in source code

### Fixed

- **Query Builder Results Display**: Fixed bug where clicking Execute in the Query Builder tab produced no visual feedback despite the query executing successfully on the backend
  - Results panel was gated on `results.length > 0`, hiding the panel entirely for zero-row results and providing no execution feedback
  - Now displays Results panel after every successful execution with row count, execution time, and served-by region/replica metadata
  - Handles zero-result queries with "Query returned no results" or "X row(s) affected" messaging
  - Added CSV export button for result data (matching SQL Editor feature parity)

### Security

- **CVE-2026-24842** (tar path traversal): Updated tar override to 7.5.7 to address additional path traversal vulnerability
- **GHSA-7h2j-956f-4vf2** (@isaacs/brace-expansion ReDoS): Added override ^5.0.1 to fix critical regex complexity vulnerability (CVSS 9.2)
- **CVE-2026-23745** (tar path traversal): Updated tar to 7.5.7 in Dockerfile npm patching and package.json override
- **CVE-2026-23950** (tar Unicode handling): Updated tar to 7.5.7 in Dockerfile npm patching and package.json override
- **CodeQL js/stack-trace-exposure**: Replaced error sanitization with `classifySqlError` allowlist function that returns only predefined static strings - no data from original error flows to response, fully breaking taint tracking

## [2.4.0] - 2026-01-13

### Added

- **Schema Comparison with Migration Script Generation**: Enhanced Database Comparison with SQL migration script generation
  - Compare two databases to view schema differences (tables, columns, indexes, foreign keys, triggers)
  - Generate executable SQL migration scripts from schema differences
  - Risk classification for migration steps (safe, warning, danger)
  - Copy migration script to clipboard or download as `.sql` file
  - Apply migration directly to target database with confirmation dialog
  - Idempotent apply: automatically skips ADD COLUMN for columns that already exist
  - Handles SQLite-specific constraints (table recreation for column modifications)
  - New backend endpoint: `GET /api/tables/:dbId/schema-full` for comprehensive schema introspection

### Changed

**Dependencies**

- **Types Group**: Updated `@types/node` 25.0.7 → 25.0.8
- **wrangler**: Updated 4.58.0 → 4.59.1
- **@cloudflare/workers-types**: Updated 4.20260111.0 → 4.20260113.0
- **@babel/core**: Updated 7.28.5 → 7.28.6
- **diff**: Updated 8.0.2 → 8.0.3
- **esbuild**: Held at 0.25.12 (pinned in overrides for Wrangler compatibility)

### Fixed

- **Local Development Server**: Fixed "Cannot read properties of undefined (reading 'fetch')" error when running `npx wrangler dev --config wrangler.dev.toml` - Worker now properly handles missing ASSETS binding in local dev (ASSETS is only available in production, Vite serves frontend locally)

### Security

- **Documented** CVE-2026-22184 (zlib buffer overflow in untgz) - NOT EXPLOITABLE (D1 Manager does not use untgz utility); awaiting zlib 1.3.1.3 from Alpine

## [2.3.0] - 2026-01-07

### Added

- **Query Insights Tab**: New tab in Metrics Dashboard for slow query analysis
  - Powered by Cloudflare's `d1QueriesAdaptiveGroups` GraphQL Analytics API
  - Performance summary cards: Critical (>100ms), Moderate (50-100ms), Fast (<50ms) queries
  - Sortable table by total time, average time, execution count, or rows read
  - Expandable query details showing full SQL and detailed metrics
  - Visual performance badges with color-coded severity indicators
  - Tabbed interface: "Overview" for existing charts, "Query Insights" for slow queries

### Changed

**Dependencies**

- **@cloudflare/workers-types**: Updated 4.20260103.0 → 4.20260107.1
- **@radix-ui/react-tabs**: Added for Query Insights tabbed interface

## [2.2.0] - 2026-01-07

### Added

- **Portable Export Formats**: Export databases in SQL, JSON, or CSV/ZIP format
  - SQL: Full database dump with schema and data (standard .sql file)
  - JSON: Portable JSON format with metadata and table data as arrays of objects
  - CSV: ZIP archive containing `_metadata.json` + per-table CSV files with column types
  - Empty table handling: tables with 0 rows export metadata only
  - All formats include schema information for complete database reconstruction
- **External Import Support**: Import databases from SQL, JSON, or CSV/ZIP sources
  - Create new database or import into existing database
  - Automatic schema inference from JSON/CSV metadata
  - Table preview showing row counts per table before import
  - Empty table support: creates schema for tables with no data rows
  - Better error messages for "database already exists" and other common issues
- **Batch Export Format Selection**: Choose SQL/JSON/CSV format for bulk downloads
  - Format dropdown appears when databases are selected
  - Progress indicator shows current database name, completed count, and progress bar
  - Rate limiting with 300ms delay between databases prevents API throttling

### Changed

**Improved**

- **Export Rate Limiting**: Increased inter-table delay from 100ms to 300ms with exponential backoff retry (2s→4s→8s) for 429 errors
- **Import Cache Refresh**: Database list now automatically refreshes after successful import (no page reload needed)
  **Developer Experience**

- **Auto-detect local vs production**: Environment configuration simplified with `.env.development` auto-loaded by Vite during `npm run dev`. No more manually commenting/uncommenting `.env` to switch between dev and prod.
- **Simplified** Wrangler config - `wrangler.toml` now committed to repo; removed `wrangler.toml.example` and `wrangler.jsonc`
  **CI/CD**

- **Fixed** Docker gating to properly block on CodeQL security alerts - Added `fail-on: error` to CodeQL analyze step
- **Improved** Docker Scout scanning to use official `docker/scout-action@v1` with `only-fixed: true` filter - Only blocks on fixable critical/high vulnerabilities, uploads SARIF to GitHub Security tab
  **Dependencies**

- **wrangler**: Updated 4.54.0 → 4.57.0
- **vite**: Updated 7.3.0 → 7.3.1

### Security

- **Fixed** CodeQL alert for incomplete string escaping in AI Search markdown export - Now escapes backslashes before pipes to prevent escaping bypass
- **Upgraded** Node.js from 20-alpine to 22-alpine (Node 20 EOL April 2026)
- **Upgraded** curl 8.17.0-r1 → 8.18.0-r0 - Fixes CVE-2025-14819, CVE-2025-14017, CVE-2025-14524 (various curl vulnerabilities)
- **Documented** CVE-2025-60876 (busybox wget) - Not exploitable (D1 Manager uses curl); awaiting Alpine patch

## [2.1.0] - 2026-01-07

### Added

- **AI Search Integration**: Semantic search over D1 database schemas and data using Cloudflare AI Search (AutoRAG)
  - D1→R2 connector pattern: exports database content as markdown for indexing
  - Export formats: schema.md, tables/{name}.md, relationships.md, data/{name}.md
  - Compatibility analysis: table count, row count, estimated export size, last export timestamp
  - One-click export to R2 with progress tracking
  - AI Search instance management: list instances, trigger sync/re-index
  - Dual search modes: semantic search (vector similarity) and AI-powered search (with generated response)
  - Streaming support for AI-powered search responses
  - Mock data support for local development
  - New wiki page: [[AI Search]] with setup guide and troubleshooting
  - Requires `[ai]` binding and `BACKUP_BUCKET` in wrangler.toml
- **13-Event Webhook Engine**: Streamlined webhook events for cleaner external integrations
  - New events: `table_create`, `table_delete`, `table_update`, `backup_complete`, `restore_complete`, `import_complete`, `export_complete`, `bulk_delete_complete`, `schema_change`
  - Events organized into categories: Database Lifecycle, Table DDL, R2 Snapshots, Data Transfer, Bulk Operations, Job Lifecycle
  - Backward-compatible aliases for `database_export` and `database_import`
  - Aligned with KV Manager webhook architecture for fleet consistency
- **FTS5 Warning for Scheduled Backups**: Added visual warning when configuring scheduled backups for databases with FTS5 tables
  - Displays warning badge showing FTS5 table count in the scheduled backup configuration dialog
  - Explains that FTS5 tables can cause longer export times and potential timeouts
  - Does not block scheduled backups (users can still proceed), but provides informed guidance
  - Suggests manual backups as alternative for databases with large FTS5 indexes
- **Health Dashboard**: At-a-glance system health overview for D1 databases
  - Health score (0-100) calculated from backup coverage, job failures, and replication status
  - Summary cards: database count, total storage, scheduled backups, recent jobs
  - Low backup coverage alerts: databases without scheduled backups
  - Failed backup tracking with schedule ID and failure time
  - Replication status overview: databases with/without read replication
  - 2-minute cache TTL matching Metrics Dashboard
  - Navigation tab between Metrics and Webhooks

### Changed

**Documentation**

- **Added** [[Upgrade Guide]] to wiki - Comprehensive documentation for the automated in-app upgrade system covering all 5 schema migrations
- **Updated** [[Webhooks]] wiki page - Complete rewrite for 13-event webhook engine with streamlined event categories
  **CI/CD**

- **Explicit Docker Gating**: Docker image publishing is now gated on lint and CodeQL verification
  - Added `lint` prerequisite job to `docker-publish.yml` (ESLint, frontend build, worker dry-run)
  - Added `codeql` prerequisite job for security analysis before image builds
  - `build-platform` job now requires both `lint` and `codeql` to pass
  - Prevents publishing images when linting or security analysis fails
- **Dependabot Configuration**: Added `.github/dependabot.yml` with dependency grouping
  - 8 npm dependency groups: vitest, eslint, types, ui-frameworks, cloudflare, react, vite, tanstack
  - github-actions ecosystem with actions grouping
  - docker ecosystem for base image updates
  - Weekly schedule (Mondays at 9:00 AM ET)
- **GitHub Actions Updates**: Updated to latest action versions
  - `actions/checkout`: v5 → v6
  - `actions/upload-artifact`: v4 → v6
  - `actions/download-artifact`: v4 → v7
    **Dependencies**

- **ESLint Group**: Updated `eslint` 9.36.0 → 9.39.2, `eslint-plugin-react-refresh` 0.4.14 → 0.4.26, `typescript-eslint` 8.50.1 → 8.52.0, `globals` 16.4.0 → 17.0.0
- **Types Group**: Updated `@types/node` 24.9.1 → 24.9.3, `@types/react` 19.2.2 → 19.2.3, `@types/react-dom` 19.2.2 → 19.2.3
- **sql-formatter**: Updated 15.6.10 → 15.6.12
- **TailwindCSS v4 Upgrade**: Migrated from TailwindCSS 3.4.19 to 4.1.17
  - Replaced `tailwindcss` PostCSS plugin with `@tailwindcss/postcss`
  - Added `@tailwindcss/vite` for Vite integration
  - Migrated from `tailwind.config.js` to CSS-first configuration using `@import "tailwindcss"` and `@theme` blocks
  - Removed `tailwindcss-animate` (incompatible with v4) - animations now defined in `@theme` block
  - Removed `autoprefixer` (built into Tailwind v4)
  - Deleted legacy `tailwind.config.js` file

### Fixed

- **React Version Mismatch**: Fixed React error #527 caused by mismatched versions
  - Aligned `react-dom` (19.2.1 → 19.2.3) to match `react` version
  - React and React-DOM must always be the same version
- **Scheduled Backups**: Added missing cron trigger configuration in `wrangler.toml` to enable automated scheduled backups
  - The `scheduled()` handler was implemented but cron trigger was not configured in production
  - Added `[triggers]` section with hourly cron schedule (`0 * * * *`)
  - Scheduled backups will now execute on schedule after deployment
- **Backup Timeout**: Increased backup export timeout from 2 minutes to 6 minutes for larger databases
  - Prevents "Export timeout - database may be too large" errors on databases that take longer to export
  - Increased polling attempts from 60 to 180 (180 attempts × 2 seconds = 6 minutes)
  - Improved error message with more actionable guidance
  - Note: Databases with FTS5 tables may still timeout depending on FTS5 index size
- **Build Optimization**: Reduced bundle size and improved initial page load
  - Replaced 2MB Vite placeholder favicon with inline SVG data URI (~200 bytes)
  - Added JobHistory to lazy-loaded components (loads on-demand, not at startup)
  - Main bundle reduced from 665KB → 645KB
- **TypeScript Fix**: Fixed `getOrdinalSuffix` function returning `string | undefined` instead of `string`
  - Array fallback now uses literal `'th'` instead of `s[0]` to satisfy `noUncheckedIndexedAccess`

### Security

- **jspdf Local File Inclusion/Path Traversal**: Updated jspdf from 3.0.4 to 4.0.0 to address path traversal vulnerability
  - Affected methods: `loadFile`, `addImage`, `html`, `addFont` in node.js builds
  - User-controlled paths could retrieve arbitrary local file contents and embed them in generated PDFs
  - jsPDF 4.0.0 restricts file system access by default
  - D1 Manager uses jspdf in browser context (unaffected), but update applied as best practice
  - See [GitHub Advisory GHSA-jspdf-path-traversal](https://github.com/parallax/jsPDF/security/advisories) for details
- **CVE-2025-64756 (glob CLI Command Injection)**: Proactively addressed potential command injection vulnerability in glob dependency
  - Added `"glob": "^11.1.0"` to package.json overrides to force patched version across all dependencies
  - Vulnerability affects glob CLI's `-c/--cmd` option (versions 10.2.0-10.4.x and 11.0.0-11.0.3)
  - D1 Manager does not directly use glob CLI, but override protects against future transitive dependencies
  - Patched version 11.1.0 prevents arbitrary command execution via malicious filenames
  - See [GitHub Advisory CVE-2025-64756](https://github.com/advisories/GHSA-xj72-wvfv-8985) for details

## [2.0.0] - 2025-12-05

This major release transforms D1 Database Manager into an enterprise-ready solution with Drizzle ORM integration, scheduled R2 backups, a comprehensive metrics dashboard, and dramatic performance improvements. No breaking changes - all new features are additive.

### Added

- **Scheduled R2 Backups**: Automated backup scheduling for D1 databases to R2 storage
  - Configure daily, weekly, or monthly backup schedules per database
  - Backups run automatically via Cloudflare Workers cron triggers (hourly check)
  - Choose specific day of week for weekly backups, day of month for monthly
  - Select backup hour (0-23 UTC) for precise scheduling
  - Enable/disable schedules without deleting configuration
  - View last run status (success/failed), next run time, and backup history
  - All scheduled backups appear in the Backup & Restore hub for easy restore
  - Job history tracks all scheduled backups as "Scheduled Backup" operation type
  - New "Schedule" tab in Backup & Restore dialog for per-database configuration
  - Requires R2 bucket and cron trigger configured in wrangler.toml
- **External Documentation Links**: Added quick-access icon buttons in the header for external resources
  - Cloudflare Dashboard link for direct access to your Cloudflare account
  - Cloudflare D1 Documentation link for D1-specific reference
  - D1 Manager Wiki link for app-specific documentation and guides
  - SQLite Documentation link for SQL syntax and function reference
  - All links open in new tabs with proper accessibility attributes
- **SQL Formatter**: Added one-click SQL formatting in Query Console
  - "Format" button with magic wand icon in the editor toolbar
  - Uses `sql-formatter` library with SQLite dialect support
  - Automatically indents and beautifies complex queries
  - Graceful handling of invalid SQL (leaves query unchanged)
- **SQL Autocomplete Toggle**: Added option to enable/disable SQL suggestions in Query Console
  - Toggle checkbox in editor controls: "Enable SQL suggestions"
  - Preference persisted to localStorage (survives browser refresh)
  - Dynamic placeholder text and help hints based on toggle state
  - Useful for users who prefer typing without popup interruptions
- **Syntax Highlighting**: Enhanced SQL editor with real-time syntax highlighting
  - Powered by Prism.js with full SQLite language support
  - Color-coded keywords, strings, numbers, comments, functions, and operators
  - Updates in real-time as you type
  - Full support for both light and dark themes
- **Word Wrap Toggle**: Added word wrap control in Query Console
  - Toggle button above the editor with wrap icon (↩)
  - Long lines wrap to next line (default) or extend horizontally with scrollbar
  - Preference state persisted during session
- **Inline Error Squiggles**: Added visual error indicators in SQL editor
  - Red wavy underlines appear at exact position of syntax errors
  - Detects unclosed parentheses, quotes, incomplete statements, and trailing commas
  - Helps locate and fix issues before executing queries
- **Table-Level R2 Backup & Restore**: Added Backup and Restore buttons to table cards in the Tables tab
  - Each table card now has quick-access Backup and Restore icons
  - Create instant R2 backups of individual tables
  - Restore tables directly from R2 backups via table card actions
  - Full integration with existing R2 backup infrastructure
  - Available in both Grid view (card icons) and List view (action column buttons)
- **Comprehensive Undo & R2 Backup Integration**: Automatic backups for all destructive operations
  - **Delete Database**: Creates R2 backup before deletion; backup viewable/restorable in Backup & Restore hub
  - **Rename Database**: Creates R2 backup before rename operation
  - **Delete Table**: Creates undo snapshot for quick restore
  - **Enable STRICT Mode**: Creates R2 backup before table conversion
  - **Modify Column**: Creates undo snapshot before schema changes
  - Deleted database backups persist and can be restored even after database deletion
  - Backup & Restore hub shows orphaned backups (from deleted databases) in database picker
- **Error Support Link**: All error messages now include "Report this error to support@adamic.tech" with clickable mailto link
  - Reusable `ErrorMessage` component with consistent styling across the app
  - Link opens user's default email client with pre-filled subject line
  - WCAG/ARIA compliant with proper `role="alert"` and `aria-live` attributes
- **Drizzle ORM Console**: New tab in Query Console for Drizzle ORM operations
  - **Introspect**: Pull schema from D1 database and generate Drizzle TypeScript schema
  - **Migration Status**: View applied Drizzle migrations and migration history
  - **Generate**: Upload or paste Drizzle schema to preview migration SQL
  - **Push**: Push schema changes directly to database (with dry-run option)
  - **Check**: Validate schema against current database state
  - **Export**: Download generated schema as `schema.ts` TypeScript file
  - **Schema Input**: Upload `.ts` file or paste schema directly into textarea
  - **Schema Comparison**: Parses Drizzle schema and generates SQL diff against current database
  - Schema viewer with syntax highlighting and copy-to-clipboard
  - Output log panel showing command execution history
  - Automatic cache invalidation after push (table list refreshes without page reload)
  - Uses D1 HTTP API with existing credentials (no additional configuration)
- **Unified Backup & Restore Hub**: Centralized dialog for managing both undo history and R2 backups
  - Replaces separate Undo History and R2 Restore dialogs with a single, tabbed interface
  - **Quick Restore Tab**: Undo recent destructive operations (last 10 dropped tables, columns, deleted rows)
  - **R2 Backups Tab**: Full database snapshots stored in R2 cloud storage
  - Multi-select capability for bulk download and bulk delete of R2 backups
  - File size and creation date displayed for each backup
  - Source tags show backup origin (Manual, Before Rename, Before STRICT Mode, etc.)
  - Info panel explains the difference between Quick Restore and R2 Backups
  - Select All / Deselect All for bulk operations
- **Backup Options in Delete Dialogs**: Both Delete Database and Delete Table dialogs now include backup functionality
  - **Delete Database Dialog**:
    - R2 backup button (if configured) to create full database backup before deletion
    - Direct download option to export database as SQL file
    - Confirmation checkbox required before deletion can proceed
    - Warning panel explains the importance of backing up
  - **Delete Table Dialog**:
    - Export Tables button to download table(s) as SQL file before deletion
    - Confirmation checkbox required before deletion can proceed
    - Hint about using R2 Backup for full database snapshots
  - Restore, download, and delete operations tracked in job history
  - New bulk delete endpoint: `DELETE /api/r2-backup/:databaseId/bulk`
- **R2 Backup Counts in Database Picker**: The Backup & Restore database picker now shows R2 backup counts alongside undo counts
  - Each database displays both undo history count and R2 backup count
  - R2 backup counts are lazily loaded when the dialog opens
  - Loading spinner shown while counts are being fetched
  - Only shown when R2 backups are configured
- **Orphaned Backups Section**: Database picker now shows backups from deleted databases
  - Lists R2 backups that belong to databases that no longer exist
  - Allows viewing and restoring backups from deleted databases
  - Displayed in an amber-highlighted section at the bottom of the picker
  - New API endpoint: `GET /api/r2-backup/orphaned`
- **R2 Backup Button on Table Cards**: Table cards in the Tables tab now have an R2 backup button
  - Quick access to backup individual tables to R2 storage
  - Only shown when R2 backups are configured
  - Styled with blue hover effect matching other cloud operations
- **Table Backups in R2 Backups Panel**: Table-level backups (from Modify Column, etc.) are now visible in the R2 Backups tab
  - Backups now clearly distinguished as "Database" (full) or "Table" (single table) with visual badges
  - Table backups display the table name prominently
  - Both backup types support restore, download, and delete operations
  - New `backupType` field added to backup list items
- **STRICT Mode in Create Table**: Option to create tables with SQLite STRICT mode enabled
  - New "Enable STRICT Mode" checkbox in Schema Designer
  - Column type dropdown automatically filters to STRICT-compatible types (INTEGER, REAL, TEXT, BLOB, ANY)
  - Generated columns disabled when STRICT mode is selected (not supported together)
  - Helpful tooltip explains STRICT mode benefits (type safety, data integrity)
- **Create All Indexes Button**: New "Create All Indexes" button on the Performance tab
  - One-click creation of all recommended indexes
  - Warning dialog explains impact on storage and write performance
  - Optional R2 backup before proceeding (when R2 is configured)
  - Progress indicator shows real-time creation status
  - Detailed results showing succeeded and failed indexes
  - Small delay between index creations to avoid rate limits
- **Fullscreen Mode for Relationship Diagrams**: View Foreign Key Editor and ER Diagram in fullscreen
  - Maximize button in toolbar expands diagram to fill entire viewport
  - Press Escape or click minimize button to exit fullscreen
  - Diagram automatically refits when entering/exiting fullscreen
  - Uses z-50 fixed positioning to overlay all other UI elements
- **Metrics Dashboard**: New top-level tab for D1 database analytics powered by Cloudflare GraphQL Analytics API
  - Summary cards: Total queries (reads/writes), rows read, average P90 latency, total storage
  - Time range selector: Last 24 hours, 7 days, or 30 days
  - Query volume trend chart showing reads and writes over time
  - Rows read trend chart (important for billing visibility)
  - Per-database breakdown with horizontal bar charts
  - Detailed metrics table with all database statistics
  - Lightweight SVG-based charts (no heavy chart library dependencies)
  - Full accessibility: screen reader support, keyboard navigation, WCAG-compliant contrast
  - API endpoint: `GET /api/metrics?range=24h|7d|30d`
- **Database List View**: Toggle between grid (cards) and list (table) view for databases
  - Grid/List toggle button with LayoutGrid/LayoutList icons
  - List view shows databases in a compact table format with sortable columns
  - Sortable by Name, Size, Tables, and Created date
  - All database info visible: name, ID (copyable), FTS5/Replicated/Version badges, size, tables, created
  - All action buttons available: Browse, Query, Rename, Clone, Import, Download, Optimize, FTS5 Search, R2 Backup, R2 Restore, Delete
  - Color picker accessible in list view
  - Checkbox selection with select-all support
  - View preference persisted to localStorage
  - Fits more databases on screen compared to card view
- **Tables List View**: Toggle between grid (cards) and list (table) view for tables within a database
  - Grid/List toggle button in the Tables tab toolbar
  - List view shows tables in a compact table format with sortable columns
  - Sortable by Name, Type, Columns, and Rows
  - All table info visible: name, type, columns count, rows count, without rowid, strict mode
  - Status badges displayed: STRICT, FTS5
  - All action buttons available: Browse, Rename, Clone, Import, Export, FTS5/Convert, STRICT mode, Delete
  - Color picker accessible in list view
  - Checkbox selection with select-all support
  - View preference persisted to localStorage (`d1-manager-table-view-mode`)
  - List view is the default (faster rendering with fewer DOM nodes)
- **Always-Visible Undo History**: The undo icon is now always visible in the header
  - Shows total undo count badge aggregating all databases
  - Database picker dialog when clicking from list view
  - View any database's undo history without navigating to it first
- **FTS5 Undo Support**: FTS5 table deletions now create undo snapshots
  - Deleted FTS5 tables can be restored from undo history
  - Also captures snapshots when FTS5 tables are deleted during convert-to-table
- **STRICT Mode Undo Support**: Converting tables to STRICT mode now creates an undo snapshot
  - Original non-STRICT table is saved before conversion
  - Can restore original table if conversion causes issues
- **Automated Migration System**: Schema upgrades are now handled automatically
  - Auto-detects pending migrations on app load
  - Displays upgrade banner when migrations are available
  - One-click "Upgrade Now" button to apply all pending migrations
  - Graceful handling of legacy installations (pre-migration system)
  - Migration status API endpoints (`GET /api/migrations/status`, `POST /api/migrations/apply`)
  - Rollback on failure for safe upgrades
  - Tracks applied migrations in `schema_version` table
- **R2 Backup/Restore**: Cloud-based database backups using Cloudflare R2 storage
  - One-click backup to R2 from database cards
  - One-click restore from R2 with backup selection dialog
  - Pre-operation backups for rename, STRICT mode, and FTS5 conversion
  - Full backup history with source tracking (manual, rename, strict_mode, fts5_convert)
  - Progress tracking via Job History
  - Powered by Durable Objects for reliable async processing
  - Complete API for backup management (list, create, restore, delete)
- **Row Search Filter**: New text search in Table View for quickly finding rows
  - Search across all visible column values
  - Instant client-side filtering
  - Shows filtered count (e.g., "3 of 50 rows")
  - Clear search button when no results match
- **Generated Column Support**: Full support for SQLite generated/computed columns
  - Create STORED or VIRTUAL generated columns in Schema Designer
  - Add generated columns to existing tables via Add Column dialog
  - Expression editor with syntax validation
  - Purple "STORED" or "VIRTUAL" badges in schema display
  - Proper handling in row operations (read-only values)
- **UNIQUE Constraint Support**: Add UNIQUE constraints when creating columns
  - Checkbox in Add Column dialog
  - Blue "UNIQUE" badge displayed in schema view
  - Detection of existing UNIQUE constraints from database
- **Enhanced Schema Display**: More column metadata visible at a glance
  - UNIQUE constraint indicator badge
  - Generated column type badge (STORED/VIRTUAL)
  - Generated expression shown in schema (where available)
  - Uses PRAGMA table_xinfo for accurate hidden/generated column detection
- **Expanded Color Picker**: Database color picker now offers 27 colors (up from 9)
  - Organized by hue family: Reds/Pinks, Oranges/Yellows, Greens/Teals, Blues/Purples, Neutrals
  - New colors include: Light/Dark variants, Amber, Lime, Emerald, Cyan, Sky, Indigo, Violet, Fuchsia, Rose, Slate, Zinc
  - 6-column grid layout for better visual organization
- **Sticky Navigation**: Main navigation bar (Databases, Search, Job History, Webhooks) now stays fixed at top when scrolling
  - Semi-transparent background with backdrop blur effect
  - Always accessible regardless of scroll position
- **Jump to Top Button**: Job History and Search pages now include a floating "Back to Top" button
  - Appears after scrolling down 300px
  - Centered at bottom of screen for easy access
  - Smooth scroll animation
- **Enhanced Cross-Database Search UI**: Improved database selection interface
  - Filter databases by name or ID with dedicated filter input at top
  - Database list shows: Name, ID (copyable), Size, Created date, Table count
  - All metadata from D1 API - no additional API calls needed
  - Select All/Clear All buttons for quick selection
- **FTS5 Quick Actions on Virtual Tables**: FTS5 virtual tables now show a quick action button (sparkles icon) that opens the "Convert to Regular Table" dialog directly from the table card
- **FTS5 Export Error Dialog**: When attempting to export a database containing FTS5 tables, a helpful dialog now appears explaining the limitation and providing options:
  - Lists the specific FTS5 tables preventing export
  - Offers "Go to FTS5 Manager" button to convert tables
  - Explains D1's export API limitation with virtual tables
- **Import Table Data**: New feature to import data into tables from multiple formats
  - Supports CSV, JSON, and SQL (INSERT statements)
  - Upload file or paste content directly
  - Create new table (auto-infers schema from data) or import into existing table
  - Preview data before importing
  - Progress tracking for large imports
  - Import button on table cards and in Tables view toolbar
  - **Duplicate handling options** for existing tables: Fail, Replace (UPDATE), or Skip (IGNORE)
  - **Auto-add missing columns**: When importing into existing table with mismatched schema, offers to automatically add missing columns via ALTER TABLE
- **JSON Export Format**: Tables can now be exported as JSON (array of objects) in addition to SQL and CSV
- **Copyable Database IDs**: Database IDs are now clickable to copy to clipboard
  - Shows "Copied!" feedback with checkmark icon
  - Hover reveals copy icon
  - Useful for wrangler commands and sharing with colleagues
  - Truncated display in Tables view header to reduce crowding
- **STRICT Mode Conversion**: Convert tables to SQLite STRICT mode for enhanced type safety
  - Shield icon button on non-STRICT table cards
  - Blue "STRICT" badge on tables that have STRICT mode enabled
  - Comprehensive warnings about the destructive nature of the operation
  - Automatic type mapping to STRICT-compatible types (INTEGER, REAL, TEXT, BLOB, ANY)
  - Graceful failure handling with clear error messages if data is incompatible
  - Preserves indexes during conversion
  - Confirmation checkbox required before proceeding
  - Tracked in Job History as "Enable STRICT Mode"
- **Table Row Counts**: Table cards now display row counts
  - Shows number of rows for each table (formatted with locale separators)
  - Only fetches for regular tables (not views or virtual tables)
  - Limited to 100 tables for performance
- **FTS5 to Regular Table Conversion**: Convert FTS5 virtual tables back to regular SQLite tables
  - "Convert" button on FTS5 table cards in the Full-Text Search tab
  - Specify custom name for the new table
  - Option to backup table before conversion (SQL, CSV, or JSON)
  - Option to delete the original FTS5 table after conversion
  - Extracts data from FTS5 and creates a regular table with TEXT columns
  - Useful for removing FTS5 limitations (e.g., enabling table rename)
  - Checks for existing target table before conversion to prevent errors
- **FTS5 Search in Main Search Tab**: Added FTS5 full-text search capability to the main Search tab
  - Toggle between "All Databases" and "FTS5 Full-Text" search modes
  - Select database and FTS5 table for targeted full-text search
  - Supports FTS5 query syntax (boolean operators, prefix matching, etc.)
  - Purple-themed UI to distinguish FTS5 search from regular search
- **External Observability (Webhooks)**: User-configurable HTTP webhook notifications for key events
  - Database operations (create, delete, export, import)
  - Job failures and batch completions
  - Webhook CRUD management UI
  - Test webhook functionality with feedback
- **Centralized Error Logging System** - Full integration of structured error logging across all worker modules
  - Converted 337+ ad-hoc `console.log/error/warn` statements to use centralized error logger
  - All logging now includes structured context: module, operation, databaseId, databaseName, userId, metadata
  - Critical errors (job failures, API errors) automatically trigger webhook notifications
  - Consistent log format: `[LEVEL] [module] [CODE] message (context)`
  - Module-prefixed error codes for easy identification (e.g., `DB_CREATE_FAILED`, `TBL_DELETE_FAILED`, `QRY_EXEC_FAILED`)
  - Automatic stack trace capture for debugging
  - Error code prefixes: DB (databases), TBL (tables), QRY (queries), FTS (full-text search), IDX (indexes), JOB (jobs), TT (time travel), UNDO (undo), COL (colors), WH (webhooks), SQ (saved queries), WRK (worker), SESS (session)
  - Route files converted: databases.ts, tables.ts, fts5.ts, queries.ts, undo.ts, time-travel.ts, colors.ts, jobs.ts, webhooks.ts, indexes.ts, saved-queries.ts
  - Utility files converted: auth.ts, cors.ts, database-protection.ts, database-tracking.ts, helpers.ts, index-analyzer.ts, job-tracking.ts, query-parser.ts, time-travel.ts, undo.ts, webhooks.ts
  - Main worker entry point (index.ts) converted to use centralized logger
- **Observability Documentation**: Integration guides for Datadog, Grafana Cloud, and Sentry

### Changed

- **Query Console UI**: Moved Clear button to the left side of the card header for better visual hierarchy
  **Performance**

- **ER Diagram Load Optimization**: ER Diagram now loads with a single API call instead of N+1 calls
  - Added `includeSchemas` parameter to `/api/tables/{dbId}/foreign-keys` endpoint
  - Backend returns full column schemas for all tables in one request
  - Eliminates per-table `getTableSchema` calls that caused slow load times on large databases
  - ER Diagram load time now matches Foreign Key Editor performance
  - Schemas are cached alongside FK graph data with 30-second TTL
- **Performance Tab (Index Analyzer) Optimization**: Index analysis now runs significantly faster
  - Parallel batch processing: Processes 5 tables at a time instead of sequential
  - Within each batch, fetches columns, FKs, and indexes in parallel (Promise.all)
  - Index column info also fetched in parallel for all indexes per table
  - Client-side caching with 60-second TTL to avoid redundant API calls
  - Cache automatically invalidated when creating new indexes
  - "Re-analyze" button forces fresh analysis (bypasses cache)
- **Tables Tab Caching**: Table list now cached for instant tab switching
  - Client-side caching with 30-second TTL for `listTables` API calls
  - Instant re-rendering when switching back to Tables tab within cache window
  - Cache automatically invalidated on table modifications (rename, delete, clone, STRICT mode, FTS5 conversion)
  - Refresh button explicitly bypasses cache to fetch fresh data
  - Reduces unnecessary API calls when navigating between tabs
- **Unified Relationship Tabs Caching**: All relationship views now share a single cache entry
  - Foreign Key Editor, ER Diagram, and Circular Dependencies all use the same API call
  - First view to load fetches FK graph + cycles + schemas in one request
  - Subsequent views use cached data instantly (no additional API calls)
  - Single cache key (`cycles+schemas`) ensures maximum cache reuse
  - Switching between any relationship sub-tabs is now instant after first load
- **Extended Cache TTL**: All client-side caches now persist for 5 minutes (up from 30-60 seconds)
  - Table list, FK data, and index analysis caches all use 5-minute TTL
  - Cache persists throughout typical database browsing sessions
  - Safe because caches are explicitly invalidated on any data modifications
  - Allows navigating between tabs (Performance, Time Travel, etc.) without losing cached data
- **FTS5, Time Travel, and Replication Tab Caching**: Added caching for remaining database tabs
  - FTS5 Manager: FTS5 table list cached for 5 minutes, invalidated on create/delete
  - Time Travel: Bookmark and history data cached for 5 minutes, invalidated on capture/delete
  - Replication: Database info cached for 5 minutes, invalidated on replication mode change
  - All tabs now support instant switching after first load within the same database
- **Metrics Dashboard Caching**: Added caching for the main Metrics page
  - Metrics data cached for 2 minutes per time range (24h, 7d, 30d)
  - Instant page revisits within cache window
  - Refresh button forces fresh data fetch
  - Shorter TTL (2 min) since metrics data updates more frequently
    **Optimized**

- **Table Schema Caching**: Added 5-minute client-side caching
  - Schema fetched once per table per session
  - Cache invalidated on column add/rename/modify/delete
- **Table Foreign Keys Caching**: Added 5-minute client-side caching
  - FK data fetched once per table per session
  - Cache invalidated on FK modifications
- **R2 Backup Status Caching**: Added 10-minute cache
  - Status checked once and shared across all components
- **Cascade Impact Simulation**: Added 5-minute client-side caching
  - Reopening the same cascade impact dialog uses cached results
  - Cache invalidated on table deletion or FK modifications
- **Table Dependencies**: Added 5-minute client-side caching
  - Repeated dependency checks for same tables use cached data
  - Cache invalidated on table deletion or FK modifications
- **Unified Cache Invalidation**: All FK/schema-related operations now properly invalidate related caches
- **Foreign Key Editor Alphabetization**: Tables and columns are now sorted alphabetically in dropdown lists
  - Source Table and Target Table lists sorted by name
  - Source Column and Target Column lists sorted by name
  - Improves usability for databases with many tables/columns
- **Enhanced Input Validation**: Comprehensive validation with helpful error messages
  - Column and table names validated against SQLite reserved words
  - Invalid identifier characters blocked with suggestions (e.g., "Try: my_table" for spaces)
  - NOT NULL constraint validation warns when table has existing rows without default value
  - Default value type compatibility validation
  - Generated column expression syntax validation (balanced parentheses, no SQL injection)
  - Clear error messages with actionable suggestions throughout
- **Schema Designer Constraint Tooltips**: Informative hover tooltips for all constraint checkboxes
  - Primary Key: Shows purpose when enabled, shows "✗ Generated columns cannot be primary keys" when disabled
  - Not Null: Shows purpose when enabled, shows "✓ Primary keys are always NOT NULL" when disabled (already applied)
  - Unique: Shows purpose when enabled, shows "✓ Primary keys are already unique" when disabled (already applied)
  - Generated: Shows purpose when enabled, shows "✗ Primary key columns cannot be generated" when disabled
- **Add Column Dialog Tooltips**: Hover explanations for NOT NULL and UNIQUE constraint checkboxes
- **Modify Column Dialog Tooltips**: Hover explanation for NOT NULL constraint checkbox
- **Add Column Button Location**: Moved Add Column button to header row alongside Insert Row for better discoverability
- **Table Data Header Styling**: Improved visual distinction with subtle primary color tint on column headers
- **Add Column Dialog Note**: Informative note explaining that generated columns can only be created at table creation time (SQLite limitation)
- **Add Column UNIQUE Workaround**: UNIQUE constraint now works when adding columns to existing tables by creating a unique index (SQLite doesn't support UNIQUE in ALTER TABLE ADD COLUMN)
- **Query Console Tab Naming**: Improved tab naming for clarity
  - "SQL Query" card title simplified to "Query"
  - "Compare" tab renamed to "SQL Diff" for better description
- **Table Card Actions Layout**: Reorganized action buttons into two centered rows for better visual balance
- **Query Builder Consolidation**: Removed the redundant Query Builder tab from the Tables view (DatabaseView) since the same functionality is available in the Query Console with enhanced "Send to Editor" integration
- **Clone Database Enhancement**: Consolidated the separate "Migration Wizard" into an enhanced "Clone Database" dialog accessible from each database card
  - Multi-step wizard: Target → Tables → Options → Review → Progress
  - Target options: Create new database or copy to existing database
  - Selective table cloning: Choose specific tables instead of all-or-nothing
  - Granular options: Copy schema only, copy data only, or both
  - "Drop Existing Tables" option when copying to existing database (requires schema copy)
  - Smart validation: Schema required when copying data to new database
  - Fast path: Full database export/import when cloning all tables to new database
  - Per-table progress tracking for selective migrations
  - FTS5 database handling with appropriate warnings
- **Cross-Database Search**: Moved from collapsible card on database list to dedicated "Search" tab in main navigation for better visibility
  - Now includes FTS5 full-text search option alongside regular database search
- **FTS5 UI Improvements**: Improved button labels for clarity
  - "To Table" renamed to "Convert" on FTS5 table cards
  - "Convert Table" button renamed to "Convert to FTS5"
  - "Convert to FTS5" button now stays visible after creating FTS5 tables (previously hidden when any FTS5 tables existed)
- **Import Database Enhancement**: Renamed "Upload Database" to "Import Database" with new paste option
  - SQL Source selector: Upload file or paste SQL content directly
  - Support for both file uploads (.sql) and pasted SQL statements
  - Same import modes: Create new database or import into existing
- **Compare Databases**: Moved from standalone card to toolbar button; appears when exactly 2 databases are selected for streamlined workflow
- **Database Card Quick Actions**: Replaced text-labeled buttons with compact icon-only buttons in a 2-row grid
  - Row 1: Browse, Query, Rename, Clone
  - Row 2: Import, Download, Optimize, Delete
  - All icons include aria-labels and tooltips for accessibility
  - Single-database operations complement existing bulk toolbar actions
- **Full-Text Search Tab Renamed**: Tab now displays as "Full-Text Search (FTS5)" for clarity
- **Table Card Quick Actions**: Replaced text-labeled buttons with compact icon-only buttons
  - Browse, Rename, Clone, Import, Export, Delete
  - All icons include aria-labels and tooltips for accessibility
  - Single-table operations complement existing bulk toolbar actions
- **Job History Improvements**: Enhanced job display with more information
  - Full date/time display (e.g., "Dec 2, 2025, 11:16 AM") instead of relative times
  - Duration column showing job execution time (ms, s, m, h)
  - Progress percentage column with green highlight at 100%
  - Combined Items column showing "processed / total"
- **Strict TypeScript Configuration**: Enabled strictest type-checking options across frontend and worker
  - `exactOptionalPropertyTypes: true`
  - `noUncheckedIndexedAccess: true`
  - `noImplicitOverride: true`
  - `noPropertyAccessFromIndexSignature: true`
  - `noImplicitReturns: true`
  - `allowUnusedLabels: false`
  - `allowUnreachableCode: false`
  - `verbatimModuleSyntax: true`
- **ESLint Configuration**: Upgraded to `strictTypeChecked` + `stylisticTypeChecked` rulesets
  - Added `explicit-function-return-type` enforcement
  - Added `strict-boolean-expressions` for safer conditionals
  - Added `consistent-type-imports` for proper import separation
  - Added `prefer-nullish-coalescing` for safer defaults
  - Added `prefer-optional-chain` for cleaner property access
  - Added `prefer-regexp-exec` for consistent regex usage
  - Added `array-type` enforcement (`T[]` over `Array<T>`)
  - Added `consistent-generic-constructors` for type inference
  - Added `no-inferrable-types` to reduce redundant annotations
  - Added `consistent-indexed-object-style` (`Record<K,V>` preferred)
  - Configured `no-console: warn` for frontend, `off` for worker

### Removed

- **Table View Row Filters**: Removed the "Filter Rows" feature from Table View
  - The existing client-side row search (in the toolbar) remains available for quick filtering
  - Simplifies the UI and reduces complexity
- **Production Badge**: Removed the "production" badge from database cards and list view as it always shows "production" (D1 doesn't have development mode) and provided no useful information

### Fixed

- **SQL Validator False Positives**: Fixed keyword misspelling detection showing incorrect suggestions
  - Removed `INTO` from its own misspellings list (was showing "Did you mean 'INTO'? Found 'INTO'")
  - Removed `VALUE` from `VALUES` misspellings (common column name was being flagged)
- **Database Name Validation**: Create Database dialog now validates names before submission
  - Enforces D1 naming rules: 3-63 characters, lowercase letters/numbers/hyphens only
  - Shows character count with warning when approaching limit
  - Input limited to 63 characters max
  - Clear error messages for invalid names
- **Table Rename Validation**: Improved validation when renaming tables
  - Checks if target table name already exists before attempting rename
  - Validates table name format (letters, numbers, underscores only)
  - Clear error messages with suggestions for invalid names
- **Database Rename D1 Eventual Consistency**: Fixed rename failures caused by D1's eventual consistency
  - Added 3-second delay before verification to allow data to become visible
  - Added retry logic (up to 3 attempts with delays) for verification step
  - Resolves "Table count mismatch" errors after successful import
- **R2 Backup Dialog Navigation**: Fixed issue where Delete Database and Rename Database dialogs would close permanently after initiating an R2 backup
  - Dialogs now properly return to the original context after backup completes
  - Users can complete the delete/rename operation without re-opening the dialog
  - Progress dialog now tracks which parent dialog to return to
- **Undo Restore Table Refresh**: Fixed issue where restored tables from undo history didn't appear in the table list without a page refresh
  - Now properly triggers table list reload after undo restore from both the database view dialog and the database picker dialog
- **STRICT Mode Conversion Reliability**: Major fixes to the "Enable STRICT Mode" feature
  - Fixed D1 REST API request body missing required `params` field (caused 500 errors)
  - Fixed index recreation bug where index column info was lost after dropping original table (caused syntax errors)
  - Fixed `DEFAULT CURRENT_TIMESTAMP` syntax for STRICT tables (now correctly wrapped in parentheses)
  - Foreign key constraints now properly preserved during table recreation
  - Virtual tables (FTS5, FTS4, rtree) and generated columns now blocked with helpful error messages
  - Added pre-conversion validation endpoint (`/api/tables/:dbId/:tableName/strict-check`)
  - Enable STRICT Mode dialog now shows blockers (red), warnings (amber), and compatibility status before conversion
- **Table Creation Not Updating UI**: Fixed issue where creating a table in Schema Designer didn't immediately show the new table in the list (was using cached data)
- **Table Operations Not Refreshing**: Fixed all table mutations (rename, clone, delete, STRICT mode, FTS5 convert) to properly skip cache and show updated results immediately
- **Database List Caching**: Added 5-minute cache for database list (includes FTS5 count, replication status); properly invalidated on create/delete/rename operations
- **TableView Instant Schema Loading**: Optimized TableView to show cached schema immediately while loading rows
  - Schema loads from cache (instant on revisit)
  - Subtle overlay shows while rows refresh (always fresh)
  - Column operations (add/rename/modify/delete) properly skip cache for fresh schema
  - Refresh button shows spinning indicator during reload
- **Improved Rate Limit Error Messages**: Now displays user-friendly messages for Cloudflare rate limits
  - 429 errors: "Rate limit exceeded. Cloudflare limits API requests - please wait a moment and try again."
  - 503 errors: "Service temporarily unavailable. Cloudflare may be experiencing issues - please try again shortly."
  - 504 errors: "Request timed out. The database may be under heavy load - please try again."
- **Time Travel Cache Fix**: Fixed issue where Time Travel tab would hard-load on every revisit
  - Added `bookmarkLoaded` and `historyLoaded` flags to properly track cached state
  - Cache now correctly returns data even when bookmark is null or history is empty
  - Uses `in` operator to detect explicitly provided values vs missing properties
- **Foreign Key Graph API Optimization**: Significantly reduced API calls and improved responsiveness for the Relationships tab
  - Previous: Sequential API calls (3N calls for N tables: table_info, COUNT, foreign_key_list each)
  - Now: Parallel batch processing with controlled concurrency (batches of 5 tables, 3 queries each in parallel)
  - Reduces total request time by ~60-70% for databases with many tables
  - Combined endpoint (`?includeCycles=true`) returns both FK graph and circular dependencies in single request
  - Client-side caching prevents redundant fetches when switching between FK Visualizer and Circular Dependency Detector
  - Debounced cycle simulation check in FK Editor (500ms delay) prevents rapid API calls during table selection
  - Proper error logging for skipped tables (e.g., FTS5 virtual tables) instead of silent failures
  - Retry with exponential backoff (2s, 4s, 8s) for 429 rate limit errors
- **FK Visualizer UI Improvements**: Better layout and error handling
  - Moved "Foreign Key Constraint" popup (Edit/Delete buttons) to top-right near Legend instead of buried at bottom
  - Added close button (✕) to dismiss the constraint popup
  - Alphabetized table filter dropdown for easier navigation
  - Improved error display with specific messaging for rate limit errors
- **ER Diagram UI Improvements**: Better layout for visual schema documentation
  - Moved Legend to top-right next to Export panel instead of buried at bottom
  - Condensed spacing for more compact display
- **Fullscreen Mode for Graph Visualizations**: View FK relationships and ER diagrams in fullscreen
  - Added fullscreen toggle button (Maximize/Minimize icon) to FK Visualizer toolbar
  - Added fullscreen toggle button to ER Diagram control panel
  - Press Escape or click the minimize button to exit fullscreen
  - Graph automatically refits to the new viewport size when toggling
- **Delete Foreign Key Reliability**: Improved FK constraint removal for various SQL formats
  - Enhanced regex patterns to handle inline FK definitions (`col REFERENCES table(col)`)
  - Better support for mixed quoting styles (double quotes, backticks, no quotes)
  - Detailed error messages when FK constraint cannot be found in CREATE TABLE SQL
  - Added logging to help diagnose FK removal issues
- **Delete Table Dependency Check Performance**: Significantly optimized the "Checking Dependencies" feature in the Delete Table dialog
  - Previous: O(M × N) API calls where M = tables to delete, N = total tables in database
  - Now: O(N) API calls regardless of how many tables are selected for deletion
  - Builds complete foreign key index in single pass for all tables
  - Caches table list (previously fetched redundantly for each table being deleted)
  - Batches row count queries to reduce API overhead
  - Much faster response time for databases with many tables
  - Conservative approach maintains same data quality and avoids rate limits
- **Cascade Impact Simulator Performance**: Optimized the "Simulate Cascade Impact" feature with same approach
  - Previous: O(M × N) API calls during BFS traversal where M = cascade chain length
  - Now: O(N) API calls upfront to build FK index, then pure in-memory lookups during BFS
  - Builds reverse FK index for efficient "who references this table" lookups
  - Caches row counts during BFS to avoid redundant queries for the same table
  - Significantly faster for databases with many tables and deep cascade chains
- **Circular Dependencies Detector Performance**: Optimized cycle detection with lightweight FK graph
  - Previous: 3N API calls (table_list + table_info + count + foreign_key_list per table)
  - Now: N+1 API calls (table_list + foreign_key_list per table)
  - Created lightweight graph builder that skips schema and row count queries not needed for cycle detection
  - ~65% fewer API calls for the same result
  - Also optimizes "Simulate FK Addition" endpoint which checks for potential cycles
- **Foreign Key Editor Race Condition**: Fixed bug where "Add Foreign Key" button could be clicked before circular dependency check completed
  - Button now stays disabled while `checkingCycle` is true
  - Prevents users from accidentally creating circular dependencies without seeing the warning
- **Circular Dependencies UI**: Fixed misleading button behavior
  - "View Graph" button now scrolls to the graph visualization (useful on mobile/smaller screens)
  - Changed navigation icon from ExternalLink to ArrowRight since it's same-page navigation
  - Added accessibility attributes (title, aria-label) to FK Editor navigation button
- **Query Console Autocomplete**: Fixed issue where clicking into the SQL input field didn't close the autocomplete suggestions popup (required clicking elsewhere or pressing Escape)
- **Cross-Database Search Rate Limiting**: Major improvements to avoid Cloudflare 429 rate limits
  - Changed from concurrent to fully sequential table searches
  - Added 300ms delay between each table search
  - Added 500ms delay between databases
  - Implemented aggressive exponential backoff (2s-30s) when rate limited
  - Auto-retry after rate limit with backoff
  - Search is slower but reliable for users with many databases/tables
- **Convert to FTS5 Dialog Overflow**: Fixed SQL Preview section extending beyond dialog boundaries
  - Background now properly contained within rounded border
  - Text wraps correctly for long SQL statements
- **Build Optimization**: Improved code splitting to reduce bundle sizes
  - Split vendor dependencies: react, reactflow, pdf, zip, canvas, icons, UI components
  - Split app features: FTS5, Query, Schema, Jobs, Database components
  - Reduces initial load time and enables better caching
- **STRICT Mode Type Inference**: Improved type detection when converting tables to STRICT mode
  - Samples data to detect actual types in use (not just declared types)
  - Uses `ANY` type for columns with mixed data types
  - Automatically uses `ANY` for BLOB columns containing non-BLOB data
  - Correctly maps `NUMERIC` type to `REAL`
  - Logs generated CREATE TABLE statement for debugging
- **Table Clone Index Names**: Fixed issue where cloning a table would fail if the original table had indexes whose names didn't contain the table name. Now generates unique index names by appending the new table name when needed.
- **Query Builder Table Dropdown**: Fixed issue where FTS5 virtual tables were not appearing in the "Select Table" dropdown. The filter now includes both regular tables (`type === 'table'`) and virtual tables (`type === 'virtual'`) while still excluding shadow tables.
- **SQL Reserved Keywords in Table/Column Names**: Table and column names are now properly quoted with double quotes, allowing use of SQL reserved words like `foreign`, `order`, `select`, `table`, `index`, etc. as identifiers.
- **Table Import Column Validation**: Import now fetches fresh table list from database (not cached) and validates columns match before attempting INSERT. Shows clear error with both table columns and import columns listed.
- **Frontend Components** (40+ files):
  - Added explicit return types to all exported functions
  - Replaced deprecated `React.ElementRef` with `React.ComponentRef`
  - Replaced deprecated `MediaQueryList.addListener` with `addEventListener`
  - Replaced deprecated `wordWrap` CSS property with `overflowWrap`
  - Fixed all floating promise violations
  - Fixed template literal type safety issues
  - Removed unsafe non-null assertions throughout codebase
  - Changed `Array<T>` syntax to `T[]` across all interfaces
  - Replaced `||` with `??` for nullish coalescing safety
  - Used optional chaining (`?.`) instead of manual null checks
  - Changed type imports to use `import type` syntax
  - Fixed strict boolean expression violations
- **Worker Routes** (15+ files):
  - Replaced `String.match()` with `RegExp.exec()` throughout
  - Changed `Array<T>` to `T[]` in all type definitions
  - Used nullish coalescing (`??`) instead of logical OR (`||`)
  - Added explicit type assertions for API responses
  - Fixed index signature property access with bracket notation
  - Removed inferrable type annotations from parameters
  - Used `Record<K,V>` instead of index signatures
- **Worker Utilities** (10+ files):
  - Added explicit return types to session management functions
  - Fixed circular dependency detector array types
  - Updated FTS5 helpers to use `RegExp.exec()`
  - Improved query parser with consistent type definitions
  - Fixed job tracking nullish coalescing operators
  - Updated time travel utilities with proper type annotations
[Unreleased]: https://github.com/neverinfamous/d1-manager/compare/v2.6.7...HEAD
[2.6.7]: https://github.com/neverinfamous/d1-manager/compare/v2.6.6...v2.6.7
[2.6.6]: https://github.com/neverinfamous/d1-manager/compare/v2.6.5...v2.6.6
[2.6.5]: https://github.com/neverinfamous/d1-manager/compare/v2.6.4...v2.6.5
[2.6.4]: https://github.com/neverinfamous/d1-manager/compare/v2.6.3...v2.6.4
[2.6.3]: https://github.com/neverinfamous/d1-manager/compare/v2.6.2...v2.6.3
[2.6.2]: https://github.com/neverinfamous/d1-manager/compare/v2.6.1...v2.6.2
[2.6.1]: https://github.com/neverinfamous/d1-manager/compare/v2.6.0...v2.6.1
[2.6.0]: https://github.com/neverinfamous/d1-manager/compare/v2.5.0...v2.6.0
[2.5.0]: https://github.com/neverinfamous/d1-manager/compare/v2.4.0...v2.5.0
[2.4.0]: https://github.com/neverinfamous/d1-manager/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/neverinfamous/d1-manager/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/neverinfamous/d1-manager/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/neverinfamous/d1-manager/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/neverinfamous/d1-manager/compare/v1.1.1...v2.0.0
