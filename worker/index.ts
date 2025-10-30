import type { Env } from './types';
import { validateAccessJWT } from './utils/auth';
import { getCorsHeaders, handleCorsPreflightRequest, isLocalDevelopment } from './utils/cors';
import { handleDatabaseRoutes } from './routes/databases';
import { handleTableRoutes } from './routes/tables';
import { handleQueryRoutes } from './routes/queries';
import { handleSavedQueriesRoutes } from './routes/saved-queries';
import { trackDatabaseAccess } from './utils/database-tracking';

async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  console.log('[Request]', request.method, url.pathname);
  
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
    // Static asset request - let it through to the assets handler
    return env.ASSETS.fetch(request);
  }
  
  // Skip auth for localhost development API requests
  let userEmail: string | null = null;
  if (isLocalhost) {
    console.log('[Auth] Localhost detected, skipping JWT validation');
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
  
  console.log('[Environment]', {
    isLocalhost,
    hasAccountId: !!env.ACCOUNT_ID,
    hasApiKey: !!env.API_KEY,
    isLocalDev,
    hostname: url.hostname
  });

  // Route API requests
  if (url.pathname.startsWith('/api/databases')) {
    return await handleDatabaseRoutes(request, env, url, corsHeaders, isLocalDev);
  }

  if (url.pathname.startsWith('/api/tables/')) {
    return await handleTableRoutes(request, env, url, corsHeaders, isLocalDev);
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

  // Serve frontend assets
  if (isLocalhost) {
    // In development, Vite serves the frontend on port 5173
    return new Response('Development: Frontend at http://localhost:5173', {
      headers: {
        'Content-Type': 'text/plain',
        ...corsHeaders
      }
    });
  }

  // In production, serve from ASSETS binding
  try {
    const assetResponse = await env.ASSETS.fetch(request);
    
    // If asset not found and not an API route, serve index.html for client-side routing
    if (assetResponse.status === 404 && !url.pathname.startsWith('/api/')) {
      const indexRequest = new Request(new URL('/index.html', request.url), request);
      return await env.ASSETS.fetch(indexRequest);
    }
    
    return assetResponse;
  } catch (err) {
    console.error('[Assets] Error serving asset:', err);
    return new Response('Not Found', { 
      status: 404,
      headers: corsHeaders
    });
  }
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    try {
      return await handleApiRequest(request, env);
    } catch (err) {
      // Log full error details on server only
      console.error('[Worker] Unhandled error:', err);
      const corsHeaders = getCorsHeaders(request);
      // Return generic error to client (security: don't expose stack traces)
      return new Response(JSON.stringify({ 
        error: 'Internal Server Error',
        message: 'An unexpected error occurred. Please try again later.'
      }), { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }
};

