// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { Bot, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { afterEach, expect, test, vi } from 'vitest';
import { handler } from './nppes-lookup';
import type { NppesLookupInput } from './nppes-lookup';

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

test('NPPES lookup by NPI number returns thin-wrapped JSON', async () => {
  const medplum = new MockClient();
  const apiResponse = {
    result_count: 1,
    results: [
      {
        number: '1234567893',
        enumeration_type: 'NPI-1',
        basic: { first_name: 'JANE', last_name: 'DOE', credential: 'MD' },
      },
    ],
  };
  mockNppesResponse(apiResponse);

  const input: NppesLookupInput = { number: '1234567893' };
  const result = await handler(medplum, { bot, input, contentType, secrets });

  expect(result).toEqual(apiResponse);
  expect(fetch).toHaveBeenCalledTimes(1);
  const calledUrl = (fetch as any).mock.calls[0][0] as string;
  expect(calledUrl).toContain('https://npiregistry.cms.hhs.gov/api/');
  expect(calledUrl).toContain('version=2.1');
  expect(calledUrl).toContain('number=1234567893');
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
    organization_name: 'Acme Health',
    city: '',
    state: undefined,
  };
  await handler(medplum, { bot, input, contentType, secrets });

  const calledUrl = new URL((fetch as any).mock.calls[0][0] as string);
  expect(calledUrl.searchParams.get('organization_name')).toBe('Acme Health');
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
