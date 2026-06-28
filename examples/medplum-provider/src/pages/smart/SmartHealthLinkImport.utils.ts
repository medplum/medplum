// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { deepClone } from '@medplum/core';
import type {
  Bundle,
  BundleEntry,
  CodeableConcept,
  Coding,
  HumanName,
  Identifier,
  Patient,
  Resource,
} from '@medplum/fhirtypes';

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
  const referenceMap = buildReferenceMap(items, sharedPatient, targetPatient);
  for (const item of items) {
    if (!selectedKeys.has(item.key) || item.resource.resourceType === 'Patient') {
      continue;
    }
    const fullUrl = getTransactionFullUrl(item);
    referenceMap.set(item.key, fullUrl);
    referenceMap.set(getResourceReference(item.resource), fullUrl);
    if (item.fullUrl) {
      referenceMap.set(item.fullUrl, fullUrl);
    }
  }
  const entries: BundleEntry[] = [];

  for (const item of items) {
    if (!selectedKeys.has(item.key) || item.resource.resourceType === 'Patient') {
      continue;
    }

    const resource = cleanResource(rewriteReferences(item.resource, referenceMap));
    const fullUrl = referenceMap.get(item.key) as string;

    entries.push({
      fullUrl,
      resource,
      request: {
        method: 'POST',
        url: resource.resourceType,
        ifNoneExist: buildIfNoneExist(resource, targetPatient),
      },
    });
  }

  return {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: entries,
  };
}

export function getPatientDisplay(patient: Patient): string {
  const name = patient.name?.[0];
  const formattedName = name ? formatHumanName(name) : undefined;
  return formattedName || patient.id || 'Unnamed patient';
}

export function getResourceSummary(resource: Resource): string {
  const typedResource = resource as Record<string, any>;
  const code = getCodeableConceptText(typedResource.code) ?? getCodeableConceptText(typedResource.type);
  const date =
    typedResource.effectiveDateTime ??
    typedResource.issued ??
    typedResource.recordedDate ??
    typedResource.onsetDateTime ??
    typedResource.occurrenceDateTime ??
    typedResource.authoredOn ??
    typedResource.date;
  const status = typedResource.clinicalStatus?.coding?.[0]?.code ?? typedResource.status;
  return [code, date, status].filter(Boolean).join(' | ') || resource.id || resource.resourceType;
}

export function getMatchGrade(entry: BundleEntry<WithId<Patient>>): string | undefined {
  return entry.search?.extension?.find((ext) => ext.url.endsWith('/match-grade'))?.valueCode;
}

function buildReferenceMap(
  items: SmartHealthLinkResourceItem[],
  sharedPatient: Patient,
  targetPatient: WithId<Patient>
): Map<string, string> {
  const referenceMap = new Map<string, string>();
  const targetRef = `Patient/${targetPatient.id}`;
  referenceMap.set(getResourceReference(sharedPatient), targetRef);
  for (const item of items) {
    if (item.resource === sharedPatient && item.fullUrl) {
      referenceMap.set(item.fullUrl, targetRef);
    }
  }
  if (sharedPatient.id) {
    referenceMap.set(`Patient/${sharedPatient.id}`, targetRef);
    referenceMap.set(`resource:${sharedPatient.id}`, targetRef);
  }
  return referenceMap;
}

function rewriteReferences<T extends Resource>(resource: T, referenceMap: Map<string, string>): T {
  return JSON.parse(
    JSON.stringify(resource, (key, value) => {
      if ((key === 'reference' || key === 'url') && typeof value === 'string') {
        return referenceMap.get(value) ?? value;
      }
      return value;
    })
  ) as T;
}

function cleanResource<T extends Resource>(resource: T): T {
  const result = deepClone(resource);
  delete result.id;
  if (result.meta) {
    delete result.meta.author;
    delete result.meta.compartment;
    delete result.meta.lastUpdated;
    delete result.meta.project;
    delete result.meta.versionId;
    if (Object.keys(result.meta).length === 0) {
      delete result.meta;
    }
  }
  return result;
}

function getTransactionFullUrl(item: SmartHealthLinkResourceItem): string {
  if (item.fullUrl?.startsWith('urn:uuid:')) {
    return item.fullUrl;
  }
  return `urn:uuid:${globalThis.crypto?.randomUUID?.() ?? `${item.resource.resourceType}-${Math.random()}`}`;
}

function getResourceReference(resource: Resource): string {
  return resource.id ? `${resource.resourceType}/${resource.id}` : resource.resourceType;
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
  const code = getTokenSearchValue(typedResource.code ?? typedResource.type ?? typedResource.vaccineCode);
  if (!patientParam || !code) {
    return undefined;
  }

  const params = [`${patientParam}=Patient/${targetPatient.id}`, `code=${code}`];
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

function getCodeableConceptText(input: CodeableConcept | undefined): string | undefined {
  if (!input) {
    return undefined;
  }
  return input.text ?? formatCoding(input.coding?.find((c) => c.display || c.code));
}

function formatCoding(coding: Coding | undefined): string | undefined {
  return coding?.display ?? coding?.code;
}

function formatHumanName(name: HumanName): string {
  return [name.given?.join(' '), name.family].filter(Boolean).join(' ');
}
