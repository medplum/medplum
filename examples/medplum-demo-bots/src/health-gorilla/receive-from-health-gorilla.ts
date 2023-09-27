import {
  allOk,
  BotEvent,
  convertContainedResourcesToBundle,
  getReferenceString,
  MedplumClient,
  normalizeErrorString,
} from '@medplum/core';
import {
  Account,
  Bundle,
  BundleEntry,
  DiagnosticReport,
  Media,
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
  await createJsonMedia(medplum, event.input, 'original.json');

  try {
    await syncBundle(medplum, convertContainedResourcesToBundle(event.input) as Bundle<HealthGorillaResource>);
  } catch (err) {
    console.log(normalizeErrorString(err));
  }

  return allOk;
}

export async function syncBundle(
  medplum: MedplumClient,
  healthGorillaBundle: Bundle<HealthGorillaResource>
): Promise<void> {
  for (const entry of healthGorillaBundle.entry ?? []) {
    touchUpBundleEntry(entry);
  }

  // Rewrite references to other resources
  // For example, convert references to Patient and Organization resources
  // from Health Gorilla references to Medplum references
  await rewriteReferences(medplum, healthGorillaBundle);

  await createJsonMedia(medplum, healthGorillaBundle, 'batch.json');

  // Execute the bundle
  const result = await medplum.executeBatch(healthGorillaBundle);
  for (const entry of result.entry ?? []) {
    if (entry.response) {
      console.log(entry.response.status, entry.response.location);
    }
  }
}

async function createJsonMedia(medplum: MedplumClient, json: any, filename: string): Promise<void> {
  // Save the bundle as an Attachment on a Media resource
  const bundleString = JSON.stringify(json, null, 2);
  const attachment = await medplum.createAttachment(bundleString, filename, 'application/json');
  const media = await medplum.createResource<Media>({
    resourceType: 'Media',
    status: 'completed',
    issued: new Date().toISOString(),
    content: attachment,
  });
  console.log('Created Media', media.id);
}

function touchUpBundleEntry(bundleEntry: BundleEntry<HealthGorillaResource>): void {
  const resource = bundleEntry.resource;
  if (resource?.resourceType === 'Account' && !resource.status) {
    // Health Gorilla drops Account.status which is a required field
    resource.status = 'active';
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

async function searchByHealthGorillaId(
  medplum: MedplumClient,
  resourceType: HealthGorillaResourceType,
  id: string
): Promise<HealthGorillaResource | undefined> {
  return medplum.searchOne(resourceType, { identifier: `${HEALTH_GORILLA_SYSTEM}|${id}` });
}
