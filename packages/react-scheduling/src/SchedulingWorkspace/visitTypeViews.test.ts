// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import type { VisitTypeViews } from './visitTypeViews';
import { addVisitType, keepVisitTypesAtSites, toFilterServices, toVisitTypeViews } from './visitTypeViews';

function service(id: string, site?: string): WithId<HealthcareService> {
  return { resourceType: 'HealthcareService', id, location: site ? [{ reference: `Location/${site}` }] : undefined };
}

const EVERY_APPOINTMENT: VisitTypeViews = { allAppointments: true, listed: [] };

describe('visitTypeViews', () => {
  test('a visit type added is shaded and leaves every appointment drawn', () => {
    const views = addVisitType(EVERY_APPOINTMENT, service('follow-up'));

    expect(toFilterServices(views)).toEqual({ services: undefined, availabilityServices: [service('follow-up')] });
  });

  test('a fourth visit type is listed with its availability off', () => {
    const views = ['a', 'b', 'c', 'd'].map((id) => service(id)).reduce(addVisitType, EVERY_APPOINTMENT);

    expect(views.listed.map((view) => view.availability)).toEqual([true, true, true, false]);
    // Listed once, however often it is picked.
    expect(addVisitType(views, service('a'))).toBe(views);
  });

  test('once not every appointment is drawn, only the listed ones ticked for it are', () => {
    const views: VisitTypeViews = {
      allAppointments: false,
      listed: [
        { service: service('a'), appointments: true, availability: false },
        { service: service('b'), appointments: false, availability: true },
      ],
    };

    expect(toFilterServices(views)).toEqual({ services: [service('a')], availabilityServices: [service('b')] });
    // And none listed is none drawn.
    expect(toFilterServices({ allAppointments: false, listed: [] }).services).toEqual([]);
  });

  test('is read back from the values it was reported as', () => {
    const views: VisitTypeViews = {
      allAppointments: false,
      listed: [
        { service: service('a'), appointments: true, availability: true },
        { service: service('b'), appointments: false, availability: true },
      ],
    };

    expect(toVisitTypeViews(toFilterServices(views))).toEqual(views);
  });

  test('a change of site drops what it does not hold, and goes back to every appointment if that empties them', () => {
    const views: VisitTypeViews = {
      allAppointments: false,
      listed: [
        { service: service('here', 'main'), appointments: true, availability: true },
        { service: service('anywhere'), appointments: false, availability: true },
      ],
    };

    const kept = keepVisitTypesAtSites(views, [{ reference: 'Location/satellite' }]);

    expect(kept.listed.map((view) => view.service.id)).toEqual(['anywhere']);
    expect(kept.allAppointments).toBe(true);
  });
});
