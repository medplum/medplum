import { allOk, BotEvent, getIdentifier, getReferenceString, MedplumClient, normalizeErrorString } from '@medplum/core';
import {
  Account,
  DiagnosticReport,
  Observation,
  OperationOutcome,
  Patient,
  Practitioner,
  PractitionerRole,
  RequestGroup,
  ServiceRequest,
} from '@medplum/fhirtypes';

type HealthGorillaResource =
  | Account
  | DiagnosticReport
  | Observation
  | Patient
  | Practitioner
  | PractitionerRole
  | RequestGroup
  | ServiceRequest;

type HealthGorillaResourceType = HealthGorillaResource['resourceType'];

const HEALTH_GORILLA_SYSTEM = 'https://www.healthgorilla.com';

const referenceMap = new Map<string, string>();

export async function handler(
  medplum: MedplumClient,
  event: BotEvent<HealthGorillaResource>
): Promise<OperationOutcome> {
  try {
    const resource = event.input;

    if (resource.contained) {
      for (const containedResource of resource.contained) {
        await syncResource(medplum, containedResource as HealthGorillaResource, true);
      }

      // Remove contained resources before syncing the parent resource
      resource.contained = undefined;
    }

    await syncResource(medplum, resource);
  } catch (err) {
    console.log(normalizeErrorString(err));
  }

  return allOk;
}

export async function syncResource<T extends HealthGorillaResource>(
  medplum: MedplumClient,
  healthGorillaResource: T,
  contained = false
): Promise<void> {
  if (healthGorillaResource.resourceType === 'Account' && !healthGorillaResource.status) {
    // Health Gorilla drops Account.status which is a required field
    healthGorillaResource.status = 'active';
  }

  // Rewrite references to other resources
  // For example, convert references to Patient and Organization resources
  // from Health Gorilla references to Medplum references
  await rewriteReferences(medplum, healthGorillaResource);

  let existingResource: HealthGorillaResource | undefined = undefined;
  let healthGorillaId: string | undefined = undefined;

  const mergeResourceTypes: HealthGorillaResourceType[] = ['Account'];
  if (mergeResourceTypes.includes(healthGorillaResource.resourceType)) {
    // For some resource types, we attempt a "merge" operation with existing resources.
    // For other resource types, we always create a new resource.
    healthGorillaId = getHealthGorillaId(healthGorillaResource, contained) as string;
    existingResource = await searchByHealthGorillaId(medplum, healthGorillaResource.resourceType, healthGorillaId);
  }

  if (existingResource) {
    // Update the existing resource
    const updatedResource = await medplum.updateResource({
      ...healthGorillaResource,
      id: existingResource.id,
      identifier: existingResource.identifier,
    });
    console.log('Updated', updatedResource.resourceType, updatedResource.id);
    if (healthGorillaResource.id) {
      referenceMap.set('#' + healthGorillaResource.id, getReferenceString(updatedResource));
    }
  } else {
    // Create a new resource
    const createdResource = await medplum.createResource({
      ...healthGorillaResource,
      id: undefined,
      identifier: [{ system: HEALTH_GORILLA_SYSTEM, value: healthGorillaId }],
    });
    console.log('Created', createdResource.resourceType, createdResource.id);
    if (healthGorillaResource.id) {
      referenceMap.set('#' + healthGorillaResource.id, getReferenceString(createdResource));
    }
  }
}

async function rewriteReferences(medplum: MedplumClient, value: unknown): Promise<void> {
  if (!value) {
    return;
  }
  if (Array.isArray(value)) {
    await rewriteReferencesInArray(medplum, value);
  } else if (typeof value === 'object') {
    await rewriteReferencesInObject(medplum, value as Record<string, unknown>);
  }
}

async function rewriteReferencesInArray(medplum: MedplumClient, array: unknown[]): Promise<void> {
  for (const entry of array) {
    await rewriteReferences(medplum, entry);
  }
}

async function rewriteReferencesInObject(medplum: MedplumClient, obj: Record<string, unknown>): Promise<void> {
  if ('reference' in obj && typeof obj.reference === 'string') {
    // Rewrite the reference
    const reference = obj.reference;
    if (referenceMap.has(reference)) {
      obj.reference = referenceMap.get(reference);
      console.log('Rewrite', reference, '->', obj.reference);
    } else if (reference.includes('/')) {
      const [resourceType, id] = reference.split('/');
      const resource = await searchByHealthGorillaId(medplum, resourceType as HealthGorillaResourceType, id);
      if (resource) {
        referenceMap.set(reference, getReferenceString(resource));
        obj.reference = getReferenceString(resource);
        console.log('Rewrite', getReferenceString(resource), '->', obj.reference);
      } else {
        console.log('WARNING: Could not find reference', reference);
      }
    }
    return;
  }
  // Recursively rewrite the object
  for (const child of Object.values(obj)) {
    await rewriteReferences(medplum, child);
  }
}

function getHealthGorillaId(resource: HealthGorillaResource, contained: boolean): string | undefined {
  if (!contained && resource.id) {
    return resource.id;
  }
  return getIdentifier(resource, HEALTH_GORILLA_SYSTEM);
}

async function searchByHealthGorillaId(
  medplum: MedplumClient,
  resourceType: HealthGorillaResourceType,
  id: string
): Promise<HealthGorillaResource | undefined> {
  return medplum.searchOne(resourceType, { identifier: id });
}
