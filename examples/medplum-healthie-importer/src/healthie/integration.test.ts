// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/**
 * Integration tests for the Healthie API client.
 *
 * These tests are skipped by default unless HEALTHIE_API_URL and HEALTHIE_CLIENT_SECRET
 * environment variables are set (e.g., via a .env file).
 *
 * To run these tests:
 * 1. Create a .env file with HEALTHIE_API_URL and HEALTHIE_CLIENT_SECRET
 * 2. Run: npm test -- --run src/healthie/integration.test.ts
 */
import { config } from 'dotenv';
import { describe, expect, test } from 'vitest';
import { HealthieClient } from './client';
import { fetchAllergySensitivities } from './allergy';
import { fetchMedications } from './medication';
import { fetchHealthieFormAnswerGroups } from './questionnaire-response';
import {
  fetchMostRecentAllergyDate,
  fetchMostRecentMedicationDate,
  fetchMostRecentFormAnswerGroupDate,
  fetchLatestClinicalUpdate,
} from './clinical-activity';

// Load .env file
config();

// Both HEALTHIE_API_URL and HEALTHIE_CLIENT_SECRET must be set
const HEALTHIE_API_URL = process.env.HEALTHIE_API_URL;
const HEALTHIE_CLIENT_SECRET = process.env.HEALTHIE_CLIENT_SECRET;

// Skip all tests if credentials are not available
const shouldSkip = !HEALTHIE_API_URL || !HEALTHIE_CLIENT_SECRET;

