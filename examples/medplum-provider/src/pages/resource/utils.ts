import { ResourceType } from '@medplum/fhirtypes';

export const RESOURCE_PROFILE_URLS: Partial<Record<ResourceType, string>> = {
  Patient: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient',
  ServiceRequest: 'http://medplum.com/StructureDefinition/medplum-provider-lab-procedure-servicerequest',
  Device: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-implantable-device',
};
