// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { Bot, OperationOutcome, Practitioner, PractitionerRole, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { afterEach, expect, test, vi } from 'vitest';
import {
  formatPostalCode,
  getPracticeAddress,
  handler,
  mapNppesAddress,
  mapNppesName,
  mapNppesSex,
  mapNppesStatus,
  mapNppesTaxonomies,
  mapNppesTelecom,
  NPI_SYSTEM,
  NPPES_PRACTITIONER_ROLE_SYSTEM,
  NUCC_SYSTEM,
  toPractitionerBundle,
} from './nppes-lookup';
import type { NppesLookupInput, NppesRecord } from './nppes-lookup';

/*
 * FAKE NPPES API v2.1 records for tests. Shapes match live NPPES responses.
 * - Every NPI starts with 999; real NPIs start with 1 or 2, so these cannot collide with a real provider.
 * - Names, addresses, 555-01xx phone numbers, and FAKE-* license numbers are invented.
 * - Taxonomy codes and descriptions are real NUCC values copied from live NPPES responses.
 */

/** Individual with two specialties; the primary is listed second, and one code repeats for a second state license. */
const SAMPLESON: NppesRecord = {
  number: '9990000002',
  enumeration_type: 'NPI-1',
  basic: {
    first_name: 'JORDAN',
    middle_name: 'Q',
    last_name: 'SAMPLESON',
    name_prefix: 'Dr.',
    credential: 'MD',
    sex: 'M',
    status: 'A',
  },
  addresses: [
    {
      address_purpose: 'MAILING',
      address_1: 'PO BOX 0000',
      city: 'BROOKLYN',
      state: 'NY',
      postal_code: '112029999',
      country_code: 'US',
      telephone_number: '718-555-0199',
    },
    {
      address_purpose: 'LOCATION',
      address_1: '200 PLACEHOLDER ST',
      address_2: 'SUITE 3',
      city: 'BROOKLYN',
      state: 'NY',
      postal_code: '112010000',
      country_code: 'US',
      telephone_number: '718-555-0102',
      fax_number: '718-555-0103',
    },
  ],
  taxonomies: [
    {
      code: '207RE0101X',
      desc: 'Internal Medicine, Endocrinology, Diabetes & Metabolism',
      primary: false,
      state: 'NY',
      license: 'FAKE-NY-0002',
    },
    { code: '207R00000X', desc: 'Internal Medicine', primary: true, state: 'NY', license: 'FAKE-NY-0002' },
    { code: '207R00000X', desc: 'Internal Medicine', primary: false, state: 'NJ', license: 'FAKE-NJ-0002' },
  ],
};

/** Individual with minimal data: no middle name, no fax, inactive, 5-digit ZIP, hyphenated name. */
const MOCKINGTON_JONES: NppesRecord = {
  number: '9990000003',
  enumeration_type: 'NPI-1',
  basic: { first_name: 'MARY-JANE', last_name: "O'MOCKINGTON-JONES", credential: 'NP', sex: 'F', status: 'D' },
  addresses: [
    {
      address_purpose: 'LOCATION',
      address_1: '300 DEMO RD',
      city: 'SAN FRANCISCO',
      state: 'CA',
      postal_code: '94102',
      country_code: 'US',
      telephone_number: '415-555-0103',
    },
  ],
  taxonomies: [{ code: '363LF0000X', desc: 'Nurse Practitioner, Family', primary: true }],
};

/** An organization (NPI-2): not a Practitioner, so the bot skips it. */
const PLACEHOLDER_PHARMACY = {
  number: '9990000104',
  enumeration_type: 'NPI-2',
  basic: { organization_name: 'PLACEHOLDER PHARMACY', status: 'A' },
  addresses: [{ address_purpose: 'LOCATION', city: 'BROOKLYN', state: 'NY', postal_code: '11202' }],
  taxonomies: [{ code: '3336C0003X', desc: 'Pharmacy, Community/Retail Pharmacy', primary: true }],
} as NppesRecord;

vi.stubGlobal('fetch', vi.fn());

const bot: Reference<Bot> = { reference: 'Bot/123' };
const contentType = ContentType.JSON;
const secrets = {};

afterEach(() => {
  (fetch as any).mockReset();
});

function mockNppesResponse(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}): void {
  const { ok = true, status = 200, statusText = 'OK' } = init;
  (fetch as any).mockImplementationOnce(() =>
    Promise.resolve({
      ok,
      status,
      statusText,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    })
  );
}