describe.skipIf(shouldSkip)('Healthie API Integration Tests', () => {
  let healthieClient: HealthieClient;

  // We need at least one patient ID for testing. This will be fetched dynamically.
  let testPatientId: string | undefined;

  test('can connect and fetch users', async () => {
    // These are guaranteed to be defined since we skipIf(!HEALTHIE_API_URL || !HEALTHIE_CLIENT_SECRET)
    const apiUrl = HEALTHIE_API_URL as string;
    const clientSecret = HEALTHIE_CLIENT_SECRET as string;
    healthieClient = new HealthieClient(apiUrl, clientSecret);

    // Fetch users to verify connectivity and find one with clinical data
    const query = `
      query fetchUsers {
        users(page_size: 20) {
          id
          first_name
          last_name
          updated_at
          medications_count
        }
      }
    `;

    const result = await healthieClient.query<{
      users: { id: string; first_name?: string; last_name?: string; updated_at: string; medications_count?: number }[];
    }>(query);

    expect(result.users).toBeDefined();
    expect(Array.isArray(result.users)).toBe(true);
    expect(result.users.length).toBeGreaterThan(0);

    // Try to find a patient with medications, otherwise use the first one
    const patientWithMeds = result.users.find((u) => (u.medications_count ?? 0) > 0);
    testPatientId = patientWithMeds?.id ?? result.users[0].id;
    console.log(
      `Using test patient ID: ${testPatientId}` +
        (patientWithMeds ? ` (has ${patientWithMeds.medications_count} medications)` : ' (no medications)')
    );
  });

  test('can fetch medications for a patient', async () => {
    if (!testPatientId) {
      console.log('Skipping: No test patient available');
      return;
    }

    const medications = await fetchMedications(healthieClient, testPatientId);

    expect(Array.isArray(medications)).toBe(true);
    console.log(`Found ${medications.length} medications for patient ${testPatientId}`);

    // If there are medications, verify they have expected structure
    if (medications.length > 0) {
      const med = medications[0];
      expect(med.id).toBeDefined();
      expect(typeof med.id).toBe('string');
      expect(med.created_at).toBeDefined();
      // Log details to help verify data looks correct
      console.log(`  First medication: id=${med.id}, name=${med.name}, active=${med.active}`);
    }
  });

  test('can fetch allergies for a patient', async () => {
    if (!testPatientId) {
      console.log('Skipping: No test patient available');
      return;
    }

    const allergies = await fetchAllergySensitivities(healthieClient, testPatientId);

    expect(Array.isArray(allergies)).toBe(true);
    console.log(`Found ${allergies.length} allergies for patient ${testPatientId}`);

    // If there are allergies, verify they have expected structure
    if (allergies.length > 0) {
      const allergy = allergies[0];
      expect(allergy.id).toBeDefined();
      expect(typeof allergy.id).toBe('string');
      expect(allergy.created_at).toBeDefined();
      // Log details to help verify data looks correct
      console.log(`  First allergy: id=${allergy.id}, name=${allergy.name}, category=${allergy.category}`);
    }
  });

  test('can fetch form answer groups for a patient', async () => {
    if (!testPatientId) {
      console.log('Skipping: No test patient available');
      return;
    }

    const forms = await fetchHealthieFormAnswerGroups(testPatientId, healthieClient);

    expect(Array.isArray(forms)).toBe(true);
    console.log(`Found ${forms.length} form answer groups for patient ${testPatientId}`);

    // If there are forms, verify they have expected structure
    if (forms.length > 0) {
      const form = forms[0];
      expect(form.id).toBeDefined();
      expect(typeof form.id).toBe('string');
      expect(form.created_at).toBeDefined();
      // Log details to help verify data looks correct
      console.log(`  First form: id=${form.id}, name=${form.name}, finished=${form.finished}`);

      // Verify form_answers structure if present
      if (form.form_answers && form.form_answers.length > 0) {
        const answer = form.form_answers[0];
        expect(answer.id).toBeDefined();
        console.log(`  First form has ${form.form_answers.length} answers`);
      }
    }
  });

  test('can fetch most recent medication date', async () => {
    if (!testPatientId) {
      console.log('Skipping: No test patient available');
      return;
    }

    const date = await fetchMostRecentMedicationDate(healthieClient, testPatientId);

    // Date can be undefined if patient has no medications
    if (date) {
      expect(typeof date).toBe('string');
      // Verify it's a valid ISO date
      expect(new Date(date).toISOString()).toBe(date);
      console.log(`Most recent medication date: ${date}`);
    } else {
      console.log('No medications found for patient');
    }
  });

  test('can fetch most recent allergy date via User.last_updated_allergy', async () => {
    if (!testPatientId) {
      console.log('Skipping: No test patient available');
      return;
    }

    const date = await fetchMostRecentAllergyDate(healthieClient, testPatientId);

    // Date can be undefined if patient has no allergies
    if (date) {
      expect(typeof date).toBe('string');
      // Verify it's a valid ISO date
      expect(new Date(date).toISOString()).toBe(date);
      console.log(`Most recent allergy date: ${date}`);
    } else {
      console.log('No allergies found for patient');
    }
  });

  test('can fetch most recent form answer group date', async () => {
    if (!testPatientId) {
      console.log('Skipping: No test patient available');
      return;
    }

    const date = await fetchMostRecentFormAnswerGroupDate(healthieClient, testPatientId);

    // Date can be undefined if patient has no forms
    if (date) {
      expect(typeof date).toBe('string');
      // Verify it's a valid ISO date
      expect(new Date(date).toISOString()).toBe(date);
      console.log(`Most recent form date: ${date}`);
    } else {
      console.log('No form answer groups found for patient');
    }
  });

  test('can fetch latest clinical update across all resources', async () => {
    if (!testPatientId) {
      console.log('Skipping: No test patient available');
      return;
    }

    const date = await fetchLatestClinicalUpdate(healthieClient, testPatientId);

    // Date can be undefined if patient has no clinical data
    if (date) {
      expect(typeof date).toBe('string');
      // Verify it's a valid ISO date
      expect(new Date(date).toISOString()).toBe(date);
      console.log(`Latest clinical update: ${date}`);
    } else {
      console.log('No clinical data found for patient');
    }
  });
});
