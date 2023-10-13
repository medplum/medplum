import { FhircastEventContext, FhircastResourceType } from '.';

const FHIRCAST_RESOURCE_TYPES = {
  patient: 'Patient',
  imagingstudy: 'ImagingStudy',
  encounter: 'Encounter',
} as const;

export function createFhircastMessageContext(
  resourceType: Lowercase<FhircastResourceType>,
  resourceId: string
): FhircastEventContext {
  if (!FHIRCAST_RESOURCE_TYPES[resourceType]) {
    throw new TypeError(`resourceType must be one of: ${Object.keys(FHIRCAST_RESOURCE_TYPES).join(', ')}`);
  }
  if (!(resourceId && typeof resourceId === 'string')) {
    throw new TypeError('Must provide a resourceId!');
  }
  return {
    key: resourceType === 'imagingstudy' ? 'study' : resourceType,
    resource: {
      resourceType: FHIRCAST_RESOURCE_TYPES[resourceType],
      id: resourceId,
    },
  };
}
