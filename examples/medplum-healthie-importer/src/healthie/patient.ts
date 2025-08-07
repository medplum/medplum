// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContactPoint, Patient } from '@medplum/fhirtypes';
import { HealthieClient } from './client';
import { HEALTHIE_USER_ID_SYSTEM } from './constants';

/**
 * Interface for Healthie location data.
 */
export interface HealthieLocation {
  zip: string;
  line1: string;
  line2: string;
  to_oneline: string;
  city: string;
  country: string;
  cursor: string;
  state: string;
}

/**
 * Interface for Healthie patient/user data.
 */
export interface HealthiePatient {
  id: string;
  active: boolean;
  name: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  gender: string;
  gender_identity: string;
  sex: string;
  sexual_orientation: string;
  locations: HealthieLocation[];
}

/**
 * Options for fetching Healthie patient IDs.
 */
export interface FetchHealthiePatientIdsOptions {
  /** Filter users updated since this date (ISO 8601 format) */
  sinceLastUpdated?: string;
  /**
   * Maximum number of patient IDs to return (for pagination).
   */
  count?: number;

  /**
   * Number of patient IDs to skip before starting to collect the result set (for pagination).
   */
  offset?: number;
}

/**
 * Fetches patient IDs from Healthie with optional filtering and cursor-based pagination.
 * @param healthie - The Healthie client instance to use for API calls.
 * @param options - Optional filtering and pagination parameters.
 * @returns An array of patient IDs.
 */
export async function fetchHealthiePatientIds(
  healthie: HealthieClient,
  options: FetchHealthiePatientIdsOptions = {}
): Promise<string[]> {
  const { sinceLastUpdated, count, offset } = options;

  // Fetch all pages
  let allUsers: { id: string; updated_at: string }[] = [];
  let hasMorePages = true;
  let nextCursor = undefined;
  let loopCount = 0;

  while (hasMorePages) {
    const {
      users,
      nextCursor: endCursor,
      hasNextPage,
    } = await fetchHealthiePatientIdsPage(healthie, {
      sinceLastUpdated,
      after: nextCursor,
      offset,
    });

    allUsers.push(...users.map((user) => ({ id: user.id, updated_at: user.updated_at })));
    if (count !== undefined && allUsers.length >= count) {
      allUsers = allUsers.slice(0, count);
      break;
    }

    // Update pagination state
    hasMorePages = hasNextPage;
    nextCursor = endCursor;

    // Prevent infinite loop
    loopCount++;
    if (loopCount > 10000) {
      throw new Error('Exiting fetchHealthiePatientIds due to too many pages');
    }
  }

  // Client-side filtering by updated_at if sinceLastUpdated is provided
  if (sinceLastUpdated) {
    const sinceDate = new Date(sinceLastUpdated);
    allUsers = allUsers.filter((user) => {
      const updatedAt = new Date(user.updated_at);
      return updatedAt >= sinceDate;
    });
  }

  return allUsers.map((user) => user.id);
}

/**
 * Fetches a single page of patient IDs using cursor-based pagination.
 * @param healthie - The Healthie client instance to use for API calls.
 * @param options - Configuration options for the fetch operation.
 * @param options.sinceLastUpdated - Filter users updated since this date (ISO 8601 format).
 * @param options.after - Cursor for pagination - fetch results after this cursor.
 * @param options.pageSize - Number of items to return per page.
 * @param options.offset - Number of items to skip before starting to collect the result set (for pagination).
 * @returns Page result with users and pagination metadata.
 */
