import type { AccessPolicyInteraction, WithId } from '@medplum/core';
import type { Reference, Resource, ResourceType } from '@medplum/fhirtypes';
import type { SqlConnection } from '../sql/connection.js';
import type { SelectQuery } from '../sql/sql.js';

/**
 * Repository interface required by the shared SQL search implementation.
 */
export interface SqliteSearchRepo {
  getSqlConnection(): SqlConnection;
  addDeletedFilter(builder: SelectQuery): void;
  addSecurityFilters(builder: SelectQuery, resourceType: ResourceType, interaction: AccessPolicyInteraction): void;
  removeHiddenFields(resource: Resource): void;
  supportsInteraction(_interaction: AccessPolicyInteraction, _resourceType: ResourceType): boolean;
  supportsRangeSearch(): boolean;
  readReferences<T extends Resource>(references: readonly Reference<T>[]): Promise<(T | Error)[]>;
  readResource<T extends Resource>(resourceType: string, id: string): Promise<WithId<T>>;
}
