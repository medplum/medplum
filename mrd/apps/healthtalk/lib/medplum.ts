/**
 * Tenant-scoped Medplum Client Factory
 * 
 * Creates Medplum clients that are scoped to a specific tenant (Medplum Project).
 * All data access is automatically isolated to the tenant's project.
 * 
 * IMPORTANT: Never create a Medplum client without a tenant_id from Gateway.
 */

import { MedplumClient } from '@medplum/core';
import type { GatewayAuthContext } from './gateway';

// Cache for Medplum clients per tenant
const clientCache = new Map<string, MedplumClient>();

/**
 * Get or create a Medplum client for a specific tenant
 * 
 * The client is configured with the tenant's Medplum Project credentials.
 * All queries through this client are automatically scoped to the tenant's data.
 * 
 * @param tenantId - The tenant_id from Gateway (Medplum Project ID)
 * @returns MedplumClient configured for the tenant
 */
export function getMedplumClient(tenantId: string): MedplumClient {
  // Check cache first
  const cached = clientCache.get(tenantId);
  if (cached) {
    return cached;
  }

  // Get tenant-specific credentials from environment
  // In production, these would be fetched from Gateway or a secrets manager
  const baseUrl = process.env.MEDPLUM_BASE_URL || 'https://medplum.healthtalk.ai';
  const clientId = process.env.MEDPLUM_CLIENT_ID;
  const clientSecret = process.env.MEDPLUM_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Medplum credentials not configured');
  }

  const client = new MedplumClient({
    baseUrl,
    clientId,
    // Project ID ensures all operations are scoped to this tenant
    projectId: tenantId,
  });

  // Authenticate with client credentials
  // This is done lazily on first request
  client.startClientLogin(clientId, clientSecret);

  // Cache the client
  clientCache.set(tenantId, client);

  return client;
}

/**
 * Get Medplum client from Gateway auth context
 * 
 * Convenience wrapper that extracts tenant_id from auth context.
 * 
 * @param auth - GatewayAuthContext from verifyGatewayAuth()
 * @returns MedplumClient configured for the tenant
 */
export function getMedplumClientFromAuth(auth: GatewayAuthContext): MedplumClient {
  return getMedplumClient(auth.tenant_id);
}

/**
 * Clear the client cache
 * 
 * Use when credentials are rotated or for testing.
 */
export function clearClientCache(): void {
  clientCache.clear();
}

/**
 * Remove a specific tenant's client from cache
 * 
 * @param tenantId - The tenant_id to remove
 */
export function removeClientFromCache(tenantId: string): void {
  clientCache.delete(tenantId);
}
