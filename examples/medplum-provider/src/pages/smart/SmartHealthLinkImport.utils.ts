// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { convertToTransactionBundle, getDisplayString, getReferenceString, isResource } from '@medplum/core';
import type { Bundle, BundleEntry, CodeableConcept, Identifier, Patient, Resource } from '@medplum/fhirtypes';

/** A candidate local Patient returned by `Patient/$match` for the shared patient. */
export interface SmartHealthLinkPatientMatch {
  readonly patient: WithId<Patient>;
  readonly score?: number;
  readonly grade?: string;
}

const CONDITIONAL_CREATE_RESOURCE_TYPES = new Set([
  'AllergyIntolerance',
  'Condition',
  'DiagnosticReport',
  'DocumentReference',
  'Immunization',
  'MedicationRequest',
  'Observation',
  'Procedure',
]);

export function getSmartHealthLinkBundle(resources: unknown[]): Bundle | undefined {
  return resources.find((resource) => isResource<Bundle>(resource, 'Bundle'));
}

export function getSmartHealthCardFile(resources: unknown[]): { verifiableCredential: string[] } | undefined {
  return resources.find(isSmartHealthCardFile);
}

export function getSmartHealthLinkPatient(bundle: Bundle): Patient | undefined {
  return bundle.entry?.find((e) => isResource<Patient>(e.resource, 'Patient'))?.resource as Patient | undefined;
}

export function getSmartHealthLinkBundleEntryKey(entry: BundleEntry): string | undefined {
  return entry.fullUrl ?? (entry.resource ? getReferenceString(entry.resource) : undefined);
}

export function buildSmartHealthLinkImportBundle(
  bundle: Bundle,
  selectedKeys: Set<string>,
  sharedPatient: Patient,
  targetPatient: WithId<Patient>
): Bundle {
  const sharedPatientRefs = new Set<string>();
  if (sharedPatient.id) {
    sharedPatientRefs.add(`Patient/${sharedPatient.id}`);
  }
  const sharedPatientFullUrl = bundle.entry?.find((entry) => isResource<Patient>(entry.resource, 'Patient'))?.fullUrl;
  if (sharedPatientFullUrl) {
    sharedPatientRefs.add(sharedPatientFullUrl);
  }
  const targetPatientRef = `Patient/${targetPatient.id}`;
  const selectedBundle: Bundle = {
    resourceType: 'Bundle',
    type: 'collection',
    entry: bundle.entry
      ?.filter((entry) => {
        const resource = entry.resource;
        const key = getSmartHealthLinkBundleEntryKey(entry);
        return !!resource && !!key && selectedKeys.has(key) && resource.resourceType !== 'Patient';
      })
      .map((entry) => ({
        fullUrl: entry.fullUrl,
        resource: rewritePatientReference(entry.resource as Resource, sharedPatientRefs, targetPatientRef),
      })),
  };
  const transaction = convertToTransactionBundle(selectedBundle);
  for (const entry of transaction.entry ?? []) {
    if (entry.resource && entry.request) {
      entry.request.ifNoneExist = buildIfNoneExist(entry.resource, targetPatient);
    }
  }
  return transaction;
}

export function getMatchGrade(entry: BundleEntry<WithId<Patient>>): string | undefined {
  return entry.search?.extension?.find((ext) => ext.url.endsWith('/match-grade'))?.valueCode;
}

/**
 * Overrides for resource types whose patient-friendly label isn't just their camelCase-split name.
 * Everything else — Condition, Observation, CarePlan, … — is left to {@link getResourceTypeLabel}'s
 * fallback, which already produces the right words.
 */
const RESOURCE_TYPE_LABELS: Record<string, string> = {
  AllergyIntolerance: 'Allergy',
  Coverage: 'Insurance',
  DiagnosticReport: 'Report',
  DocumentReference: 'Document',
  Encounter: 'Visit',
  FamilyMemberHistory: 'Family History',
  MedicationDispense: 'Medication (dispensed)',
  MedicationRequest: 'Medication (prescribed)',
  MedicationStatement: 'Medication (reported)',
  Practitioner: 'Provider',
  ServiceRequest: 'Order',
};

/**
 * Returns a patient-friendly label for a FHIR resource type (e.g. `AllergyIntolerance` → "Allergy").
 * Unmapped types are humanized by inserting spaces at camelCase boundaries (`NutritionOrder` → "Nutrition Order").
 * @param resourceType - The raw FHIR resource type.
 * @returns The simplified display label.
 */
