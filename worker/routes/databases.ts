import type { Env, D1DatabaseInfo } from '../types';
import { CF_API } from '../types';

export async function handleDatabaseRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean
): Promise<Response> {
  console.log('[Databases] Handling database operation');
  
  const cfHeaders = {
    'Authorization': `Bearer ${env.API_KEY}`,
    'Content-Type': 'application/json'
  };
  
  // Verify auth configuration (sensitive values redacted)
  console.log('[Databases] Auth configured:', {
    hasApiKey: !!env.API_KEY,
    hasAccountId: !!env.ACCOUNT_ID
  });

  try {
    // List databases
    if (request.method === 'GET' && url.pathname === '/api/databases') {
      console.log('[Databases] Listing databases');
      
      // Mock response for local development
      if (isLocalDev) {
        console.log('[Databases] Using mock data for local development');
        return new Response(JSON.stringify({
          result: [
            {
              uuid: 'mock-db-1',
              name: 'dev-database',
              version: 'production',
              created_at: new Date().toISOString(),
              file_size: 1024 * 1024, // 1MB
              num_tables: 5
            },
            {
              uuid: 'mock-db-2',
              name: 'test-database',
              version: 'production',
              created_at: new Date(Date.now() - 86400000).toISOString(),
              file_size: 512 * 1024, // 512KB
              num_tables: 3
            }
          ],
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      console.log('[Databases] Making API request to:', `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database`);
      console.log('[Databases] Using Bearer token authentication');
      
      const response = await fetch(
        `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database`,
        { headers: cfHeaders }
      );
      
      console.log('[Databases] Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Databases] List error:', errorText);
        throw new Error(`Failed to list databases: ${response.status}`);
      }
      
      const data = await response.json() as { result: D1DatabaseInfo[]; success: boolean };
      
      // Enhance database info with size and table count if possible
      // Note: This requires querying each database individually which isn't possible
      // without dynamic bindings, so we'll return basic info for now
      
      return new Response(JSON.stringify({
        result: data.result,
        success: data.success
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Get database info
    if (request.method === 'GET' && url.pathname.match(/^\/api\/databases\/[^/]+\/info$/)) {
      const dbId = url.pathname.split('/')[3];
      console.log('[Databases] Getting database info:', dbId);
      
      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          result: {
            uuid: dbId,
            name: 'dev-database',
            version: 'production',
            created_at: new Date().toISOString(),
            file_size: 1024 * 1024,
            num_tables: 5
          },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const response = await fetch(
        `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}`,
        { headers: cfHeaders }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Databases] Info error:', errorText);
        throw new Error(`Failed to get database info: ${response.status}`);
      }
      
      const data = await response.json();
      
      return new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Create database
    if (request.method === 'POST' && url.pathname === '/api/databases') {
      const body = await request.json() as { name: string; location?: string };
      console.log('[Databases] Creating database:', body.name);
      
      // Mock response for local development
      if (isLocalDev) {
        console.log('[Databases] Simulating database creation for local development');
        return new Response(JSON.stringify({
          result: {
            uuid: `mock-${Date.now()}`,
            name: body.name,
            version: 'production',
            created_at: new Date().toISOString()
          },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const createBody: { name: string; primary_location_hint?: string } = {
        name: body.name
      };
      
      if (body.location) {
        createBody.primary_location_hint = body.location;
      }
      
      const response = await fetch(
        `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database`,
        {
          method: 'POST',
          headers: cfHeaders,
          body: JSON.stringify(createBody)
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Databases] Create error:', errorText);
        throw new Error(`Failed to create database: ${response.status}`);
      }
      
      const data = await response.json();
      
      return new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Delete database
    if (request.method === 'DELETE' && url.pathname.match(/^\/api\/databases\/[^/]+$/)) {
      const dbId = url.pathname.split('/')[3];
      console.log('[Databases] Deleting database:', dbId);
      
      // Mock response for local development
      if (isLocalDev) {
        console.log('[Databases] Simulating database deletion for local development');
        return new Response(JSON.stringify({
          result: {},
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const response = await fetch(
        `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}`,
        {
          method: 'DELETE',
          headers: cfHeaders
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Databases] Delete error:', errorText);
        throw new Error(`Failed to delete database: ${response.status}`);
      }
      
      const data = await response.json();
      
      return new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Export databases (bulk download)
    if (request.method === 'POST' && url.pathname === '/api/databases/export') {
      const body = await request.json() as { databaseIds: string[] };
      console.log('[Databases] Exporting databases:', body.databaseIds);
      
      // Mock response for local development
      if (isLocalDev) {
        console.log('[Databases] Simulating database export for local development');
        // Create mock SQL content for each database
        const mockExports: { [key: string]: string } = {};
        for (const dbId of body.databaseIds) {
          mockExports[dbId] = `-- Mock export for database ${dbId}\nCREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO users (id, name) VALUES (1, 'Test User');`;
        }
        
        return new Response(JSON.stringify({
          result: mockExports,
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Export each database using D1's export API
      const exports: { [key: string]: string } = {};
      
      for (const dbId of body.databaseIds) {
        try {
          // Start export with polling
          const startResponse = await fetch(
            `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}/export`,
            {
              method: 'POST',
              headers: cfHeaders,
              body: JSON.stringify({ output_format: 'polling' })
            }
          );
          
          if (!startResponse.ok) {
            console.error(`[Databases] Export start failed for ${dbId}:`, await startResponse.text());
            continue;
          }
          
          const startData = await startResponse.json() as { result: { at_bookmark: string } };
          const bookmark = startData.result.at_bookmark;
          
          // Poll for completion
          let signedUrl: string | null = null;
          let attempts = 0;
          const maxAttempts = 30;
          
          while (!signedUrl && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            
            const pollResponse = await fetch(
              `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}/export`,
              {
                method: 'POST',
                headers: cfHeaders,
                body: JSON.stringify({ current_bookmark: bookmark })
              }
            );
            
            if (pollResponse.ok) {
              const pollData = await pollResponse.json() as { result: { signed_url?: string } };
              if (pollData.result.signed_url) {
                signedUrl = pollData.result.signed_url;
              }
            }
            
            attempts++;
          }
          
          if (!signedUrl) {
            console.error(`[Databases] Export timeout for ${dbId}`);
            continue;
          }
          
          // Download the SQL file
          const downloadResponse = await fetch(signedUrl);
          if (downloadResponse.ok) {
            exports[dbId] = await downloadResponse.text();
          }
        } catch (err) {
          console.error(`[Databases] Export error for ${dbId}:`, err);
        }
      }
      
      return new Response(JSON.stringify({
        result: exports,
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Import database
    if (request.method === 'POST' && url.pathname === '/api/databases/import') {
      const body = await request.json() as {
        sqlContent: string;
        createNew?: boolean;
        databaseName?: string;
        targetDatabaseId?: string;
      };
      
      console.log('[Databases] Importing database:', {
        createNew: body.createNew,
        databaseName: body.databaseName,
        targetDatabaseId: body.targetDatabaseId
      });
      
      // Mock response for local development
      if (isLocalDev) {
        console.log('[Databases] Simulating database import for local development');
        if (body.createNew) {
          return new Response(JSON.stringify({
            result: {
              uuid: `mock-${Date.now()}`,
              name: body.databaseName,
              version: 'production',
              created_at: new Date().toISOString()
            },
            success: true
          }), {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        } else {
          return new Response(JSON.stringify({
            result: { imported: true },
            success: true
          }), {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
      }
      
      let targetDbId = body.targetDatabaseId;
      
      // Create new database if requested
      if (body.createNew && body.databaseName) {
        const createResponse = await fetch(
          `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database`,
          {
            method: 'POST',
            headers: cfHeaders,
            body: JSON.stringify({ name: body.databaseName })
          }
        );
        
        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          console.error('[Databases] Create error during import:', errorText);
          throw new Error(`Failed to create database: ${createResponse.status}`);
        }
        
        const createData = await createResponse.json() as { result: { uuid: string } };
        targetDbId = createData.result.uuid;
      }
      
      if (!targetDbId) {
        throw new Error('No target database specified');
      }
      
      // Import SQL content using D1's import API
      const importResponse = await fetch(
        `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${targetDbId}/import`,
        {
          method: 'POST',
          headers: cfHeaders,
          body: JSON.stringify({
            action: 'init',
            // Split SQL content into manageable chunks if needed
            sql: body.sqlContent
          })
        }
      );
      
      if (!importResponse.ok) {
        const errorText = await importResponse.text();
        console.error('[Databases] Import error:', errorText);
        throw new Error(`Failed to import database: ${importResponse.status}`);
      }
      
      const importData = await importResponse.json();
      
      return new Response(JSON.stringify({
        result: importData.result,
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Route not found
    return new Response(JSON.stringify({ 
      error: 'Route not found' 
    }), { 
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (err) {
    // Log full error details on server only
    console.error('[Databases] Error:', err);
    // Return generic error to client (security: don't expose stack traces)
    return new Response(JSON.stringify({ 
      error: 'Database operation failed',
      message: 'Unable to complete database operation. Please try again.'
    }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}

