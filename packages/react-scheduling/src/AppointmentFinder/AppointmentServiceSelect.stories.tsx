// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { Document } from '@medplum/react';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { withFixtures } from '../stories/decorators';
import { buildSchedulableService, MainClinic, SchedulingFixtures } from '../stories/scheduling';
import { AppointmentServiceSelect } from './AppointmentServiceSelect';

/**
 * Enough visit types to read as a list, chosen for what each one shows: two share a
 * category and differ only in length, and the third is held at the satellite site
 * alone, so narrowing to the main clinic drops it. The location-less "Telehealth
 * Consult" comes with the shared fixtures, and is what a site cannot exclude.
 */
const STORY_FIXTURES = [
  ...SchedulingFixtures,
  buildSchedulableService({
    id: 'new-patient-consult',
    name: 'New Patient Consultation',
    category: 'Consultation',
    durationMinutes: 45,
    alignmentMinutes: 15,
    locationIds: ['main-clinic', 'satellite-clinic'],
  }),
  buildSchedulableService({
    id: 'follow-up-visit',
    name: 'Follow-up Visit',
    category: 'Consultation',
    durationMinutes: 15,
    alignmentMinutes: 15,
    locationIds: ['main-clinic', 'satellite-clinic'],
  }),
  buildSchedulableService({
    id: 'urodynamics',
    name: 'Urodynamics Study',
    category: 'Diagnostic',
    durationMinutes: 60,
    alignmentMinutes: 30,
    locationIds: ['satellite-clinic'],
  }),
];

export default {
  title: 'Medplum/AppointmentServiceSelect',
  component: AppointmentServiceSelect,
  decorators: [withFixtures(STORY_FIXTURES)],
} as Meta;

/**
 * Visit types are searched on the server, and each is described by its category
 * and how long it takes.
 *
 * Only services carrying SchedulingParameters appear — "Walk-in Clinic" is in the
 * fixtures and is deliberately never offered, because `$find` could not produce
 * times for it.
 *
 * @returns The story.
 */
export const Basic = (): JSX.Element => {
  const [service, setService] = useState<WithId<HealthcareService>>();
  return (
    <Document>
      <AppointmentServiceSelect onChange={setService} />
      <Text size="sm" c="dimmed" mt="md">
        {service ? `Chose ${service.id}` : 'Nothing chosen yet'}
      </Text>
    </Document>
  );
};

/**
 * A site chosen earlier narrows what is on offer, and the field says so.
 *
 * A site holds what it is named on, plus everything named on no location at all: the
 * practice-wide "Telehealth Consult" is offered here and at every other site, while the
 * satellite-only "Urodynamics Study" drops off. Open the field to read them — the two
 * come from separate searches and arrive as one list in name order, "Telehealth Consult"
 * between the sited visit types rather than grouped at either end.
 *
 * @returns The story.
 */
export const NarrowedToASite = (): JSX.Element => (
  <Document>
    <AppointmentServiceSelect onChange={() => undefined} location={MainClinic} />
  </Document>
);
