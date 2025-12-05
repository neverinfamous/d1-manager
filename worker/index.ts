import type { Env } from './types';
import { validateAccessJWT } from './utils/auth';
import { getCorsHeaders, handleCorsPreflightRequest, isLocalDevelopment } from './utils/cors';
import { handleDatabaseRoutes } from './routes/databases';
import { handleTableRoutes } from './routes/tables';
import { handleQueryRoutes } from './routes/queries';
import { handleSavedQueriesRoutes } from './routes/saved-queries';
import { handleUndoRoutes } from './routes/undo';
import { handleFTS5Routes } from './routes/fts5';
import { handleIndexRoutes } from './routes/indexes';
import { handleJobRoutes } from './routes/jobs';
import { handleTimeTravelRoutes } from './routes/time-travel';
import { handleColorRoutes } from './routes/colors';
import { handleWebhookRoutes } from './routes/webhooks';
import { handleR2BackupRoutes } from './routes/r2-backup';
import { handleMigrationRoutes } from './routes/migrations';
import { handleMetricsRoutes } from './routes/metrics';
import { handleScheduledBackupRoutes } from './routes/scheduled-backups';
import { handleDrizzleRoutes } from './routes/drizzle';
import { processScheduledBackups } from './utils/scheduled-backup-processor';
import { trackDatabaseAccess } from './utils/database-tracking';
import { logInfo, logWarning } from './utils/error-logger';

// Export Durable Object for R2 backup operations
export { BackupDO } from './durable-objects/BackupDO';

/**
 * Content Security Policy for static assets.
 * 
 * Policy:
 * - script-src: self + Cloudflare Web Analytics
 * - style-src: self + unsafe-inline (required by shadcn/ui and Tailwind)
 * - img-src: self + data URIs (for inline images)
 * - font-src: self
 * - connect-src: self (for API calls)
 * - frame-ancestors: self (prevent clickjacking)
 */
