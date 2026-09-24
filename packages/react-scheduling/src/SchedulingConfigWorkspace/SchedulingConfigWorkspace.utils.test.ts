// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { TimezoneExtensionURI, toServiceTypeCodeableConcepts } from '@medplum/core';
import type { Device, HealthcareService, Location, Practitioner, Schedule } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import type { ConfigurableActor } from '../configSearch';
import {
  setHealthcareServiceSchedulingParameterValues,
  setScheduleSchedulingParameterValues,
} from '../parameterValues';
import {
  buildActorItems,
  buildServiceItems,
  getActorNotices,
  getOfferings,
  isSameSelection,
  matchesFilter,
  mergeActors,
  withStoredActorResource,
  withStoredService,
} from './SchedulingConfigWorkspace.utils';

const configured = setHealthcareServiceSchedulingParameterValues(
  { resourceType: 'HealthcareService', id: 'exam', name: 'Annual exam' } satisfies WithId<HealthcareService>,
  { duration: 30 }
);
const unconfigured: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'draw', name: 'Blood draw' };
const inactive: WithId<HealthcareService> = {
  resourceType: 'HealthcareService',
  id: 'consult',
  name: 'Consult',
  active: false,
};

describe('matchesFilter', () => {
  test('matches a substring regardless of case, and everything when blank', () => {
    expect(matchesFilter('Exam Room A', 'room')).toBe(true);
    expect(matchesFilter('Exam Room A', '  ')).toBe(true);
    expect(matchesFilter('Exam Room A', 'lab')).toBe(false);
  });
});

describe('buildServiceItems', () => {
  test('marks the selection', () => {
    const items = buildServiceItems([configured, unconfigured], { kind: 'service', id: 'exam' }, '', false);

    expect(items).toEqual([
      { id: 'exam', label: 'Annual exam', selected: true, inactive: false },
      { id: 'draw', label: 'Blood draw', selected: false, inactive: false },
    ]);
  });

  test('hides turned-off visit types unless asked to show them', () => {
    expect(buildServiceItems([configured, inactive], undefined, '', false).map((item) => item.id)).toEqual(['exam']);

    const shown = buildServiceItems([configured, inactive], undefined, '', true);
    expect(shown.map((item) => [item.id, item.inactive])).toEqual([
      ['exam', false],
      ['consult', true],
    ]);
  });

  test('lists the selected visit type even when it is turned off', () => {
    const items = buildServiceItems([configured, inactive], { kind: 'service', id: 'consult' }, '', false);

    expect(items.map((item) => [item.id, item.selected, item.inactive])).toEqual([
      ['exam', false, false],
      ['consult', true, true],
    ]);
  });

  test('a visit type being created selects no row', () => {
    const items = buildServiceItems([configured], { kind: 'new-service', key: 1 }, '', false);

    expect(items[0].selected).toBe(false);
  });

  test('the filter narrows the rows', () => {
    const items = buildServiceItems([configured, unconfigured], undefined, 'BLOOD', false);

    expect(items.map((item) => item.id)).toEqual(['draw']);
  });
});

describe('isSameSelection', () => {
  test('matches the same stored visit type, or the same visit type being created', () => {
    expect(isSameSelection({ kind: 'service', id: 'exam' }, { kind: 'service', id: 'exam' })).toBe(true);
    expect(isSameSelection({ kind: 'service', id: 'exam' }, { kind: 'service', id: 'draw' })).toBe(false);
    expect(isSameSelection({ kind: 'new-service', key: 1 }, { kind: 'new-service', key: 1 })).toBe(true);
    expect(isSameSelection({ kind: 'new-service', key: 1 }, { kind: 'new-service', key: 2 })).toBe(false);
    expect(isSameSelection({ kind: 'service', id: 'exam' }, undefined)).toBe(false);
  });

  test('matches the same actor, whichever of its visit types is open', () => {
    const smith = { kind: 'actor', resourceType: 'Practitioner', id: 'dr-smith' } as const;

    expect(isSameSelection(smith, { ...smith, openServiceId: 'exam' })).toBe(true);
    expect(isSameSelection(smith, { ...smith, resourceType: 'Device' })).toBe(false);
    expect(isSameSelection(smith, { kind: 'service', id: 'dr-smith' })).toBe(false);
  });
});

