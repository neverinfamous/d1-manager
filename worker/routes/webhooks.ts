/**
 * Webhook Routes
 * 
 * CRUD API for managing webhook configurations.
 * Supports creating, updating, deleting, and testing webhooks.
 */

import type { Env, Webhook } from '../types';
import { sendWebhook } from '../utils/webhooks';
import { logWarning } from '../utils/error-logger';

type CorsHeaders = HeadersInit;

// Helper to create response headers with CORS
function jsonHeaders(corsHeaders: CorsHeaders): Headers {
  const headers = new Headers(corsHeaders);
  headers.set('Content-Type', 'application/json');
  return headers;
}

/**
 * Generate a unique ID for webhooks
 */
function generateId(): string {
  return `whk_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get current ISO timestamp
 */
function nowISO(): string {
  return new Date().toISOString();
}

/**
 * JSON response helper
 */
function jsonResponse(
  data: unknown,
  corsHeaders: CorsHeaders,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: jsonHeaders(corsHeaders),
  });
}

/**
 * Error response helper
 */
function errorResponse(
  message: string,
  corsHeaders: CorsHeaders,
  status = 500
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: jsonHeaders(corsHeaders),
  });
}

/**
 * Parse JSON body safely
 */
async function parseJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return await request.json() as T;
  } catch {
    return null;
  }
}

/**
 * Mock webhooks for local development
 */
const MOCK_WEBHOOKS: Webhook[] = [
  {
    id: 'webhook-1',
    name: 'Slack Notifications',
    url: 'https://hooks.slack.com/services/xxx/yyy/zzz',
    secret: 'mock-secret-123',
    events: JSON.stringify(['database_create', 'job_failed']),
    enabled: 1,
    created_at: '2024-03-01T10:00:00Z',
    updated_at: '2024-03-01T10:00:00Z',
  },
  {
    id: 'webhook-2',
    name: 'Discord Alerts',
    url: 'https://discord.com/api/webhooks/xxx/yyy',
    secret: null,
    events: JSON.stringify(['database_export', 'database_import']),
    enabled: 0,
    created_at: '2024-03-02T14:30:00Z',
    updated_at: '2024-03-02T14:30:00Z',
  },
];

/**
 * Handle webhook routes
 */
export async function handleWebhookRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean,
  _userEmail: string | null
): Promise<Response | null> {
  // userEmail available for future access control
  void _userEmail;
  
  const method = request.method;
  const path = url.pathname;

  // GET /api/webhooks - List all webhooks
  if (method === 'GET' && path === '/api/webhooks') {
    return listWebhooks(env, corsHeaders, isLocalDev);
  }

  // POST /api/webhooks - Create webhook
  if (method === 'POST' && path === '/api/webhooks') {
    return createWebhook(request, env, corsHeaders, isLocalDev);
  }

  // GET /api/webhooks/:id - Get single webhook
  const singleMatch = /^\/api\/webhooks\/([^/]+)$/.exec(path);
  if (method === 'GET' && singleMatch) {
    const webhookId = singleMatch[1];
    if (!webhookId) {
      return errorResponse('Webhook ID required', corsHeaders, 400);
    }
    return getWebhook(webhookId, env, corsHeaders, isLocalDev);
  }

  // PUT /api/webhooks/:id - Update webhook
  if (method === 'PUT' && singleMatch) {
    const webhookId = singleMatch[1];
    if (!webhookId) {
      return errorResponse('Webhook ID required', corsHeaders, 400);
    }
    return updateWebhook(webhookId, request, env, corsHeaders, isLocalDev);
  }

  // DELETE /api/webhooks/:id - Delete webhook
  if (method === 'DELETE' && singleMatch) {
    const webhookId = singleMatch[1];
    if (!webhookId) {
      return errorResponse('Webhook ID required', corsHeaders, 400);
    }
    return deleteWebhook(webhookId, env, corsHeaders, isLocalDev);
  }

  // POST /api/webhooks/:id/test - Test webhook
  const testMatch = /^\/api\/webhooks\/([^/]+)\/test$/.exec(path);
  if (method === 'POST' && testMatch) {
    const webhookId = testMatch[1];
    if (!webhookId) {
      return errorResponse('Webhook ID required', corsHeaders, 400);
    }
    return testWebhook(webhookId, env, corsHeaders, isLocalDev);
  }

  // Route not matched
  return null;
}

/**
 * List all webhooks
 */
async function listWebhooks(
  env: Env,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean
): Promise<Response> {
  if (isLocalDev) {
    return jsonResponse({ webhooks: MOCK_WEBHOOKS }, corsHeaders);
  }

  try {
    const result = await env.METADATA.prepare(
      'SELECT * FROM webhooks ORDER BY created_at DESC'
    ).all<Webhook>();

    return jsonResponse({ webhooks: result.results }, corsHeaders);
  } catch (error) {
    logWarning(`List error: ${error instanceof Error ? error.message : String(error)}`, { module: 'webhooks', operation: 'list' });
    
    // Check for missing table error
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('no such table')) {
      return errorResponse(
        'Webhooks table not found. Please run the database migration: npx wrangler d1 execute d1-manager-metadata --remote --file=worker/migrations/004_add_webhooks.sql',
        corsHeaders,
        500
      );
    }
    
    return errorResponse('Failed to list webhooks', corsHeaders, 500);
  }
}

/**
 * Get a single webhook by ID
 */
async function getWebhook(
  webhookId: string,
  env: Env,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean
): Promise<Response> {
  if (isLocalDev) {
    const webhook = MOCK_WEBHOOKS.find((w) => w.id === webhookId);
    if (!webhook) {
      return errorResponse('Webhook not found', corsHeaders, 404);
    }
    return jsonResponse({ webhook }, corsHeaders);
  }

  try {
    const webhook = await env.METADATA.prepare(
      'SELECT * FROM webhooks WHERE id = ?'
    ).bind(webhookId).first<Webhook>();

    if (!webhook) {
      return errorResponse('Webhook not found', corsHeaders, 404);
    }

    return jsonResponse({ webhook }, corsHeaders);
  } catch (error) {
    logWarning(`Get error: ${error instanceof Error ? error.message : String(error)}`, { module: 'webhooks', operation: 'get' });
    return errorResponse('Failed to get webhook', corsHeaders, 500);
  }
}

/**
 * Create webhook request body
 */
interface CreateWebhookRequest {
  name: string;
  url: string;
  secret?: string;
  events: string[];
  enabled?: boolean;
}

/**
 * Create a new webhook
 */
async function createWebhook(
  request: Request,
  env: Env,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean
): Promise<Response> {
  const body = await parseJsonBody<CreateWebhookRequest>(request);
  if (!body) {
    return errorResponse('Invalid request body', corsHeaders, 400);
  }

  const { name, url, secret, events, enabled = true } = body;

  if (!name || !url || !Array.isArray(events) || events.length === 0) {
    return errorResponse('name, url, and events are required', corsHeaders, 400);
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return errorResponse('Invalid URL format', corsHeaders, 400);
  }

  const webhookId = generateId();
  const now = nowISO();

  if (isLocalDev) {
    const newWebhook: Webhook = {
      id: webhookId,
      name,
      url,
      secret: secret ?? null,
      events: JSON.stringify(events),
      enabled: enabled ? 1 : 0,
      created_at: now,
      updated_at: now,
    };
    MOCK_WEBHOOKS.unshift(newWebhook);
    return jsonResponse({ webhook: newWebhook }, corsHeaders, 201);
  }

  try {
    await env.METADATA.prepare(`
      INSERT INTO webhooks (id, name, url, secret, events, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      webhookId,
      name,
      url,
      secret ?? null,
      JSON.stringify(events),
      enabled ? 1 : 0,
      now,
      now
    ).run();

    const webhook = await env.METADATA.prepare(
      'SELECT * FROM webhooks WHERE id = ?'
    ).bind(webhookId).first<Webhook>();

    return jsonResponse({ webhook }, corsHeaders, 201);
  } catch (error) {
    logWarning(`Create error: ${error instanceof Error ? error.message : String(error)}`, { module: 'webhooks', operation: 'create' });
    return errorResponse('Failed to create webhook', corsHeaders, 500);
  }
}

