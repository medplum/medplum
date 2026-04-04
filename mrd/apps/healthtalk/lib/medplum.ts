/**
 * Medplum client utilities for HealthTalk
 * 
 * Re-exports from MEDrecord (the overarching brand) where the
 * shared Medplum client factory lives.
 * 
 * All brands use the same tenant-scoped Medplum client.
 */

export {
  getMedplumClient,
  getMedplumClientFromAuth,
  type TenantMedplumClient,
} from '../../medrecord/lib/medplum';
