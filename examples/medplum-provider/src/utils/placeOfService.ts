// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ClaimItem, Coding, Encounter, Extension } from '@medplum/fhirtypes';

/** The CMS Place of Service code set, which CMS-1500 Box 24B requires. */
export const PLACE_OF_SERVICE_SYSTEM = 'https://www.cms.gov/Medicare/Coding/place-of-service-codes';

/** Where a visit took place, as a CMS Place of Service coding on the Encounter. */
export const PLACE_OF_SERVICE_URL = 'https://medplum.com/fhir/StructureDefinition/place-of-service';

/** The CMS Place of Service codes in use. */
export const PLACE_OF_SERVICE_CODES: readonly Coding[] = [
  ['01', 'Pharmacy'],
  ['02', 'Telehealth Provided Other than in Patient’s Home'],
  ['03', 'School'],
  ['04', 'Homeless Shelter'],
  ['05', 'Indian Health Service Free-standing Facility'],
  ['06', 'Indian Health Service Provider-based Facility'],
  ['07', 'Tribal 638 Free-standing Facility'],
  ['08', 'Tribal 638 Provider-based Facility'],
  ['09', 'Prison/Correctional Facility'],
  ['10', 'Telehealth Provided in Patient’s Home'],
  ['11', 'Office'],
  ['12', 'Home'],
  ['13', 'Assisted Living Facility'],
  ['14', 'Group Home'],
  ['15', 'Mobile Unit'],
  ['16', 'Temporary Lodging'],
  ['17', 'Walk-in Retail Health Clinic'],
  ['18', 'Place of Employment-Worksite'],
  ['19', 'Off Campus-Outpatient Hospital'],
  ['20', 'Urgent Care Facility'],
  ['21', 'Inpatient Hospital'],
  ['22', 'On Campus-Outpatient Hospital'],
  ['23', 'Emergency Room – Hospital'],
  ['24', 'Ambulatory Surgical Center'],
  ['25', 'Birthing Center'],
  ['26', 'Military Treatment Facility'],
  ['27', 'Outreach Site/Street'],
  ['31', 'Skilled Nursing Facility'],
  ['32', 'Nursing Facility'],
  ['33', 'Custodial Care Facility'],
  ['34', 'Hospice'],
  ['41', 'Ambulance – Land'],
  ['42', 'Ambulance – Air or Water'],
  ['49', 'Independent Clinic'],
  ['50', 'Federally Qualified Health Center'],
  ['51', 'Inpatient Psychiatric Facility'],
  ['52', 'Psychiatric Facility-Partial Hospitalization'],
  ['53', 'Community Mental Health Center'],
  ['54', 'Intermediate Care Facility/Individuals with Intellectual Disabilities'],
  ['55', 'Residential Substance Abuse Treatment Facility'],
  ['56', 'Psychiatric Residential Treatment Center'],
  ['57', 'Non-residential Substance Abuse Treatment Facility'],
  ['58', 'Non-residential Opioid Treatment Facility'],
  ['60', 'Mass Immunization Center'],
  ['61', 'Comprehensive Inpatient Rehabilitation Facility'],
  ['62', 'Comprehensive Outpatient Rehabilitation Facility'],
  ['65', 'End-Stage Renal Disease Treatment Facility'],
  ['66', 'Programs of All-Inclusive Care for the Elderly (PACE) Center'],
  ['71', 'Public Health Clinic'],
  ['72', 'Rural Health Clinic'],
  ['81', 'Independent Laboratory'],
  ['99', 'Other Place of Service'],
].map(([code, display]) => ({ system: PLACE_OF_SERVICE_SYSTEM, code, display }));

/**
 * The visit's place of service.
 * @param encounter - The visit.
 * @returns Its CMS Place of Service coding, when set.
 */
export function getPlaceOfService(encounter: Encounter | undefined): Coding | undefined {
  return encounter?.extension?.find((e) => e.url === PLACE_OF_SERVICE_URL)?.valueCoding;
}

/**
 * The visit's extensions with its place of service set or cleared.
 * @param encounter - The visit.
 * @param code - The CMS Place of Service code, or undefined to clear it.
 * @returns The new extension list.
 */
export function withPlaceOfService(encounter: Encounter, code: string | undefined): Extension[] {
  const others = (encounter.extension ?? []).filter((e) => e.url !== PLACE_OF_SERVICE_URL);
  const coding = PLACE_OF_SERVICE_CODES.find((c) => c.code === code);
  return coding ? [...others, { url: PLACE_OF_SERVICE_URL, valueCoding: coding }] : others;
}

/**
 * Puts the visit's place of service on each claim line, where CMS-1500 Box 24B reads it.
 * @param items - The claim lines.
 * @param encounter - The visit.
 * @returns The lines with the place of service, or as they were when the visit has none.
 */
export function applyPlaceOfService(items: ClaimItem[], encounter: Encounter): ClaimItem[] {
  const coding = getPlaceOfService(encounter);
  return coding ? items.map((item) => ({ ...item, locationCodeableConcept: { coding: [coding] } })) : items;
}