export function getResourceTypeLabel(resourceType: string): string {
  return RESOURCE_TYPE_LABELS[resourceType] ?? resourceType.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

/**
 * Orders bundle entries for the import table: grouped by patient-friendly type label, then by
 * display string within a type. A shared health summary is a few dozen records, so one stable
 * grouping reads better than letting the columns be re-sorted.
 * @param entries - The importable bundle entries.
 * @returns A new sorted array.
 */
export function sortImportableEntries(entries: BundleEntry[]): BundleEntry[] {
  return [...entries].sort((a, b) => {
    const typeA = a.resource ? getResourceTypeLabel(a.resource.resourceType) : '';
    const typeB = b.resource ? getResourceTypeLabel(b.resource.resourceType) : '';
    return typeA.localeCompare(typeB) || getEntryDisplay(a).localeCompare(getEntryDisplay(b));
  });
}

function getEntryDisplay(entry: BundleEntry): string {
  return entry.resource ? getDisplayString(entry.resource) : '';
}

/**
 * True when a sharing expiration has already passed. Records may still be importable — the
 * server is the authority on availability — so this only drives the inline notice.
 * @param expiresAt - The link's expiration, if it declared one.
 * @returns True when the expiration is in the past.
 */
export function isExpired(expiresAt: string | undefined): boolean {
  return !!expiresAt && new Date(expiresAt).getTime() <= Date.now();
}

/**
 * Label for the import button, which names the destination patient once one is chosen.
 * @param destination - The patient the records will be imported into, if already resolved.
 * @param createNewPatient - True when the destination patient will be created by the import.
 * @returns The button label.
 */
export function getImportButtonLabel(destination: Patient | undefined, createNewPatient: boolean): string {
  if (!destination) {
    return 'Import Records';
  }
  const name = getDisplayString(destination);
  return createNewPatient ? `Create ${name} & Import Records` : `Import Records to ${name}`;
}

/**
 * Uploads any inline attachment data found in the bundle's resources as `Binary` resources,
 * replacing the inline base64 `data` with the resulting `Binary` URL.
 *
 * SMART Health Link bundles embed documents inline as base64 `Attachment.data`. Browsers refuse to
 * render a `data:` URL PDF inside an iframe (and a download link needs a real URL), so imported
 * attachments don't display until they're stored the way Medplum normally stores them: as `Binary`
 * resources referenced by `Attachment.url`.
 * @param medplum - The Medplum client used to create the `Binary` resources.
 * @param bundle - The bundle whose resources' inline attachments should be externalized (mutated in place).
 */
export async function uploadInlineAttachments(medplum: MedplumClient, bundle: Bundle): Promise<void> {
  for (const entry of bundle.entry ?? []) {
    if (entry.resource) {
      await externalizeInlineAttachments(medplum, entry.resource);
    }
  }
}

async function externalizeInlineAttachments(medplum: MedplumClient, value: unknown): Promise<void> {
  if (!value || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      await externalizeInlineAttachments(medplum, item);
    }
    return;
  }
  const record = value as Record<string, unknown>;
  if (isInlineAttachment(record)) {
    const contentType = record.contentType as string;
    const uploaded = await medplum.createAttachment({
      data: await base64ToBlob(record.data as string, contentType),
      contentType,
      filename: typeof record.title === 'string' ? record.title : undefined,
    });
    delete record.data;
    record.url = uploaded.url;
    return;
  }
  for (const key of Object.keys(record)) {
    await externalizeInlineAttachments(medplum, record[key]);
  }
}

/**
 * Detects a FHIR `Attachment` carrying inline base64 data that hasn't been externalized.
 * Requires both `contentType` and `data` strings and no existing `url`, and rejects the look-alikes
 * that share those field names: `Binary` and any other resource (they carry `resourceType`),
 * `Signature` (has `who`/`when`) and `SampledData` (no `contentType`).
 * @param record - The object to inspect.
 * @returns True when the object is an inline attachment that should be uploaded.
 */
function isInlineAttachment(record: Record<string, unknown>): boolean {
  return (
    typeof record.data === 'string' &&
    record.data.length > 0 &&
    typeof record.contentType === 'string' &&
    typeof record.url !== 'string' &&
    !('resourceType' in record) &&
    !('who' in record) &&
    !('when' in record)
  );
}

