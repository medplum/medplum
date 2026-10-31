// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { readCredential } from './credentials';

import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import type { Bundle, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { findConnection, listActiveConnections, readConnection, saveConnection, updateConnection } from './connection';

const PRACTITIONER = 'Practitioner/dr-rivera';

describe('connection', () => {
  let medplum: MockClient;

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(() => {
    medplum = new MockClient({ project: { resourceType: 'Project', id: 'proj-1', name: 'Calendar test' } });
  });

  test('not connected until saved', async () => {
    expect(await findConnection(medplum, PRACTITIONER)).toBeUndefined();
  });

  test('saves, finds and reads a connection', async () => {
    const saved = await saveConnection(medplum, {
      practitionerRef: PRACTITIONER,
      accountSub: '1234567890',
      accountEmail: 'dr@clinic.example',
      refreshToken: 'rt',
      eventDetailLevel: 'initials',
    });
    expect(saved.status).toBe('active');
    expect(saved.basic.subject).toEqual({ reference: PRACTITIONER });

    expect(await findConnection(medplum, PRACTITIONER)).toMatchObject({
      practitionerRef: PRACTITIONER,
      accountSub: '1234567890',
      accountEmail: 'dr@clinic.example',
      status: 'active',
      eventDetailLevel: 'initials',
    });
    expect(await findConnection(medplum, 'Practitioner/someone-else')).toBeUndefined();
  });

  test('saving again replaces the record in place', async () => {
    const first = await saveConnection(medplum, { practitionerRef: PRACTITIONER, accountSub: 'a', refreshToken: 'x' });
    const second = await saveConnection(medplum, { practitionerRef: PRACTITIONER, accountSub: 'a', refreshToken: 'y' });
    expect(second.basic.id).toBe(first.basic.id);
    expect(second.accountSub).toBe('a');
    expect(await readCredential(medplum, second)).toBe('y');
    expect(second.accountEmail).toBeUndefined();
    expect(
      await medplum.searchResources(
        'Basic',
        'code=https://www.medplum.com/integrations/google-calendar|calendar-connection'
      )
    ).toHaveLength(1);
  });

  test('updates status and level without touching other fields', async () => {
    const saved = await saveConnection(medplum, {
      practitionerRef: PRACTITIONER,
      accountSub: 'a',
      accountEmail: 'dr@clinic.example',
      refreshToken: 'rt',
    });
    const paused = await updateConnection(medplum, saved, { status: 'reauth-required' });
    expect(paused).toMatchObject({ status: 'reauth-required', accountEmail: 'dr@clinic.example' });
    expect(await readCredential(medplum, paused)).toBe('rt');
    const stricter = await updateConnection(medplum, paused, { eventDetailLevel: 'busy-only', status: 'active' });
    expect(stricter).toMatchObject({
      status: 'active',
      eventDetailLevel: 'busy-only',
      accountEmail: 'dr@clinic.example',
    });
  });

  test('a stale copy cannot overwrite a newer write', async () => {
    const saved = await saveConnection(medplum, { practitionerRef: PRACTITIONER, accountSub: 'a', refreshToken: 'rt' });
    await updateConnection(medplum, saved, { eventDetailLevel: 'busy-only' });
    await expect(updateConnection(medplum, saved, { status: 'reauth-required' })).rejects.toThrow(
      'Stale calendar connection'
    );
    expect(await findConnection(medplum, PRACTITIONER)).toMatchObject({
      status: 'active',
      eventDetailLevel: 'busy-only',
    });
  });

  test('lists active connections only', async () => {
    expect(await listActiveConnections(medplum)).toEqual([]);
    const a = await saveConnection(medplum, { practitionerRef: 'Practitioner/a', accountSub: 'a', refreshToken: 'rt' });
    await saveConnection(medplum, { practitionerRef: 'Practitioner/b', accountSub: 'b', refreshToken: 'rt' });
    await updateConnection(medplum, a, { status: 'reauth-required' });
    expect((await listActiveConnections(medplum)).map((c) => c.practitionerRef)).toEqual(['Practitioner/b']);
  });

  test('readConnection refuses an incomplete or unknown-status Basic', () => {
    expect(readConnection({ resourceType: 'Basic', id: 'x', code: { text: 'x' } })).toBeUndefined();
    expect(
      readConnection({
        resourceType: 'Basic',
        id: 'x',
        code: { text: 'x' },
        subject: { reference: PRACTITIONER },
        identifier: [{ system: 'https://accounts.google.com', value: 'sub' }],
        extension: [
          { url: 'https://www.medplum.com/integrations/google-calendar/refresh-token', valueString: 'rt' },
          { url: 'https://www.medplum.com/integrations/google-calendar/status', valueCode: 'banana' },
        ],
      })
    ).toBeUndefined();
  });
});
