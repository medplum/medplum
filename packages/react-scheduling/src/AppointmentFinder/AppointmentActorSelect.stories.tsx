// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Coding, Schedule } from '@medplum/fhirtypes';
import { Document } from '@medplum/react';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import {
  DrChenSchedule,
  DrKimSchedule,
  DrOkaforSchedule,
  DrRiveraSchedule,
  ExamRoomASchedule,
  ExamRoomBSchedule,
} from '../stories/scheduling';
import { AppointmentActorSelect } from './AppointmentActorSelect';
import { ROLE_LABELS, getSchedulingRole, isSchedulingActorType } from './AppointmentFinder.roles';
import type { ActorRequirement, ScheduleCandidate, ScheduleCandidateGroup } from './AppointmentFinder.schedules';
import { toActorRequirements } from './AppointmentFinder.schedules';

export default {
  title: 'Medplum/AppointmentActorSelect',
  component: AppointmentActorSelect,
} as Meta;

const SURGEON: Coding = { system: 'http://snomed.info/sct', code: '304292004', display: 'Surgeon' };
const ANAESTHETICS: Coding = { system: 'http://snomed.info/sct', code: '394577000', display: 'Anaesthetics' };
const IMAGING: Coding = { system: 'http://snomed.info/sct', code: '82918005', display: 'Imaging room' };

/**
 * Builds a candidate from a fixture Schedule, the way `searchEligibleSchedules`
 * would have.
 *
 * The role and actor type are derived from the Schedule's own actor rather than
 * passed in, so a story cannot describe a room as a provider.
 *
 * @param schedule - The fixture Schedule the actor is booked through.
 * @param display - The actor's name, as the Schedule records it.
 * @param qualifiers - Codings saying what kind of thing the actor is.
 * @returns The candidate.
 */
function candidate(schedule: WithId<Schedule>, display: string, qualifiers: Coding[] = []): ScheduleCandidate {
  const actor = schedule.actor[0];
  const actorType = actor.reference?.split('/')[0];
  if (!isSchedulingActorType(actorType)) {
    throw new Error(`${schedule.id} is not held on a schedulable actor`);
  }
  return {
    schedule,
    actor,
    actorType,
    role: getSchedulingRole(actorType),
    actorDisplay: display,
    qualifiers,
    actorResource: undefined,
  };
}

const PROVIDERS: ScheduleCandidateGroup = {
  role: 'provider',
  label: ROLE_LABELS.provider,
  required: true,
  candidates: [
    candidate(DrRiveraSchedule, 'Dr. Maya Rivera'),
    candidate(DrOkaforSchedule, 'Dr. Tunde Okafor'),
    candidate(DrChenSchedule, 'Dr. Wei Chen', [SURGEON]),
    candidate(DrKimSchedule, 'Dr. James Kim', [ANAESTHETICS]),
  ],
};

const ROOMS: ScheduleCandidateGroup = {
  role: 'room',
  label: ROLE_LABELS.room,
  required: false,
  candidates: [candidate(ExamRoomASchedule, 'Exam Room A', [IMAGING]), candidate(ExamRoomBSchedule, 'Exam Room B')],
};

/**
 * One role's field, holding its own selection so choosing and removing work.
 * @param props - The React props.
 * @param props.group - The role and the actors that can fill it.
 * @param props.initial - Requirements chosen before the story opens.
 * @param props.error - Why the selection is not yet valid.
 * @returns The field.
 */
function Field(props: {
  readonly group: ScheduleCandidateGroup;
  readonly initial?: readonly ActorRequirement[];
  readonly error?: string;
}): JSX.Element {
  const [value, setValue] = useState<readonly ActorRequirement[]>(props.initial ?? []);
  return (
    <Document>
      <AppointmentActorSelect group={props.group} value={value} error={props.error} onChange={setValue} />
    </Document>
  );
}

/**
 * A required role with nothing chosen yet.
 *
 * Opening the list and typing searches what an actor *is* as well as what it is
 * called, so "anaes" finds Dr. Kim by specialty rather than by name.
 * @returns The story.
 */
export const Required = (): JSX.Element => <Field group={PROVIDERS} />;

/**
 * Two providers already chosen. Both attend — `$find` intersects their
 * schedules, so this asks for the times they are *both* free.
 * @returns The story.
 */
export const SeveralChosen = (): JSX.Element => (
  <Field group={PROVIDERS} initial={toActorRequirements([DrChenSchedule.id, DrKimSchedule.id])} />
);

/**
 * An optional role, which reads "Any room" until something is chosen.
 * @returns The story.
 */
export const Optional = (): JSX.Element => <Field group={ROOMS} />;

/**
 * A required role with nothing chosen, as the form reports it on submit.
 * @returns The story.
 */
export const WithError = (): JSX.Element => <Field group={PROVIDERS} error="Choose at least one provider" />;
