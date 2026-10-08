// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ServiceTypeReferenceURI, toServiceTypeCodeableConcepts } from '@medplum/core';
import type { HealthcareService, Location, Practitioner, Schedule } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import type { ConfigurableActor } from '../configSearch';
import { setHealthcareServiceSchedulingParameterValues } from '../parameterValues';
import {
  buildActorItems,
  buildServiceItems,
  getActorNotices,
  getOfferedServices,
  isSameSelection,
  matchesFilter,
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

const drSmith: WithId<Practitioner> = { resourceType: 'Practitioner', id: 'dr-smith', name: [{ family: 'Smith' }] };
const drLeft: WithId<Practitioner> = {
  resourceType: 'Practitioner',
  id: 'dr-left',
  name: [{ family: 'Left' }],
  active: false,
};
const typedRoom: WithId<Location> = {
  resourceType: 'Location',
  id: 'room-1',
  name: 'Room 1',
  physicalType: { coding: [{ code: 'ro' }] },
};

function makeSchedule(
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
  test('marks an active actor whose Schedule is inactive, but not an inactive one', () => {
    const off = makeSchedule('s', 'Location/procedure', [timed], { active: false });

    expect(getActorNotices({ resource: typedRoom, schedules: [off] })).toEqual(['Schedule inactive']);
    expect(getActorNotices({ resource: { ...typedRoom, status: 'inactive' }, schedules: [off] })).toEqual([]);
    expect(getActorNotices({ resource: drSmith, schedules: [] })).toEqual([]);
  });
});

describe('buildActorItems', () => {
  const onLeave: WithId<Practitioner> = { ...drSmith, id: 'dr-leave', name: [{ family: 'Leave' }] };
  const actors: ConfigurableActor[] = [
    { resource: drLeft, schedules: [] },
    { resource: onLeave, schedules: [makeSchedule('s', 'Practitioner/dr-leave', [configured], { active: false })] },
    { resource: drSmith, schedules: [] },
  ];

  test('hides actors that are inactive or whose Schedule is, unless asked, but always lists the selected one', () => {
    expect(buildActorItems(actors, undefined, '', false).map((item) => item.label)).toEqual(['Smith']);
    expect(
      buildActorItems(actors, undefined, '', true).map((item) => [item.label, item.inactive, item.notices])
    ).toEqual([
      ['Left', true, []],
      ['Leave', false, ['Schedule inactive']],
      ['Smith', false, []],
    ]);
    const selected = buildActorItems(actors, { kind: 'actor', resourceType: 'Practitioner', id: 'dr-left' }, '', false);
    expect(selected.map((item) => [item.label, item.selected])).toEqual([
      ['Left', true],
      ['Smith', false],
    ]);
  });
});

describe('withStoredActorResource', () => {
  const smithSchedule = makeSchedule('s', 'Practitioner/dr-smith', [configured]);
  const actors: ConfigurableActor[] = [{ resource: drSmith, schedules: [smithSchedule] }];

  test('replaces a Schedule its only actor holds, and adds one just created', () => {
    const updated = { ...smithSchedule, active: false };
    const created = makeSchedule('new', 'Practitioner/dr-smith', [timed]);

    expect(withStoredActorResource(actors, updated)[0].schedules).toEqual([updated]);
    expect(withStoredActorResource(actors, created)[0].schedules).toEqual([smithSchedule, created]);
  });

  test('replaces the actor itself', () => {
    const renamed = { ...drSmith, name: [{ family: 'Smythe' }] };

    expect(withStoredActorResource(actors, renamed)[0].resource).toEqual(renamed);
  });

  test('ignores a Schedule of an actor not listed, or one held by several', () => {
    const shared = {
      ...smithSchedule,
      id: 'shared',
      actor: [{ reference: 'Practitioner/dr-smith' }, { reference: 'Location/room-1' }],
    };

    expect(withStoredActorResource(actors, makeSchedule('x', 'Practitioner/dr-other', []))).toEqual(actors);
    expect(withStoredActorResource(actors, shared)).toEqual(actors);
  });
});

describe('getOfferedServices', () => {
  test('lists a visit type the Schedule names by a versioned reference once', () => {
    const versioned: WithId<Schedule> = {
      ...makeSchedule('s', 'Practitioner/dr-smith', []),
      serviceType: [
        {
          extension: [
            { url: ServiceTypeReferenceURI, valueReference: { reference: 'HealthcareService/exam/_history/2' } },
          ],
        },
        ...toServiceTypeCodeableConcepts(configured),
      ],
    };

    expect(getOfferedServices(versioned, new Map([[configured.id, configured]]))).toEqual([configured]);
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
