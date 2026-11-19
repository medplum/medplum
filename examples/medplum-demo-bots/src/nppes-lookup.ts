// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient } from '@medplum/core';
import { formatHumanName, generateId, normalizeErrorString } from '@medplum/core';
import type {
  Address,
  Bundle,
  BundleEntry,
  CodeableConcept,
  ContactPoint,
  HumanName,
  Identifier,
  OperationOutcome,
  OperationOutcomeIssue,
  Practitioner,
  PractitionerRole,
  Reference,
} from '@medplum/fhirtypes';

// NPPES NPI Registry search -> FHIR searchset Bundle. Nothing saved; callers decide what to store.
// Runs server-side because NPPES sends no CORS headers (browsers can't call it directly).
// Per individual (NPI-1): Practitioner (match) + PractitionerRole (include), linked by urn:uuid fullUrl.
// Individual providers only: NPI-1 is always sent; organization inputs are rejected.
// Skipped records (e.g. malformed) -> one OperationOutcome entry (outcome). NPPES `Errors` -> throws.
// NPPES casing (upper case) is kept as-is; format for display in the app.
// API docs: https://npiregistry.cms.hhs.gov/api-page

const NPPES_ENDPOINT = 'https://npiregistry.cms.hhs.gov/api/';
const NPPES_API_VERSION = '2.1';

export type PractitionerBundle = Bundle<Practitioner | PractitionerRole | OperationOutcome>;

// FHIR systems
export const NPI_SYSTEM = 'http://hl7.org/fhir/sid/us-npi';
export const NUCC_SYSTEM = 'http://nucc.org/provider-taxonomy';
// Role identifier (value = NPI) for update-or-create. Don't change: saved roles depend on it.
// Roles have no standard business id; mirrors SERVICE_FACILITY_ROLE_SYSTEM in react-scheduling.
export const NPPES_PRACTITIONER_ROLE_SYSTEM = 'https://medplum.com/fhir/nppes-practitioner-role';

// Bot input = NPPES query params
export interface NppesLookupInput {
  number?: string; // 10-digit NPI
  enumeration_type?: 'NPI-1'; // always NPI-1 (individuals); NPI-2 rejected
  taxonomy_description?: string;
  first_name?: string; // trailing * ok
  use_first_name_alias?: boolean;
  last_name?: string; // trailing * ok
  address_purpose?: 'LOCATION' | 'MAILING' | 'PRIMARY' | 'SECONDARY';
  city?: string;
  state?: string; // not allowed alone
  postal_code?: string;
  country_code?: string;
  limit?: number; // 1-200, NPPES default 10
  skip?: number; // max 1000
  pretty?: boolean;
}

export interface NppesApiResponse {
  result_count: number;
  results: NppesRecord[];
  Errors?: { description: string; field?: string; number?: string }[]; // rejected search
}

// NPPES record fields we map (NPPES omits empty fields)
export interface NppesRecord {
  number: string;
  enumeration_type: 'NPI-1' | 'NPI-2';
  basic: NppesBasic;
  addresses?: NppesAddress[];
  taxonomies?: NppesTaxonomy[];
}

export interface NppesBasic {
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  name_prefix?: string;
  name_suffix?: string;
  credential?: string; // not mapped yet
  sex?: string; // M | F
  status?: string; // A = active
}

export interface NppesAddress {
  address_purpose: string; // LOCATION = practice, MAILING
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postal_code?: string; // 5 or 9 digits, no dash
  country_code?: string;
  telephone_number?: string;
  fax_number?: string;
}

export interface NppesTaxonomy {
  code: string; // NUCC
  desc: string;
  primary: boolean;
  state?: string | null;
  license?: string | null;
}

const allowedInputKeys = new Set<string>([
  'number',
  'enumeration_type',
  'taxonomy_description',
  'first_name',
  'use_first_name_alias',
  'last_name',
  'address_purpose',
  'city',
  'state',
  'postal_code',
  'country_code',
  'limit',
  'skip',
  'pretty',
]);

const ORGANIZATION_ONLY_KEYS = new Set<string>(['organization_name', 'name_purpose']);

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
    // organization searches only return NPI-2 records, which this bot can't convert
    if (ORGANIZATION_ONLY_KEYS.has(key) || (key === 'enumeration_type' && value !== 'NPI-1' && value !== '')) {
      throw new Error(`NPPES lookup supports individual providers (NPI-1) only; "${key}" is not supported.`);
    }

    if (!allowedInputKeys.has(key)) {
      throw new Error(`NPPES lookup input includes unsupported field: ${key}`);
    }

    // empty values are dropped, not sent, so they don't count as criteria
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

