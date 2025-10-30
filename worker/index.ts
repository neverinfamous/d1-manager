import type { Env } from './types';
import { validateAccessJWT } from './utils/auth';
import { getCorsHeaders, handleCorsPreflightRequest, isLocalDevelopment } from './utils/cors';
import { handleDatabaseRoutes } from './routes/databases';
import { handleTableRoutes } from './routes/tables';
import { handleQueryRoutes } from './routes/queries';

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
  
  // Skip auth for localhost development
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

  // Detect if we're in local development without credentials
  const isLocalDev = isLocalhost && (!env.ACCOUNT_ID || !env.CF_EMAIL || !env.API_KEY);

  // Route API requests
  if (url.pathname.startsWith('/api/databases')) {
    return await handleDatabaseRoutes(request, env, url, corsHeaders, isLocalDev);
  }

  if (url.pathname.startsWith('/api/tables/')) {
    return await handleTableRoutes(request, env, url, corsHeaders, isLocalDev);
  }

  if (url.pathname.startsWith('/api/query/')) {
    return await handleQueryRoutes(request, env, url, corsHeaders, isLocalDev, userEmail);
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
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await handleApiRequest(request, env);
    } catch (err) {
      console.error('[Worker] Unhandled error:', err);
      const corsHeaders = getCorsHeaders(request);
      return new Response(JSON.stringify({ 
        error: 'Internal Server Error',
        message: err instanceof Error ? err.message : String(err)
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

