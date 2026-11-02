// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test } from 'vitest';
import { findConnection, readConnection, saveConnection, updateConnection } from './connection';
import { readCredential } from './credentials';

const PRACTITIONER = 'Practitioner/dr-rivera';

describe('connection', () => {
  let medplum: MockClient;

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
