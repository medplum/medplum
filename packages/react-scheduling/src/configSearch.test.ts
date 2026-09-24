// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Bundle, Device, HealthcareService, Location, Practitioner, Resource, Schedule } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { searchConfigurableActors, searchConfigurableCalendars, searchConfigurableServices } from './configSearch';

const configured: WithId<HealthcareService> = {
  resourceType: 'HealthcareService',
  id: 'configured',
  name: 'Annual exam',
  extension: [
    {
      url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
      extension: [{ url: 'duration', valueDuration: { value: 30, unit: 'min' } }],
    },
  ],
};
const unconfigured: WithId<HealthcareService> = {
  resourceType: 'HealthcareService',
  id: 'unconfigured',
  name: 'Blood draw',
};
const deactivated: WithId<HealthcareService> = {
  resourceType: 'HealthcareService',
  id: 'deactivated',
  name: 'Consult',
  active: false,
};

async function setupClient(resources: readonly Resource[]): Promise<MockClient> {
  // Unseeded, so the default Dr. Alice Smith calendar does not join every result.
  const medplum = new MockClient({ seedDefaultData: false });
  for (const resource of resources) {
    await medplum.createResource(resource);
  }
  vi.spyOn(medplum, 'search');
  return medplum;
}

// `searchResourcePages` hands `search` a URLSearchParams rather than the record it was given.
function querySentTo(medplum: MockClient, index = 0): Record<string, string> {
  return Object.fromEntries(vi.mocked(medplum.search).mock.calls[index][1] as URLSearchParams);
}

function searchset<T extends WithId<Resource>>(resources: T[], next?: string): Bundle<T> {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: resources.map((resource) => ({ resource })),
    ...(next && { link: [{ relation: 'next', url: next }] }),
  };
}

describe('searchConfigurableServices', () => {
  test('returns deactivated and unconfigured visit types, which booking leaves out', async () => {
    const medplum = await setupClient([configured, unconfigured, deactivated]);

    const { services, complete } = await searchConfigurableServices(medplum);

    expect(services.map((service) => service.id).sort()).toEqual(['configured', 'deactivated', 'unconfigured']);
    expect(complete).toBe(true);
  });

  test('sorts by name and filters on nothing', async () => {
    const medplum = await setupClient([configured]);

    await searchConfigurableServices(medplum);

    expect(querySentTo(medplum)).toEqual({ _sort: 'name', _count: '1000' });
  });

  test('reading exactly the limit, with nothing left over, is complete', async () => {
    const medplum = await setupClient([configured, unconfigured]);

    const { services, complete } = await searchConfigurableServices(medplum, { limit: 2 });

    expect(services).toHaveLength(2);
    expect(complete).toBe(true);
  });

  test('stops at the limit and reports the rest missing', async () => {
    const medplum = await setupClient([configured, unconfigured, deactivated]);

    const { services, complete } = await searchConfigurableServices(medplum, { limit: 2 });

    expect(services).toHaveLength(2);
    expect(complete).toBe(false);
  });

  // MockClient's bundles never carry a `next` link, so it only ever serves one page. Stubbing `search` still
  // runs the real paging loop, which is what calls it.
  test('reads every page', async () => {
    const medplum = await setupClient([]);
    vi.mocked(medplum.search)
      .mockResolvedValueOnce(
        searchset([configured, unconfigured], 'https://example.com/fhir/R4/HealthcareService?_offset=2')
      )
      .mockResolvedValueOnce(searchset([deactivated]));

    const { services, complete } = await searchConfigurableServices(medplum, { pageSize: 2 });

    expect(services.map((service) => service.id)).toEqual(['configured', 'unconfigured', 'deactivated']);
    expect(complete).toBe(true);
    expect(querySentTo(medplum, 1)._offset).toBe('2');
  });

  test('a limit reached on a page with a next link is incomplete', async () => {
    const medplum = await setupClient([]);
    vi.mocked(medplum.search).mockResolvedValueOnce(
      searchset([configured, unconfigured], 'https://example.com/fhir/R4/HealthcareService?_offset=2')
    );

    const { services, complete } = await searchConfigurableServices(medplum, { pageSize: 2, limit: 2 });

    expect(services).toHaveLength(2);
    expect(complete).toBe(false);
    expect(medplum.search).toHaveBeenCalledTimes(1);
  });

  test('rejects once aborted', async () => {
    const medplum = await setupClient([configured]);
    const controller = new AbortController();
    controller.abort();

    await expect(searchConfigurableServices(medplum, { signal: controller.signal })).rejects.toThrow();
  });
});