export async function handler(_medplum: MedplumClient, event: BotEvent<NppesLookupInput>): Promise<PractitionerBundle> {
  const input = validateInput(event.input);

  const params = new URLSearchParams();
  params.set('version', NPPES_API_VERSION);
  params.set('enumeration_type', 'NPI-1'); // individuals only; NPPES doesn't count this as a criterion

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '' || key === 'enumeration_type') {
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

  // NPPES returns HTTP 200 with `Errors` for rejected searches (e.g. state alone), so check explicitly
  const body = (await response.json()) as NppesApiResponse;
  if (body.Errors?.length) {
    throw new Error(`NPPES rejected the search: ${body.Errors.map((e) => e.description).join('; ')}`);
  }
  return toPractitionerBundle(body.results ?? []);
}

// --- NPPES -> FHIR field mappers ---
// Each returns undefined for missing input so empty FHIR fields are omitted, not set to [] or ''.

// trimmed, or undefined if empty
function clean(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

export function mapNppesName(basic: NppesBasic): HumanName | undefined {
  const given = [clean(basic.first_name), clean(basic.middle_name)].filter((n): n is string => !!n);
  const family = clean(basic.last_name);
  if (!family && given.length === 0) {
    return undefined;
  }
  const prefix = clean(basic.name_prefix);
  const suffix = clean(basic.name_suffix);
  return {
    use: 'official',
    family,
    given: given.length > 0 ? given : undefined,
    prefix: prefix ? [prefix] : undefined,
    suffix: suffix ? [suffix] : undefined,
  };
}

// M/F -> male/female, other -> unknown
export function mapNppesSex(sex: string | undefined): 'male' | 'female' | 'unknown' | undefined {
  switch (sex?.trim().toUpperCase()) {
    case undefined:
    case '':
      return undefined;
    case 'M':
      return 'male';
    case 'F':
      return 'female';
    default:
      return 'unknown';
  }
}

// A -> active
export function mapNppesStatus(status: string | undefined): boolean | undefined {
  const value = status?.trim().toUpperCase();
  if (!value) {
    return undefined;
  }
  return value === 'A';
}

// practice (LOCATION) address only; MAILING is often a PO box and not where the provider sees patients
export function getPracticeAddress(addresses: NppesAddress[] | undefined): NppesAddress | undefined {
  return addresses?.find((a) => a.address_purpose?.toUpperCase() === 'LOCATION');
}

// 100010000 -> 10001-0000
export function formatPostalCode(postalCode: string | undefined): string | undefined {
  const value = postalCode?.trim();
  if (!value) {
    return undefined;
  }
  return /^\d{9}$/.test(value) ? `${value.slice(0, 5)}-${value.slice(5)}` : value;
}

export function mapNppesAddress(address: NppesAddress | undefined): Address | undefined {
  if (!address) {
    return undefined;
  }
  const line = [clean(address.address_1), clean(address.address_2)].filter((l): l is string => !!l);
  return {
    use: 'work',
    type: 'physical',
    line: line.length > 0 ? line : undefined,
    city: clean(address.city),
    state: address.state?.trim().toUpperCase() || undefined,
    postalCode: formatPostalCode(address.postal_code),
    country: address.country_code?.trim().toUpperCase() || undefined,
  };
}

// work phone + fax
export function mapNppesTelecom(address: NppesAddress | undefined): ContactPoint[] | undefined {
  const telecom: ContactPoint[] = [];
  const phone = address?.telephone_number?.trim();
  const fax = address?.fax_number?.trim();
  if (phone) {
    telecom.push({ system: 'phone', value: phone, use: 'work' });
  }
  if (fax) {
    telecom.push({ system: 'fax', value: fax, use: 'work' });
  }
  return telecom.length > 0 ? telecom : undefined;
}

// NUCC specialties: primary first, no duplicate codes
// Same code repeats once per state license in NPPES. Codes come from NPPES as-is; nothing is mapped or invented.
export function mapNppesTaxonomies(taxonomies: NppesTaxonomy[] | undefined): CodeableConcept[] | undefined {
  const seen = new Set<string>();
  const specialties: CodeableConcept[] = [];
  const sorted = [...(taxonomies ?? [])].sort((a, b) => Number(b.primary) - Number(a.primary));
  for (const t of sorted) {
    const code = t.code?.trim();
    if (!code || seen.has(code)) {
      continue;
    }
    seen.add(code);
    specialties.push({ coding: [{ system: NUCC_SYSTEM, code, display: t.desc }], text: t.desc });
  }
  return specialties.length > 0 ? specialties : undefined;
}

// --- NPPES -> Practitioner / PractitionerRole ---

// NPI-1 with 10-digit NPI only. Throws so toPractitionerBundle can skip the record and report it.
function assertIndividualProvider(record: NppesRecord): void {
  if (record.enumeration_type !== 'NPI-1') {
    throw new Error(
      `Only individual providers (NPI-1) can be converted to a Practitioner; got ${record.enumeration_type}`
    );
  }
  if (!/^\d{10}$/.test(record.number ?? '')) {
    throw new Error(`NPPES record has an invalid NPI: ${record.number}`);
  }
}

export function getNpiIdentifier(record: NppesRecord): Identifier {
  return { system: NPI_SYSTEM, value: record.number };
}

// not mapped yet: credential, licenses, other names, mailing address, endpoints
export function convertNppesToPractitioner(record: NppesRecord): Practitioner {
  assertIndividualProvider(record);
  const practice = getPracticeAddress(record.addresses);
  const name = mapNppesName(record.basic);
  const address = mapNppesAddress(practice);
  return {
    resourceType: 'Practitioner',
    identifier: [getNpiIdentifier(record)],
    active: mapNppesStatus(record.basic.status),
    name: name ? [name] : undefined,
    gender: mapNppesSex(record.basic.sex),
    telecom: mapNppesTelecom(practice),
    address: address ? [address] : undefined,
  };
}

// one role per NPI, holds specialties (Practitioner has no specialty field in R4)
// `practitioner` is passed in: a urn:uuid in the Bundle, replaced by the caller with the saved reference.
export function convertNppesToPractitionerRole(
  record: NppesRecord,
  practitioner: Reference<Practitioner>
): PractitionerRole {
  assertIndividualProvider(record);
  return {
    resourceType: 'PractitionerRole',
    identifier: [{ system: NPPES_PRACTITIONER_ROLE_SYSTEM, value: record.number }],
    active: mapNppesStatus(record.basic.status),
    practitioner,
    specialty: mapNppesTaxonomies(record.taxonomies),
  };
}

// --- searchset Bundle ---

// pair role -> Practitioner by fullUrl, not position; total = Practitioner count
// urn:uuid fullUrls because nothing is saved yet (no server ids). generateId() works in Lambda and VM context.
// A bad record is skipped rather than failing the whole search; skipped NPIs go in one OperationOutcome.
export function toPractitionerBundle(records: NppesRecord[]): PractitionerBundle {
  const entry: BundleEntry<Practitioner | PractitionerRole | OperationOutcome>[] = [];
  const skipped: OperationOutcomeIssue[] = [];
  let total = 0;

  for (const record of records) {
    try {
      const practitioner = convertNppesToPractitioner(record);
      const practitionerUrl = `urn:uuid:${generateId()}`;
      const role = convertNppesToPractitionerRole(record, {
        reference: practitionerUrl,
        display: formatHumanName(practitioner.name?.[0]) || undefined, // readable without resolving the link
      });
      entry.push(
        { fullUrl: practitionerUrl, resource: practitioner, search: { mode: 'match' } },
        { fullUrl: `urn:uuid:${generateId()}`, resource: role, search: { mode: 'include' } }
      );
      total++;
    } catch (err) {
      skipped.push({
        severity: 'warning',
        code: 'processing',
        details: { text: `Skipped NPI ${record?.number ?? '(unknown)'}: ${normalizeErrorString(err)}` },
      });
    }
  }

  const bundle: PractitionerBundle = { resourceType: 'Bundle', type: 'searchset', total };
  if (entry.length > 0) {
    bundle.entry = entry; // omit when empty (FHIR: no empty arrays)
  }
  if (skipped.length > 0) {
    bundle.entry ??= [];
    bundle.entry.push({
      fullUrl: `urn:uuid:${generateId()}`,
      resource: { resourceType: 'OperationOutcome', issue: skipped },
      search: { mode: 'outcome' },
    });
  }
  return bundle;
}
