// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { HealthieClient } from './client';

/**
 * Fetches the most recent medication update date for a patient.
 * Note: Healthie medications API doesn't support pagination or ordering, so we
 * fetch all medications and find the max date client-side.
 * @param healthie - The Healthie client instance.
 * @param patientId - The Healthie patient ID.
 * @returns The most recent update date (ISO 8601) or undefined if no medications.
 */
export async function fetchMostRecentMedicationDate(
  healthie: HealthieClient,
  patientId: string
): Promise<string | undefined> {
  // Healthie's medications query doesn't support pagination or ordering
  const query = `
    query fetchMedications($patientId: ID!) {
      medications(patient_id: $patientId) {
        id
        created_at
        updated_at
      }
    }
  `;

  const result = await healthie.query<{
    medications: { id: string; created_at: string; updated_at?: string }[];
  }>(query, { patientId });

  const medications = result.medications ?? [];
  if (medications.length === 0) {
    return undefined;
  }

  // Find the most recent date across all medications
  let mostRecent: Date | undefined;
  for (const med of medications) {
    const dateStr = med.updated_at ?? med.created_at;
    const date = new Date(dateStr);
    if (!mostRecent || date > mostRecent) {
      mostRecent = date;
    }
  }

  return mostRecent?.toISOString();
}

/**
 * Fetches the most recent allergy update date for a patient.
 * Uses the User.last_updated_allergy field which returns the most recently updated allergy.
 * @param healthie - The Healthie client instance.
 * @param patientId - The Healthie patient ID.
 * @returns The most recent update date (ISO 8601) or undefined if no allergies.
 */
export async function fetchMostRecentAllergyDate(
  healthie: HealthieClient,
  patientId: string
): Promise<string | undefined> {
  // allergy_sensitivities must be queried through User, not directly.
  // User.last_updated_allergy returns the most recently updated allergy.
  const query = `
    query fetchMostRecentAllergy($patientId: ID!) {
      user(id: $patientId) {
        last_updated_allergy {
          id
          created_at
          updated_at
        }
      }
    }
  `;

  const result = await healthie.query<{
    user: { last_updated_allergy: { id: string; created_at: string; updated_at?: string } | null } | null;
  }>(query, { patientId });

  const allergy = result.user?.last_updated_allergy;
  if (!allergy) {
    return undefined;
  }

  const dateStr = allergy.updated_at ?? allergy.created_at;
  return new Date(dateStr).toISOString();
}

/**
 * Fetches the most recent form answer group date for a patient.
 * Uses order_by: UPDATED_AT_DESC and page_size=1 to get the most recently updated form.
 * @param healthie - The Healthie client instance.
 * @param patientId - The Healthie patient ID.
 * @returns The most recent update date (ISO 8601) or undefined if no form responses.
 */
export async function fetchMostRecentFormAnswerGroupDate(
  healthie: HealthieClient,
  patientId: string
): Promise<string | undefined> {
  const query = `
    query fetchMostRecentFormAnswerGroup($userId: String!) {
      formAnswerGroups(
        user_id: $userId,
        order_by: UPDATED_AT_DESC,
        page_size: 1
      ) {
        id
        created_at
        updated_at
      }
    }
  `;

  const result = await healthie.query<{
    formAnswerGroups: { id: string; created_at: string; updated_at?: string }[];
  }>(query, { userId: patientId });

  const formGroups = result.formAnswerGroups ?? [];
  if (formGroups.length === 0) {
    return undefined;
  }

  let mostRecent: Date | undefined;
  for (const form of formGroups) {
    const dateStr = form.updated_at ?? form.created_at;
    const date = new Date(dateStr);
    if (!mostRecent || date > mostRecent) {
      mostRecent = date;
    }
  }

  return mostRecent?.toISOString();
}

/**
 * Fetches the latest clinical update date across all resource types for a patient.
 * This makes 3 API calls (medications, allergies, form responses) and returns the maximum date.
 * @param healthie - The Healthie client instance.
 * @param patientId - The Healthie patient ID.
 * @returns The most recent clinical update date (ISO 8601) or undefined if no clinical data.
 */
export async function fetchLatestClinicalUpdate(
  healthie: HealthieClient,
  patientId: string
): Promise<string | undefined> {
  // Fetch all three in parallel for efficiency
  const [medicationDate, allergyDate, formDate] = await Promise.all([
    fetchMostRecentMedicationDate(healthie, patientId),
    fetchMostRecentAllergyDate(healthie, patientId),
    fetchMostRecentFormAnswerGroupDate(healthie, patientId),
  ]);

  // Find the maximum date
  const dates: Date[] = [];
  if (medicationDate) {
    dates.push(new Date(medicationDate));
  }
  if (allergyDate) {
    dates.push(new Date(allergyDate));
  }
  if (formDate) {
    dates.push(new Date(formDate));
  }

  if (dates.length === 0) {
    return undefined;
  }

  const maxDate = dates.reduce((max, d) => (d > max ? d : max));
  return maxDate.toISOString();
}