const drAdams: WithId<Practitioner> = {
  resourceType: 'Practitioner',
  id: 'dr-adams',
  name: [{ prefix: ['Dr.'], given: ['Ada'], family: 'Adams' }],
};
const drBaker: WithId<Practitioner> = {
  resourceType: 'Practitioner',
  id: 'dr-baker',
  name: [{ prefix: ['Dr.'], given: ['Ben'], family: 'Baker' }],
  active: false,
};

const ROOM_SYSTEM = 'http://terminology.hl7.org/CodeSystem/location-physical-type';

function location(id: string, name: string, code?: 'ro' | 'bd' | 'si'): WithId<Location> {
  return {
    resourceType: 'Location',
    id,
    name,
    ...(code && { physicalType: { coding: [{ system: ROOM_SYSTEM, code }] } }),
  };
}

const room1 = location('room-1', 'Room 1', 'ro');
const bed1 = location('bed-1', 'Bed 1', 'bd');
const clinic = location('clinic', 'Downtown Clinic', 'si');
const untypedRoom = location('room-untyped', 'Procedure Room');
const untypedFacility = location('facility-untyped', 'Northside');

const ultrasound: WithId<Device> = {
  resourceType: 'Device',
  id: 'ultrasound',
  deviceName: [{ name: 'Ultrasound', type: 'user-friendly-name' }],
  status: 'inactive',
};

function calendar(id: string, actors: string[], active?: boolean): WithId<Schedule> {
  return {
    resourceType: 'Schedule',
    id,
    ...(active !== undefined && { active }),
    actor: actors.map((reference) => ({ reference })),
  };
}

function scheduleIds(actor: { schedules: WithId<Schedule>[] } | undefined): string[] {
  return actor?.schedules.map((schedule) => schedule.id) ?? [];
}

