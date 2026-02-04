// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient } from '@medplum/core';
import { HealthieClient } from './healthie/client';
import { fetchLatestClinicalUpdate } from './healthie/clinical-activity';

/**
 * Input interface for the List Healthie Patients bot.
 */
export interface ListHealthiePatientsInput {
  /** Optional filters for patient selection */
  filters?: {
    /** Filter by patients updated since this date (ISO 8601 format) */
    sinceLastUpdated?: string;
    /** Partial match on patient name (first or last) */
    name?: string;
    /** Filter by date of birth (YYYY-MM-DD format) */
    dateOfBirth?: string;
  };

  /**
   * Optional pagination parameters.
   * If omitted, returns ALL matching results.
   */
  pagination?: {
    /** 0-indexed page number (default: 0) */
    page?: number;
    /** Results per page (default: 100) */
    pageSize?: number;
  };

  /** Optional cap on total results returned */
  maxResults?: number;

  /** Include name, DOB, and updatedAt in response */
  includeDemographics?: boolean;

  /**
   * Include clinical update dates in response.
   * When true, fetches the most recent update date from medications, allergies, and form responses
   * for each patient. This is expensive as it requires 3 additional API calls per patient.
   * When combined with sinceLastUpdated filter, filters by clinical activity instead of patient record.
   */
  includeClinicalUpdateDates?: boolean;
}

/**
 * Patient entry in the response.
 */
export interface ListHealthiePatientsEntry {
  /** Healthie patient ID */
  id: string;
  /** Last updated timestamp (ISO 8601) */
  updatedAt: string;
  /** Optional demographics (if includeDemographics is true) */
  demographics?: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
  };
  /**
   * Latest clinical update across all resource types (if includeClinicalUpdateDates is true).
   * This is the max of the most recent medication, allergy, and form response update dates.
   */
  latestClinicalUpdate?: string;
}

/**
 * Pagination metadata in the response.
 */
export interface ListHealthiePatientsPagination {
  /** Current page (0-indexed) */
  page: number;
  /** Results per page */
  pageSize: number;
  /** Total pages available */
  totalPages: number;
  /** Total matching patients */
  totalCount: number;
  /** Whether there are more pages */
  hasNextPage: boolean;
}

/**
 * Output interface for the List Healthie Patients bot.
 */
export interface ListHealthiePatientsOutput {
  /** Array of patient entries */
  patients: ListHealthiePatientsEntry[];
  /** Pagination metadata */
  pagination: ListHealthiePatientsPagination;
}

/**
 * Internal patient data structure for fetching with demographics.
 */
interface HealthiePatientWithDemographics {
  id: string;
  updated_at: string;
  first_name?: string;
  last_name?: string;
  dob?: string;
  cursor?: string;
  /** Latest clinical update date (added after fetching clinical data) */
  latest_clinical_update?: string;
}

/**
 * Fetches all patients from Healthie using cursor pagination.
 * @param healthie - The Healthie client instance.
 * @param filters - Optional filters to apply.
 * @param includeDemographics - Whether to fetch demographic data.
 * @returns Array of patient data.
 */
async function fetchAllPatientsWithCursor(
  healthie: HealthieClient,
  filters?: ListHealthiePatientsInput['filters'],
  includeDemographics?: boolean
): Promise<HealthiePatientWithDemographics[]> {
  const allPatients: HealthiePatientWithDemographics[] = [];
  let cursor: string | undefined = undefined;
  let loopCount = 0;
  const pageSize = 50;

  // Build the query based on whether we need demographics
  const buildQuery = (): string => {
    if (includeDemographics) {
      return `
        query fetchPatientIds($after: Cursor, $pageSize: Int) {
          users(
            should_paginate: true,
            after: $after,
            page_size: $pageSize
          ) {
            id
            updated_at
            first_name
            last_name
            dob
            cursor
          }
        }
      `;
    }
    return `
      query fetchPatientIds($after: Cursor, $pageSize: Int) {
        users(
          should_paginate: true,
          after: $after,
          page_size: $pageSize
        ) {
          id
          updated_at
          cursor
        }
      }
    `;
  };

  const query = buildQuery();

  while (true) {
    const result: { users: HealthiePatientWithDemographics[] } = await healthie.query<{
      users: HealthiePatientWithDemographics[];
    }>(query, {
      after: cursor,
      pageSize,
    });

    const users: HealthiePatientWithDemographics[] = result.users ?? [];

    // Apply filters
    let filteredUsers: HealthiePatientWithDemographics[] = users;

    // Filter by sinceLastUpdated
    if (filters?.sinceLastUpdated) {
      const sinceDate = new Date(filters.sinceLastUpdated);
      filteredUsers = filteredUsers.filter((user: HealthiePatientWithDemographics) => {
        const updatedAt = new Date(user.updated_at);
        return updatedAt >= sinceDate;
      });
    }

    // Filter by name (partial match on first or last name)
    if (filters?.name) {
      const nameFilter = filters.name.toLowerCase();
      filteredUsers = filteredUsers.filter((user: HealthiePatientWithDemographics) => {
        const firstName = user.first_name?.toLowerCase() ?? '';
        const lastName = user.last_name?.toLowerCase() ?? '';
        return firstName.includes(nameFilter) || lastName.includes(nameFilter);
      });
    }

    // Filter by date of birth
    if (filters?.dateOfBirth) {
      filteredUsers = filteredUsers.filter((user: HealthiePatientWithDemographics) => user.dob === filters.dateOfBirth);
    }

    allPatients.push(...filteredUsers);

    // Check if we've reached the end
    if (users.length < pageSize) {
      break;
    }

    // Get cursor for next page
    cursor = users.at(-1)?.cursor;
    if (!cursor) {
      break;
    }

    // Prevent infinite loop
    loopCount++;
    if (loopCount > 10000) {
      throw new Error('Exiting fetchAllPatientsWithCursor due to too many pages');
    }
  }

  return allPatients;
}

