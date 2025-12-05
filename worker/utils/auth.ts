import type { Env } from '../types';
import { logInfo, logWarning } from './error-logger';

// JWT validation for Cloudflare Access
export async function validateAccessJWT(request: Request, env: Env): Promise<string | null> {
  const token = request.headers.get('cf-access-jwt-assertion');
  
  if (!token) {
    logInfo('No JWT token found in request headers', {
      module: 'auth',
      operation: 'validate_jwt'
    });
    return null;
  }

  try {
    // Import jose dynamically for JWT verification
    const { jwtVerify, createRemoteJWKSet } = await import('jose');
    
    const JWKS = createRemoteJWKSet(new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`));
    
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: env.TEAM_DOMAIN,
      audience: env.POLICY_AUD,
    });

    // Extract email from JWT payload
    const email = payload['email'] as string;
    if (!email) {
      logWarning('JWT payload missing email', {
        module: 'auth',
        operation: 'validate_jwt'
      });
      return null;
    }
    
    logInfo(`JWT validated for user: ${email}`, {
      module: 'auth',
      operation: 'validate_jwt',
      userId: email
    });
    return email;
  } catch (error) {
    logWarning(`JWT validation failed: ${error instanceof Error ? error.message : String(error)}`, {
      module: 'auth',
      operation: 'validate_jwt',
      metadata: { error: error instanceof Error ? error.message : String(error) }
    });
    return null;
  }
}

