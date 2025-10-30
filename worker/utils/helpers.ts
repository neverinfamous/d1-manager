import type { Env } from '../types';

/**
 * Get database size using D1 PRAGMA
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getDatabaseSize(_databaseId: string, _env: Env): Promise<number> {
  // For now, return 0 - will be implemented when we have dynamic database bindings
  // In production, this would query the specific D1 database
  return 0;
}

/**
 * Validate SQL query to prevent dangerous operations without confirmation
 */
export function validateQuery(query: string): { valid: boolean; warning?: string } {
  const upperQuery = query.trim().toUpperCase();
  
  // Check for DROP without confirmation
  if (upperQuery.startsWith('DROP ')) {
    return { valid: false, warning: 'DROP operations require explicit confirmation' };
  }
  
  // Check for DELETE/UPDATE without WHERE clause
  if (upperQuery.startsWith('DELETE ') || upperQuery.startsWith('UPDATE ')) {
    if (!upperQuery.includes(' WHERE ')) {
      return { 
        valid: false, 
        warning: 'DELETE/UPDATE without WHERE clause requires explicit confirmation' 
      };
    }
  }
  
  return { valid: true };
}

/**
 * Sanitize table/column names to prevent SQL injection
 */
export function sanitizeIdentifier(identifier: string): string {
  // Remove any non-alphanumeric characters except underscore
  return identifier.replace(/[^a-zA-Z0-9_]/g, '');
}

/**
 * Parse D1 error messages
 */
export function parseD1Error(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

