// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient } from '@medplum/core';

/**
 * Thin wrapper around the NPPES NPI Registry Read API (v2.1).
 *
 * The NPPES API is a public, read-only, unauthenticated endpoint provided by
 * CMS for looking up National Provider Identifier (NPI) records. It accepts a
 * GET request with query string parameters and responds with JSON.
 *
 * See https://npiregistry.cms.hhs.gov/api-page for the full list of supported
 * fields, validation rules, and result limits (max 200 per request, skip up to
 * 1000).
 *
 * This bot intentionally does not transform the response into FHIR resources —
 * it is a thin pass-through so callers can use the raw NPPES output directly,
 * or wrap this bot in another bot that maps the result into a FHIR
 * Practitioner/Organization.
 *
 * For more information on how to model provider credentials, see the [Provider Credentials documentation](/docs/administration/provider-directory/provider-credentials).
 *
 * @example
 * ```ts
 * const result = await handler(medplum, {
 *   bot: { reference: 'Bot/<your-bot-id>' },
 *   input: { number: '1234567893' },
 * });
 * ```
 */

const NPPES_ENDPOINT = 'https://npiregistry.cms.hhs.gov/api/';
const NPPES_API_VERSION = '2.1';

export interface NppesLookupInput {
  /** The 10-digit National Provider Identifier. */
  number?: string;
  /** `NPI-1` for individual providers, `NPI-2` for organizational providers. */
  enumeration_type?: 'NPI-1' | 'NPI-2';
  taxonomy_description?: string;
  /** `AO` (Authorized Official) or `Provider`. Defaults to provider name. */
  name_purpose?: 'AO' | 'Provider';
  /** Individual providers only. Trailing wildcards (e.g. `jo*`) are allowed. */
  first_name?: string;
  /** When `true`, includes similar/alias first names (Robert -> Bob, Robbie). */
  use_first_name_alias?: boolean;
  /** Individual providers only. Trailing wildcards allowed. */
  last_name?: string;
  /** Organizational providers only. Trailing wildcards allowed. */
  organization_name?: string;
  address_purpose?: 'LOCATION' | 'MAILING' | 'PRIMARY' | 'SECONDARY';
  city?: string;
  /** Two-letter state abbreviation. Cannot be the only criterion. */
  state?: string;
  /** 5- or 9-digit ZIP, or a trailing wildcard (e.g. `21*`). */
  postal_code?: string;
  country_code?: string;
  /** 1-200, defaults to 10. */
  limit?: number;
  /** Skip the first N matching records. Max 1000. */
  skip?: number;
  /** Pretty-print the JSON response. */
  pretty?: boolean;
}

export interface NppesLookupResult {
  result_count: number;
  results: unknown[];
  /** NPPES sometimes returns `Errors` instead of `results` when validation fails. */
  Errors?: { description: string; field?: string; number?: string }[];
}

const allowedInputKeys = new Set<string>([
  'number',
  'enumeration_type',
  'taxonomy_description',
  'name_purpose',
  'first_name',
  'use_first_name_alias',
  'last_name',
  'organization_name',
  'address_purpose',
  'city',
  'state',
  'postal_code',
  'country_code',
  'limit',
  'skip',
  'pretty',
]);

function validateInput(input: unknown): NppesLookupInput {
  if (input === undefined || input === null) {
    throw new Error('NPPES lookup input is required.');
  }

  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('NPPES lookup input must be an object.');
  }

  const typedInput = input as Record<string, unknown>;
  let hasSearchCriterion = false;

  for (const [key, value] of Object.entries(typedInput)) {
    if (!allowedInputKeys.has(key)) {
      throw new Error(`NPPES lookup input includes unsupported field: ${key}`);
    }

    if (value === undefined || value === null || value === '') {
      continue;
    }

    hasSearchCriterion = true;

    if (key === 'number' && (typeof value !== 'string' || !/^\d{10}$/.test(value))) {
      throw new Error('NPPES lookup "number" must be a 10-digit string.');
    }

    if (key === 'limit' && (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 200)) {
      throw new Error('NPPES lookup "limit" must be an integer between 1 and 200.');
    }

    if (key === 'skip' && (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1000)) {
      throw new Error('NPPES lookup "skip" must be an integer between 0 and 1000.');
    }
  }

  if (!hasSearchCriterion) {
    throw new Error('NPPES lookup requires at least one search criterion.');
  }

  return typedInput;
}

export async function handler(_medplum: MedplumClient, event: BotEvent<NppesLookupInput>): Promise<NppesLookupResult> {
  const input = validateInput(event.input);

  const params = new URLSearchParams();
  params.set('version', NPPES_API_VERSION);

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    params.set(key, String(value));
  }

  const url = `${NPPES_ENDPOINT}?${params.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`NPPES API request failed: ${response.status} ${response.statusText} — ${body}`);
  }

  return (await response.json()) as NppesLookupResult;
}
