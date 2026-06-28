// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { convertToTransactionBundle, getDisplayString } from '@medplum/core';
import type { Bundle, BundleEntry, CodeableConcept, Identifier, Patient, Resource } from '@medplum/fhirtypes';

export interface SmartHealthLinkResourceItem {
  readonly key: string;
  readonly fullUrl?: string;
  readonly resource: Resource;
  readonly defaultSelected: boolean;
}

export interface SmartHealthLinkMatch {
  readonly patient: WithId<Patient>;
  readonly score?: number;
  readonly grade?: string;
}

const DEFAULT_SELECTED_RESOURCE_TYPES = new Set([
  'AllergyIntolerance',
  'Condition',
  'DocumentReference',
  'Immunization',
  'MedicationRequest',
  'Observation',
  'DiagnosticReport',
]);

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

export function getSmartHealthLinkBundle(resources: Resource[]): Bundle | undefined {
  return resources.find((resource): resource is Bundle => resource.resourceType === 'Bundle');
}

export function getSmartHealthLinkPatient(bundle: Bundle): Patient | undefined {
  return getSmartHealthLinkResourceItems(bundle).find((item) => item.resource.resourceType === 'Patient')?.resource as
    | Patient
    | undefined;
}

export function getSmartHealthLinkResourceItems(bundle: Bundle): SmartHealthLinkResourceItem[] {
  return (bundle.entry ?? [])
    .map((entry, index): SmartHealthLinkResourceItem | undefined => {
      if (!entry.resource) {
        return undefined;
      }
      const key = entry.fullUrl ?? `${entry.resource.resourceType}/${entry.resource.id ?? index}`;
      return {
        key,
        fullUrl: entry.fullUrl,
        resource: entry.resource,
        defaultSelected: DEFAULT_SELECTED_RESOURCE_TYPES.has(entry.resource.resourceType),
      };
    })
    .filter((item): item is SmartHealthLinkResourceItem => !!item);
}

export function buildSmartHealthLinkImportBundle(
  items: SmartHealthLinkResourceItem[],
  selectedKeys: Set<string>,
  sharedPatient: Patient,
  targetPatient: WithId<Patient>
): Bundle {
  const targetPatientRef = `Patient/${targetPatient.id}`;
  const sharedPatientRefs = getSharedPatientReferences(items, sharedPatient);
  const selectedBundle: Bundle = {
    resourceType: 'Bundle',
    type: 'collection',
    entry: items
      .filter((item) => selectedKeys.has(item.key) && item.resource.resourceType !== 'Patient')
      .map((item) => ({
        fullUrl: item.fullUrl,
        resource: rewriteSharedPatientReferences(item.resource, sharedPatientRefs, targetPatientRef),
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

export function getResourceSummary(resource: Resource): string {
  const typedResource = resource as Record<string, any>;
  const display = getDisplayString(resource);
  const date =
    typedResource.effectiveDateTime ??
    typedResource.issued ??
    typedResource.recordedDate ??
    typedResource.onsetDateTime ??
    typedResource.occurrenceDateTime ??
    typedResource.authoredOn ??
    typedResource.date;
  const status = typedResource.clinicalStatus?.coding?.[0]?.code ?? typedResource.status;
  return [display, date, status].filter(Boolean).join(' | ') || resource.id || resource.resourceType;
}

export function getMatchGrade(entry: BundleEntry<WithId<Patient>>): string | undefined {
  return entry.search?.extension?.find((ext) => ext.url.endsWith('/match-grade'))?.valueCode;
}

function getSharedPatientReferences(items: SmartHealthLinkResourceItem[], sharedPatient: Patient): Set<string> {
  const sharedPatientRefs = new Set<string>();
  for (const item of items) {
    if (item.resource === sharedPatient && item.fullUrl) {
      sharedPatientRefs.add(item.fullUrl);
    }
  }
  if (sharedPatient.id) {
    sharedPatientRefs.add(`Patient/${sharedPatient.id}`);
    sharedPatientRefs.add(`resource:${sharedPatient.id}`);
  }
  return sharedPatientRefs;
}

function rewriteSharedPatientReferences<T extends Resource>(
  resource: T,
  sharedPatientRefs: Set<string>,
  targetRef: string
): T {
  return JSON.parse(
    JSON.stringify(resource, (key, value) => {
      if ((key === 'reference' || key === 'url') && typeof value === 'string') {
        return sharedPatientRefs.has(value) ? targetRef : value;
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