test('NPPES lookup by NPI number returns a FHIR Bundle of Practitioner + PractitionerRole', async () => {
  const medplum = new MockClient();
  mockNppesResponse({ result_count: 1, results: [SAMPLESON] });

  const input: NppesLookupInput = { number: '9990000002' };
  const bundle = await handler(medplum, { bot, input, contentType, secrets });

  expect(bundle.resourceType).toBe('Bundle');
  expect(bundle.type).toBe('searchset');
  expect(bundle.total).toBe(1);
  const [practitionerEntry, roleEntry] = bundle.entry ?? [];
  const practitioner = practitionerEntry?.resource as Practitioner;
  const role = roleEntry?.resource as PractitionerRole;
  expect(practitioner.resourceType).toBe('Practitioner');
  expect(practitioner.identifier).toContainEqual({ system: NPI_SYSTEM, value: '9990000002' });
  expect(role.resourceType).toBe('PractitionerRole');
  expect(role.practitioner?.reference).toBe(practitionerEntry?.fullUrl);

  expect(fetch).toHaveBeenCalledTimes(1);
  const calledUrl = (fetch as any).mock.calls[0][0] as string;
  expect(calledUrl).toContain('https://npiregistry.cms.hhs.gov/api/');
  expect(calledUrl).toContain('version=2.1');
  expect(calledUrl).toContain('number=9990000002');
});

test('NPPES lookup skips organizations and reports them in an OperationOutcome entry', async () => {
  const medplum = new MockClient();
  mockNppesResponse({ result_count: 2, results: [SAMPLESON, PLACEHOLDER_PHARMACY] });

  const bundle = await handler(medplum, { bot, input: { city: 'brooklyn', state: 'NY' }, contentType, secrets });

  expect(bundle.total).toBe(1);
  expect(bundle.entry?.at(-1)?.search?.mode).toBe('outcome');
});

test('NPPES lookup with no matches returns an empty Bundle', async () => {
  const medplum = new MockClient();
  mockNppesResponse({ result_count: 0, results: [] });

  const bundle = await handler(medplum, { bot, input: { last_name: 'nobody' }, contentType, secrets });

  expect(bundle).toEqual({ resourceType: 'Bundle', type: 'searchset', total: 0 });
});

test('NPPES lookup throws when NPPES rejects the search', async () => {
  const medplum = new MockClient();
  mockNppesResponse({
    Errors: [{ description: 'Field state requires additional search criteria', field: 'state', number: '07' }],
  });

  await expect(handler(medplum, { bot, input: { state: 'NY' }, contentType, secrets })).rejects.toThrow(
    /NPPES rejected the search: Field state requires additional search criteria/
  );
});

test('NPPES lookup forwards multiple search criteria as query params', async () => {
  const medplum = new MockClient();
  mockNppesResponse({ result_count: 0, results: [] });

  const input: NppesLookupInput = {
    first_name: 'jo*',
    last_name: 'smith',
    state: 'CA',
    enumeration_type: 'NPI-1',
    limit: 25,
    use_first_name_alias: true,
  };
  await handler(medplum, { bot, input, contentType, secrets });

  const calledUrl = new URL((fetch as any).mock.calls[0][0] as string);
  expect(calledUrl.searchParams.get('version')).toBe('2.1');
  expect(calledUrl.searchParams.get('first_name')).toBe('jo*');
  expect(calledUrl.searchParams.get('last_name')).toBe('smith');
  expect(calledUrl.searchParams.get('state')).toBe('CA');
  expect(calledUrl.searchParams.get('enumeration_type')).toBe('NPI-1');
  expect(calledUrl.searchParams.get('limit')).toBe('25');
  expect(calledUrl.searchParams.get('use_first_name_alias')).toBe('true');
});

test('NPPES lookup omits empty/undefined fields from the query string', async () => {
  const medplum = new MockClient();
  mockNppesResponse({ result_count: 0, results: [] });

  const input: NppesLookupInput = {
    last_name: 'sampleson',
    city: '',
    state: undefined,
  };
  await handler(medplum, { bot, input, contentType, secrets });

  const calledUrl = new URL((fetch as any).mock.calls[0][0] as string);
  expect(calledUrl.searchParams.get('last_name')).toBe('sampleson');
  expect(calledUrl.searchParams.has('city')).toBe(false);
  expect(calledUrl.searchParams.has('state')).toBe(false);
});

test('NPPES lookup throws when the API returns a non-OK response', async () => {
  const medplum = new MockClient();
  mockNppesResponse('rate limited', { ok: false, status: 429, statusText: 'Too Many Requests' });

  await expect(handler(medplum, { bot, input: { number: '1234567893' }, contentType, secrets })).rejects.toThrow(
    /NPPES API request failed: 429 Too Many Requests/
  );
});

