// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedicationKnowledge, Organization } from '@medplum/fhirtypes';
import { DOSESPOT_PHARMACY_ID_SYSTEM } from './common';

export const getMedicationName = (medication: MedicationKnowledge | undefined): string => {
  return medication?.code?.text || '';
};

/**
 * Extracts the DoseSpot pharmacy ID from an Organization resource.
 * @param organization - The FHIR Organization resource representing a pharmacy.
 * @returns The DoseSpot pharmacy ID, or undefined if not found.
 */
export function getPharmacyIdFromOrganization(organization: Organization): number | undefined {
  const id = organization.identifier?.find((i) => i.system === DOSESPOT_PHARMACY_ID_SYSTEM)?.value;
  return id ? parseInt(id, 10) : undefined;
}