/**
 * Converts internal patient data to output format.
 * @param patient - The internal patient data.
 * @param includeDemographics - Whether to include demographics in the output.
 * @param includeClinicalUpdateDates - Whether to include clinical update dates in the output.
 * @returns The formatted output entry.
 */
function toOutputEntry(
  patient: HealthiePatientWithDemographics,
  includeDemographics?: boolean,
  includeClinicalUpdateDates?: boolean
): ListHealthiePatientsEntry {
  const entry: ListHealthiePatientsEntry = {
    id: patient.id,
    updatedAt: patient.updated_at,
  };

  if (includeDemographics) {
    entry.demographics = {
      firstName: patient.first_name,
      lastName: patient.last_name,
      dateOfBirth: patient.dob,
    };
  }

  if (includeClinicalUpdateDates && patient.latest_clinical_update) {
    entry.latestClinicalUpdate = patient.latest_clinical_update;
  }

  return entry;
}

/**
 * Bot handler for listing Healthie patients with filtering and pagination.
 *
 * @param medplum - The Medplum client instance (unused but required for bot signature).
 * @param event - The bot event containing input parameters.
 * @returns List of patients with pagination metadata.
 */
export async function handler(
  medplum: MedplumClient,
  event: BotEvent<ListHealthiePatientsInput>
): Promise<ListHealthiePatientsOutput> {
  const { HEALTHIE_API_URL, HEALTHIE_CLIENT_SECRET } = event.secrets;
  const { filters, pagination, maxResults, includeDemographics, includeClinicalUpdateDates } = event.input;

  if (!HEALTHIE_API_URL?.valueString) {
    throw new Error('HEALTHIE_API_URL must be set');
  }
  if (!HEALTHIE_CLIENT_SECRET?.valueString) {
    throw new Error('HEALTHIE_CLIENT_SECRET must be set');
  }

  const healthie = new HealthieClient(HEALTHIE_API_URL.valueString, HEALTHIE_CLIENT_SECRET.valueString);

  // When includeClinicalUpdateDates is true, we need to:
  // 1. Fetch patients without sinceLastUpdated filter (we'll filter after getting clinical dates)
  // 2. Fetch clinical dates for each patient
  // 3. Apply sinceLastUpdated filter on clinical dates
  const filtersForPatientFetch = includeClinicalUpdateDates
    ? { ...filters, sinceLastUpdated: undefined } // Exclude sinceLastUpdated for initial fetch
    : filters;

  // Fetch ALL matching patients using cursor pagination internally
  let allPatients = await fetchAllPatientsWithCursor(healthie, filtersForPatientFetch, includeDemographics);

  // If includeClinicalUpdateDates is true, fetch clinical dates for each patient
  if (includeClinicalUpdateDates) {
    // Fetch clinical dates in parallel (batched to avoid overwhelming the API)
    const batchSize = 10; // Process 10 patients at a time
    for (let i = 0; i < allPatients.length; i += batchSize) {
      const batch = allPatients.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (patient) => {
          patient.latest_clinical_update = await fetchLatestClinicalUpdate(healthie, patient.id);
        })
      );
    }

    // Apply sinceLastUpdated filter on clinical dates
    if (filters?.sinceLastUpdated) {
      const sinceDate = new Date(filters.sinceLastUpdated);
      allPatients = allPatients.filter((patient) => {
        if (!patient.latest_clinical_update) {
          return false; // No clinical data, exclude
        }
        const clinicalDate = new Date(patient.latest_clinical_update);
        return clinicalDate >= sinceDate;
      });
    }
  }

  // Apply maxResults cap if specified
  const cappedPatients = maxResults ? allPatients.slice(0, maxResults) : allPatients;

  // If no pagination requested, return all results
  if (!pagination) {
    return {
      patients: cappedPatients.map((p) => toOutputEntry(p, includeDemographics, includeClinicalUpdateDates)),
      pagination: {
        page: 0,
        pageSize: cappedPatients.length,
        totalPages: 1,
        totalCount: cappedPatients.length,
        hasNextPage: false,
      },
    };
  }

  // Apply page/offset pagination on top of full results
  const { page = 0, pageSize = 100 } = pagination;
  const startIndex = page * pageSize;
  const pagePatients = cappedPatients.slice(startIndex, startIndex + pageSize);
  const totalPages = Math.ceil(cappedPatients.length / pageSize);

  return {
    patients: pagePatients.map((p) => toOutputEntry(p, includeDemographics, includeClinicalUpdateDates)),
    pagination: {
      page,
      pageSize,
      totalPages,
      totalCount: cappedPatients.length,
      hasNextPage: page < totalPages - 1,
    },
  };
}
