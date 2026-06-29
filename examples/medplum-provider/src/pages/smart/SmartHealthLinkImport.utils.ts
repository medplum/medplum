// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { convertToTransactionBundle, getReferenceString, isResource } from '@medplum/core';
import type { Bundle, BundleEntry, CodeableConcept, Identifier, Patient, Resource } from '@medplum/fhirtypes';

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
    case 'AllergyIntolerance':
    case 'Condition':
    case 'DiagnosticReport':
    case 'DocumentReference':
    case 'Observation':
    case 'Procedure':
      return 'subject';
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
