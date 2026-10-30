# =============================================================================
# D1 Database Manager - Cloudflare Workers Deployment
# =============================================================================
# Multi-stage build for optimal image size and security
# Production-ready image: ~150MB
# =============================================================================

# -----------------
# Stage 1: Builder
# -----------------
FROM node:24-alpine AS builder

WORKDIR /app

# Upgrade npm to latest version to fix CVE-2024-21538 (cross-spawn vulnerability)
RUN npm install -g npm@latest

# Patch npm's own dependencies to fix CVE-2025-64756 (glob), CVE-2026-23745, CVE-2026-23950, CVE-2026-24842, CVE-2026-26960 (tar), GHSA-7h2j-956f-4vf2 (@isaacs/brace-expansion), CVE-2026-27903, CVE-2026-27904 (minimatch)
# Recent npm versions bundle vulnerable versions glob@11.0.3, glob@10.4.5 (in node-gyp), tar@7.5.1, @isaacs/brace-expansion@5.0.0, minimatch@10.2.2, picomatch@4.0.3
# We download patched versions first, then replace all vulnerable ones
RUN cd /tmp && \
    npm pack glob@11.1.0 && \
    npm pack tar@7.5.22 && \
    npm pack @isaacs/brace-expansion@5.0.1 && \
    npm pack minimatch@10.2.6 && \
    npm pack picomatch@4.0.7 && \
    npm pack undici@6.29.1 && \
    npm pack ip-address@10.7.5 && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/glob && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/tar && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/@isaacs/brace-expansion && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/node-gyp/node_modules/glob && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/minimatch && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules/picomatch && \
    tar -xzf glob-11.1.0.tgz && \
    cp -r package /usr/local/lib/node_modules/npm/node_modules/glob && \
    (mkdir -p /usr/local/lib/node_modules/npm/node_modules/node-gyp/node_modules && \
     cp -r package /usr/local/lib/node_modules/npm/node_modules/node-gyp/node_modules/glob || true) && \
    rm -rf package && \
    tar -xzf tar-7.5.22.tgz && \
    mv package /usr/local/lib/node_modules/npm/node_modules/tar && \
    tar -xzf isaacs-brace-expansion-5.0.1.tgz && \
    mkdir -p /usr/local/lib/node_modules/npm/node_modules/@isaacs && \
    mv package /usr/local/lib/node_modules/npm/node_modules/@isaacs/brace-expansion && \
    tar -xzf minimatch-10.2.6.tgz && \
    mv package /usr/local/lib/node_modules/npm/node_modules/minimatch && \
    tar -xzf picomatch-4.0.7.tgz && \
    mkdir -p /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules && \
    mv package /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules/picomatch && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/undici && \
    tar -xzf undici-6.29.1.tgz && \
    mv package /usr/local/lib/node_modules/npm/node_modules/undici && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/ip-address && \
    tar -xzf ip-address-10.7.5.tgz && \
    mv package /usr/local/lib/node_modules/npm/node_modules/ip-address && \
    rm -rf /tmp/*

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install ALL dependencies (including devDependencies for build)
RUN npm install -g pnpm@latest && CI=true pnpm install --frozen-lockfile --config.ignore-scripts=true

# Copy source code
COPY . .

# Build the application
RUN pnpm run build

# -----------------
# Stage 2: Runtime
# -----------------
FROM node:24-alpine AS runtime

WORKDIR /app

# Upgrade npm to latest version to fix CVE-2024-21538 (cross-spawn vulnerability)
RUN npm install -g npm@latest

# Patch npm's own dependencies to fix CVE-2025-64756 (glob), CVE-2026-23745, CVE-2026-23950, CVE-2026-24842, CVE-2026-26960 (tar), GHSA-7h2j-956f-4vf2 (@isaacs/brace-expansion), CVE-2026-27903, CVE-2026-27904 (minimatch)
# Recent npm versions bundle vulnerable versions glob@11.0.3, glob@10.4.5 (in node-gyp), tar@7.5.1, @isaacs/brace-expansion@5.0.0, minimatch@10.2.2, picomatch@4.0.3
# We download patched versions first, then replace all vulnerable ones
RUN cd /tmp && \
    npm pack glob@11.1.0 && \
    npm pack tar@7.5.22 && \
    npm pack @isaacs/brace-expansion@5.0.1 && \
    npm pack minimatch@10.2.6 && \
    npm pack picomatch@4.0.7 && \
    npm pack undici@6.29.1 && \
    npm pack ip-address@10.7.5 && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/glob && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/tar && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/@isaacs/brace-expansion && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/node-gyp/node_modules/glob && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/minimatch && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules/picomatch && \
    tar -xzf glob-11.1.0.tgz && \
    cp -r package /usr/local/lib/node_modules/npm/node_modules/glob && \
    (mkdir -p /usr/local/lib/node_modules/npm/node_modules/node-gyp/node_modules && \
     cp -r package /usr/local/lib/node_modules/npm/node_modules/node-gyp/node_modules/glob || true) && \
    rm -rf package && \
    tar -xzf tar-7.5.22.tgz && \
    mv package /usr/local/lib/node_modules/npm/node_modules/tar && \
    tar -xzf isaacs-brace-expansion-5.0.1.tgz && \
    mkdir -p /usr/local/lib/node_modules/npm/node_modules/@isaacs && \
    mv package /usr/local/lib/node_modules/npm/node_modules/@isaacs/brace-expansion && \
    tar -xzf minimatch-10.2.6.tgz && \
    mv package /usr/local/lib/node_modules/npm/node_modules/minimatch && \
    tar -xzf picomatch-4.0.7.tgz && \
    mkdir -p /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules && \
    mv package /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules/picomatch && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/undici && \
    tar -xzf undici-6.29.1.tgz && \
    mv package /usr/local/lib/node_modules/npm/node_modules/undici && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/ip-address && \
    tar -xzf ip-address-10.7.5.tgz && \
    mv package /usr/local/lib/node_modules/npm/node_modules/ip-address && \
    rm -rf /tmp/*

# Install runtime dependencies and upgrade to fix CVEs
# Security Notes:
# - Application dependencies: minimatch@10.2.6, brace-expansion@5.0.12, tar@7.5.22, picomatch@4.0.7, undici@^6.28.0, ip-address@10.7.5 (pinned via pnpm-workspace.yaml overrides); overrides for glob@11.1.0 and @isaacs/brace-expansion@5.0.1 are precautionary and may not currently appear in the installed dependency graph.
# - npm CLI bundled dependencies: glob@11.1.0, tar@7.5.22, @isaacs/brace-expansion@5.0.1, minimatch@10.2.6, picomatch@4.0.7, undici@6.29.1, ip-address@10.7.5 (manually patched in npm's installation)
# - curl 8.18.0-r0 (from edge): CVE-2025-14819, CVE-2025-14017, CVE-2025-14524 (curl vulnerabilities)
# - busybox: CVE-2025-60876 (wget CRLF injection) - not exploitable (D1 Manager uses curl, not wget)
# - zlib: CVE-2026-22184 (buffer overflow in untgz) - NOT EXPLOITABLE (D1 Manager does not use untgz utility)
#   Fixed via apk upgrade below: zlib 1.3.2-r1 (and openssl/libcrypto3/libssl3 3.5.9-r0) from the Alpine v3.24 repository
# - pnpm self-managed copy: pnpm downloads @pnpm/exe into /root/.local/share/pnpm during install; its bundled tar@7.5.16 and undici@6.27.0 are vulnerable, so that directory is removed after install (the runtime user never uses it)
# curl 8.18.0 is only available in Alpine edge, so we add edge/main repo temporarily
RUN apk update && \
    echo "http://dl-cdn.alpinelinux.org/alpine/edge/main" >> /etc/apk/repositories && \
    apk add --no-cache ca-certificates && \
    apk add --no-cache curl --repository=http://dl-cdn.alpinelinux.org/alpine/edge/main && \
    apk upgrade --no-cache busybox busybox-binsh libcrypto3 libssl3 zlib

# Create non-root user for security
# Note: Alpine Linux uses GID 1000 for 'users' group, so we use a different GID
RUN addgroup -g 1001 app && \
    adduser -D -u 1001 -G app app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install production dependencies only
RUN npm install -g pnpm@latest && \
    CI=true pnpm install --frozen-lockfile --prod --config.ignore-scripts=true && \
    pnpm store prune && \
    rm -rf /root/.local/share/pnpm /root/.cache /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/worker ./worker

# Set ownership to non-root user
# RUN chown -R app:app /app

# Switch to non-root user
USER app

# Expose Wrangler dev server port
EXPOSE 8787

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8787/health || exit 1

# Default command: Run Wrangler in development mode
CMD ["pnpm", "dlx", "wrangler", "dev", "--ip", "0.0.0.0", "--port", "8787"]
