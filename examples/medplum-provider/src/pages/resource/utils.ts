import { ResourceType } from '@medplum/fhirtypes';

export const RESOURCE_PROFILE_URLS: Partial<Record<ResourceType, string>> = {
  ServiceRequest: 'http://medplum.com/StructureDefinition/medplum-provider-lab-procedure-servicerequestX',
};
