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
  DrChenPractitioner,
  DrRiveraPractitioner,
  ExamRoomA,
  indexByReference,
  Ultrasound1Device,
} from '../stories/scheduling';
import type { SchedulingActorResource } from './AppointmentFinder.roles';
import type { AppointmentSlotGroup } from './AppointmentFinder.times';
import { groupAppointmentsByDay } from './AppointmentFinder.times';
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

/**
 * Builds the times one set of actors is offering.
 * @param actors - Whose times these are, as their own resources.
 * @param durationMinutes - How long each visit runs.
 * @param resolved - Whether the resources are handed over, or only the references
 *   `$find` returned.
 * @returns The group, as the picker would have grouped it.
 */
function buildGroup(
  actors: readonly SchedulingActorResource[],
  durationMinutes = 30,
  resolved = true
): AppointmentSlotGroup {
  const appointments = TIMES.map((start) =>
    buildProposedAppointment({
      start,
      durationMinutes,
      actorReferences: actors.map((actor) => getReferenceString(actor)),
    })
  );
  const resources = resolved ? indexByReference(actors) : undefined;
  return groupAppointmentsByDay(appointments, TIMEZONE, resources)[0].groups[0];
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

export const OneProvider = (): JSX.Element => <Card group={buildGroup([DrRiveraPractitioner])} />;

/**
 * A booking that takes a person, a place and a machine, all free at once.
 * @returns The story.
 */
export const ATeam = (): JSX.Element => (
  <Card group={buildGroup([DrChenPractitioner, ExamRoomA, Ultrasound1Device], 120)} />
);

/**
 * The same card with nothing selectable, which is how it looks while the booking
 * it belongs to is being written.
 * @returns The story.
 */
export const Busy = (): JSX.Element => <Card group={buildGroup([DrRiveraPractitioner])} disabled />;

/**
 * A card handed nothing but the references `$find` returned, which is what a
 * caller who supplies no resources gets: each actor is read back before it can
 * be named, so the headings fill in a beat after the times do.
 *
 * @returns The story.
 */
export const UnresolvedActors = (): JSX.Element => (
  <Card group={buildGroup([DrRiveraPractitioner, ExamRoomA], 30, false)} />
);
