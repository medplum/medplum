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

function calendar(actor: string, offered: WithId<HealthcareService>[]): Schedule {
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
    await setup(drSmith, [calendar('Practitioner/dr-smith', [initialVisit, followUp])]);

    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'General',
      'Visit types offered',
    ]);
    expect(screen.getByText('Initial Visit')).toBeInTheDocument();
    expect(screen.getByText('60 min · Mon 9:00 AM–5:00 PM')).toBeInTheDocument();
    expect(screen.getByText('Follow-up')).toBeInTheDocument();
    expect(screen.getByText('30 min · Any time (no hours set)')).toBeInTheDocument();
  });

  test('a room with no calendar offers nothing yet', async () => {
    await setup(room3);

    expect(screen.getByText('Room 3 offers no visit types yet.')).toBeInTheDocument();
  });

  test("a provider's name and status are read-only", async () => {
    await setup({ ...drSmith, active: false }, [calendar('Practitioner/dr-smith', [initialVisit])]);

    expect(screen.getAllByText('Inactive')).toHaveLength(2);
    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /Active/ })).not.toBeInTheDocument();
  });
});
