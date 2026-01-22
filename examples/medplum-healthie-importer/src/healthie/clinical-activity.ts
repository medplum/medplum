// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { HealthieClient } from './client';

/**
 * Fetches the most recent medication update date for a patient.
 * Uses page_size=1 to minimize data transfer.
 * Note: Healthie medications API doesn't support order_by, so this returns the first
 * medication in default order. For accurate "most recent" tracking, consider fetching
 * all medications and finding the max date client-side if precision is critical.
 * @param healthie - The Healthie client instance.
 * @param patientId - The Healthie patient ID.
 * @returns The most recent update date (ISO 8601) or undefined if no medications.
 */
export async function fetchMostRecentMedicationDate(
  healthie: HealthieClient,
  patientId: string
): Promise<string | undefined> {
  const query = `
    query fetchMostRecentMedication($patientId: ID!) {
      medications(
        patient_id: $patientId,
        page_size: 1
      ) {
        id
        created_at
        updated_at
      }
    }
  `;

  const result = await healthie.query<{
    medications: Array<{ id: string; created_at: string; updated_at?: string }>;
  }>(query, { patientId });

  const medications = result.medications ?? [];
  if (medications.length === 0) {
    return undefined;
  }

  // Find the most recent date across all returned medications
  // (in case the API returns multiple or sorted differently)
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
 * Uses page_size=1 to minimize data transfer.
 * Note: Healthie allergy_sensitivities API may not support order_by, so this returns
 * the first allergy in default order. For accurate "most recent" tracking, consider
 * fetching all allergies and finding the max date client-side if precision is critical.
 * @param healthie - The Healthie client instance.
 * @param patientId - The Healthie patient ID.
 * @returns The most recent update date (ISO 8601) or undefined if no allergies.
 */
export async function fetchMostRecentAllergyDate(
  healthie: HealthieClient,
  patientId: string
): Promise<string | undefined> {
  const query = `
    query fetchMostRecentAllergy($patientId: ID!) {
      allergy_sensitivities(
        patient_id: $patientId,
        page_size: 1
      ) {
        id
        created_at
        updated_at
      }
    }
  `;

  const result = await healthie.query<{
    allergy_sensitivities: Array<{ id: string; created_at: string; updated_at?: string }>;
  }>(query, { patientId });

  const allergies = result.allergy_sensitivities ?? [];
  if (allergies.length === 0) {
    return undefined;
  }

  let mostRecent: Date | undefined;
  for (const allergy of allergies) {
    const dateStr = allergy.updated_at ?? allergy.created_at;
    const date = new Date(dateStr);
    if (!mostRecent || date > mostRecent) {
      mostRecent = date;
    }
  }

  return mostRecent?.toISOString();
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
    formAnswerGroups: Array<{ id: string; created_at: string; updated_at?: string }>;
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