const timed = setHealthcareServiceSchedulingParameterValues(
  { resourceType: 'HealthcareService', id: 'timed', name: 'Timed' } satisfies WithId<HealthcareService>,
  { timezone: 'America/New_York' }
);
const servicesById = new Map([configured, unconfigured, timed].map((service) => [service.id, service]));

const drSmith: WithId<Practitioner> = { resourceType: 'Practitioner', id: 'dr-smith', name: [{ family: 'Smith' }] };
const drLeft: WithId<Practitioner> = {
  resourceType: 'Practitioner',
  id: 'dr-left',
  name: [{ family: 'Left' }],
  active: false,
};
const retired: WithId<Device> = {
  resourceType: 'Device',
  id: 'retired',
  deviceName: [{ name: 'Retired scope', type: 'user-friendly-name' }],
  status: 'inactive',
};
const untypedRoom: WithId<Location> = { resourceType: 'Location', id: 'procedure', name: 'Procedure Room' };
const typedRoom: WithId<Location> = {
  resourceType: 'Location',
  id: 'room-1',
  name: 'Room 1',
  physicalType: { coding: [{ code: 'ro' }] },
};

function calendar(
  id: string,
  actor: string,
  offered: WithId<HealthcareService>[],
  extra?: Partial<Schedule>
): WithId<Schedule> {
  return {
    resourceType: 'Schedule',
    id,
    actor: [{ reference: actor }],
    serviceType: offered.flatMap((service) => toServiceTypeCodeableConcepts(service)),
    ...extra,
  };
}

describe('getActorNotices', () => {
  test('an actor without a calendar needs nothing', () => {
    expect(getActorNotices({ resource: drSmith, schedules: [] }, servicesById)).toEqual([]);
  });

  test('no time zone, when a visit type offered resolves none from the calendar, the visit type, or the actor', () => {
    const offering = calendar('s', 'Practitioner/dr-smith', [configured]);

    expect(getActorNotices({ resource: drSmith, schedules: [offering] }, servicesById)).toEqual(['No time zone']);
    expect(
      getActorNotices({ resource: drSmith, schedules: [calendar('s', 'Practitioner/dr-smith', [timed])] }, servicesById)
    ).toEqual([]);
    expect(
      getActorNotices(
        {
          resource: { ...drSmith, extension: [{ url: TimezoneExtensionURI, valueCode: 'America/Chicago' }] },
          schedules: [offering],
        },
        servicesById
      )
    ).toEqual([]);
    expect(
      getActorNotices(
        {
          resource: drSmith,
          schedules: [setScheduleSchedulingParameterValues(offering, configured, { timezone: 'America/Denver' })],
        },
        servicesById
      )
    ).toEqual([]);
  });

  test('not accepting appointments, and not marked as a room', () => {
    const off = calendar('s', 'Location/procedure', [timed], { active: false });

    expect(getActorNotices({ resource: untypedRoom, schedules: [off] }, servicesById)).toEqual([
      'Not accepting appointments',
      'Not marked as a room',
    ]);
    expect(getActorNotices({ resource: typedRoom, schedules: [] }, servicesById)).toEqual([]);
  });
});

