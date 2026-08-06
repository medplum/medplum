// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Appointment } from '@medplum/fhirtypes';
import { Document } from '@medplum/react';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { withMockedDate } from '../stories/decorators';
import { buildProposedAppointment } from '../stories/scheduling';
import type { AppointmentSlotGroup } from './AppointmentFinder.utils';
import { groupAppointmentsByDay } from './AppointmentFinder.utils';
import { AppointmentSlotGroupCard } from './AppointmentSlotGroupCard';

export default {
  title: 'Medplum/AppointmentSlotGroupCard',
  component: AppointmentSlotGroupCard,
  decorators: [withMockedDate],
} as Meta;

/** The clinic keeps Eastern hours, which are UTC-4 in May. */
const TIMEZONE = 'America/New_York';

/** 9:00, 9:30, 10:00, 11:00 and 1:30 on the clinic's own clock. */
const TIMES = ['13:00', '13:30', '14:00', '15:00', '17:30'].map((time) => `2020-05-05T${time}:00.000Z`);

const RIVERA = { reference: 'Practitioner/dr-rivera', display: 'Dr. Maya Rivera' };
const CHEN_ROLE = { reference: 'PractitionerRole/role-dr-chen', display: 'Dr. Wei Chen' };
const EXAM_ROOM = { reference: 'Location/exam-room-a', display: 'Exam Room A' };
const ULTRASOUND = { reference: 'Device/ultrasound-1', display: 'Ultrasound 1' };

/**
 * Builds the times one set of actors is offering.
 * @param actors - Who the times are with.
 * @param durationMinutes - How long each visit runs.
 * @returns The group, as the picker would have grouped it.
 */
function buildGroup(
  actors: readonly { reference: string; display: string }[],
  durationMinutes = 30
): AppointmentSlotGroup {
  const appointments = TIMES.map((start) =>
    buildProposedAppointment({ start, durationMinutes, actorReferences: actors })
  );
  return groupAppointmentsByDay(appointments, TIMEZONE)[0].groups[0];
}

/**
 * A card of times, kept selectable so the chosen one fills in.
 * @param props - The React props.
 * @param props.group - The times to offer.
 * @param props.disabled - Whether the times can be chosen.
 * @returns The card.
 */
function Card(props: { readonly group: AppointmentSlotGroup; readonly disabled?: boolean }): JSX.Element {
  const [selected, setSelected] = useState<Appointment>();
  return (
    <Document>
      <AppointmentSlotGroupCard
        group={props.group}
        timezone={TIMEZONE}
        selected={selected}
        disabled={props.disabled}
        onSelectAppointment={setSelected}
      />
    </Document>
  );
}

export const OneProvider = (): JSX.Element => <Card group={buildGroup([RIVERA])} />;

/**
 * A booking that takes a person, a place and a machine, all free at once.
 *
 * Each actor is labelled with the role it fills, so that a card headed by three
 * names reads as a provider, a room and a device rather than as three names.
 * @returns The story.
 */
export const ATeam = (): JSX.Element => <Card group={buildGroup([CHEN_ROLE, EXAM_ROOM, ULTRASOUND], 120)} />;

/**
 * The same card with nothing selectable, which is how it looks while the booking
 * it belongs to is being written.
 * @returns The story.
 */
export const Busy = (): JSX.Element => <Card group={buildGroup([RIVERA])} disabled />;
