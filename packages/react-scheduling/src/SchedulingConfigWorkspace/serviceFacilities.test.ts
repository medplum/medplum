// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Device, Location, Practitioner, PractitionerRole, Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { describe, expect, test, vi } from 'vitest';
import { filterCandidatesByLocation } from '../AppointmentFinder/AppointmentFinder.schedules';
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
      references: ['Location/room-3', 'Location/floor-2', 'Location/downtown'],
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

  test('reads the roles of many providers in batches, placing every one', async () => {
    const providers: WithId<Practitioner>[] = Array.from({ length: 120 }, (_, index) => ({
      resourceType: 'Practitioner',
      id: `provider-${index}`,
    }));
    const medplum = await setup([
      downtown,
      ...providers,
      ...providers.map((provider) => role(`role-${provider.id}`, provider.id, ['downtown'])),
    ]);
    const search = vi.spyOn(medplum, 'searchResources');

    const placed = await resolveActorFacilities(medplum, providers);

    expect(search.mock.calls.filter(([resourceType]) => resourceType === 'PractitionerRole')).toHaveLength(3);
    expect(providers.every((provider) => placed.get(`Practitioner/${provider.id}`)?.references[0])).toBe(true);
  });

  test('a parentless room sites itself, while a provider with no roles is unrestricted', async () => {
    const medplum = await setup([unplacedRoom, drSmith]);

    const placed = await resolveActorFacilities(medplum, [unplacedRoom, drSmith]);

    expect(placed.get('Location/room-9')).toEqual({ references: ['Location/room-9'], names: ['Room 9'] });
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

describe('facility decisions agree with booking', () => {
  async function expectDecision(
    actor: WithId<Location> | WithId<Device>,
    locations: readonly Location[],
    site: string,
    expected: boolean
  ): Promise<void> {
    const medplum = await setup([...locations, actor]);
    const reference = `${actor.resourceType}/${actor.id}`;
    const facilities = (await resolveActorFacilities(medplum, [actor])).get(reference) as ActorFacilities;
    const candidates = [
      {
        actorResource: actor,
        schedule: { resourceType: 'Schedule' as const, id: 'calendar', actor: [{ reference }] },
      },
    ];
    const booked = await filterCandidatesByLocation(medplum, candidates, { reference: site });
    expect(booked.length > 0).toBe(expected);
    expect(sharesServiceFacility({ location: [{ reference: site }] }, facilities)).toBe(expected);
  }

  test.each([
    ['Location/room-3', true],
    ['Location/floor-2', true],
    ['Location/downtown', true],
    ['Location/northside', false],
  ] as const)('a room at %s: %s', async (site, expected) => {
    await expectDecision(room3, [floor2, downtown], site, expected);
  });

  test.each([
    ['Location/room-9', true],
    ['Location/downtown', false],
  ] as const)('a parentless room at %s: %s', async (site, expected) => {
    await expectDecision(unplacedRoom, [], site, expected);
  });

  test.each(['Location', 'Device'] as const)('%s with unreadable ancestry remains eligible', async (resourceType) => {
    const missing = { reference: 'Location/missing' };
    const actor = resourceType === 'Location' ? { ...room3, partOf: missing } : { ...doppler, location: missing };
    await expectDecision(actor, [], 'Location/downtown', true);
  });

  test.each(['Location', 'Device'] as const)('%s respects the four-location boundary', async (resourceType) => {
    for (const length of [4, 5]) {
      const chain: WithId<Location>[] = Array.from({ length }, (_, index) => ({
        resourceType: 'Location',
        id: `level-${index}`,
        ...(index + 1 < length && { partOf: { reference: `Location/level-${index + 1}` } }),
      }));
      const actor =
        resourceType === 'Location' ? chain[0] : { ...doppler, location: { reference: 'Location/level-0' } };
      const locations = resourceType === 'Location' ? chain.slice(1) : chain;
      await expectDecision(actor, locations, 'Location/level-3', true);
      await expectDecision(actor, locations, 'Location/unrelated', length > 4);
    }
  });

  test('a device without a location remains unrestricted', async () => {
    await expectDecision({ ...doppler, location: undefined }, [], 'Location/downtown', true);
  });
});
