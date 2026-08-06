// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Appointment } from '@medplum/fhirtypes';
import { Document } from '@medplum/react';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { withMockedDate } from '../stories/decorators';
import { buildProposedAppointment } from '../stories/scheduling';
import type { AppointmentSelectionOptions } from './AppointmentCustomTimeCard';
import { AppointmentCustomTimeCard } from './AppointmentCustomTimeCard';
import type { ActorCombination } from './AppointmentFinder.utils';
import { getActorsKey } from './AppointmentFinder.utils';

export default {
  title: 'Medplum/AppointmentCustomTimeCard',
  component: AppointmentCustomTimeCard,
  decorators: [withMockedDate],
} as Meta;

/** The clinic keeps Eastern hours, which are UTC-4 in May. */
const TIMEZONE = 'America/New_York';

const DAY = new Date(2020, 4, 5);

const RIVERA = { reference: 'Practitioner/dr-rivera', display: 'Dr. Maya Rivera' };
const OKAFOR = { reference: 'Practitioner/dr-okafor', display: 'Dr. Ada Okafor' };

/**
 * Keys the actors the way an offered appointment is keyed, so that a time that
 * is already on offer is recognised as that offer.
 * @param actor - Who the time would be held on.
 * @param actor.reference - The actor's reference.
 * @param actor.display - How the search named them.
 * @returns The combination.
 */
function combinationFor(actor: { reference: string; display: string }): ActorCombination {
  return {
    key: getActorsKey([actor]),
    label: actor.display,
    actors: [actor],
    schedules: [{ reference: `Schedule/schedule-${actor.reference.split('/')[1]}` }],
  };
}

/** 9:00 and 9:30 on the clinic's own clock, already on offer from Dr. Rivera. */
const OFFERED: Appointment[] = ['13:00', '13:30'].map((time) =>
  buildProposedAppointment({ start: `2020-05-05T${time}:00.000Z`, actorReferences: [RIVERA] })
);

function onSelectAppointment(appointment: Appointment, options: AppointmentSelectionOptions): void {
  console.log(options.available ? 'Took an offered time' : 'Overrode the schedule', appointment.start, appointment);
}

/**
 * Asking for a time on a day whose 9:00 and 9:30 are already offered.
 *
 * Entering 09:00 takes that offer, `contained` Slots and all. Entering anything
 * else warns that booking it may double-book whoever it is held on, and only
 * reports it back once that has been accepted.
 * @returns The story.
 */
export const Basic = (): JSX.Element => (
  <Document>
    <AppointmentCustomTimeCard
      day={DAY}
      options={[combinationFor(RIVERA)]}
      durationMinutes={30}
      offered={OFFERED}
      timezone={TIMEZONE}
      onSelectAppointment={onSelectAppointment}
    />
  </Document>
);

/**
 * More than one way to hold the time, which is what a search across several
 * providers leaves. The card has to ask which of them the time is for.
 * @returns The story.
 */
export const AChoiceOfWho = (): JSX.Element => (
  <Document>
    <AppointmentCustomTimeCard
      day={DAY}
      options={[combinationFor(RIVERA), combinationFor(OKAFOR)]}
      durationMinutes={30}
      offered={OFFERED}
      timezone={TIMEZONE}
      onSelectAppointment={onSelectAppointment}
    />
  </Document>
);

/**
 * A long visit. The length comes from the service rather than from the times on
 * offer, so a request made on a day with nothing on it still runs two hours.
 * @returns The story.
 */
export const ALongVisit = (): JSX.Element => (
  <Document>
    <AppointmentCustomTimeCard
      day={DAY}
      options={[combinationFor(RIVERA)]}
      durationMinutes={120}
      timezone={TIMEZONE}
      onSelectAppointment={onSelectAppointment}
    />
  </Document>
);
