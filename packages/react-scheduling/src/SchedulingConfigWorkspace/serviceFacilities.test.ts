// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Device, Location, Practitioner, PractitionerRole, Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { describe, expect, test } from 'vitest';
import type { ActorFacilities } from './serviceFacilities';
import {
  describeNoSharedFacility,
  resolveActorFacilities,
  sharesServiceFacility,
  UNRESTRICTED,
} from './serviceFacilities';

const downtown: WithId<Location> = { resourceType: 'Location', id: 'downtown', name: 'Downtown Clinic' };
const northside: WithId<Location> = { resourceType: 'Location', id: 'northside', name: 'Northside' };
const floor2: WithId<Location> = {
  resourceType: 'Location',
  id: 'floor-2',
  name: 'Second Floor',
  partOf: { reference: 'Location/downtown' },
};
const room3: WithId<Location> = {
  resourceType: 'Location',
  id: 'room-3',
  name: 'Room 3',
  partOf: { reference: 'Location/floor-2' },
};
const unplacedRoom: WithId<Location> = { resourceType: 'Location', id: 'room-9', name: 'Room 9' };
const doppler: WithId<Device> = {
  resourceType: 'Device',
  id: 'doppler',
  deviceName: [{ name: 'Doppler', type: 'user-friendly-name' }],
  location: { reference: 'Location/northside' },
};
const drSmith: WithId<Practitioner> = { resourceType: 'Practitioner', id: 'dr-smith' };
const drJones: WithId<Practitioner> = { resourceType: 'Practitioner', id: 'dr-jones' };

function role(id: string, practitioner: string, locations: string[], active?: boolean): WithId<PractitionerRole> {
  return {
    resourceType: 'PractitionerRole',
    id,
    practitioner: { reference: `Practitioner/${practitioner}` },
    location: locations.map((location) => ({ reference: `Location/${location}` })),
    ...(active !== undefined && { active }),
  };
}

async function setup(resources: readonly Resource[]): Promise<MockClient> {
  const medplum = new MockClient({ seedDefaultData: false });
  for (const resource of resources) {
    await medplum.createResource(resource);
  }
  return medplum;
}

const cystoscopy = { location: [{ reference: 'Location/northside' }] };
const initialVisit = { location: undefined };

describe('resolveActorFacilities', () => {
  test("a room is at its service facility and that facility's ancestors, named by the nearest", async () => {
    const medplum = await setup([downtown, floor2, room3]);

    const placed = await resolveActorFacilities(medplum, [room3]);

    expect(placed.get('Location/room-3')).toEqual({
      references: ['Location/floor-2', 'Location/downtown'],
      names: ['Second Floor'],
    });
  });

  test('a device is at its location', async () => {
    const medplum = await setup([northside, doppler]);

    const placed = await resolveActorFacilities(medplum, [doppler]);

    expect(placed.get('Device/doppler')).toEqual({ references: ['Location/northside'], names: ['Northside'] });
  });

  test('a provider is at every location of their active roles, and nowhere their inactive ones name', async () => {
    const medplum = await setup([
      downtown,
      northside,
      drSmith,
      drJones,
      role('r1', 'dr-smith', ['downtown']),
      role('r2', 'dr-smith', ['northside'], false),
      role('r3', 'dr-jones', ['northside']),
    ]);

    const placed = await resolveActorFacilities(medplum, [drSmith, drJones]);

    expect(placed.get('Practitioner/dr-smith')).toEqual({
      references: ['Location/downtown'],
      names: ['Downtown Clinic'],
    });
    expect(placed.get('Practitioner/dr-jones')).toEqual({ references: ['Location/northside'], names: ['Northside'] });
  });

  test('nothing recording where an actor is leaves it unrestricted', async () => {
    const medplum = await setup([unplacedRoom, drSmith]);

    const placed = await resolveActorFacilities(medplum, [unplacedRoom, drSmith]);

    expect(placed.get('Location/room-9')).toEqual(UNRESTRICTED);
    expect(placed.get('Practitioner/dr-smith')).toEqual(UNRESTRICTED);
  });
});

describe('sharesServiceFacility', () => {
  const atDowntown: ActorFacilities = {
    references: ['Location/floor-2', 'Location/downtown'],
    names: ['Second Floor'],
  };

  test('a visit type naming no location is held everywhere', () => {
    expect(sharesServiceFacility(initialVisit, atDowntown)).toBe(true);
  });

  test('an actor nothing places is offered everywhere', () => {
    expect(sharesServiceFacility(cystoscopy, UNRESTRICTED)).toBe(true);
  });

  test("shares one when the visit type names a location the actor is at, including its facility's ancestors", () => {
    expect(sharesServiceFacility({ location: [{ reference: 'Location/downtown' }] }, atDowntown)).toBe(true);
    expect(sharesServiceFacility(cystoscopy, atDowntown)).toBe(false);
  });
});

describe('describeNoSharedFacility', () => {
  test('names where the actor is', () => {
    expect(
      describeNoSharedFacility('Cystoscopy', { references: ['Location/downtown'], names: ['Downtown Clinic'] })
    ).toBe("Cystoscopy isn't held at Downtown Clinic");
    expect(
      describeNoSharedFacility('Cystoscopy', {
        references: ['Location/downtown', 'Location/northside', 'Location/east'],
        names: ['Downtown Clinic', 'Northside', 'East'],
      })
    ).toBe("Cystoscopy isn't held at Downtown Clinic, Northside or East");
  });
});