/**
 * Reads inline base64 attachment data as a `Blob`, via the same `data:` URL encoding
 * `AttachmentDisplay` uses to render `Attachment.data`. A `Blob` is a `BinarySource`, so the
 * upload carries the decoded bytes; passing the base64 string would upload the base64 text.
 * @param base64 - The base64-encoded attachment data.
 * @param contentType - The attachment's content type.
 * @returns The attachment contents.
 */
async function base64ToBlob(base64: string, contentType: string): Promise<Blob> {
  const response = await fetch(`data:${contentType};base64,${base64}`);
  return response.blob();
}

function rewritePatientReference<T extends Resource>(
  resource: T,
  sharedPatientRefs: Set<string>,
  targetPatientRef: string
): T {
  return JSON.parse(
    JSON.stringify(resource, (key, value) => {
      if (key === 'reference' && sharedPatientRefs.has(value)) {
        return targetPatientRef;
      }
      return value;
    })
  ) as T;
}

function buildIfNoneExist(resource: Resource, targetPatient: WithId<Patient>): string | undefined {
  if (!CONDITIONAL_CREATE_RESOURCE_TYPES.has(resource.resourceType)) {
    return undefined;
  }

  const identifier = getIdentifierSearch(resource);
  if (identifier) {
    return identifier;
  }

  const typedResource = resource as Record<string, any>;
  const patientParam = getPatientSearchParam(resource.resourceType);
  const tokenParam = getTokenSearchParam(resource.resourceType);
  const token = getTokenSearchValue(typedResource.code ?? typedResource.type ?? typedResource.vaccineCode);
  if (!patientParam || !tokenParam || !token) {
    return undefined;
  }

  const params = [`${patientParam}=Patient/${targetPatient.id}`, `${tokenParam}=${token}`];
  const date = getResourceDate(resource);
  if (date) {
    params.push(`date=${date}`);
  }
  return params.join('&');
}

function getIdentifierSearch(resource: Resource): string | undefined {
  const identifiers = (resource as Resource & { identifier?: Identifier[] }).identifier;
  const identifier = identifiers?.find((id) => id.value);
  if (!identifier?.value) {
    return undefined;
  }
  return `identifier=${identifier.system ? `${identifier.system}|` : ''}${identifier.value}`;
}

function getPatientSearchParam(resourceType: string): string | undefined {
  switch (resourceType) {
    case 'Condition':
    case 'DiagnosticReport':
    case 'DocumentReference':
    case 'Observation':
    case 'Procedure':
      return 'subject';
    // AllergyIntolerance and Immunization use `patient` (they have no `subject` search parameter).
    case 'AllergyIntolerance':
    case 'Immunization':
    case 'MedicationRequest':
      return 'patient';
    default:
      return undefined;
  }
}

function getTokenSearchParam(resourceType: string): string | undefined {
  switch (resourceType) {
    case 'DocumentReference':
      return 'type';
    case 'Immunization':
      return 'vaccine-code';
    case 'AllergyIntolerance':
    case 'Condition':
    case 'DiagnosticReport':
    case 'MedicationRequest':
    case 'Observation':
    case 'Procedure':
      return 'code';
    default:
      return undefined;
  }
}

function getResourceDate(resource: Resource): string | undefined {
  const typedResource = resource as Record<string, any>;
  const date =
    typedResource.effectiveDateTime ??
    typedResource.issued ??
    typedResource.recordedDate ??
    typedResource.onsetDateTime ??
    typedResource.occurrenceDateTime ??
    typedResource.authoredOn ??
    typedResource.date;
  return typeof date === 'string' ? date.substring(0, 10) : undefined;
}

function getTokenSearchValue(input: CodeableConcept | undefined): string | undefined {
  const coding = input?.coding?.find((c) => c.code);
  if (!coding?.code) {
    return undefined;
  }
  return coding.system ? `${coding.system}|${coding.code}` : coding.code;
}

function isSmartHealthCardFile(input: unknown): input is { verifiableCredential: string[] } {
  const verifiableCredential = (input as { verifiableCredential?: unknown } | undefined)?.verifiableCredential;
  return (
    Array.isArray(verifiableCredential) && verifiableCredential.some((credential) => typeof credential === 'string')
  );
}
