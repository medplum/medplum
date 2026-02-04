// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Extension, Identifier, Organization, Patient, Reference } from '@medplum/fhirtypes';
import { getReferenceString } from './utils';

// Extension URLs and systems
export const PATIENT_PREFERRED_PHARMACY_URL = 'http://hl7.org/fhir/StructureDefinition/patient-preferredPharmacy';
export const PHARMACY_PREFERENCE_TYPE_SYSTEM = 'https://dosespot.com/pharmacy-preference-type';

export const PHARMACY_TYPE_PRIMARY = 'primary';
export const PHARMACY_TYPE_PREFERRED = 'preferred';

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
 * Gets the reference string from a pharmacy extension.
 * @param ext - The extension to extract from.
 * @returns The reference string or undefined.
 */
function getPharmacyRefString(ext: Extension): string | undefined {
  const pharmacyExt = ext.extension?.find((e) => e.url === 'pharmacy');
  return pharmacyExt?.valueReference ? getReferenceString(pharmacyExt.valueReference) : undefined;
}

/**
 * Checks if an extension is a preferred pharmacy extension.
 * @param ext - The extension to check.
 * @returns True if it's a preferred pharmacy extension with nested extensions.
 */
function isPreferredPharmacyExtension(ext: Extension): boolean {
  return ext.url === PATIENT_PREFERRED_PHARMACY_URL && !!ext.extension;
}

/**
 * Demotes a pharmacy extension to 'preferred' status.
 * @param ext - The extension to demote.
 */
function demoteToPreferred(ext: Extension): void {
  const typeExt = ext.extension?.find((e) => e.url === 'type');
  if (typeExt) {
    typeExt.valueCodeableConcept = {
      coding: [
        {
          system: PHARMACY_PREFERENCE_TYPE_SYSTEM,
          code: PHARMACY_TYPE_PREFERRED,
          display: 'Preferred Pharmacy',
        },
      ],
    };
  }
}

/**
 * Extracts preferred pharmacies from a Patient resource's extensions.
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

/**
 * Creates a preferredPharmacy extension object.
 *
 * @param orgRef - Reference to the Organization resource.
 * @param isPrimary - Whether this is the primary pharmacy.
 * @returns The extension object to add to a Patient.
 */
export function createPreferredPharmacyExtension(orgRef: Reference<Organization>, isPrimary: boolean): Extension {
  const typeCode = isPrimary ? PHARMACY_TYPE_PRIMARY : PHARMACY_TYPE_PREFERRED;
  const typeDisplay = isPrimary ? 'Primary Pharmacy' : 'Preferred Pharmacy';

  return {
    url: PATIENT_PREFERRED_PHARMACY_URL,
    extension: [
      {
        url: 'pharmacy',
        valueReference: orgRef,
      },
      {
        url: 'type',
        valueCodeableConcept: {
          coding: [
            {
              system: PHARMACY_PREFERENCE_TYPE_SYSTEM,
              code: typeCode,
              display: typeDisplay,
            },
          ],
        },
      },
    ],
  };
}

/**
 * Adds or updates a preferred pharmacy extension on a Patient.
 * If the pharmacy already exists, updates its type. Otherwise, adds a new extension.
 * If isPrimary is true, other pharmacies are set to 'preferred'.
 *
 * @param patient - The Patient resource to modify (will be mutated).
 * @param orgRef - Reference to the Organization resource.
 * @param isPrimary - Whether to set this as the primary pharmacy.
 * @returns The modified Patient resource.
 */
export function addPreferredPharmacyToPatient(
  patient: Patient,
  orgRef: Reference<Organization>,
  isPrimary: boolean
): Patient {
  patient.extension ??= [];

  const orgRefString = getReferenceString(orgRef);

  // If setting as primary, demote all other pharmacies to 'preferred'
  if (isPrimary) {
    for (const ext of patient.extension) {
      if (isPreferredPharmacyExtension(ext) && getPharmacyRefString(ext) !== orgRefString) {
        demoteToPreferred(ext);
      }
    }
  }

  // Find existing pharmacy extension index
  const existingIndex = patient.extension.findIndex(
    (ext) => isPreferredPharmacyExtension(ext) && getPharmacyRefString(ext) === orgRefString
  );

  const newExtension = createPreferredPharmacyExtension(orgRef, isPrimary);

  if (existingIndex >= 0) {
    patient.extension[existingIndex] = newExtension;
  } else {
    patient.extension.push(newExtension);
  }

  return patient;
}

/**
 * Removes a preferred pharmacy extension from a Patient.
 *
 * @param patient - The Patient resource to modify (will be mutated).
 * @param orgRef - Reference to the Organization resource to remove.
 * @returns The modified Patient resource.
 */
export function removePreferredPharmacyFromPatient(patient: Patient, orgRef: Reference<Organization>): Patient {
  if (!patient.extension) {
    return patient;
  }

  const orgRefString = getReferenceString(orgRef);

  patient.extension = patient.extension.filter((ext) => {
    if (!isPreferredPharmacyExtension(ext)) {
      return true; // Keep non-pharmacy extensions
    }
    return getPharmacyRefString(ext) !== orgRefString;
  });

  return patient;
}
