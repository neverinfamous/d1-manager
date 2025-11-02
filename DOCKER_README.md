# D1 Database Manager - Docker Edition

[![Docker](https://img.shields.io/badge/Docker-Ready-blue?logo=docker)](https://hub.docker.com)
[![GitHub](https://img.shields.io/badge/GitHub-neverinfamous/d1--manager-blue?logo=github)](https://github.com/neverinfamous/d1-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
![Version](https://img.shields.io/badge/version-v1.0.0-green)
![Status](https://img.shields.io/badge/status-Production%2FStable-brightgreen)

**Version:** 1.0.0 | **Last Updated:** November 2, 2025 - 8:39 AM EST  
**Base Image:** Node.js 18-alpine | **Architecture:** linux/amd64, linux/arm64

A fully containerized version of the D1 Database Manager for Cloudflare. This Docker image provides a modern, full-featured web application for managing Cloudflare D1 databases with enterprise-grade authentication via Cloudflare Access (Zero Trust).

---

## 🐳 Quick Start

### Pull and Run

```bash
# Pull the latest image
docker pull writenotenow/d1-manager:latest

# Run with environment variables
docker run -d \
  -p 8080:8080 \
  -e ACCOUNT_ID=your_cloudflare_account_id \
  -e API_KEY=your_cloudflare_api_token \
  -e TEAM_DOMAIN=https://yourteam.cloudflareaccess.com \
  -e POLICY_AUD=your_cloudflare_access_aud_tag \
  --name d1-manager \
  writenotenow/d1-manager:latest
```

Access the application at `http://localhost:8080`

### Using Docker Compose

Create a `docker-compose.yml` file:

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
      start_period: 40s
```

Create a `.env` file:

```env
ACCOUNT_ID=your_cloudflare_account_id
API_KEY=your_cloudflare_api_token
TEAM_DOMAIN=https://yourteam.cloudflareaccess.com
POLICY_AUD=your_cloudflare_access_aud_tag
```

Run with Docker Compose:

```bash
docker-compose up -d
```

---

## 🎯 What's Included

This Docker image packages the complete D1 Database Manager with:

### Core Features
- **Full Database Management** - List, create, rename, delete, and optimize D1 databases
- **Advanced Table Operations** - Browse, create, modify, clone, and export tables with visual schema designer
- **SQL Query Console** - Execute queries with syntax highlighting, history, and CSV export
- **Row-Level Filtering** - Type-aware filtering with server-side SQL WHERE clauses
- **Bulk Operations** - Multi-select operations for databases and tables (bulk download, delete, clone, export)
- **Column Management** - Add, rename, modify, and delete columns with proper migration handling
- **Dependency Analysis** - Foreign key relationship viewer before table deletion
- **Dark/Light Themes** - System-aware theme switching with persistence
- **Responsive Design** - Works seamlessly on desktop, tablet, and mobile

### Authentication
- **Cloudflare Access (Zero Trust)** - Enterprise-grade authentication with JWT validation
- **GitHub OAuth Integration** - Secure authentication via Cloudflare's identity providers
- **Session Management** - Automatic token refresh and secure session handling

### Technical Stack
- React 19.2.0 with TypeScript 5.9.3
- Vite 7.1.12 for optimized production builds
- Tailwind CSS + shadcn/ui for modern UI
- Cloudflare Workers runtime for serverless API
- SQLite-compatible D1 database engine

---

## 📋 Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ACCOUNT_ID` | Your Cloudflare Account ID | `a1b2c3d4e5f6g7h8i9j0` |
| `API_KEY` | Cloudflare API Token with D1 Edit permissions | `abc123...xyz789` |
| `TEAM_DOMAIN` | Cloudflare Access team domain | `https://yourteam.cloudflareaccess.com` |
| `POLICY_AUD` | Cloudflare Access Application Audience (AUD) tag | `abc123def456...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Port the application listens on | `8080` |
| `NODE_ENV` | Node environment (production/development) | `production` |
| `LOG_LEVEL` | Logging level (error/warn/info/debug) | `info` |

---

## 🔧 Configuration Guide

### 1. Get Your Cloudflare Account ID

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to any page in your account
3. Copy the Account ID from the URL: `dash.cloudflare.com/{ACCOUNT_ID}/...`

### 2. Create a Cloudflare API Token

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token** → **Create Custom Token**
3. Set the following permissions:
   - **Account** → **D1** → **Edit**
4. Click **Continue to summary** → **Create Token**
5. Copy the token (it won't be shown again)

### 3. Set Up Cloudflare Access (Zero Trust)

1. Navigate to [Cloudflare Zero Trust](https://one.dash.cloudflare.com/)
2. Go to **Settings → Authentication**
3. Add GitHub as an identity provider (or use another provider)
4. Create a new Access Application:
   - **Application Type:** Self-hosted
   - **Application Domain:** Your domain where D1 Manager will be accessible
   - **Session Duration:** As per your security requirements
5. Configure Access Policies (e.g., allow users from your GitHub organization)
6. Copy the **Application Audience (AUD) tag** from the application settings

### 4. Note Your Team Domain

Your team domain is in the format: `https://yourteam.cloudflareaccess.com`

You can find it in the Zero Trust dashboard under **Settings → Custom Pages**

---

## 🚀 Deployment Options

### Docker Run

**Standard deployment:**
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

**With custom port:**
```bash
docker run -d \
  -p 3000:8080 \
  -e PORT=8080 \
  -e ACCOUNT_ID=your_account_id \
  -e API_KEY=your_api_token \
  -e TEAM_DOMAIN=https://yourteam.cloudflareaccess.com \
  -e POLICY_AUD=your_aud_tag \
  --name d1-manager \
  writenotenow/d1-manager:latest
```

**With logging enabled:**
```bash
docker run -d \
  -p 8080:8080 \
  -e LOG_LEVEL=debug \
  -e ACCOUNT_ID=your_account_id \
  -e API_KEY=your_api_token \
  -e TEAM_DOMAIN=https://yourteam.cloudflareaccess.com \
  -e POLICY_AUD=your_aud_tag \
  --name d1-manager \
  writenotenow/d1-manager:latest
```

### Docker Compose

**Production deployment with health checks:**
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
      - LOG_LEVEL=info
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - d1-network

networks:
  d1-network:
    driver: bridge
```

**Behind a reverse proxy (Nginx/Traefik):**
```yaml
version: '3.8'

services:
  d1-manager:
    image: writenotenow/d1-manager:latest
    container_name: d1-manager
    expose:
      - "8080"
    environment:
      - ACCOUNT_ID=${ACCOUNT_ID}
      - API_KEY=${API_KEY}
      - TEAM_DOMAIN=${TEAM_DOMAIN}
      - POLICY_AUD=${POLICY_AUD}
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.d1-manager.rule=Host(`d1.yourdomain.com`)"
      - "traefik.http.routers.d1-manager.entrypoints=websecure"
      - "traefik.http.routers.d1-manager.tls.certresolver=myresolver"
    networks:
      - proxy-network

networks:
  proxy-network:
    external: true
```

### Kubernetes

**Basic deployment:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: d1-manager
  labels:
    app: d1-manager
spec:
  replicas: 2
  selector:
    matchLabels:
      app: d1-manager
  template:
    metadata:
      labels:
        app: d1-manager
    spec:
      containers:
      - name: d1-manager
        image: writenotenow/d1-manager:latest
        ports:
        - containerPort: 8080
        env:
        - name: ACCOUNT_ID
          valueFrom:
            secretKeyRef:
              name: d1-manager-secrets
              key: account-id
        - name: API_KEY
          valueFrom:
            secretKeyRef:
              name: d1-manager-secrets
              key: api-key
        - name: TEAM_DOMAIN
          valueFrom:
            secretKeyRef:
              name: d1-manager-secrets
              key: team-domain
        - name: POLICY_AUD
          valueFrom:
            secretKeyRef:
              name: d1-manager-secrets
              key: policy-aud
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: d1-manager
spec:
  selector:
    app: d1-manager
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8080
  type: LoadBalancer
---
apiVersion: v1
kind: Secret
metadata:
  name: d1-manager-secrets
type: Opaque
stringData:
  account-id: "your_account_id"
  api-key: "your_api_token"
  team-domain: "https://yourteam.cloudflareaccess.com"
  policy-aud: "your_aud_tag"
```

---

## 🔍 Health Checks

The container includes a health endpoint at `/health` that returns:

```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 12345,
  "timestamp": "2025-11-02T12:00:00.000Z"
}
```

Use this endpoint for:
- Docker health checks
- Load balancer health probes
- Kubernetes liveness/readiness probes
- Monitoring and alerting systems

---

## 📊 Container Specifications

### Image Details
- **Base Image:** `node:18-alpine`
- **Size:** ~150MB (compressed)
- **Architecture:** `linux/amd64`, `linux/arm64`
- **Exposed Ports:** `8080`
- **User:** Non-root user (`node`)
- **Working Directory:** `/app`

### Performance
- **Startup Time:** ~2-3 seconds
- **Memory Usage:** 50-100MB (idle)
- **CPU Usage:** Minimal (event-driven)

### Security Features
- Runs as non-root user
- No shell utilities in minimal Alpine base
- Environment-based secret management
- JWT validation for all API requests
- CORS protection enabled
- Rate limiting (configurable)

---

## 🔐 Security Best Practices

### 1. Use Docker Secrets (Docker Swarm)

```bash
# Create secrets
echo "your_account_id" | docker secret create d1_account_id -
echo "your_api_token" | docker secret create d1_api_key -
echo "https://yourteam.cloudflareaccess.com" | docker secret create d1_team_domain -
echo "your_aud_tag" | docker secret create d1_policy_aud -

# Deploy with secrets
docker service create \
  --name d1-manager \
  --publish 8080:8080 \
  --secret d1_account_id \
  --secret d1_api_key \
  --secret d1_team_domain \
  --secret d1_policy_aud \
  yourusername/d1-manager:latest
```

### 2. Use Kubernetes Secrets

```bash
# Create secret
kubectl create secret generic d1-manager-secrets \
  --from-literal=account-id='your_account_id' \
  --from-literal=api-key='your_api_token' \
  --from-literal=team-domain='https://yourteam.cloudflareaccess.com' \
  --from-literal=policy-aud='your_aud_tag'
```

### 3. Restrict Network Access

```yaml
# Docker Compose with network isolation
version: '3.8'

services:
  d1-manager:
    image: writenotenow/d1-manager:latest
    networks:
      - backend
    environment:
      - ACCOUNT_ID=${ACCOUNT_ID}
      - API_KEY=${API_KEY}
      - TEAM_DOMAIN=${TEAM_DOMAIN}
      - POLICY_AUD=${POLICY_AUD}

  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
    networks:
      - backend
      - frontend

networks:
  backend:
    internal: true
  frontend:
    driver: bridge
```

### 4. Enable Read-Only Root Filesystem

```bash
docker run -d \
  --read-only \
  --tmpfs /tmp \
  --tmpfs /app/tmp \
  -p 8080:8080 \
  -e ACCOUNT_ID=your_account_id \
  -e API_KEY=your_api_token \
  -e TEAM_DOMAIN=https://yourteam.cloudflareaccess.com \
  -e POLICY_AUD=your_aud_tag \
  yourusername/d1-manager:latest
```

---

## 🐞 Troubleshooting

### Container Won't Start

**Check logs:**
```bash
docker logs d1-manager
```

**Common issues:**
- Missing required environment variables
- Invalid API token or Account ID
- Port already in use

**Solution:**
```bash
# Verify environment variables
docker inspect d1-manager | grep -A 10 Env

# Check if port is available
netstat -tuln | grep 8080

# Restart with correct variables
docker rm -f d1-manager
docker run -d [correct options] yourusername/d1-manager:latest
```

### Authentication Failures

**Symptoms:**
- Redirect loops
- "Failed to authenticate" errors
- 401/403 responses

**Check:**
1. Verify `TEAM_DOMAIN` includes `https://`
2. Confirm `POLICY_AUD` matches your Access application
3. Ensure your user is allowed in Access policies
4. Check if API token has **D1 Edit** permissions

**Logs to check:**
```bash
docker logs d1-manager | grep -i "auth\|jwt\|access"
```

### Database Operations Fail

**Symptoms:**
- "Failed to list databases" error
- Operations timeout
- 500 errors

**Check:**
1. Verify `ACCOUNT_ID` is correct
2. Confirm `API_KEY` has D1 Edit permissions (not just Read)
3. Check Cloudflare API status
4. Verify D1 databases exist in your account

**Test API token:**
```bash
curl -X GET "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json"
```

### High Memory Usage

**Check container stats:**
```bash
docker stats d1-manager
```

**Set memory limits:**
```bash
docker run -d \
  --memory="512m" \
  --memory-swap="512m" \
  [other options] \
  yourusername/d1-manager:latest
```

### Networking Issues

**Cannot access from host:**
```bash
# Check if container is running
docker ps | grep d1-manager

# Check port mapping
docker port d1-manager

# Test connectivity
curl http://localhost:8080/health
```

**Cannot access from other containers:**
```bash
# Ensure containers are on the same network
docker network inspect bridge

# Create custom network
docker network create d1-network

# Run with custom network
docker run --network d1-network [other options] yourusername/d1-manager:latest
```

---

## 📈 Monitoring and Logging

### Docker Logs

**View logs:**
```bash
# Follow logs in real-time
docker logs -f d1-manager

# View last 100 lines
docker logs --tail 100 d1-manager

# View logs since 1 hour ago
docker logs --since 1h d1-manager
```

### Log Aggregation

**Using Docker logging driver:**
```yaml
version: '3.8'

services:
  d1-manager:
    image: writenotenow/d1-manager:latest
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

**Forward to syslog:**
```yaml
version: '3.8'

services:
  d1-manager:
    image: writenotenow/d1-manager:latest
    logging:
      driver: syslog
      options:
        syslog-address: "tcp://192.168.0.42:514"
        tag: "d1-manager"
```

### Container Stats

Monitor container resource usage:

```bash
# View real-time stats
docker stats d1-manager

# View stats for all containers
docker stats
```

---

## 🔄 Updates and Maintenance

### Updating to Latest Version

```bash
# Pull latest image
docker pull writenotenow/d1-manager:latest

# Stop and remove old container
docker stop d1-manager
docker rm d1-manager

# Start new container with same configuration
docker run -d [same options as before] writenotenow/d1-manager:latest
```

### Using Docker Compose

```bash
# Pull latest images
docker-compose pull

# Restart services
docker-compose up -d
```

### Version Pinning (Recommended for Production)

```yaml
version: '3.8'

services:
  d1-manager:
    image: writenotenow/d1-manager:1.0.0  # Pin to specific version
    # ... rest of configuration
```

### Automated Updates with Watchtower

```yaml
version: '3.8'

services:
  d1-manager:
    image: writenotenow/d1-manager:latest
    # ... your configuration

  watchtower:
    image: containrrr/watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --interval 3600 d1-manager
```

---

## 🏗️ Building from Source

If you want to build the Docker image yourself:

### Clone the Repository

```bash
git clone https://github.com/neverinfamous/d1-manager.git
cd d1-manager
```

### Build the Image

```bash
# Build for your platform
docker build -t d1-manager:local .

# Build for multiple platforms
docker buildx build --platform linux/amd64,linux/arm64 -t d1-manager:local .
```

### Dockerfile Reference

The Dockerfile uses a multi-stage build for optimal size:

1. **Build Stage** - Compiles TypeScript and bundles React app with Vite
2. **Production Stage** - Copies only production artifacts to minimal Alpine image

**Key features:**
- Minimal attack surface with Alpine Linux
- Non-root user execution
- Optimized layer caching
- Health check integration
- Environment variable validation

---

## 📋 Available Tags

| Tag | Description | Use Case |
|-----|-------------|----------|
| `latest` | Latest stable release from main branch | Development/Testing |
| `v1.0.0` | Specific version number (matches README version) | Production (recommended) |
| `sha-XXXXXX` | Short commit SHA (12 chars) | Reproducible builds and security audits |

---

## 🌐 Reverse Proxy Examples

### Nginx

```nginx
server {
    listen 80;
    server_name d1.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name d1.yourdomain.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    location / {
        proxy_pass http://d1-manager:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Traefik

```yaml
version: '3.8'

services:
  d1-manager:
    image: writenotenow/d1-manager:latest
    networks:
      - traefik-network
    environment:
      - ACCOUNT_ID=${ACCOUNT_ID}
      - API_KEY=${API_KEY}
      - TEAM_DOMAIN=${TEAM_DOMAIN}
      - POLICY_AUD=${POLICY_AUD}
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.d1.rule=Host(`d1.yourdomain.com`)"
      - "traefik.http.routers.d1.entrypoints=websecure"
      - "traefik.http.routers.d1.tls=true"
      - "traefik.http.routers.d1.tls.certresolver=letsencrypt"
      - "traefik.http.services.d1.loadbalancer.server.port=8080"

networks:
  traefik-network:
    external: true
```

### Caddy

```caddyfile
d1.yourdomain.com {
    reverse_proxy d1-manager:8080
}
```

---

## 📚 Additional Resources

### Documentation
- **Main Documentation:** [GitHub Repository](https://github.com/neverinfamous/d1-manager)
- **Cloudflare D1:** [D1 Documentation](https://developers.cloudflare.com/d1/)
- **Cloudflare Access:** [Zero Trust Documentation](https://developers.cloudflare.com/cloudflare-one/policies/access/)
- **Docker Documentation:** [Docker Docs](https://docs.docker.com/)

### Support
- 🐛 **Bug Reports:** [GitHub Issues](https://github.com/neverinfamous/d1-manager/issues)
- 💬 **Discussions:** [GitHub Discussions](https://github.com/neverinfamous/d1-manager/discussions)
- 📧 **Email:** support@example.com

### Community
- **Docker Hub:** [Image Repository](https://hub.docker.com/r/writenotenow/d1-manager)
- **GitHub:** [Source Code](https://github.com/neverinfamous/d1-manager)
- **License:** [MIT License](https://github.com/neverinfamous/d1-manager/blob/main/LICENSE)

---

## 🤝 Contributing

We welcome contributions! See the [CONTRIBUTING.md](https://github.com/neverinfamous/d1-manager/blob/main/CONTRIBUTING.md) guide for details.

---

## 📄 License

MIT License - see [LICENSE](https://github.com/neverinfamous/d1-manager/blob/main/LICENSE) file for details

---

## ⭐ Show Your Support

If you find this project useful, please consider giving it a star on GitHub!

---

**Made with ❤️ for the Cloudflare and Docker communities**