export async function fetchHealthiePatientIdsPage(
  healthie: HealthieClient,
  options: {
    sinceLastUpdated?: string;
    offset?: number;
    after?: string;
    pageSize?: number;
  } = {}
): Promise<{
  users: { id: string; updated_at: string }[];
  nextCursor: string | undefined;
  hasNextPage: boolean;
}> {
  const { sinceLastUpdated, after, pageSize = 50, offset } = options;

  const query = `
    query fetchPatientIds($after: Cursor, $pageSize: Int, $offset: Int,) {
      users(
        should_paginate: true,
        offset: $offset,
        after: $after,
        page_size: $pageSize
      ) {
        id
        updated_at
        cursor
      }
    }
  `;

  const variables: { after?: string; pageSize?: number; offset?: number } = { after, pageSize, offset };

  const result = await healthie.query<{ users: { id: string; updated_at: string; cursor: string }[] }>(
    query,
    variables
  );
  let users = result.users ?? [];

  // Client-side filtering by updated_at if sinceLastUpdated is provided
  if (sinceLastUpdated) {
    const filterDate = new Date(sinceLastUpdated);
    users = users.filter((user) => {
      const userUpdatedAt = new Date(user.updated_at);
      return userUpdatedAt >= filterDate;
    });
  }

  const hasNextPage = users.length === pageSize;
  const nextCursor = users.length > 0 ? users[users.length - 1].cursor : undefined;

  return {
    users: users.map((user) => ({ id: user.id, updated_at: user.updated_at })),
    nextCursor,
    hasNextPage,
  };
}

/**
 * Fetches patients from Healthie.
 * @param healthie - The Healthie client instance to use for API calls.
 * @param patientIds - An array of patient IDs to fetch.
 * @returns An array of patient data.
 */
export async function fetchHealthiePatients(
  healthie: HealthieClient,
  patientIds?: string[]
): Promise<HealthiePatient[]> {
  const query = `
    query fetchPatients($ids: [ID!]!) {
      users(ids: $ids) {
        id
        active
        name
        first_name
        last_name
        phone_number
        gender
        gender_identity
        sex
        sexual_orientation
        locations {
          zip
          line1
          line2
          to_oneline
          city
          country
          cursor
          state
        }
      }
    }
  `;

  if (!patientIds) {
    patientIds = await fetchHealthiePatientIds(healthie);
  }

  const result = await healthie.query<{ users: HealthiePatient[] }>(query, { ids: patientIds });
  return result.users ?? [];
}

export function convertHealthiePatientToFhir(healthiePatient: HealthiePatient): Patient {
  const telecom: ContactPoint[] = [];
  if (healthiePatient.phone_number) {
    telecom.push({
      system: 'phone',
      value: healthiePatient.phone_number,
    });
  }
  // Create a FHIR Patient resource from Healthie patient data
  const fhirPatient: Patient = {
    resourceType: 'Patient',
    // Add Healthie user ID as an identifier to link the systems
    identifier: [
      {
        system: HEALTHIE_USER_ID_SYSTEM,
        value: healthiePatient.id,
      },
    ],
    // Map patient name information
    name: [
      {
        given: [healthiePatient.first_name],
        family: healthiePatient.last_name,
      },
    ],

    telecom,

    // Map address information if available
    address:
      healthiePatient.locations && healthiePatient.locations.length > 0
        ? [
            {
              line: [healthiePatient.locations[0].line1],
              city: healthiePatient.locations[0].city,
              state: healthiePatient.locations[0].state,
              postalCode: healthiePatient.locations[0].zip,
              country: healthiePatient.locations[0].country,
            },
          ]
        : undefined,
    // Map gender with appropriate transformation
    gender: healthiePatient.gender ? mapHealthieGender(healthiePatient.gender) : undefined,
  };
  return fhirPatient;
}

/**
 * Maps Healthie gender values to FHIR gender values.
 * @param healthieGender - The gender value from Healthie.
 * @returns A FHIR-compliant gender value.
 */
export function mapHealthieGender(healthieGender?: string): Patient['gender'] {
  if (!healthieGender) {
    return 'unknown';
  }

  const lowerGender = healthieGender.toLowerCase();

  if (lowerGender === 'male') {
    return 'male';
  } else if (lowerGender === 'female') {
    return 'female';
  } else {
    return 'other';
  }
}
