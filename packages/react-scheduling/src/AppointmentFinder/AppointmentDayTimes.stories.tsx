// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import { Document } from '@medplum/react';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { withMockedDate } from '../stories/decorators';
import {
  buildProposedAppointment,
  DrOkaforPractitioner,
  DrRiveraPractitioner,
  indexByReference,
} from '../stories/scheduling';
import { AppointmentDayTimes } from './AppointmentDayTimes';
import type { SchedulingActorResource } from './AppointmentFinder.roles';
import type { AppointmentSlotGroup } from './AppointmentFinder.times';
import { groupAppointmentsByDay } from './AppointmentFinder.times';

export default {
  title: 'Medplum/AppointmentDayTimes',
  component: AppointmentDayTimes,
  decorators: [withMockedDate],
} as Meta;

/** The clinic keeps Eastern hours, which are UTC-4 in May. */
const TIMEZONE = 'America/New_York';

const DAY = new Date(2020, 4, 5);

/**
 * Builds a day's times.
 * @param offers - Who is offering, and at what times on the clinic's own clock.
 * @returns The times, as the picker would have grouped them.
 */
function buildGroups(
  offers: readonly { actor: SchedulingActorResource; times: string[] }[]
): readonly AppointmentSlotGroup[] {
  const appointments: Appointment[] = offers.flatMap((offer) =>
    offer.times.map((time) =>
      buildProposedAppointment({
        start: `2020-05-05T${time}:00.000Z`,
        actorReferences: [getReferenceString(offer.actor)],
      })
    )
  );
  const resources = indexByReference(offers.map((offer) => offer.actor));
  return groupAppointmentsByDay(appointments, TIMEZONE, resources)[0].groups;
}

/**
 * A day of times, kept selectable so the chosen one fills in.
 * @param props - The React props.
 * @param props.groups - The times to offer, empty for a day with none.
 * @returns The day.
 */
function Day(props: { readonly groups: readonly AppointmentSlotGroup[] }): JSX.Element {
  const [selected, setSelected] = useState<Appointment>();
  return (
    <Document>
      <AppointmentDayTimes
        date={DAY}
        groups={props.groups}
        timezone={TIMEZONE}
        selected={selected}
        onSelectAppointment={setSelected}
      />
    </Document>
  );
}

export const OneProvider = (): JSX.Element => (
  <Day groups={buildGroups([{ actor: DrRiveraPractitioner, times: ['13:00', '13:30', '14:00', '15:00'] }])} />
);

/**
 * Two providers with overlapping hours.
 *
 * The times are split by who is offering them rather than merged into one list,
 * because 10:00 with one provider and 10:00 with another are different bookings
 * and the person choosing has to be able to tell which is which.
 * @returns The story.
 */
export const SeveralProviders = (): JSX.Element => (
  <Day
    groups={buildGroups([
      { actor: DrRiveraPractitioner, times: ['13:00', '13:30', '14:00', '15:00'] },
      { actor: DrOkaforPractitioner, times: ['14:00', '17:00', '17:30'] },
    ])}
  />
);

/**
 * A day that came back with nothing on it, which still has to be said out loud.
 * @returns The story.
 */
export const NoTimes = (): JSX.Element => <Day groups={[]} />;
