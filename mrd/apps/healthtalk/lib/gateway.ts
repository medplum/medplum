/**
 * Gateway utilities for HealthTalk
 * 
 * Re-exports from MEDrecord (the overarching brand) where the
 * shared Gateway integration lives.
 * 
 * All brands use the same Gateway authentication.
 */

export {
  verifyGatewayAuth,
  GatewayAuthError,
  type GatewayAuthResponse,
  type GatewayAuthContext,
} from '../../medrecord/lib/gateway';
