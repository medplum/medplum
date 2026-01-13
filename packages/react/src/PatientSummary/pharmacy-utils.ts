// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { DOSESPOT_ADD_PATIENT_PHARMACY_BOT, DOSESPOT_SEARCH_PHARMACY_BOT } from '@medplum/dosespot-react';
import type { Organization, Patient, Reference } from '@medplum/fhirtypes';

export { DOSESPOT_ADD_PATIENT_PHARMACY_BOT, DOSESPOT_SEARCH_PHARMACY_BOT };

export const PATIENT_PREFERRED_PHARMACY_URL = 'http://hl7.org/fhir/StructureDefinition/patient-preferredPharmacy';
export const PHARMACY_TYPE_PRIMARY = 'primary';

export interface PreferredPharmacy {
  organizationRef: Reference<Organization>;
  isPrimary: boolean;
}

/**
 * Extracts preferred pharmacies from a Patient resource's extensions.
 * @param patient - The Patient resource.
 * @returns An array of PreferredPharmacy objects.
 */
export function getPreferredPharmaciesFromPatient(patient: Patient): PreferredPharmacy[] {
  const extensions = patient.extension?.filter((ext) => ext.url === PATIENT_PREFERRED_PHARMACY_URL) || [];
  const pharmacies: PreferredPharmacy[] = [];

  for (const ext of extensions) {
    const pharmacyRefExt = ext.extension?.find((e) => e.url === 'pharmacy');
    const typeExt = ext.extension?.find((e) => e.url === 'type');

    if (pharmacyRefExt?.valueReference && typeExt?.valueCodeableConcept?.coding?.[0]?.code) {
      pharmacies.push({
        organizationRef: pharmacyRefExt.valueReference as Reference<Organization>,
        isPrimary: typeExt.valueCodeableConcept.coding[0].code === PHARMACY_TYPE_PRIMARY,
      });
    }
  }
  return pharmacies;
}
