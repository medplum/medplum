/**
 * Gateway Integration for HealthTalk
 * 
 * All authentication and tenant resolution flows through the Gateway.
 * This is the single source of truth for auth context.
 * 
 * Gateway URL: https://auth-test-b2c.healthtalk.ai
 */

export interface GatewayAuthContext {
  user_id: string;
  email: string;
  tenant_id: string;           // Medplum Project ID
  organization_id?: string;    // Optional: department within tenant
  brand: 'healthtalk' | 'coachi' | 'medsafe' | 'medrecord';
  roles: string[];
}

export interface GatewayError {
  code: string;
  message: string;
}

const GATEWAY_URL = process.env.GATEWAY_URL || 'https://auth-test-b2c.healthtalk.ai';

/**
 * Verify authentication via Gateway
 * 
 * MUST be called at the start of every API route.
 * Never authenticate directly with Medplum - always go through Gateway.
 * 
 * @param request - Incoming request with Authorization header
 * @returns GatewayAuthContext with tenant_id, brand, and user info
 * @throws Error if authentication fails
 */
export async function verifyGatewayAuth(request: Request): Promise<GatewayAuthContext> {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader) {
    throw new GatewayAuthError('MISSING_AUTH', 'Authorization header required');
  }

  const response = await fetch(`${GATEWAY_URL}/auth/verify`, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Authentication failed' }));
    throw new GatewayAuthError('AUTH_FAILED', error.message || 'Authentication failed');
  }

  const data = await response.json();
  
  if (!data.auth?.tenant_id) {
    throw new GatewayAuthError('INVALID_RESPONSE', 'Gateway response missing tenant_id');
  }

  return {
    user_id: data.auth.user_id,
    email: data.auth.email,
    tenant_id: data.auth.tenant_id,
    organization_id: data.auth.organization_id,
    brand: data.auth.brand,
    roles: data.auth.roles || [],
  };
}

/**
 * Custom error class for Gateway authentication errors
 */
export class GatewayAuthError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'GatewayAuthError';
  }
}

/**
 * Helper to check if user has a specific role
 */
export function hasRole(auth: GatewayAuthContext, role: string): boolean {
  return auth.roles.includes(role);
}

/**
 * Helper to check if user is admin
 */
export function isAdmin(auth: GatewayAuthContext): boolean {
  return hasRole(auth, 'admin');
}

/**
 * Helper to check if user is practitioner
 */
export function isPractitioner(auth: GatewayAuthContext): boolean {
  return hasRole(auth, 'practitioner');
}
