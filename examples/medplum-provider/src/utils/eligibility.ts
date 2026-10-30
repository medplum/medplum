// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, PatchOperation } from '@medplum/core';
import type {
  Coding,
  CoverageEligibilityRequestItem,
  Parameters,
  ValueSet,
  ValueSetCompose,
  ValueSetComposeIncludeConcept,
} from '@medplum/fhirtypes';

/** Coding system of X12 service type codes, as the eligibility bots read it off `CoverageEligibilityRequest.item[].category`. */
export const X12_SERVICE_TYPE_CODE_SYSTEM = 'https://x12.org/codes/service-type-codes';

/** An X12 service type: its code and, when the CodeSystem carries one, its display name. */
export interface ServiceType {
  readonly code: string;
  readonly display?: string;
}

/** Health Benefit Plan Coverage, the general inquiry the eligibility bots fall back to when a request names no service type. */
export const DEFAULT_ELIGIBILITY_SERVICE_TYPE: ServiceType = { code: '30', display: 'Health Benefit Plan Coverage' };

/**
 * Canonical URL of the ValueSet holding the service types the practice asks about in every eligibility check. It is
 * project-wide: one ValueSet, edited on the Billing Settings Eligibility tab and read by every check.
 */
export const ELIGIBILITY_SERVICE_TYPES_VALUESET_URL = 'https://www.medplum.com/provider/eligibility-service-types';

/**
 * Labels a service type for a picker: its display name with the code in parentheses, or the code alone when the
 * CodeSystem carries no display for it.
 * @param serviceType - The service type.
 * @returns The label.
 */
export function formatServiceTypeLabel(serviceType: ServiceType): string {
  return serviceType.display ? `${serviceType.display} (${serviceType.code})` : serviceType.code;
}

/**
 * Loads every X12 service type from the CodeSystem deployed in the shared Medplum project, by expanding a ValueSet
 * that includes the whole system. The displays are whatever the CodeSystem carries, so a code may come back without one.
 * @param medplum - The Medplum client.
 * @returns The service types, in the order the server lists them.
 */
export async function fetchX12ServiceTypes(medplum: MedplumClient): Promise<ServiceType[]> {
  const parameters: Parameters = {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'valueSet',
        resource: {
          resourceType: 'ValueSet',
          status: 'active',
          compose: { include: [{ system: X12_SERVICE_TYPE_CODE_SYSTEM }] },
        },
      },
    ],
  };
  const expanded: ValueSet = await medplum.post(medplum.fhirUrl('ValueSet', '$expand'), parameters);
  return (expanded.expansion?.contains ?? [])
    .filter((contains) => !!contains.code)
    .map((contains) => toServiceType(contains.code as string, contains.display));
}

/**
 * Reads the service types out of the practice's eligibility ValueSet, with the displays saved alongside them.
 * @param valueSet - The eligibility service types ValueSet, or none when the practice has not saved one.
 * @returns The service types to ask about; Health Benefit Plan Coverage alone when the ValueSet is missing or names none.
 */
export function getEligibilityServiceTypes(valueSet: ValueSet | undefined): ServiceType[] {
  const seen = new Set<string>();
  const result: ServiceType[] = [];
  for (const include of valueSet?.compose?.include ?? []) {
    if (include.system !== X12_SERVICE_TYPE_CODE_SYSTEM) {
      continue;
    }
    for (const concept of include.concept ?? []) {
      if (concept.code && !seen.has(concept.code)) {
        seen.add(concept.code);
        result.push(toServiceType(concept.code, concept.display));
      }
    }
  }
  return result.length ? result : [DEFAULT_ELIGIBILITY_SERVICE_TYPE];
}

/**
 * Picks the service types with the given codes, in the order of the codes. A code none of the service types carry
 * is kept as a bare code, so a pick is never silently dropped.
 * @param serviceTypes - The service types to pick from.
 * @param codes - The codes picked.
 * @returns The picked service types.
 */
export function pickServiceTypes(serviceTypes: readonly ServiceType[], codes: readonly string[]): ServiceType[] {
  return codes.map((code) => serviceTypes.find((serviceType) => serviceType.code === code) ?? { code });
}

/**
 * Builds the `CoverageEligibilityRequest.item` entries that ask the payer about the given service types, one item
 * per service type, as both eligibility bots expect them.
 * @param serviceTypes - The service types to ask about.
 * @returns The request items.
 */
export function buildEligibilityServiceTypeItems(
  serviceTypes: readonly ServiceType[]
): CoverageEligibilityRequestItem[] {
  return serviceTypes.map((serviceType) => ({ category: { coding: [toCoding(serviceType)] } }));
}

/**
 * Builds the `compose` of the eligibility service types ValueSet for the given service types.
 * @param serviceTypes - The service types to ask about.
 * @returns The ValueSet compose listing them.
 */
export function buildEligibilityServiceTypesCompose(serviceTypes: readonly ServiceType[]): ValueSetCompose {
  return {
    include: [{ system: X12_SERVICE_TYPE_CODE_SYSTEM, concept: serviceTypes.map(toConcept) }],
  };
}

/**
 * Builds a new eligibility service types ValueSet for the given service types.
 * @param serviceTypes - The service types to ask about.
 * @returns The ValueSet to create.
 */
export function buildEligibilityServiceTypesValueSet(serviceTypes: readonly ServiceType[]): ValueSet {
  return {
    resourceType: 'ValueSet',
    url: ELIGIBILITY_SERVICE_TYPES_VALUESET_URL,
    name: 'EligibilityServiceTypes',
    title: 'Eligibility service types',
    status: 'active',
    description: 'X12 service types asked about in every insurance eligibility check.',
    compose: buildEligibilityServiceTypesCompose(serviceTypes),
  };
}

/**
 * Builds the patch that replaces the service types of an existing eligibility service types ValueSet. The op is
 * `add`, which also sets `compose` on a ValueSet that has none, where `replace` would be rejected.
 * @param serviceTypes - The service types to ask about.
 * @returns The JSON Patch operations.
 */
export function buildEligibilityServiceTypesPatch(serviceTypes: readonly ServiceType[]): PatchOperation[] {
  return [{ op: 'add', path: '/compose', value: buildEligibilityServiceTypesCompose(serviceTypes) }];
}

function toServiceType(code: string, display: string | undefined): ServiceType {
  return display ? { code, display } : { code };
}

function toCoding(serviceType: ServiceType): Coding {
  return { system: X12_SERVICE_TYPE_CODE_SYSTEM, ...toConcept(serviceType) };
}

function toConcept(serviceType: ServiceType): ValueSetComposeIncludeConcept {
  return serviceType.display ? { code: serviceType.code, display: serviceType.display } : { code: serviceType.code };
}
