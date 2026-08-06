// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Appointment } from '@medplum/fhirtypes';
import { Document } from '@medplum/react';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { withMockedDate } from '../stories/decorators';
import { buildProposedAppointment } from '../stories/scheduling';
import { AppointmentDayTimes } from './AppointmentDayTimes';
import type { AppointmentDay } from './AppointmentFinder.utils';
import { groupAppointmentsByDay } from './AppointmentFinder.utils';

export default {
  title: 'Medplum/AppointmentDayTimes',
  component: AppointmentDayTimes,
  decorators: [withMockedDate],
} as Meta;

/** The clinic keeps Eastern hours, which are UTC-4 in May. */
const TIMEZONE = 'America/New_York';

const DAY = new Date(2020, 4, 5);

const RIVERA = { reference: 'Practitioner/dr-rivera', display: 'Dr. Maya Rivera' };
const OKAFOR = { reference: 'Practitioner/dr-okafor', display: 'Dr. Ada Okafor' };

/**
 * Builds a day's times.
 * @param offers - Who is offering, and at what times on the clinic's own clock.
 * @returns The day, as the picker would have grouped it.
 */
function buildDay(
  offers: readonly { actor: { reference: string; display: string }; times: string[] }[]
): AppointmentDay {
  const appointments: Appointment[] = offers.flatMap((offer) =>
    offer.times.map((time) =>
      buildProposedAppointment({ start: `2020-05-05T${time}:00.000Z`, actorReferences: [offer.actor] })
    )
  );
  return groupAppointmentsByDay(appointments, TIMEZONE)[0];
}

/**
 * A day of times, kept selectable so the chosen one fills in.
 * @param props - The React props.
 * @param props.day - The times to offer, or undefined for a day with none.
 * @returns The day.
 */
function Day(props: { readonly day: AppointmentDay | undefined }): JSX.Element {
  const [selected, setSelected] = useState<Appointment>();
  return (
    <Document>
      <AppointmentDayTimes
        date={DAY}
        day={props.day}
        timezone={TIMEZONE}
        selected={selected}
        onSelectAppointment={setSelected}
      />
    </Document>
  );
}

export const OneProvider = (): JSX.Element => (
  <Day day={buildDay([{ actor: RIVERA, times: ['13:00', '13:30', '14:00', '15:00'] }])} />
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
    day={buildDay([
      { actor: RIVERA, times: ['13:00', '13:30', '14:00', '15:00'] },
      { actor: OKAFOR, times: ['14:00', '17:00', '17:30'] },
    ])}
  />
);

/**
 * A day that came back with nothing on it, which still has to be said out loud.
 * @returns The story.
 */
export const NoTimes = (): JSX.Element => <Day day={undefined} />;
