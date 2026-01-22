// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedicationRequest, Patient, Quantity, Reference } from '@medplum/fhirtypes';
import type { HealthieClient, WithCursor } from './client';
import {
  HEALTHIE_MEDICATION_CODE_SYSTEM,
  HEALTHIE_MEDICATION_ID_SYSTEM,
  HEALTHIE_MEDICATION_ROUTE_CODE_SYSTEM,
} from './constants';

/**
 * Interface representing a medication from Healthie API
 */
export interface HealthieMedicationType {
  /** The unique identifier of the medication */
  id: string;
  /** Name of medication */
  name?: string;
  /** Indicates if medication is still active */
  active?: boolean;
  /** Directions to use medication entered by provider */
  directions?: string;
  /** Dosage of medication entered by provider */
  dosage?: string;
  /** CCDA code for this medication */
  code?: string;
  /** First active date of medication */
  start_date?: string;
  /** last date patient should be able to use medication */
  end_date?: string;
  /** Comments entered by provider */
  comment?: string;
  /** The time the medication was created */
  created_at: string;
  /** Frequency of this medication */
  frequency?: string;
  /** If the medication is synchronized with an external system */
  mirrored: boolean;
  /** When true, this object must be consolidated as part of a CCDA Ingest */
  requires_consolidation?: boolean;
  /** The way this medication is administered */
  route?: string;
  /** The last time the medication was updated */
  updated_at?: string;
  /** User ID of the client this medication belongs to */
  user_id?: string;
}

/**
 * Fetches medications for a specific patient using cursor pagination.
 * @param healthie - The Healthie client instance to use for API calls.
 * @param patientId - The ID of the patient.
 * @returns An array of medication data.
 */
export async function fetchMedications(healthie: HealthieClient, patientId: string): Promise<HealthieMedicationType[]> {
  type HealthieMedicationWithCursor = WithCursor<HealthieMedicationType>;
  const allMedications: HealthieMedicationType[] = [];
  let cursor: string | undefined = undefined;
  let loopCount = 0;
  const pageSize = 50;

  const query = `
    query fetchMedications($patientId: ID!, $after: Cursor, $pageSize: Int) {
      medications(
        patient_id: $patientId,
        should_paginate: true,
        after: $after,
        page_size: $pageSize
      ) {
        id
        name
        active
        directions
        dosage
        code
        start_date
        end_date
        comment
        created_at
        frequency
        mirrored
        requires_consolidation
        route
        updated_at
        user_id
        cursor
      }
    }
  `;

  while (true) {
    const result: { medications: HealthieMedicationWithCursor[] } = await healthie.query<{
      medications: HealthieMedicationWithCursor[];
    }>(query, {
      patientId,
      after: cursor,
      pageSize,
    });

    const medications: HealthieMedicationWithCursor[] = result.medications ?? [];
    allMedications.push(...medications);

    // Check if we've reached the end
    if (medications.length < pageSize) {
      break;
    }

    // Get cursor for next page
    cursor = medications.at(-1)?.cursor;
    if (!cursor) {
      break;
    }

    // Prevent infinite loop
    loopCount++;
    if (loopCount > 10000) {
      throw new Error('Exiting fetchMedications due to too many pages');
    }
  }

  return allMedications;
}

/**
 * Converts a Healthie medication to a FHIR MedicationRequest.
 * @param medication - The Healthie medication object.
 * @param patientReference - The reference to the patient.
 * @returns A FHIR MedicationRequest resource.
 */
export function convertHealthieMedicationToFhir(
  medication: HealthieMedicationType,
  patientReference: Reference<Patient>
): MedicationRequest {
  const fhirMedication: MedicationRequest = {
    resourceType: 'MedicationRequest',
    identifier: [{ system: HEALTHIE_MEDICATION_ID_SYSTEM, value: medication.id }],
    // TODO: Modify this code to use the following logic
    // If medication.active is true
    //   current date after end date: completed
    //   current date is before start date: 'draft'
    // If medication.active is false, then status is unknown
    status: medication.active ? 'active' : 'unknown',
    intent: 'proposal',
    subject: patientReference,
    medicationCodeableConcept: {
      text: medication.name,
      coding: [
        {
          system: HEALTHIE_MEDICATION_CODE_SYSTEM,
          code: medication.code || undefined,
          display: medication.name,
        },
      ],
    },
    // Add dosage instructions if available
    dosageInstruction: medication.dosage
      ? [
          {
            doseAndRate: [
              {
                doseQuantity: parseDosage(medication.dosage),
              },
            ],
            route: medication.route
              ? {
                  text: medication.route,
                  coding: [
                    {
                      system: HEALTHIE_MEDICATION_ROUTE_CODE_SYSTEM,
                      code: medication.route,
                      display: medication.route,
                    },
                  ],
                }
              : undefined,
          },
        ]
      : undefined,
    note: medication.comment ? [{ text: medication.comment }] : undefined,
  };

  return fhirMedication;
}

/**
 * Parses a Healthie medication dosage string into a FHIR Quantity.
 * @param dosageString - The dosage string (e.g., "10 MG").
 * @returns A FHIR Quantity object or undefined if invalid.
 */
export function parseDosage(dosageString?: string): Quantity | undefined {
  if (!dosageString) {
    return undefined;
  }

  // Split the string into value and unit parts
  const match = dosageString.match(/^(\d+(?:\.\d+)?)\s*([A-Za-z]+)$/);
  if (!match) {
    return undefined;
  }

  const [, valueStr, unit] = match;
  const value = Number.parseFloat(valueStr);

  return {
    value,
    unit,
    system: 'http://unitsofmeasure.org',
  };
}
