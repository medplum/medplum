// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Appointment, Resource } from '@medplum/fhirtypes';
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
  Ultrasound1Device,
} from '../stories/scheduling';
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
 *
 * `$find` names an actor by reference, so the resources go in separately, the way
 * the booking form hands over whatever its fields fetched.
 *
 * @param actors - Whose times these are, as their own resources.
 * @param durationMinutes - How long each visit runs.
 * @returns The group, as the picker would have grouped it.
 */
function buildGroup(actors: readonly WithId<Resource>[], durationMinutes = 30): AppointmentSlotGroup {
  const references = actors.map((actor) => ({ reference: `${actor.resourceType}/${actor.id}` }));
  const appointments = TIMES.map((start) =>
    buildProposedAppointment({ start, durationMinutes, actorReferences: references })
  );
  const resources = new Map(references.map((reference, index) => [reference.reference, actors[index]]));
  return groupAppointmentsByDay(appointments, TIMEZONE, resources)[0].groups[0];
}

/**
 * Builds the same times with nothing but the references `$find` returned.
 * @param references - Who the times are held on.
 * @returns The group, naming its actors by reference alone.
 */
function buildUnresolvedGroup(references: readonly string[]): AppointmentSlotGroup {
  const appointments = TIMES.map((start) =>
    buildProposedAppointment({ start, actorReferences: references.map((reference) => ({ reference })) })
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
  <Card group={buildUnresolvedGroup(['Practitioner/dr-rivera', 'Location/exam-room-a'])} />
);
