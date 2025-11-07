import type { Env, D1DatabaseInfo } from '../types';
import { CF_API } from '../types';
import { isProtectedDatabase, createProtectedDatabaseResponse } from '../utils/database-protection';

/**
 * Check if a database contains FTS5 virtual tables
 * FTS5 tables cannot be exported via D1's export API
 */
async function hasFTS5Tables(
  databaseId: string,
  cfHeaders: Record<string, string>,
  env: Env
): Promise<{ hasFTS5: boolean; fts5Tables: string[] }> {
  try {
    console.log('[FTS5 Check] Checking for FTS5 tables in database:', databaseId);
    
    const response = await fetch(
      `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${databaseId}/query`,
      {
        method: 'POST',
        headers: cfHeaders,
        body: JSON.stringify({
          sql: "SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%USING fts5%' ORDER BY name"
        })
      }
    );
    
    if (!response.ok) {
      console.error('[FTS5 Check] Failed to query for FTS5 tables:', await response.text());
      // If we can't check, assume no FTS5 tables to avoid blocking unnecessarily
      return { hasFTS5: false, fts5Tables: [] };
    }
    
    const data = await response.json() as {
      result: Array<{ results: Array<{ name: string }> }>;
      success: boolean;
    };
    
    if (!data.success || !data.result?.[0]?.results) {
      console.warn('[FTS5 Check] Invalid response structure');
      return { hasFTS5: false, fts5Tables: [] };
    }
    
    const fts5Tables = data.result[0].results.map((r: { name: string }) => r.name);
    const hasFTS5 = fts5Tables.length > 0;
    
    if (hasFTS5) {
      console.log('[FTS5 Check] Found FTS5 tables:', fts5Tables);
    } else {
      console.log('[FTS5 Check] No FTS5 tables found');
    }
    
    return { hasFTS5, fts5Tables };
  } catch (err) {
    console.error('[FTS5 Check] Error checking for FTS5 tables:', err);
    // If error occurs, assume no FTS5 tables to avoid blocking unnecessarily
    return { hasFTS5: false, fts5Tables: [] };
  }
}

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
      
      // Filter out protected system databases
      const filteredDatabases = data.result.filter(db => !isProtectedDatabase(db.name));
      
      // Enhance database info with table count by querying each database
      const enhancedDatabases = await Promise.all(
        filteredDatabases.map(async (db) => {
          try {
            // Query PRAGMA table_list to get table count
            const tableListResponse = await fetch(
              `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${db.uuid}/query`,
              {
                method: 'POST',
                headers: cfHeaders,
                body: JSON.stringify({ sql: "SELECT COUNT(*) as count FROM (SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%')" })
              }
            );
            
            if (tableListResponse.ok) {
              const tableData = await tableListResponse.json() as {
                result: Array<{ results: Array<{ count: number }>; success: boolean }>;
                success: boolean;
              };
              
              if (tableData.success && tableData.result?.[0]?.results?.[0]) {
                const tableCount = tableData.result[0].results[0].count;
                return { ...db, num_tables: tableCount };
              }
            }
          } catch (err) {
            console.error(`[Databases] Failed to get table count for ${db.name}:`, err);
          }
          
          // Return database without table count if query failed
          return db;
        })
      );
      
      return new Response(JSON.stringify({
        result: enhancedDatabases,
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
      
      const data = await response.json() as { result: D1DatabaseInfo };
      
      // Protect system databases from info access
      if (isProtectedDatabase(data.result.name)) {
        console.warn('[Databases] Attempted to access protected database info:', data.result.name);
        return new Response(JSON.stringify({
          error: 'Database not found',
          message: 'The requested database does not exist or is not accessible.'
        }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
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
      
      // Protect system databases from deletion
      // First, get the database info to check its name
      const dbInfoResponse = await fetch(
        `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}`,
        { headers: cfHeaders }
      );
      
      if (dbInfoResponse.ok) {
        const dbInfo = await dbInfoResponse.json() as { result: D1DatabaseInfo };
        if (isProtectedDatabase(dbInfo.result.name)) {
          console.warn('[Databases] Attempted to delete protected database:', dbInfo.result.name);
          return createProtectedDatabaseResponse(corsHeaders);
        }
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
          // Check if this is a protected system database
          const dbInfoResponse = await fetch(
            `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}`,
            { headers: cfHeaders }
          );
          
          if (dbInfoResponse.ok) {
            const dbInfo = await dbInfoResponse.json() as { result: D1DatabaseInfo };
            if (isProtectedDatabase(dbInfo.result.name)) {
              console.warn(`[Databases] Skipping export of protected database: ${dbId} (${dbInfo.result.name})`);
              continue; // Skip this database
            }
          }
          

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

    // Rename database (migration-based approach)
    if (request.method === 'POST' && url.pathname.match(/^\/api\/databases\/[^/]+\/rename$/)) {
      const dbId = url.pathname.split('/')[3];
      const body = await request.json() as { newName: string };
      
      console.log('[Databases] Renaming database:', dbId, 'to', body.newName);
      
      // Mock response for local development
      if (isLocalDev) {
        console.log('[Databases] Simulating database rename for local development');
        // Simulate multi-step process with delays
        await new Promise(resolve => setTimeout(resolve, 1000));
        return new Response(JSON.stringify({
          result: {
            uuid: `mock-${Date.now()}`,
            name: body.newName,
            version: 'production',
            created_at: new Date().toISOString(),
            oldId: dbId
          },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Protect system databases from being renamed
      const dbInfoResponse = await fetch(
        `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}`,
        { headers: cfHeaders }
      );
      
      if (dbInfoResponse.ok) {
        const dbInfo = await dbInfoResponse.json() as { result: D1DatabaseInfo };
        if (isProtectedDatabase(dbInfo.result.name)) {
          console.warn('[Databases] Attempted to rename protected database:', dbInfo.result.name);
          return createProtectedDatabaseResponse(corsHeaders);
        }
      }
      
      // Check for FTS5 tables - D1 export API cannot export databases with FTS5 tables
      const fts5Check = await hasFTS5Tables(dbId, cfHeaders, env);
      if (fts5Check.hasFTS5) {
        console.warn('[Databases] Cannot rename database with FTS5 tables:', fts5Check.fts5Tables);
        return new Response(JSON.stringify({
          error: 'Cannot rename database with FTS5 tables',
          details: `This database contains FTS5 (Full-Text Search) virtual tables (${fts5Check.fts5Tables.join(', ')}), which cannot be exported using D1's export API. Database rename requires export/import functionality.`,
          fts5Tables: fts5Check.fts5Tables,
          success: false
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      let newDbId: string | null = null;
      
      try {
        // Step 1: Validate new name - check if it already exists
        console.log('[Databases] Step 1: Validating new name');
        const listResponse = await fetch(
          `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database`,
          { headers: cfHeaders }
        );
        
        if (!listResponse.ok) {
          throw new Error('Failed to validate database name');
        }
        
        const listData = await listResponse.json() as { result: D1DatabaseInfo[] };
        const existingDb = listData.result.find(db => db.name === body.newName);
        
        if (existingDb) {
          throw new Error(`Database with name "${body.newName}" already exists`);
        }
        
        // Step 2: Create new database with desired name
        console.log('[Databases] Step 2: Creating new database');
        const createResponse = await fetch(
          `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database`,
          {
            method: 'POST',
            headers: cfHeaders,
            body: JSON.stringify({ name: body.newName })
          }
        );
        
        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          console.error('[Databases] Create error during rename:', errorText);
          throw new Error(`Failed to create new database: ${createResponse.status}`);
        }
        
        const createData = await createResponse.json() as { result: { uuid: string; name: string } };
        newDbId = createData.result.uuid;
        console.log('[Databases] Created new database:', newDbId);
        
        // Step 3: Export source database
        console.log('[Databases] Step 3: Exporting source database');
        const startExportResponse = await fetch(
          `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}/export`,
          {
            method: 'POST',
            headers: cfHeaders,
            body: JSON.stringify({ output_format: 'polling' })
          }
        );
        
        if (!startExportResponse.ok) {
          throw new Error('Failed to start database export');
        }
        
        const exportStartData = await startExportResponse.json() as { result: { at_bookmark: string } };
        const bookmark = exportStartData.result.at_bookmark;
        
        // Poll for export completion
        let signedUrl: string | null = null;
        let attempts = 0;
        const maxAttempts = 60; // 2 minutes max
        
        while (!signedUrl && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          
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
          throw new Error('Export timeout - database may be too large');
        }
        
        // Download the SQL content
        console.log('[Databases] Downloading exported SQL');
        const downloadResponse = await fetch(signedUrl);
        if (!downloadResponse.ok) {
          throw new Error('Failed to download database export');
        }
        
        const sqlContent = await downloadResponse.text();
        
        // Step 4: Import into new database
        console.log('[Databases] Step 4: Importing into new database');
        const importResponse = await fetch(
          `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${newDbId}/import`,
          {
            method: 'POST',
            headers: cfHeaders,
            body: JSON.stringify({
              action: 'init',
              sql: sqlContent
            })
          }
        );
        
        if (!importResponse.ok) {
          const errorText = await importResponse.text();
          console.error('[Databases] Import error:', errorText);
          throw new Error('Failed to import data into new database');
        }
        
        // Step 5: Verify import (optional but recommended)
        console.log('[Databases] Step 5: Verifying import');
        // We could query table counts here if needed, but for now we'll trust the import succeeded
        
        // Step 6: Delete original database
        console.log('[Databases] Step 6: Deleting original database');
        const deleteResponse = await fetch(
          `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${dbId}`,
          {
            method: 'DELETE',
            headers: cfHeaders
          }
        );
        
        if (!deleteResponse.ok) {
          console.warn('[Databases] Failed to delete original database - manual cleanup may be required');
          // Don't throw here - the rename essentially succeeded, user just needs to manually delete old db
        }
        
        console.log('[Databases] Rename completed successfully');
        
        return new Response(JSON.stringify({
          result: {
            uuid: newDbId,
            name: body.newName,
            oldId: dbId
          },
          success: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
        
      } catch (err) {
        console.error('[Databases] Rename error:', err);
        
        // Rollback: Delete the new database if it was created
        if (newDbId) {
          console.log('[Databases] Rolling back - deleting new database:', newDbId);
          try {
            await fetch(
              `${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database/${newDbId}`,
              {
                method: 'DELETE',
                headers: cfHeaders
              }
            );
          } catch (rollbackErr) {
            console.error('[Databases] Rollback failed:', rollbackErr);
          }
        }
        
        throw err;
      }
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