describe('buildActorItems', () => {
  const actors: ConfigurableActor[] = [
    { resource: drLeft, schedules: [] },
    { resource: drSmith, schedules: [] },
  ];

  test('hides inactive actors unless asked, but always lists the selected one', () => {
    expect(buildActorItems(actors, undefined, '', false, servicesById).map((item) => item.label)).toEqual(['Smith']);
    expect(
      buildActorItems(actors, undefined, '', true, servicesById).map((item) => [item.label, item.inactive])
    ).toEqual([
      ['Left', true],
      ['Smith', false],
    ]);
    const selected = buildActorItems(
      actors,
      { kind: 'actor', resourceType: 'Practitioner', id: 'dr-left' },
      '',
      false,
      servicesById
    );
    expect(selected.map((item) => [item.label, item.selected])).toEqual([
      ['Left', true],
      ['Smith', false],
    ]);
  });

  test('a retired device counts as inactive', () => {
    expect(buildActorItems([{ resource: retired, schedules: [] }], undefined, '', false, servicesById)).toEqual([]);
  });
});

describe('mergeActors', () => {
  test('keeps each actor once, with every calendar either read found, by name', () => {
    const a = calendar('a', 'Location/procedure', []);
    const b = calendar('b', 'Location/procedure', []);

    const merged = mergeActors(
      [
        { resource: typedRoom, schedules: [] },
        { resource: untypedRoom, schedules: [a] },
      ],
      [{ resource: untypedRoom, schedules: [a, b] }]
    );

    expect(merged.map((actor) => [actor.resource.id, actor.schedules.map((schedule) => schedule.id)])).toEqual([
      ['procedure', ['a', 'b']],
      ['room-1', []],
    ]);
  });
});

describe('withStoredActorResource', () => {
  const smithCalendar = calendar('s', 'Practitioner/dr-smith', [configured]);
  const actors: ConfigurableActor[] = [{ resource: drSmith, schedules: [smithCalendar] }];

  test('replaces a calendar its only actor holds, and adds one just created', () => {
    const updated = { ...smithCalendar, active: false };
    const created = calendar('new', 'Practitioner/dr-smith', [timed]);

    expect(withStoredActorResource(actors, updated)[0].schedules).toEqual([updated]);
    expect(withStoredActorResource(actors, created)[0].schedules).toEqual([smithCalendar, created]);
  });

  test('replaces the actor itself', () => {
    const renamed = { ...drSmith, name: [{ family: 'Smythe' }] };

    expect(withStoredActorResource(actors, renamed)[0].resource).toEqual(renamed);
  });

  test('ignores a calendar of an actor not listed, or one held by several', () => {
    const shared = {
      ...smithCalendar,
      id: 'shared',
      actor: [{ reference: 'Practitioner/dr-smith' }, { reference: 'Location/room-1' }],
    };

    expect(withStoredActorResource(actors, calendar('x', 'Practitioner/dr-other', []))).toEqual(actors);
    expect(withStoredActorResource(actors, shared)).toEqual(actors);
  });
});

describe('getOfferings', () => {
  test('lists the actors whose edited calendar offers the visit type', () => {
    const offering = calendar('s', 'Practitioner/dr-smith', [configured]);
    const second = calendar('t', 'Location/room-1', [unconfigured]);
    const other = calendar('u', 'Location/room-1', [configured]);

    const found = getOfferings(
      [
        { resource: drSmith, schedules: [offering] },
        { resource: typedRoom, schedules: [second, other] },
      ],
      configured
    );

    expect(found.map((item) => item.schedule.id)).toEqual(['s']);
  });
});

describe('withStoredService', () => {
  test('replaces the stored version where it sits', () => {
    const renamed = { ...unconfigured, name: 'Blood draw (fasting)' };

    expect(withStoredService([configured, unconfigured], renamed)).toEqual([configured, renamed]);
  });

  test('puts a new visit type where its name sorts', () => {
    const created: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'b', name: 'Biopsy' };

    expect(withStoredService([configured, unconfigured], created).map((service) => service.id)).toEqual([
      'exam',
      'b',
      'draw',
    ]);
  });

  test('a renamed visit type moves to where its new name sorts', () => {
    const renamed = { ...configured, name: 'Zoster vaccine' };

    expect(withStoredService([configured, unconfigured], renamed).map((service) => service.id)).toEqual([
      'draw',
      'exam',
    ]);
  });
});