test('NPPES lookup throws for empty input', async () => {
  const medplum = new MockClient();

  await expect(handler(medplum, { bot, input: {}, contentType, secrets })).rejects.toThrow(
    /requires at least one search criterion/
  );
  expect(fetch).not.toHaveBeenCalled();
});

test('NPPES lookup throws for invalid NPI number', async () => {
  const medplum = new MockClient();

  await expect(handler(medplum, { bot, input: { number: '123' }, contentType, secrets })).rejects.toThrow(
    /must be a 10-digit string/
  );
  expect(fetch).not.toHaveBeenCalled();
});

test('NPPES lookup throws for unsupported input field', async () => {
  const medplum = new MockClient();
  const input = { number: '1234567893', foo: 'bar' } as unknown as NppesLookupInput;

  await expect(handler(medplum, { bot, input, contentType, secrets })).rejects.toThrow(/unsupported field: foo/);
  expect(fetch).not.toHaveBeenCalled();
});

test('NPPES lookup always searches individual providers (NPI-1)', async () => {
  const medplum = new MockClient();
  mockNppesResponse({ result_count: 0, results: [] });

  await handler(medplum, { bot, input: { last_name: 'sampleson' }, contentType, secrets });

  const calledUrl = new URL((fetch as any).mock.calls[0][0] as string);
  expect(calledUrl.searchParams.get('enumeration_type')).toBe('NPI-1');
});

