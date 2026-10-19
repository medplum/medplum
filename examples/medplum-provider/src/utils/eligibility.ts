// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { PatchOperation } from '@medplum/core';
import type { CoverageEligibilityRequestItem, ValueSet, ValueSetCompose } from '@medplum/fhirtypes';
import { X12_SERVICE_TYPE_CODES } from './x12ServiceTypeCodes';

/** Coding system of X12 service type codes, as the eligibility bots read it off `CoverageEligibilityRequest.item[].category`. */
export const X12_SERVICE_TYPE_CODE_SYSTEM = 'https://x12.org/codes/service-type-codes';

/** Health Benefit Plan Coverage, the general inquiry the eligibility bots fall back to when a request names no service type. */
export const DEFAULT_ELIGIBILITY_SERVICE_TYPE_CODE = '30';

/**
 * Canonical URL of the ValueSet holding the service types the practice asks about in every eligibility check. It is
 * project-wide: one ValueSet, edited on the Billing Settings Eligibility tab and read by every check.
 */
export const ELIGIBILITY_SERVICE_TYPES_VALUESET_URL = 'https://www.medplum.com/provider/eligibility-service-types';

/**
 * Looks up the display name of an X12 service type code.
 * @param code - The X12 service type code.
 * @returns The display name, or the code itself when it is not a known service type.
 */
export function getServiceTypeDisplay(code: string): string {
  return X12_SERVICE_TYPE_CODES.find((c) => c.code === code)?.display ?? code;
}

/**
 * Reads the service type codes out of the practice's eligibility ValueSet.
 * @param valueSet - The eligibility service types ValueSet, or none when the practice has not saved one.
 * @returns The X12 service type codes to ask about; `30` alone when the ValueSet is missing or names none.
 */
export function getEligibilityServiceTypeCodes(valueSet: ValueSet | undefined): string[] {
  const codes =
    valueSet?.compose?.include
      ?.filter((include) => include.system === X12_SERVICE_TYPE_CODE_SYSTEM)
      .flatMap((include) => include.concept ?? [])
      .map((concept) => concept.code)
      .filter((code): code is string => !!code) ?? [];
  return codes.length ? Array.from(new Set(codes)) : [DEFAULT_ELIGIBILITY_SERVICE_TYPE_CODE];
}

/**
 * Builds the `CoverageEligibilityRequest.item` entries that ask the payer about the given service types, one item
 * per code, as both eligibility bots expect them.
 * @param codes - The X12 service type codes to ask about.
 * @returns The request items.
 */
export function buildEligibilityServiceTypeItems(codes: readonly string[]): CoverageEligibilityRequestItem[] {
  return codes.map((code) => ({
    category: { coding: [{ system: X12_SERVICE_TYPE_CODE_SYSTEM, code, display: getServiceTypeDisplay(code) }] },
  }));
}

/**
 * Builds the `compose` of the eligibility service types ValueSet for the given codes.
 * @param codes - The X12 service type codes to ask about.
 * @returns The ValueSet compose listing them.
 */
export function buildEligibilityServiceTypesCompose(codes: readonly string[]): ValueSetCompose {
  return {
    include: [
      {
        system: X12_SERVICE_TYPE_CODE_SYSTEM,
        concept: codes.map((code) => ({ code, display: getServiceTypeDisplay(code) })),
      },
    ],
  };
}

/**
 * Builds a new eligibility service types ValueSet for the given codes.
 * @param codes - The X12 service type codes to ask about.
 * @returns The ValueSet to create.
 */
export function buildEligibilityServiceTypesValueSet(codes: readonly string[]): ValueSet {
  return {
    resourceType: 'ValueSet',
    url: ELIGIBILITY_SERVICE_TYPES_VALUESET_URL,
    name: 'EligibilityServiceTypes',
    title: 'Eligibility service types',
    status: 'active',
    description: 'X12 service types asked about in every insurance eligibility check.',
    compose: buildEligibilityServiceTypesCompose(codes),
  };
}

/**
 * Builds the patch that replaces the codes of an existing eligibility service types ValueSet.
 * @param codes - The X12 service type codes to ask about.
 * @returns The JSON Patch operations.
 */
export function buildEligibilityServiceTypesPatch(codes: readonly string[]): PatchOperation[] {
  return [{ op: 'replace', path: '/compose', value: buildEligibilityServiceTypesCompose(codes) }];
}
