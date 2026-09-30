// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { HealthcareService, Location } from '@medplum/fhirtypes';
import { Document } from '@medplum/react';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { withFixtures } from '../stories/decorators';
import { ImagingBenchFixtures, MainClinic, SchedulingFixtures, UltrasoundImagingService } from '../stories/scheduling';
import { AppointmentActorSelections } from './AppointmentActorSelections';
import type { ActorSelections } from './AppointmentFinder.schedules';
import { countActorCombinations, getActorCombinations } from './AppointmentFinder.schedules';

export default {
  title: 'Medplum/AppointmentActorSelections',
  component: AppointmentActorSelections,
  decorators: [withFixtures([...SchedulingFixtures, ...ImagingBenchFixtures])],
} as Meta;

/**
 * The rows, with what they come to underneath them.
 *
 * The combination count is the thing worth watching: adding a name to a row
 * multiplies it, and each one is a `$find` request.
 *
 * @param props - The React props.
 * @param props.service - The service being booked.
 * @param props.location - The site being booked at, if one was chosen.
 * @returns The fields, once the fixtures are in.
 */
function Fields(props: {
  readonly service: WithId<HealthcareService>;
  readonly location?: WithId<Location>;
}): JSX.Element {
  const [value, setValue] = useState<ActorSelections>({});
  const ways = countActorCombinations(value);
  const requests = getActorCombinations(value).length;

  return (
    <Document>
      <Stack maw={480}>
        <AppointmentActorSelections
          value={value}
          service={props.service}
          location={props.location}
          onChange={setValue}
        />
        <div>
          {ways} {ways === 1 ? 'way' : 'ways'} of holding this visit, searched as {requests}{' '}
          {requests === 1 ? 'request' : 'requests'}
        </div>
      </Stack>
    </Document>
  );
}

/**
 * Every role, one row each. Add names to a row for alternatives, or rows for
 * more of something.
 * @returns The story.
 */
export const AllRoles = (): JSX.Element => <Fields service={UltrasoundImagingService} />;

/**
 * Narrowed to one site, so the rooms and devices on offer are the ones kept there.
 * @returns The story.
 */
export const AtAClinic = (): JSX.Element => <Fields service={UltrasoundImagingService} location={MainClinic} />;