function getSecurityHeaders(): Record<string, string> {
  const csp = [
    "default-src 'self'",
    "script-src 'self' https://static.cloudflareinsights.com",
    "script-src-elem 'self' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://cloudflareinsights.com",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');

  return {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };
}

/**
 * Get cache headers for static assets based on file type and path.
 * 
 * Strategy:
 * - Hashed assets (JS/CSS with content hash): Cache for 1 year (immutable)
 * - Static images/fonts: Cache for 1 year
 * - index.html: No cache (ensures users get latest app version)
 * - Other HTML: Short cache
 * 
 * With Cloudflare Tiered Caching + Cache Reserve enabled, these headers
 * maximize edge cache hits while ensuring freshness for critical files.
 */
function getCacheHeaders(pathname: string): Record<string, string> {
  // index.html - never cache to ensure users get latest app
  if (pathname === '/' || pathname === '/index.html') {
    return {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    };
  }
  
  // Hashed assets (Vite adds content hash to filename)
  // These are immutable - safe to cache forever
  if (/\/assets\/.*-[a-zA-Z0-9]{8}\.(js|css|woff2?|ttf|eot)$/.exec(pathname)) {
    return {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'CDN-Cache-Control': 'public, max-age=31536000, immutable'
    };
  }
  
  // Images and other static files in assets folder
  if (pathname.startsWith('/assets/')) {
    return {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'CDN-Cache-Control': 'public, max-age=31536000, immutable'
    };
  }
  
  // SVG, favicon, and other root-level static files
  if (/\.(svg|ico|png|jpg|jpeg|gif|webp)$/.exec(pathname)) {
    return {
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'CDN-Cache-Control': 'public, max-age=604800'
    };
  }
  
  // Default: short cache for other static files
  return {
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    'CDN-Cache-Control': 'public, max-age=86400'
  };
}

async function handleApiRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  logInfo(`${request.method} ${url.pathname}`, {
    module: 'worker',
    operation: 'request',
    metadata: { method: request.method, path: url.pathname }
  });
  
  // Get CORS headers
  const corsHeaders = getCorsHeaders(request);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return handleCorsPreflightRequest(corsHeaders);
  }

  // Check if local development
  const isLocalhost = isLocalDevelopment(request);
  
  // Allow static assets without authentication (from Workers Assets binding)
  // These are served by Cloudflare's edge network and don't need auth
  if (!url.pathname.startsWith('/api/')) {
    // Static asset request - serve with optimized cache and security headers
    const assetResponse = await env.ASSETS.fetch(request);
    
    // Clone response and add cache + security headers
    const cacheHeaders = getCacheHeaders(url.pathname);
    const securityHeaders = getSecurityHeaders();
    const newHeaders = new Headers(assetResponse.headers);
    
    Object.entries(cacheHeaders).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });
    Object.entries(securityHeaders).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });
    
    return new Response(assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers: newHeaders
    });
  }
  
  // Skip auth for localhost development API requests
  let userEmail: string | null = null;
  if (isLocalhost) {
    logInfo('Localhost detected, skipping JWT validation', {
      module: 'worker',
      operation: 'auth'
    });
    userEmail = 'dev@localhost';
  } else {
    // Require auth for production API endpoints
    userEmail = await validateAccessJWT(request, env);
    if (!userEmail) {
      return new Response('Unauthorized', { 
        status: 401,
        headers: corsHeaders
      });
    }
  }

  // Only use mock data if in local development AND missing credentials
  const isLocalDev = isLocalhost && (!env.ACCOUNT_ID || !env.API_KEY);
  
  logInfo('Environment configuration', {
    module: 'worker',
    operation: 'init',
    metadata: {
      isLocalhost,
      hasAccountId: !!env.ACCOUNT_ID,
      hasApiKey: !!env.API_KEY,
      isLocalDev,
      hostname: url.hostname
    }
  });

  // Route API requests
  // Handle color routes first (more specific paths)
  if (url.pathname === '/api/databases/colors' || 
      /^\/api\/databases\/[^/]+\/color$/.exec(url.pathname) !== null ||
      /^\/api\/tables\/[^/]+\/colors$/.exec(url.pathname) !== null ||
      /^\/api\/tables\/[^/]+\/[^/]+\/color$/.exec(url.pathname) !== null) {
    const colorResponse = await handleColorRoutes(request, env, url, corsHeaders, isLocalDev, userEmail);
    if (colorResponse) {
      return colorResponse;
    }
  }

  if (url.pathname.startsWith('/api/databases')) {
    return await handleDatabaseRoutes(request, env, url, corsHeaders, isLocalDev, userEmail);
  }

  if (url.pathname.startsWith('/api/tables/')) {
    return await handleTableRoutes(request, env, url, corsHeaders, isLocalDev, userEmail);
  }

  if (url.pathname.startsWith('/api/query/')) {
    // Track database access when executing queries
    const pathParts = url.pathname.split('/');
    const dbId = pathParts[3];
    if (dbId && !isLocalDev) {
      await trackDatabaseAccess(dbId, env);
    }
    return await handleQueryRoutes(request, env, url, corsHeaders, isLocalDev, userEmail);
  }

  if (url.pathname.startsWith('/api/saved-queries')) {
    return await handleSavedQueriesRoutes(request, env, url, corsHeaders, isLocalDev, userEmail);
  }

  if (url.pathname.startsWith('/api/undo/')) {
    return await handleUndoRoutes(request, env, url, corsHeaders, isLocalDev, userEmail);
  }

  if (url.pathname.startsWith('/api/fts5/')) {
    return await handleFTS5Routes(request, env, url, corsHeaders, isLocalDev, userEmail);
  }

  if (url.pathname.startsWith('/api/indexes/')) {
    return await handleIndexRoutes(request, env, url, corsHeaders, isLocalDev, userEmail);
  }

  if (url.pathname.startsWith('/api/jobs')) {
    const jobResponse = await handleJobRoutes(request, env, url, corsHeaders, isLocalDev, userEmail);
    if (jobResponse) {
      return jobResponse;
    }
  }

  if (url.pathname.startsWith('/api/time-travel/')) {
    const timeTravelResponse = await handleTimeTravelRoutes(request, env, url, corsHeaders, isLocalDev, userEmail);
    if (timeTravelResponse) {
      return timeTravelResponse;
    }
  }

  if (url.pathname.startsWith('/api/migrations')) {
    const migrationResponse = await handleMigrationRoutes(request, env, url, corsHeaders, isLocalDev, userEmail);
    if (migrationResponse) {
      return migrationResponse;
    }
  }

  if (url.pathname.startsWith('/api/webhooks')) {
    const webhookResponse = await handleWebhookRoutes(request, env, url, corsHeaders, isLocalDev, userEmail);
    if (webhookResponse) {
      return webhookResponse;
    }
  }

  if (url.pathname.startsWith('/api/r2-backup') || url.pathname.startsWith('/api/r2-restore')) {
    const r2BackupResponse = await handleR2BackupRoutes(request, env, url, corsHeaders, isLocalDev, userEmail, ctx);
    if (r2BackupResponse) {
      return r2BackupResponse;
    }
  }

  if (url.pathname.startsWith('/api/metrics')) {
    const metricsResponse = await handleMetricsRoutes(request, env, url, corsHeaders, isLocalDev, userEmail);
    if (metricsResponse) {
      return metricsResponse;
    }
  }

  if (url.pathname.startsWith('/api/scheduled-backups')) {
    const scheduledBackupResponse = await handleScheduledBackupRoutes(request, env, url, corsHeaders, isLocalDev, userEmail);
    if (scheduledBackupResponse) {
      return scheduledBackupResponse;
    }
  }

  if (url.pathname.startsWith('/api/drizzle/')) {
    return await handleDrizzleRoutes(request, env, url, corsHeaders, isLocalDev, userEmail);
  }

  // Serve frontend assets
  if (isLocalhost) {
    // In development, Vite serves the frontend on port 5173
    const textHeaders = new Headers(corsHeaders);
    textHeaders.set('Content-Type', 'text/plain');
    return new Response('Development: Frontend at http://localhost:5173', {
      headers: textHeaders
    });
  }

  // In production, serve from ASSETS binding with cache + security headers
  try {
    const assetResponse = await env.ASSETS.fetch(request);
    const securityHeaders = getSecurityHeaders();
    
    // If asset not found and not an API route, serve index.html for client-side routing
    if (assetResponse.status === 404 && !url.pathname.startsWith('/api/')) {
      const indexRequest = new Request(new URL('/index.html', request.url), request);
      const indexResponse = await env.ASSETS.fetch(indexRequest);
      
      // index.html should not be cached but needs security headers
      const indexHeaders = new Headers(indexResponse.headers);
      const noCacheHeaders = getCacheHeaders('/index.html');
      Object.entries(noCacheHeaders).forEach(([key, value]) => {
        indexHeaders.set(key, value);
      });
      Object.entries(securityHeaders).forEach(([key, value]) => {
        indexHeaders.set(key, value);
      });
      
      return new Response(indexResponse.body, {
        status: indexResponse.status,
        statusText: indexResponse.statusText,
        headers: indexHeaders
      });
    }
    
    // Add cache + security headers to successful asset response
    const cacheHeaders = getCacheHeaders(url.pathname);
    const newHeaders = new Headers(assetResponse.headers);
    Object.entries(cacheHeaders).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });
    Object.entries(securityHeaders).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });
    
    return new Response(assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers: newHeaders
    });
  } catch (err) {
    logWarning(`Error serving asset: ${err instanceof Error ? err.message : String(err)}`, {
      module: 'worker',
      operation: 'serve_asset',
      metadata: { path: url.pathname, error: err instanceof Error ? err.message : String(err) }
    });
    return new Response('Not Found', { 
      status: 404,
      headers: corsHeaders
    });
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await handleApiRequest(request, env, ctx);
    } catch (err) {
      // Log full error details on server only
      const url = new URL(request.url);
      const isLocalhost = isLocalDevelopment(request);
      const isLocalDev = isLocalhost && (!env.ACCOUNT_ID || !env.API_KEY);
      void import('./utils/error-logger').then(({ logError }) => {
        void logError(
          env,
          `Unhandled error: ${err instanceof Error ? err.message : String(err)}`,
          {
            module: 'worker',
            operation: 'fetch',
            metadata: { 
              method: request.method, 
              path: url.pathname,
              stack: err instanceof Error ? err.stack : undefined
            }
          },
          isLocalDev
        );
      });
      const corsHeaders = getCorsHeaders(request);
      const jsonErrHeaders = new Headers(corsHeaders);
      jsonErrHeaders.set('Content-Type', 'application/json');
      // Return generic error to client (security: don't expose stack traces)
      return new Response(JSON.stringify({ 
        error: 'Internal Server Error',
        message: 'An unexpected error occurred. Please try again later.'
      }), { 
        status: 500,
        headers: jsonErrHeaders
      });
    }
  },

  /**
   * Scheduled handler for cron triggers.
   * Runs hourly to check for and execute due scheduled backups.
   */
  scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): void {
    logInfo(`Scheduled event triggered: ${event.cron}`, {
      module: 'worker',
      operation: 'scheduled',
      metadata: { cron: event.cron, scheduledTime: new Date(event.scheduledTime).toISOString() }
    });

    // Process scheduled backups in the background
    ctx.waitUntil(processScheduledBackups(env));
  }
};

