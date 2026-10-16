// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Bundle, Device, HealthcareService, Location, Practitioner, Resource, Schedule } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { searchConfigurableActors, searchConfigurableServices } from './configSearch';

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
  // Unseeded, so the default Dr. Alice Smith Schedule does not join every result.
  const medplum = new MockClient({ seedDefaultData: false });
  for (const resource of resources) {
    await medplum.createResource(resource);
  }
  vi.spyOn(medplum, 'search');
  return medplum;
}

function querySentTo(medplum: MockClient): Record<string, string> {
  return vi.mocked(medplum.search).mock.calls[0][1] as Record<string, string>;
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

  // MockClient's bundles never carry a `next` link, so a project too big for one page has to be stubbed.
  test('reads one page, and reports a project with more than that incomplete', async () => {
    const medplum = await setupClient([]);
    vi.mocked(medplum.search).mockResolvedValueOnce(
      searchset([configured, unconfigured], 'https://example.com/fhir/R4/HealthcareService?_offset=1000')
    );

    const { services, complete } = await searchConfigurableServices(medplum);

    expect(services.map((service) => service.id)).toEqual(['configured', 'unconfigured']);
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
const untypedFacility = location('facility-untyped', 'Northside');

const ultrasound: WithId<Device> = {
  resourceType: 'Device',
  id: 'ultrasound',
  deviceName: [{ name: 'Ultrasound', type: 'user-friendly-name' }],
  status: 'inactive',
};

function makeSchedule(id: string, actors: string[], active?: boolean): WithId<Schedule> {
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
  test('lists every provider, with a Schedule or without, turned off or not', async () => {
    const medplum = await setupClient([drAdams, drBaker, makeSchedule('adams', ['Practitioner/dr-adams'], false)]);

    const { actors, complete } = await searchConfigurableActors(medplum, 'Practitioner');

    expect(actors.map((actor) => [actor.resource.id, scheduleIds(actor)])).toEqual([
      ['dr-adams', ['adams']],
      ['dr-baker', []],
    ]);
    expect(complete).toBe(true);
    expect(querySentTo(medplum)).toEqual({ _sort: 'name', _count: '1000', _revinclude: 'Schedule:actor' });
  });

  test('attaches only the Schedules an actor holds alone', async () => {
    const medplum = await setupClient([
      drAdams,
      makeSchedule('shared', ['Practitioner/dr-adams', 'Location/room-1']),
      makeSchedule('first', ['Practitioner/dr-adams']),
      makeSchedule('second', ['Practitioner/dr-adams']),
    ]);

    const { actors } = await searchConfigurableActors(medplum, 'Practitioner');

    expect(scheduleIds(actors[0]).sort()).toEqual(['first', 'second']);
  });

  test('rooms are the Locations typed as a room or a bed, or holding a Schedule, and not the other facilities', async () => {
    const medplum = await setupClient([
      room1,
      bed1,
      clinic,
      untypedFacility,
      location('facility-scheduled', 'Annex', undefined),
      makeSchedule('annex', ['Location/facility-scheduled']),
    ]);

    const { actors } = await searchConfigurableActors(medplum, 'Location');

    expect(actors.map((actor) => actor.resource.id)).toEqual(['facility-scheduled', 'bed-1', 'room-1']);
    expect(querySentTo(medplum)).toEqual({ _sort: 'name', _count: '1000', _revinclude: 'Schedule:actor' });
  });

  test('lists devices, including retired ones', async () => {
    const medplum = await setupClient([ultrasound, makeSchedule('us', ['Device/ultrasound'])]);

    const { actors } = await searchConfigurableActors(medplum, 'Device');

    expect(actors.map((actor) => [actor.resource.id, scheduleIds(actor)])).toEqual([['ultrasound', ['us']]]);
    expect(querySentTo(medplum)).toEqual({ _sort: 'device-name', _count: '1000', _revinclude: 'Schedule:actor' });
  });

  test('reads one page with its Schedules, and reports a project with more than that incomplete', async () => {
    const medplum = await setupClient([]);
    vi.mocked(medplum.search).mockResolvedValueOnce(
      searchset<WithId<Resource>>(
        [drAdams, makeSchedule('a', ['Practitioner/dr-adams'])],
        'https://example.com/fhir/R4/Practitioner?_offset=1000'
      )
    );

    const { actors, complete } = await searchConfigurableActors(medplum, 'Practitioner');

    expect(actors.map((actor) => [actor.resource.id, scheduleIds(actor)])).toEqual([['dr-adams', ['a']]]);
    expect(complete).toBe(false);
    expect(medplum.search).toHaveBeenCalledTimes(1);
  });
});
