# Changelog

All notable changes to this project are documented in this file.
This changelog is auto-generated from Git history using [lib-git-history](https://github.com/neverinfamous/adamic).

## [Unreleased]

### Security

- harden origin validation and prevent local dev auth bypass by **Chris** ([a986bcd](https://github.com/neverinfamous/d1-manager/commit/a986bcd33ef0e6c2eaa7917abfd5036bb3da7f7c))

## [v2.8.1]

### Code Quality

- --- product: "D1 Manager" version: "2.8.1" date: "2026-10-30" slug: "d1-manager-v2-8-1" npm_package: "" docker_image: "writenotenow/d1-manager" github_repo: "neverinfamous/d1-manager" description: "D1 Manager v2.8.1 refreshes dependencies, clears all Docker image CVEs, and fixes lint issues in state handling." --- # D1 Manager v2.8.1 ## Highlights; **Clean Docker Image**: The container now scans at zero known vulnerabilities across all severities. You can deploy it with confidence.; **Fresh Dependencies**: React 19.3, Vite 8.3, Wrangler 4.156 and more. You stay current without any behavior changes. ## Changed; **deps**: Updated all dependencies and refreshed security overrides for `tar`, `minimatch`, `picomatch`, `brace-expansion`, `flatted`, and `ip-address`.; **docker**: Patched npm's bundled packages, upgraded Alpine system libraries, and removed pnpm's cached runtime from the final image.; **ci**: Refreshed GitHub Actions to the latest pinned releases and pinned runners to `ubuntu-24.04`. ## Fixed; **lint**: Replaced no-op statements with explicit state clearing in the database view, diff editor, FTS5 manager, and webhooks route. Error states now reset cleanly. ## Security; **docker**: Eliminated all known CVEs in the published image, verified with Docker Scout. ## Install ```bash docker pull writenotenow/d1-manager:v2.8.1 ``` [Full Changelog](https://github.com/neverinfamous/d1-manager/compare/v2.8.0...v2.8.1) by **Chris LeRoux** ([4e8302c](https://github.com/neverinfamous/d1-manager/commit/4e8302c50eb9e8868e92362cb71f5ff638e18251))

## [v2.8.0]

### Features

- add custom threshold creation form by **Chris** ([16f4b09](https://github.com/neverinfamous/d1-manager/commit/16f4b093cc36bc9e5221364d1bd96a841273275e))
- add UI components and frontend service by **Chris** ([146b2c9](https://github.com/neverinfamous/d1-manager/commit/146b2c933c89bd7dad3550ae65bd38078264f7f9))
- add CRUD routes and cron wiring by **Chris** ([2c5d966](https://github.com/neverinfamous/d1-manager/commit/2c5d966813279b7bb751f6f36225dba72a986f35))
- add threshold processor and webhook payloads by **Chris** ([5acef97](https://github.com/neverinfamous/d1-manager/commit/5acef9738b71cb94982100f3771ad52b51828adf))
- add schema and type definitions by **Chris** ([b16ceb7](https://github.com/neverinfamous/d1-manager/commit/b16ceb73775536502e48ae5edecf119a75139f84))

### Bug Fixes

- fix graphql query date format mismatch in processor and add manual trigger button to UI for easier testing by **Chris** ([ef60a57](https://github.com/neverinfamous/d1-manager/commit/ef60a571ab46b0af28f39479532ce0114f1916f5))
- automatically supply 5GB storage limit when creating custom storage_usage thresholds to prevent 400 validation error by **Chris** ([bed74a0](https://github.com/neverinfamous/d1-manager/commit/bed74a05407e658188eda2bbe3b78437ff6209f7))
- configure monitoring fetch calls to include credentials for Cloudflare Access by **Chris** ([5bfd47d](https://github.com/neverinfamous/d1-manager/commit/5bfd47dc30d61f26d0196190e3ea428a808bdf2d))

### Code Quality

- --- product: "D1 Manager" version: "2.8.0" date: "2026-08-19" slug: "d1-manager-v2-8-0" npm_package: "" docker_image: "writenotenow/d1-manager" github_repo: "neverinfamous/d1-manager" description: "D1 Manager v2.8.0 introduces comprehensive monitoring, customizable thresholds, and webhook alerts for database health." --- # D1 Manager v2.8.0 ## Highlights; **Proactive Monitoring & Alerts**: You can now define custom health thresholds and receive automated webhook alerts when database metrics breach your limits, keeping you ahead of potential issues. ## Added; **monitoring**: Introduced customizable threshold configurations and automated webhook payloads for database alerts.; **monitoring**: Added a new visual Health Dashboard and frontend services to manage threshold definitions.; **monitoring**: Built out robust backend CRUD routes and integrated cron job wiring to periodically evaluate thresholds. ## Changed; **metrics**: Extracted and centralized analytics utilities to improve the performance and maintainability of metric evaluations. ## Install ```bash docker pull writenotenow/d1-manager:v2.8.0 ``` [Full Changelog](https://github.com/neverinfamous/d1-manager/compare/v2.7.0...v2.8.0) by **Chris LeRoux** ([beb2829](https://github.com/neverinfamous/d1-manager/commit/beb2829b2a2b8b048c473862dc98ba127f4938ea))

## [v2.7.0]

### Features

- implement Phase 3 - Attachment/Image rendering for URL columns by **Chris** ([417c0b1](https://github.com/neverinfamous/d1-manager/commit/417c0b1ac9be24598b8cc897d2949c71ac32ec4e))
- implement Phase 2 - Predicate Column Filters by **Chris** ([691ddd2](https://github.com/neverinfamous/d1-manager/commit/691ddd281f0023a290a7a9019af697d8c75a9f4c))
- implement Phase 1 - Tanstack React Table v9 integration with inline cell editing by **Chris** ([c9c1c9c](https://github.com/neverinfamous/d1-manager/commit/c9c1c9c8ceda23cff3f3f617ac0c7ad8c0278aad))

### Bug Fixes

- sanitize urls in editable cell to resolve codeql xss warnings by **Chris** ([5e37b73](https://github.com/neverinfamous/d1-manager/commit/5e37b7353017b8f4a2b837c51ff3f5a91f7aa300))

### Code Quality

- --- product: "D1 Manager" version: "v2.7.0" date: "2026-08-19" slug: "d1-manager-v2.7.0" docker_image: "writenotenow/d1-manager" github_repo: "neverinfamous/d1-manager" description: "D1 Manager v2.7.0 introduces a completely overhauled Table View with inline cell editing, predicate column filters, and Tanstack Table v9 integration." --- # D1 Manager v2.7.0 ## Highlights; **Table View Overhaul**: Rebuilt the table architecture with Tanstack React Table v9 for improved modularity and performance.; **Inline Cell Editing**: Edit cell values directly within the table grid, reducing friction for rapid data entry.; **Predicate Column Filters**: Quickly filter data with advanced predicate-based column filters for more granular views. ## Added; **table-view**: Implemented Tanstack React Table v9 integration with inline cell editing to accelerate data workflows.; **table-view**: Added predicate column filters for precise data filtering and manipulation. ## Changed; **table-view**: Extracted the monolithic Table View component into a highly modular, maintainable directory structure.; **ci**: Updated pnpm/action-setup to v6, resolving Node 20 deprecation warnings and ensuring stable CI builds. ## Install ```bash docker pull writenotenow/d1-manager:v2.7.0 ``` [Full Changelog](https://github.com/neverinfamous/d1-manager/compare/v2.6.11...v2.7.0) by **Chris** ([8c32cb1](https://github.com/neverinfamous/d1-manager/commit/8c32cb1ef3bc5042b9538857ec8f8963215db518))

## [v2.6.11]

### Code Quality

- --- product: "D1 Manager" version: "v2.6.11" date: "2026-08-19" slug: "d1-manager-v2.6.11" docker_image: "writenotenow/d1-manager" github_repo: "neverinfamous/d1-manager" description: "D1 Manager v2.6.11 converts the package manager to pnpm and updates core dependencies to their latest stable versions." --- # D1 Manager v2.6.11 ## Highlights; **Performance & Stability**: Converted the internal package manager to `pnpm` for faster, more reliable dependency installations and updated core dependencies to their latest versions. ## Changed **Dependency Updates**; Converted package manager to `pnpm` for improved performance.; Updated core dependencies to their latest stable versions.; Updated Dockerfile and GitHub Actions configurations for `pnpm` support.; Fixed compatibility issues with ESLint and TypeScript. ## Install ```bash docker pull writenotenow/d1-manager:v2.6.11 ``` [Full Changelog](https://github.com/neverinfamous/d1-manager/compare/v2.6.10...v2.6.11) by **Chris** ([e304e5e](https://github.com/neverinfamous/d1-manager/commit/e304e5e7f4df1d6c4ddfb6b81a2e7d85bc1fabb5))

## [v2.6.10]

### Bug Fixes

- resolve Query Console blank page with Prism is not defined (#124) by **Chris & Mike** ([19aad8d](https://github.com/neverinfamous/d1-manager/commit/19aad8dc4d867947e4d648dbac78b2b17bc86d7d))

## [v2.6.0]

### Bug Fixes

- patch minimatch 10.2.2 -> 10.2.4 in Docker npm CLI (CVE-2026-27903, CVE-2026-27904) (#59) by **Chris LeRoux** (with Temp) ([22440fc](https://github.com/neverinfamous/d1-manager/commit/22440fc0c38daa82acfd6ed4106232fb8413cfb1))
- patch minimatch 10.2.2 -> 10.2.4 in Docker npm CLI (CVE-2026-27903, CVE-2026-27904) by **Temp** ([3682823](https://github.com/neverinfamous/d1-manager/commit/3682823f57dead829c01bdbaa584c33962f88307))

## [v2.5.0]

### Bug Fixes

- query builder results display - show execution feedback and metadata by **Temp** ([80a197f](https://github.com/neverinfamous/d1-manager/commit/80a197fcf4cc13e7d2315e34d92e21188a478959))
- use allowlist-based error classification for CodeQL compliance by **Temp** ([87b75a6](https://github.com/neverinfamous/d1-manager/commit/87b75a67504c4a5c848e44fe87e1ad9a9689a372))
- update tar to 7.5.4 in Dockerfile and improve error sanitization by **Temp** ([deee679](https://github.com/neverinfamous/d1-manager/commit/deee6795b4ceb2ffc9e5351ae3f9849ee493c305))
- security fixes and Docker publish gating by **Temp** ([b1f3dfe](https://github.com/neverinfamous/d1-manager/commit/b1f3dfea4933b941adfda18de8345b60211acad9))
- Remove console statements to fix lint warnings by **Temp** ([42d6dc9](https://github.com/neverinfamous/d1-manager/commit/42d6dc9d04e59f18c23172e620c66b8fadea6feb))

## [v2.4.0]

### Features

- Idempotent migration skips ADD COLUMN for existing columns by **Temp** ([41aee09](https://github.com/neverinfamous/d1-manager/commit/41aee092b78beae81ea11ccc356b88581f9bce70))
- Add Schema Comparison with Migration Script Generation by **Temp** ([f890481](https://github.com/neverinfamous/d1-manager/commit/f890481c9939a906a4295f23958f4f1e468719e3))

### Bug Fixes

- Migration apply skips query validation for DDL statements by **Temp** ([26c1eb5](https://github.com/neverinfamous/d1-manager/commit/26c1eb5bd4a4514d3e59d36102a84f789d2502ad))

## [v2.3.0]

### Bug Fixes

- remove wrangler.toml.example from Dockerfile by **Temp** ([8d9905e](https://github.com/neverinfamous/d1-manager/commit/8d9905e3a833296e3180bbc461b8022f91bd6ca1))

## [v2.2.0]

### Bug Fixes

- CodeQL escaping, Node 22 upgrade, CI/CD gating by **Temp** ([b413ab9](https://github.com/neverinfamous/d1-manager/commit/b413ab9c983b15020bce0693666fbe3e49af79df))

## [v2.1.0]

### Bug Fixes

- remove duplicate codeql job to avoid conflict with Default Setup by **Temp** ([cb25927](https://github.com/neverinfamous/d1-manager/commit/cb259271d40d51083656280570d0a7552703f701))
- Restore wrangler.jsonc for CI/CD by **Temp** ([fa19d91](https://github.com/neverinfamous/d1-manager/commit/fa19d91c8e7f3271263575bed467a9221acdcbf4))

## [v1.0.0]

### Bug Fixes

- remove clear-text logging of sensitive information (CWE-532) by **Temp** ([4d62190](https://github.com/neverinfamous/d1-manager/commit/4d621902823acd78af844194679987dacd414eb1))
