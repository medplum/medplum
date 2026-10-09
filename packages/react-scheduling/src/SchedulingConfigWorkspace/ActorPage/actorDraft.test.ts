// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { TimezoneExtensionURI } from '@medplum/core';
import type { Device, Location, Practitioner } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import type { ActorGeneralFields } from './actorDraft';
import { actorGeneralFieldsOf, buildActorResource } from './actorDraft';

const other = { url: 'http://example.org/other', valueString: 'kept' };

const drSmith: WithId<Practitioner> = {
  resourceType: 'Practitioner',
  id: 'dr-smith',
  meta: { versionId: '1' },
  active: true,
  name: [{ given: ['Jane'], family: 'Smith' }],
  address: [{ state: 'IL' }],
  extension: [{ url: TimezoneExtensionURI, valueCode: 'America/New_York' }, other],
};

const room3: WithId<Location> = {
  resourceType: 'Location',
  id: 'room-3',
  name: 'Room 3',
  status: 'active',
  partOf: { reference: 'Location/downtown' },
};

function edit<T extends Practitioner | Location | Device>(base: T, change: Partial<ActorGeneralFields>): T {
  const initial = actorGeneralFieldsOf(base);
  return buildActorResource(base, { ...initial, ...change }, initial);
}

describe('buildActorResource', () => {
  test('leaves an actor exactly as stored when nothing was edited', () => {
    expect(edit(drSmith, {})).toEqual(drSmith);
    expect(edit(room3, {})).toEqual(room3);
  });

  test("switches a provider's active flag, and a suspended room's status only once it is switched off", () => {
    expect(edit(drSmith, { active: false })).toEqual({ ...drSmith, active: false });

    const suspended: Location = { ...room3, status: 'suspended' };
    expect(edit(suspended, { active: true })).toEqual(suspended);
    expect(edit(suspended, { active: false }).status).toBe('inactive');
  });

  test("changes only a provider's time zone, where it sits among the other extensions", () => {
    expect(edit(drSmith, { timezone: 'America/Chicago' })).toEqual({
      ...drSmith,
      extension: [{ url: TimezoneExtensionURI, valueCode: 'America/Chicago' }, other],
    });
  });

  test('adds a time zone to an actor with none, and clearing it removes the extension', () => {
    const withZone = edit(room3, { timezone: 'America/Denver' });
    expect(withZone.extension).toEqual([{ url: TimezoneExtensionURI, valueCode: 'America/Denver' }]);

    expect(edit(withZone, { timezone: undefined })).toEqual(room3);
  });
});
