// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { HealthcareService, Location } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { Document } from '@medplum/react';
import { MedplumProvider } from '@medplum/react-hooks';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { MainClinic, SchedulingFixtures, UltrasoundImagingService, WalkInService } from '../stories/scheduling';
import { AppointmentActorSelect } from './AppointmentActorSelect';
import type { SchedulingRole } from './AppointmentFinder.roles';
import type { ScheduleCandidate } from './AppointmentFinder.schedules';

export default {
  title: 'Medplum/AppointmentActorSelect',
  component: AppointmentActorSelect,
} as Meta;

/**
 * Builds a client holding the scheduling fixtures.
 *
 * @returns The seeded client.
 */
async function buildClient(): Promise<MockClient> {
  const medplum = new MockClient();
  for (const resource of SchedulingFixtures) {
    await medplum.createResource(resource);
  }
  return medplum;
}

/**
 * One field, against the fixtures.
 * @param props - The React props.
 * @param props.role - The role being filled.
 * @param props.service - The service being booked.
 * @param props.location - The site being booked at, if one was chosen.
 * @returns The field, once the fixtures are in.
 */
function Field(props: {
  readonly role: SchedulingRole;
  readonly service: WithId<HealthcareService>;
  readonly location?: WithId<Location>;
}): JSX.Element | null {
  const [medplum, setMedplum] = useState<MockClient>();
  const [chosen, setChosen] = useState<readonly ScheduleCandidate[]>([]);

  useEffect(() => {
    buildClient().then(setMedplum).catch(console.error);
  }, []);

  if (!medplum) {
    return null;
  }

  return (
    <MedplumProvider medplum={medplum}>
      <Document>
        <Stack maw={420}>
          <AppointmentActorSelect
            role={props.role}
            service={props.service}
            location={props.location}
            onChange={setChosen}
          />
          <div>{chosen.map((candidate) => candidate.schedule.id).join(', ')}</div>
        </Stack>
      </Document>
    </MedplumProvider>
  );
}

/**
 * The required role. Focus it to see who the service has, or type a name.
 * @returns The story.
 */
export const Provider = (): JSX.Element => <Field role="provider" service={UltrasoundImagingService} />;

/**
 * An optional role, narrowed to the rooms inside the clinic being booked at.
 * @returns The story.
 */
export const RoomAtAClinic = (): JSX.Element => (
  <Field role="room" service={UltrasoundImagingService} location={MainClinic} />
);

/**
 * A role the service has nothing configured for. The field still renders rather
 * than disappearing, so the form's shape does not change with the data behind it.
 * @returns The story.
 */
export const NothingConfigured = (): JSX.Element => <Field role="device" service={WalkInService} />;
