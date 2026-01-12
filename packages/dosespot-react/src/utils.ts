// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Extension, MedicationKnowledge, Organization, Patient, Reference } from '@medplum/fhirtypes';
import { getReferenceString } from '@medplum/core';
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

// ============================================================================
// Patient Preferred Pharmacy Extension Helpers
// ============================================================================

/**
 * FHIR Extension URL for patient preferred pharmacy.
 * @see https://build.fhir.org/ig/HL7/fhir-extensions/StructureDefinition-patient-preferredPharmacy.html
 */
export const PATIENT_PREFERRED_PHARMACY_URL = 'http://hl7.org/fhir/StructureDefinition/patient-preferredPharmacy';

/**
 * System for pharmacy preference type codes.
 */
export const PHARMACY_PREFERENCE_TYPE_SYSTEM = 'https://dosespot.com/pharmacy-preference-type';

/**
 * Code for primary pharmacy (the default for new prescriptions).
 */
export const PHARMACY_TYPE_PRIMARY = 'primary';

/**
 * Code for preferred pharmacy (a favorite, but not the primary).
 */
export const PHARMACY_TYPE_PREFERRED = 'preferred';

/**
 * Represents a preferred pharmacy extracted from a Patient's extensions.
 */
export interface PreferredPharmacy {
  /** Reference to the Organization resource representing the pharmacy */
  organizationRef: Reference<Organization>;
  /** Whether this is the patient's primary pharmacy */
  isPrimary: boolean;
}

/**
 * Extracts preferred pharmacies from a Patient's extensions.
 *
 * @param patient - The Patient resource to extract pharmacies from.
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
export function createPreferredPharmacyExtension(
  orgRef: Reference<Organization>,
  isPrimary: boolean
): Extension {
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
  if (!patient.extension) {
    patient.extension = [];
  }

  const orgRefString = getReferenceString(orgRef);

  // If setting as primary, first demote all other pharmacies to 'preferred'
  if (isPrimary) {
    for (const ext of patient.extension) {
      if (ext.url === PATIENT_PREFERRED_PHARMACY_URL && ext.extension) {
        const pharmacyExt = ext.extension.find((e) => e.url === 'pharmacy');
        const existingRefString = pharmacyExt?.valueReference
          ? getReferenceString(pharmacyExt.valueReference)
          : undefined;

        // Skip if this is the same pharmacy we're adding
        if (existingRefString === orgRefString) {
          continue;
        }

        // Update type to 'preferred'
        const typeExt = ext.extension.find((e) => e.url === 'type');
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
    }
  }

  // Check if this pharmacy already exists
  const existingIndex = patient.extension.findIndex((ext) => {
    if (ext.url !== PATIENT_PREFERRED_PHARMACY_URL || !ext.extension) {
      return false;
    }
    const pharmacyExt = ext.extension.find((e) => e.url === 'pharmacy');
    const existingRefString = pharmacyExt?.valueReference
      ? getReferenceString(pharmacyExt.valueReference)
      : undefined;
    return existingRefString === orgRefString;
  });

  if (existingIndex >= 0) {
    // Update existing extension
    patient.extension[existingIndex] = createPreferredPharmacyExtension(orgRef, isPrimary);
  } else {
    // Add new extension
    patient.extension.push(createPreferredPharmacyExtension(orgRef, isPrimary));
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
export function removePreferredPharmacyFromPatient(
  patient: Patient,
  orgRef: Reference<Organization>
): Patient {
  if (!patient.extension) {
    return patient;
  }

  const orgRefString = getReferenceString(orgRef);

  patient.extension = patient.extension.filter((ext) => {
    if (ext.url !== PATIENT_PREFERRED_PHARMACY_URL || !ext.extension) {
      return true; // Keep non-pharmacy extensions
    }
    const pharmacyExt = ext.extension.find((e) => e.url === 'pharmacy');
    const existingRefString = pharmacyExt?.valueReference
      ? getReferenceString(pharmacyExt.valueReference)
      : undefined;
    return existingRefString !== orgRefString;
  });

  return patient;
}