test('NPPES lookup rejects organization searches', async () => {
  const medplum = new MockClient();
  const inputs = [
    { organization_name: 'Placeholder Pharmacy' },
    { last_name: 'sampleson', name_purpose: 'AO' },
    { last_name: 'sampleson', enumeration_type: 'NPI-2' },
  ] as unknown as NppesLookupInput[];

  for (const input of inputs) {
    await expect(handler(medplum, { bot, input, contentType, secrets })).rejects.toThrow(
      /supports individual providers \(NPI-1\) only/
    );
  }
  expect(fetch).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------------------------------------------------
// Field converters
// ---------------------------------------------------------------------------------------------------------------------

test('mapNppesName builds an official HumanName', () => {
  expect(mapNppesName(SAMPLESON.basic)).toEqual({
    use: 'official',
    family: 'SAMPLESON',
    given: ['JORDAN', 'Q'],
    prefix: ['Dr.'],
    suffix: undefined,
  });
  // NPPES casing is kept (display formatting is the caller's job)
  expect(mapNppesName(MOCKINGTON_JONES.basic)?.family).toBe("O'MOCKINGTON-JONES");
  expect(mapNppesName({})).toBeUndefined();
});

test('mapNppesSex and mapNppesStatus', () => {
  expect(mapNppesSex('M')).toBe('male');
  expect(mapNppesSex('f')).toBe('female');
  expect(mapNppesSex('X')).toBe('unknown');
  expect(mapNppesSex(undefined)).toBeUndefined();
  expect(mapNppesStatus('A')).toBe(true);
  expect(mapNppesStatus('D')).toBe(false);
  expect(mapNppesStatus(undefined)).toBeUndefined();
});

test('practice address is the LOCATION address, formatted for FHIR', () => {
  const practice = getPracticeAddress(SAMPLESON.addresses);
  expect(practice?.address_1).toBe('200 PLACEHOLDER ST');
  expect(mapNppesAddress(practice)).toEqual({
    use: 'work',
    type: 'physical',
    line: ['200 PLACEHOLDER ST', 'SUITE 3'],
    city: 'BROOKLYN',
    state: 'NY',
    postalCode: '11201-0000',
    country: 'US',
  });
  expect(getPracticeAddress([{ address_purpose: 'MAILING' }])).toBeUndefined();
  expect(mapNppesAddress(undefined)).toBeUndefined();
});

test('formatPostalCode', () => {
  expect(formatPostalCode('100010000')).toBe('10001-0000');
  expect(formatPostalCode('94102')).toBe('94102');
  expect(formatPostalCode('')).toBeUndefined();
});

test('mapNppesTelecom returns work phone and fax from the practice address', () => {
  expect(mapNppesTelecom(getPracticeAddress(SAMPLESON.addresses))).toEqual([
    { system: 'phone', value: '718-555-0102', use: 'work' },
    { system: 'fax', value: '718-555-0103', use: 'work' },
  ]);
  expect(mapNppesTelecom(getPracticeAddress(MOCKINGTON_JONES.addresses))).toEqual([
    { system: 'phone', value: '415-555-0103', use: 'work' },
  ]);
  expect(mapNppesTelecom(undefined)).toBeUndefined();
});

test('mapNppesTaxonomies puts the primary first and removes repeated codes', () => {
  const specialties = mapNppesTaxonomies(SAMPLESON.taxonomies);
  expect(specialties?.map((s) => s.coding?.[0]?.code)).toEqual(['207R00000X', '207RE0101X']);
  expect(specialties?.[0]).toEqual({
    coding: [{ system: NUCC_SYSTEM, code: '207R00000X', display: 'Internal Medicine' }],
    text: 'Internal Medicine',
  });
  expect(mapNppesTaxonomies([])).toBeUndefined();
  expect(mapNppesTaxonomies(undefined)).toBeUndefined();
});

// ---------------------------------------------------------------------------------------------------------------------
// Bundle
// ---------------------------------------------------------------------------------------------------------------------

test('each individual provider becomes a linked Practitioner + PractitionerRole pair', () => {
  const bundle = toPractitionerBundle([SAMPLESON, MOCKINGTON_JONES]);

  expect(bundle.resourceType).toBe('Bundle');
  expect(bundle.type).toBe('searchset');
  expect(bundle.total).toBe(2);
  expect(bundle.entry).toHaveLength(4);

  const practitioners = bundle.entry?.filter((e) => e.resource?.resourceType === 'Practitioner') ?? [];
  const roles = bundle.entry?.filter((e) => e.resource?.resourceType === 'PractitionerRole') ?? [];
  expect(practitioners.every((e) => e.search?.mode === 'match')).toBe(true);
  expect(roles.every((e) => e.search?.mode === 'include')).toBe(true);
  expect(bundle.entry?.every((e) => e.fullUrl?.startsWith('urn:uuid:'))).toBe(true);
  expect(new Set(bundle.entry?.map((e) => e.fullUrl)).size).toBe(4);

  for (const p of practitioners) {
    const practitioner = p.resource as Practitioner;
    const npi = practitioner.identifier?.find((i) => i.system === NPI_SYSTEM)?.value;
    const role = roles.find((r) => (r.resource as PractitionerRole).practitioner?.reference === p.fullUrl)
      ?.resource as PractitionerRole;
    expect(role).toBeDefined();
    expect(role.identifier).toEqual([{ system: NPPES_PRACTITIONER_ROLE_SYSTEM, value: npi }]);
  }
});

test('Practitioner and PractitionerRole content', () => {
  const bundle = toPractitionerBundle([SAMPLESON]);
  const practitioner = bundle.entry?.[0]?.resource as Practitioner;
  const role = bundle.entry?.[1]?.resource as PractitionerRole;

  expect(practitioner).toMatchObject({
    resourceType: 'Practitioner',
    identifier: [{ system: NPI_SYSTEM, value: '9990000002' }],
    active: true,
    gender: 'male',
    name: [{ family: 'SAMPLESON', given: ['JORDAN', 'Q'] }],
  });
  expect(practitioner.address?.[0]?.city).toBe('BROOKLYN');
  expect(role.practitioner).toEqual({ reference: bundle.entry?.[0]?.fullUrl, display: 'Dr. JORDAN Q SAMPLESON' });
  expect(role.specialty?.map((s) => s.coding?.[0]?.code)).toEqual(['207R00000X', '207RE0101X']);
  expect(role.active).toBe(true);
});

test('records that cannot be converted are skipped and reported in one OperationOutcome entry', () => {
  const badNpi = { ...MOCKINGTON_JONES, number: '123' };
  const bundle = toPractitionerBundle([SAMPLESON, PLACEHOLDER_PHARMACY, badNpi]);

  expect(bundle.total).toBe(1);
  expect(bundle.entry).toHaveLength(3);
  const outcomeEntry = bundle.entry?.[2];
  expect(outcomeEntry?.search?.mode).toBe('outcome');
  const outcome = outcomeEntry?.resource as OperationOutcome;
  expect(outcome.resourceType).toBe('OperationOutcome');
  expect(outcome.issue).toHaveLength(2);
  expect(outcome.issue[0]).toMatchObject({ severity: 'warning', code: 'processing' });
  expect(outcome.issue[0].details?.text).toMatch(/^Skipped NPI 9990000104: Only individual providers \(NPI-1\)/);
  expect(outcome.issue[1].details?.text).toMatch(/^Skipped NPI 123: NPPES record has an invalid NPI/);
});

test('no records gives an empty searchset with no OperationOutcome', () => {
  expect(toPractitionerBundle([])).toEqual({ resourceType: 'Bundle', type: 'searchset', total: 0 });
});
