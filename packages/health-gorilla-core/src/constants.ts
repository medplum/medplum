import { HTTP_HL7_ORG } from '@medplum/core';

export const MEDPLUM_HEALTH_GORILLA_TENANT_PROFILE =
  'https://medplum.com/profiles/integrations/health-gorilla/StructureDefinition/MedplumHealthGorillaTenant';
export const MEDPLUM_HEALTH_GORILLA_LAB_ORDER_PROFILE =
  'https://medplum.com/profiles/integrations/health-gorilla/StructureDefinition/MedplumHealthGorillaOrder';

export const MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_BILL_TO = 'billTo';
export const MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_PERFORMING_LAB_AN = 'performingLabAccountNumber';

export const HEALTH_GORILLA_SYSTEM = 'https://www.healthgorilla.com';

export const NPI_SYSTEM = HTTP_HL7_ORG + '/fhir/sid/us-npi';
