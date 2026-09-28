// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { TimezoneExtensionURI } from '@medplum/core';
import type { Device, Location, Practitioner } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import type { ActorGeneralFields } from './actorDraft';
import { actorGeneralFieldsOf, buildActorResource, newActorResource } from './actorDraft';

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

  test("writes a room's name, status, and service facility", () => {
    expect(
      edit(room3, { name: ' Room 3A ', status: 'inactive', location: { reference: 'Location/northside' } })
    ).toEqual({ ...room3, name: 'Room 3A', status: 'inactive', partOf: { reference: 'Location/northside' } });
    const { partOf: _partOf, ...unplaced } = room3;
    expect(edit(room3, { location: undefined })).toEqual(unplaced);
  });

  test("writes a device's name as its first user-friendly name, and its location", () => {
    const modelOnly: Device = { resourceType: 'Device', deviceName: [{ name: 'US-2000', type: 'model-name' }] };
    expect(edit(modelOnly, { name: 'Ultrasound 2', location: { reference: 'Location/downtown' } })).toEqual({
      ...modelOnly,
      deviceName: [
        { name: 'Ultrasound 2', type: 'user-friendly-name' },
        { name: 'US-2000', type: 'model-name' },
      ],
      location: { reference: 'Location/downtown' },
    });

    const named: Device = {
      resourceType: 'Device',
      deviceName: [{ name: 'Ultrasound 2', type: 'user-friendly-name' }],
    };
    expect(edit(named, { name: 'Ultrasound 3' }).deviceName).toEqual([
      { name: 'Ultrasound 3', type: 'user-friendly-name' },
    ]);
  });
});

describe('newActorResource', () => {
  test('a new room is typed as a room and active, and a new device is active', () => {
    const room = edit(newActorResource('Location'), { name: 'Room 9' });
    expect(room).toMatchObject({ resourceType: 'Location', name: 'Room 9', status: 'active' });
    expect((room as Location).physicalType?.coding?.[0].code).toBe('ro');

    expect(edit(newActorResource('Device'), { name: 'Ultrasound 4' })).toEqual({
      resourceType: 'Device',
      status: 'active',
      deviceName: [{ name: 'Ultrasound 4', type: 'user-friendly-name' }],
    });
  });
});