/**
 * Update webhook request body
 */
interface UpdateWebhookRequest {
  name?: string;
  url?: string;
  secret?: string | null;
  events?: string[];
  enabled?: boolean;
}

/**
 * Update an existing webhook
 */
async function updateWebhook(
  webhookId: string,
  request: Request,
  env: Env,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean
): Promise<Response> {
  const body = await parseJsonBody<UpdateWebhookRequest>(request);
  if (!body) {
    return errorResponse('Invalid request body', corsHeaders, 400);
  }

  const { name, url, secret, events, enabled } = body;

  // Validate URL if provided
  if (url) {
    try {
      new URL(url);
    } catch {
      return errorResponse('Invalid URL format', corsHeaders, 400);
    }
  }

  if (isLocalDev) {
    const index = MOCK_WEBHOOKS.findIndex((w) => w.id === webhookId);
    if (index < 0) {
      return errorResponse('Webhook not found', corsHeaders, 404);
    }
    const webhook = MOCK_WEBHOOKS[index];
    if (webhook) {
      if (name !== undefined) webhook.name = name;
      if (url !== undefined) webhook.url = url;
      if (secret !== undefined) webhook.secret = secret;
      if (events !== undefined) webhook.events = JSON.stringify(events);
      if (enabled !== undefined) webhook.enabled = enabled ? 1 : 0;
      webhook.updated_at = nowISO();
    }
    return jsonResponse({ webhook }, corsHeaders);
  }

  try {
    // Check if webhook exists
    const existing = await env.METADATA.prepare(
      'SELECT * FROM webhooks WHERE id = ?'
    ).bind(webhookId).first<Webhook>();

    if (!existing) {
      return errorResponse('Webhook not found', corsHeaders, 404);
    }

    // Build update query
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (url !== undefined) {
      updates.push('url = ?');
      values.push(url);
    }
    if (secret !== undefined) {
      updates.push('secret = ?');
      values.push(secret);
    }
    if (events !== undefined) {
      updates.push('events = ?');
      values.push(JSON.stringify(events));
    }
    if (enabled !== undefined) {
      updates.push('enabled = ?');
      values.push(enabled ? 1 : 0);
    }

    if (updates.length === 0) {
      return jsonResponse({ webhook: existing }, corsHeaders);
    }

    updates.push('updated_at = ?');
    values.push(nowISO());
    values.push(webhookId);

    await env.METADATA.prepare(
      `UPDATE webhooks SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    const webhook = await env.METADATA.prepare(
      'SELECT * FROM webhooks WHERE id = ?'
    ).bind(webhookId).first<Webhook>();

    return jsonResponse({ webhook }, corsHeaders);
  } catch (error) {
    logWarning(`Update error: ${error instanceof Error ? error.message : String(error)}`, { module: 'webhooks', operation: 'update' });
    return errorResponse('Failed to update webhook', corsHeaders, 500);
  }
}

/**
 * Delete a webhook
 */
async function deleteWebhook(
  webhookId: string,
  env: Env,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean
): Promise<Response> {
  if (isLocalDev) {
    const index = MOCK_WEBHOOKS.findIndex((w) => w.id === webhookId);
    if (index >= 0) {
      MOCK_WEBHOOKS.splice(index, 1);
    }
    return jsonResponse({ success: true }, corsHeaders);
  }

  try {
    const existing = await env.METADATA.prepare(
      'SELECT * FROM webhooks WHERE id = ?'
    ).bind(webhookId).first<Webhook>();

    if (!existing) {
      return errorResponse('Webhook not found', corsHeaders, 404);
    }

    await env.METADATA.prepare(
      'DELETE FROM webhooks WHERE id = ?'
    ).bind(webhookId).run();

    return jsonResponse({ success: true }, corsHeaders);
  } catch (error) {
    logWarning(`Delete error: ${error instanceof Error ? error.message : String(error)}`, { module: 'webhooks', operation: 'delete' });
    return errorResponse('Failed to delete webhook', corsHeaders, 500);
  }
}

/**
 * Test a webhook by sending a test payload
 */
async function testWebhook(
  webhookId: string,
  env: Env,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean
): Promise<Response> {
  let webhook: Webhook | null = null;

  if (isLocalDev) {
    webhook = MOCK_WEBHOOKS.find((w) => w.id === webhookId) ?? null;
    if (!webhook) {
      return errorResponse('Webhook not found', corsHeaders, 404);
    }
    // In local dev, simulate success
    return jsonResponse({
      success: true,
      message: 'Test webhook sent successfully (mock mode)',
    }, corsHeaders);
  }

  try {
    webhook = await env.METADATA.prepare(
      'SELECT * FROM webhooks WHERE id = ?'
    ).bind(webhookId).first<Webhook>();

    if (!webhook) {
      return errorResponse('Webhook not found', corsHeaders, 404);
    }

    // Send test webhook
    const result = await sendWebhook(webhook, 'database_create', {
      test: true,
      message: 'This is a test webhook from D1 Manager',
      timestamp: nowISO(),
    });

    if (result.success) {
      return jsonResponse({
        success: true,
        message: 'Test webhook sent successfully',
        statusCode: result.statusCode,
      }, corsHeaders);
    } else {
      return jsonResponse({
        success: false,
        message: 'Test webhook failed',
        error: result.error,
        statusCode: result.statusCode,
      }, corsHeaders, 400);
    }
  } catch (error) {
    logWarning(`Test error: ${error instanceof Error ? error.message : String(error)}`, { module: 'webhooks', operation: 'test' });
    return errorResponse('Failed to test webhook', corsHeaders, 500);
  }
}

