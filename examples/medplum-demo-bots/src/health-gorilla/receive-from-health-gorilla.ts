import {
  allOk,
  BotEvent,
  convertContainedResourcesToBundle,
  getIdentifier,
  getReferenceString,
  MedplumClient,
  normalizeErrorString,
} from '@medplum/core';
import {
  Account,
  Bundle,
  BundleEntryRequest,
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

/**
 * Main entry point for the Health Gorilla webhook bot.
 *
 * This bot receives a Health Gorilla resource and syncs it to Medplum.
 *
 * Health Gorilla uses "contained resources" to represent related resources.
 *
 * In Medplum, we recommend that you use references instead of contained resources,
 * which is often better for data quality and analytics.
 *
 * The majority of this bot is dedicated to rewriting references from Health Gorilla.
 *
 * @param medplum The Medplum client.
 * @param event The Bot execution event with a Health Gorilla resource.
 * @returns Returns OK OperationOutcome on success, or an error OperationOutcome on failure.
 */
export async function handler(
  medplum: MedplumClient,
  event: BotEvent<HealthGorillaResource>
): Promise<OperationOutcome> {
  const resource = event.input;

  // Move the Health Gorilla resource ID to an identifier
  if (resource.id) {
    const identifiers = resource.identifier ?? [];
    identifiers.push({ system: HEALTH_GORILLA_SYSTEM, value: resource.id });
    resource.identifier = identifiers;
  }

  // Convert the Health Gorilla resource to a Medplum bundle.
  // This moves contained resources to separate create/update operations.
  const healthGorillaBundle = convertContainedResourcesToBundle(resource) as Bundle<HealthGorillaResource>;

  // Touch up the bundle before executing
  // This adds identifiers and ifNoneExist to the bundle entries
  touchUpBundle(healthGorillaBundle);

  try {
    // Rewrite references to other resources
    // For example, convert references to Patient and Organization resources
    // from Health Gorilla references to Medplum references
    await rewriteReferences(medplum, healthGorillaBundle);

    // Execute the bundle
    const result = await medplum.executeBatch(healthGorillaBundle);
    for (const entry of result.entry ?? []) {
      if (entry.response) {
        console.log(entry.response.status, entry.response.location);
      }
    }
  } catch (err) {
    console.log(normalizeErrorString(err));
  }

  return allOk;
}

/**
 * Touches up the bundle before executing.
 *
 * As part of the conversion from Health Gorilla to Medplum, we need to add identifiers to the resources,
 * so that we can connect/reuse resources that already exist in Medplum.
 *
 * We also take advantage of the "ifNoneExist" feature of FHIR to avoid creating duplicate resources.
 *
 * @param bundle The Health Gorilla bundle.
 */
function touchUpBundle(bundle: Bundle<HealthGorillaResource>): void {
  for (const entry of bundle.entry ?? []) {
    const resource = entry.resource as HealthGorillaResource;
    const request = entry.request as BundleEntryRequest;

    if (resource.resourceType === 'Account') {
      // In Health Gorilla, Account connects a Patient and a payment method
      // So we use the combination of those references as the Account identifier
      const identifier = resource.guarantor?.[0]?.party?.reference + '-' + resource?.type?.coding?.[0]?.code;
      if (!resource.identifier) {
        resource.identifier = [];
      }
      resource.identifier.push({ system: HEALTH_GORILLA_SYSTEM, value: identifier });
      request.ifNoneExist = 'identifier=' + identifier;
    }

    if (resource.resourceType === 'PractitionerRole') {
      // In Health Gorilla, PractitionerRole connects a Practitioner and an Organization
      // So we use the combination of those references as the PractitionerRole identifier
      const identifier = resource.practitioner?.reference + '-' + resource.organization?.reference;
      if (!resource.identifier) {
        resource.identifier = [];
      }
      resource.identifier.push({ system: HEALTH_GORILLA_SYSTEM, value: identifier });
      request.ifNoneExist = 'identifier=' + identifier;
    }

    if (resource.resourceType === 'RequestGroup' || resource.resourceType === 'DiagnosticReport') {
      const identifier = getIdentifier(resource, HEALTH_GORILLA_SYSTEM);
      if (identifier) {
        request.ifNoneExist = 'identifier=' + identifier;
      }
    }

    if (resource.resourceType === 'ServiceRequest') {
      // The ServiceRequest identifier is the requisition and the code
      const requisition = resource.requisition?.value;
      const code = resource.code?.coding?.[0]?.code;
      const identifier = requisition + '-' + code;
      if (!resource.identifier) {
        resource.identifier = [];
      }
      resource.identifier.push({ system: HEALTH_GORILLA_SYSTEM, value: identifier });
      request.ifNoneExist = 'identifier=' + identifier;
    }
  }
}

/**
 * Rewrites Health Gorilla references to Medplum references.
 *
 * @param medplum The Medplum client.
 * @param value An unknown value.
 */
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

/**
 * Tries to find a Medplum resource by Health Gorilla ID.
 *
 * In most cases, this is a matter of search by "identifier" rather than "id".
 *
 * There are some special cases where "identifier" is not available.
 *
 * @param medplum The Medplum client.
 * @param resourceType The FHIR resource type.
 * @param id The Health Gorilla resource ID.
 * @returns The Medplum resource, or undefined if not found.
 */
async function searchByHealthGorillaId(
  medplum: MedplumClient,
  resourceType: HealthGorillaResourceType,
  id: string
): Promise<HealthGorillaResource | undefined> {
  if (resourceType === 'ServiceRequest') {
    // Special case for ServiceRequest - search by requisition instead of identifier
    // Because Health Gorilla does not include the identifier
    const requisition = id.split('-')[0];
    return medplum.searchOne(resourceType, { requisition });
  }

  // Default case - search by identifier
  return medplum.searchOne(resourceType, { identifier: `${HEALTH_GORILLA_SYSTEM}|${id}` });
}
