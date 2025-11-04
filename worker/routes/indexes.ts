import type { Env } from '../types';
import { analyzeIndexes } from '../utils/index-analyzer';

/**
 * Handle Index Analyzer routes
 */
export async function handleIndexRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean
): Promise<Response> {
  console.log('[Indexes] Handling index analyzer operation');
  
  // Extract database ID from URL (format: /api/indexes/:dbId/...)
  const pathParts = url.pathname.split('/');
  const dbId = pathParts[3];
  
  if (!dbId) {
    return new Response(JSON.stringify({ 
      error: 'Database ID required' 
    }), { 
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }

  try {
    // Analyze indexes
    if (request.method === 'GET' && url.pathname === `/api/indexes/${dbId}/analyze`) {
      console.log('[Indexes] Analyzing indexes for database:', dbId);
      
      // Mock response for local development
      if (isLocalDev) {
        return new Response(JSON.stringify({
          recommendations: [
            {
              tableName: 'users',
              columnName: 'email',
              indexType: 'single',
              priority: 'high',
              rationale: 'Used in WHERE clause 5 times in recent queries. High filter frequency indicates strong indexing candidate.',
              estimatedImpact: 'High - Will significantly speed up filtered queries',
              suggestedSQL: 'CREATE INDEX idx_users_email ON users(email);',
            },
            {
              tableName: 'posts',
              columnName: 'user_id',
              indexType: 'single',
              priority: 'high',
              rationale: 'Foreign key column referencing users.id. Indexes on foreign keys significantly improve JOIN performance.',
              estimatedImpact: 'High - Foreign key lookups will be much faster, especially for JOINs',
              suggestedSQL: 'CREATE INDEX idx_posts_user_id ON posts(user_id);',
            },
            {
              tableName: 'users',
              columnName: 'created_at',
              indexType: 'single',
              priority: 'medium',
              rationale: 'Used in ORDER BY clause 3 times. Indexes can avoid full table sorts.',
              estimatedImpact: 'Medium - Speeds up sorted result retrieval',
              suggestedSQL: 'CREATE INDEX idx_users_created_at ON users(created_at);',
            },
            {
              tableName: 'comments',
              columnName: 'post_id',
              indexType: 'single',
              priority: 'high',
              rationale: 'Foreign key column referencing posts.id. Indexes on foreign keys significantly improve JOIN performance.',
              estimatedImpact: 'High - Foreign key lookups will be much faster, especially for JOINs',
              suggestedSQL: 'CREATE INDEX idx_comments_post_id ON comments(post_id);',
            },
          ],
          existingIndexes: [
            {
              tableName: 'users',
              indexes: [
                { name: 'sqlite_autoindex_users_1', columns: ['id'], unique: true },
              ],
            },
            {
              tableName: 'posts',
              indexes: [
                { name: 'sqlite_autoindex_posts_1', columns: ['id'], unique: true },
              ],
            },
            {
              tableName: 'comments',
              indexes: [
                { name: 'sqlite_autoindex_comments_1', columns: ['id'], unique: true },
              ],
            },
          ],
          statistics: {
            totalRecommendations: 4,
            tablesWithoutIndexes: 0,
            averageQueryEfficiency: 0.65,
          },
          success: true,
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Perform actual analysis
      const analysis = await analyzeIndexes(dbId, env, isLocalDev);
      
      return new Response(JSON.stringify({
        ...analysis,
        success: true,
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

  } catch (error) {
    console.error('[Indexes] Error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to analyze indexes',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}

