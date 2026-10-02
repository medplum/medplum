// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { toServiceTypeCodeableConcepts } from '@medplum/core';
import type { HealthcareService, Location, Practitioner, Schedule } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { describe, expect, test } from 'vitest';
import type { ConfigurableActor, ConfigurableActorResource } from '../../configSearch';
import { setHealthcareServiceSchedulingParameterValues } from '../../parameterValues';
import { renderWithMedplum, screen } from '../../test-utils/render';
import { ActorPage } from './ActorPage';

const room3: WithId<Location> = {
  resourceType: 'Location',
  id: 'room-3',
  name: 'Room 3',
  status: 'active',
  physicalType: { coding: [{ code: 'ro' }] },
  partOf: { reference: 'Location/downtown' },
};

const initialVisit = setHealthcareServiceSchedulingParameterValues(
  {
    resourceType: 'HealthcareService',
    id: 'initial-visit',
    name: 'Initial Visit',
    availableTime: [{ daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' }],
  } satisfies WithId<HealthcareService>,
  { duration: 60, timezone: 'America/New_York' }
);
const followUp = setHealthcareServiceSchedulingParameterValues(
  { resourceType: 'HealthcareService', id: 'follow-up', name: 'Follow-up' } satisfies WithId<HealthcareService>,
  { duration: 30, timezone: 'America/New_York' }
);
const services = [initialVisit, followUp];

const drSmith: WithId<Practitioner> = {
  resourceType: 'Practitioner',
  id: 'dr-smith',
  name: [{ prefix: ['Dr.'], given: ['Jane'], family: 'Smith' }],
};

function makeSchedule(actor: string, offered: WithId<HealthcareService>[]): Schedule {
  return {
    resourceType: 'Schedule',
    id: `schedule-${actor.split('/')[1]}`,
    active: true,
    actor: [{ reference: actor }],
    serviceType: offered.flatMap((service) => toServiceTypeCodeableConcepts(service)),
  };
}

async function setup(actor: ConfigurableActorResource, schedules: Schedule[] = []): Promise<void> {
  const medplum = new MockClient({ seedDefaultData: false });
  for (const resource of [...services, actor]) {
    await medplum.createResource(resource);
  }
  const stored: WithId<Schedule>[] = [];
  for (const schedule of schedules) {
    stored.push(await medplum.createResource(schedule));
  }
  const configurable: ConfigurableActor = { resource: actor, schedules: stored };
  renderWithMedplum(<ActorPage actor={configurable} services={services} />, medplum);
}

describe('ActorPage', () => {
  test("a provider's page shows General and Visit types, with every visit type's summary", async () => {
    await setup(drSmith, [makeSchedule('Practitioner/dr-smith', [initialVisit, followUp])]);

    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'General',
      'Visit types offered',
    ]);
    expect(screen.getByText('Initial Visit')).toBeInTheDocument();
    expect(screen.getByText("60 min · Visit type's default hours")).toBeInTheDocument();
    expect(screen.getByText('Follow-up')).toBeInTheDocument();
    expect(screen.getByText('30 min · No hours set')).toBeInTheDocument();
  });

  test('a room with no Schedule offers nothing yet', async () => {
    await setup(room3);

    expect(screen.getByText('Room 3 offers no visit types yet.')).toBeInTheDocument();
    expect(screen.queryByText('Schedule status')).not.toBeInTheDocument();
  });

  const SCHEDULE_OFF =
    "This provider's Schedule is switched off, so they can't be booked until it's switched back on. Appointments already booked stay booked.";
  const INACTIVE = "This provider is inactive and can't be booked.";

  test.each([
    [true, true, undefined],
    [true, false, SCHEDULE_OFF],
    [false, true, INACTIVE],
    [false, false, INACTIVE],
  ])('provider active: %s, Schedule active: %s, alert: %s', async (providerActive, scheduleActive, expected) => {
    await setup({ ...drSmith, active: providerActive }, [
      { ...makeSchedule('Practitioner/dr-smith', [initialVisit]), active: scheduleActive },
    ]);

    if (expected) {
      expect(screen.getByRole('alert')).toHaveTextContent(expected);
    } else {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    }
  });

  test("a room whose Schedule is off is called 'it'", async () => {
    await setup(room3, [{ ...makeSchedule('Location/room-3', [initialVisit]), active: false }]);

    expect(screen.getByRole('alert')).toHaveTextContent(
      "This room's Schedule is switched off, so it can't be booked until it's switched back on."
    );
  });

  test("shows the provider's status and the Schedule's status side by side", async () => {
    await setup(drSmith, [{ ...makeSchedule('Practitioner/dr-smith', [initialVisit]), active: false }]);

    expect(screen.getByText('Provider status').parentElement).toHaveTextContent('Active');
    expect(screen.getByText('Schedule status').parentElement).toHaveTextContent('Inactive');
  });

  test('a room with no status reads as active', async () => {
    await setup({ ...room3, status: undefined });

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  test("a provider's name and status are read-only", async () => {
    await setup({ ...drSmith, active: false }, [makeSchedule('Practitioner/dr-smith', [initialVisit])]);

    expect(screen.getAllByText('Inactive')).toHaveLength(2);
    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /Active/ })).not.toBeInTheDocument();
  });
});
