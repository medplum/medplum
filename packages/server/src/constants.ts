import { WithId } from '@medplum/core';
import { Project } from '@medplum/fhirtypes';

/**
 * The hardcoded ID for the base FHIR R4 Project.
 *
 * This is a UUIDv5 of the string "R4" in the NAMESPACE_DNS namespace.
 *
 *     r4ProjectId = v5('R4', nullUuid)
 */
export const r4ProjectId = '161452d9-43b7-5c29-aa7b-c85680fa45c6';

export const syntheticR4Project: WithId<Project> = {
  resourceType: 'Project',
  id: r4ProjectId,
  name: 'FHIR R4',
  exportedResourceType: ['StructureDefinition', 'ValueSet', 'CodeSystem', 'SearchParameter'],
};