describe('searchConfigurableActors', () => {
  test('lists every provider, with a calendar or without, turned off or not', async () => {
    const medplum = await setupClient([drAdams, drBaker, calendar('adams', ['Practitioner/dr-adams'], false)]);

    const { actors, complete } = await searchConfigurableActors(medplum, 'Practitioner');

    expect(actors.map((actor) => actor.resource.id)).toEqual(['dr-adams', 'dr-baker']);
    expect(scheduleIds(actors[0])).toEqual(['adams']);
    expect(scheduleIds(actors[1])).toEqual([]);
    expect(complete).toBe(true);
    expect(querySentTo(medplum)).toEqual({ _count: '1000', _revinclude: 'Schedule:actor' });
  });

  test('attaches only the calendars an actor holds alone', async () => {
    const medplum = await setupClient([
      drAdams,
      room1,
      calendar('shared', ['Practitioner/dr-adams', 'Location/room-1']),
      calendar('first', ['Practitioner/dr-adams']),
      calendar('second', ['Practitioner/dr-adams']),
    ]);

    const { actors } = await searchConfigurableActors(medplum, 'Practitioner');

    expect(scheduleIds(actors[0]).sort()).toEqual(['first', 'second']);
  });

  test('rooms are the Locations typed as a room or a bed, and not the service facilities', async () => {
    const medplum = await setupClient([room1, bed1, clinic, untypedFacility]);

    const { actors } = await searchConfigurableActors(medplum, 'Location');

    expect(actors.map((actor) => actor.resource.id)).toEqual(['bed-1', 'room-1']);
    expect(querySentTo(medplum)).toEqual({ 'physical-type': 'ro,bd', _count: '1000', _revinclude: 'Schedule:actor' });
  });

  test('lists devices, including retired ones', async () => {
    const medplum = await setupClient([ultrasound, calendar('us', ['Device/ultrasound'])]);

    const { actors } = await searchConfigurableActors(medplum, 'Device');

    expect(actors.map((actor) => actor.resource.id)).toEqual(['ultrasound']);
    expect(scheduleIds(actors[0])).toEqual(['us']);
  });

  test('stops at the limit, counting actors rather than their calendars', async () => {
    const medplum = await setupClient([
      drAdams,
      drBaker,
      calendar('a', ['Practitioner/dr-adams']),
      calendar('b', ['Practitioner/dr-baker']),
    ]);

    const all = await searchConfigurableActors(medplum, 'Practitioner', { limit: 2 });
    const one = await searchConfigurableActors(medplum, 'Practitioner', { limit: 1 });

    expect(all.actors).toHaveLength(2);
    expect(all.complete).toBe(true);
    expect(one.actors).toHaveLength(1);
    expect(one.complete).toBe(false);
  });

  test('reads every page, keeping the calendars each page includes', async () => {
    const medplum = await setupClient([]);
    vi.mocked(medplum.search)
      .mockResolvedValueOnce(
        searchset<WithId<Resource>>(
          [drAdams, calendar('a', ['Practitioner/dr-adams'])],
          'https://example.com/fhir/R4/Practitioner?_offset=1'
        )
      )
      .mockResolvedValueOnce(searchset<WithId<Resource>>([drBaker, calendar('b', ['Practitioner/dr-baker'])]));

    const { actors, complete } = await searchConfigurableActors(medplum, 'Practitioner', { pageSize: 1 });

    expect(actors.map((actor) => [actor.resource.id, scheduleIds(actor)])).toEqual([
      ['dr-adams', ['a']],
      ['dr-baker', ['b']],
    ]);
    expect(complete).toBe(true);
  });
});

describe('searchConfigurableCalendars', () => {
  test('finds a Location booked as a room without being typed as one', async () => {
    const medplum = await setupClient([
      untypedRoom,
      untypedFacility,
      room1,
      calendar('procedure', ['Location/room-untyped']),
      calendar('room-1', ['Location/room-1']),
    ]);

    const { locations, complete, skipped } = await searchConfigurableCalendars(medplum);

    expect(locations.map((found) => [found.resource.id, scheduleIds(found)])).toEqual([
      ['room-untyped', ['procedure']],
      ['room-1', ['room-1']],
    ]);
    expect(complete).toBe(true);
    expect(skipped).toBe(0);
    expect(querySentTo(medplum)).toEqual({ _count: '1000', _include: 'Schedule:actor:Location' });
  });

  test('counts calendars scheduling cannot book instead of dropping them silently', async () => {
    const medplum = await setupClient([
      drAdams,
      room1,
      calendar('shared', ['Practitioner/dr-adams', 'Location/room-1']),
      calendar('role', ['PractitionerRole/role-1']),
      calendar('fine', ['Practitioner/dr-adams']),
    ]);

    const { locations, skipped } = await searchConfigurableCalendars(medplum);

    expect(locations).toEqual([]);
    expect(skipped).toBe(2);
  });

  test('stops at the limit and reports the rest missing', async () => {
    const medplum = await setupClient([
      room1,
      untypedRoom,
      calendar('a', ['Location/room-1']),
      calendar('b', ['Location/room-untyped']),
    ]);

    const { complete } = await searchConfigurableCalendars(medplum, { limit: 1 });

    expect(complete).toBe(false);
  });
});
