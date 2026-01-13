// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Identifier, Organization, Patient, Reference } from '@medplum/fhirtypes';

// Extension URLs and systems
// Note: These constants are duplicated from @medplum/dosespot-react to avoid
// creating a dependency between @medplum/react and @medplum/dosespot-react.
// If you modify these, ensure the corresponding values in dosespot-react/utils.ts
// are also updated.
export const PATIENT_PREFERRED_PHARMACY_URL =
  'https://hl7.org/fhir/StructureDefinition/patient-preferredPharmacy';
export const PHARMACY_PREFERENCE_TYPE_SYSTEM = 'https://dosespot.com/pharmacy-preference-type';

export const PHARMACY_TYPE_PRIMARY = 'primary';

// Bot identifiers
export const MEDPLUM_BOT_SYSTEM = 'https://www.medplum.com/bots';

export const DOSESPOT_SEARCH_PHARMACY_BOT: Identifier = {
  system: MEDPLUM_BOT_SYSTEM,
  value: 'dosespot-search-pharmacy-bot',
};

export const DOSESPOT_ADD_PATIENT_PHARMACY_BOT: Identifier = {
  system: MEDPLUM_BOT_SYSTEM,
  value: 'dosespot-add-patient-pharmacy-bot',
};

export interface PreferredPharmacy {
  organizationRef: Reference<Organization>;
  isPrimary: boolean;
}

/**
 * Extracts preferred pharmacies from a Patient resource's extensions.
 *
 * Note: This function is intentionally duplicated from `@medplum/dosespot-react`
 * to avoid creating a dependency between `@medplum/react` and `@medplum/dosespot-react`.
 *
 * @param patient - The Patient resource.
 * @returns An array of PreferredPharmacy objects.
 */
export function getPreferredPharmaciesFromPatient(patient: Patient): PreferredPharmacy[] {
  if (!patient.extension) {
    return [];
  }

  const pharmacies: PreferredPharmacy[] = [];

  for (const ext of patient.extension) {
    if (ext.url !== PATIENT_PREFERRED_PHARMACY_URL || !ext.extension) {
      continue;
    }

    // Find the pharmacy reference sub-extension
    const pharmacyExt = ext.extension.find((e) => e.url === 'pharmacy');
    const typeExt = ext.extension.find((e) => e.url === 'type');

    if (pharmacyExt?.valueReference) {
      // Check for the type code with the correct system
      const typeCode = typeExt?.valueCodeableConcept?.coding?.find(
        (c) => c.system === PHARMACY_PREFERENCE_TYPE_SYSTEM
      )?.code;

      pharmacies.push({
        organizationRef: pharmacyExt.valueReference as Reference<Organization>,
        isPrimary: typeCode === PHARMACY_TYPE_PRIMARY,
      });
    }
  }

  return pharmacies;
}
