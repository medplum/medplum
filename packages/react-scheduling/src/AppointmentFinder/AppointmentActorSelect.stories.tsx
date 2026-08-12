// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Schedule } from '@medplum/fhirtypes';
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
import { ROLE_LABELS, isSchedulingActorType } from './AppointmentFinder.roles';
import type { ActorRequirement, ScheduleCandidate, ScheduleCandidateGroup } from './AppointmentFinder.schedules';
import { toActorRequirements } from './AppointmentFinder.schedules';

export default {
  title: 'Medplum/AppointmentActorSelect',
  component: AppointmentActorSelect,
} as Meta;

/**
 * Builds a candidate from a fixture Schedule, the way `searchEligibleSchedules`
 * would have.
 *
 * The name is written onto the Schedule's own actor rather than held beside it,
 * so `getCandidateDisplay` reads it back the way it reads a real one.
 *
 * @param schedule - The fixture Schedule the actor is booked through.
 * @param display - The actor's name, as the Schedule records it.
 * @returns The candidate.
 */
function candidate(schedule: WithId<Schedule>, display: string): ScheduleCandidate {
  const actor = schedule.actor[0];
  if (!isSchedulingActorType(actor.reference?.split('/')[0])) {
    throw new Error(`${schedule.id} is not held on a schedulable actor`);
  }
  return { schedule: { ...schedule, actor: [{ ...actor, display }] }, actorResource: undefined };
}

const PROVIDERS: ScheduleCandidateGroup = {
  role: 'provider',
  label: ROLE_LABELS.provider,
  required: true,
  candidates: [
    candidate(DrRiveraSchedule, 'Dr. Maya Rivera'),
    candidate(DrOkaforSchedule, 'Dr. Tunde Okafor'),
    candidate(DrChenSchedule, 'Dr. Wei Chen'),
    candidate(DrKimSchedule, 'Dr. James Kim'),
  ],
};

const ROOMS: ScheduleCandidateGroup = {
  role: 'room',
  label: ROLE_LABELS.room,
  required: false,
  candidates: [candidate(ExamRoomASchedule, 'Exam Room A'), candidate(ExamRoomBSchedule, 'Exam Room B')],
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
 * One empty row on an optional role. Leaving it alone holds no room at all,
 * rather than looking for whichever one is free.
 *
 * The only optional role here; every other story fills a required one.
 * @returns The story.
 */
export const Basic = (): JSX.Element => <Field group={ROOMS} />;

/**
 * Two providers, on a row each. Both attend — `$find` intersects their
 * schedules, so this asks for the times they are *both* free, which is what the
 * `AND` between the rows says.
 * @returns The story.
 */
export const AAndB = (): JSX.Element => (
  <Field group={PROVIDERS} initial={toActorRequirements([DrChenSchedule.id, DrKimSchedule.id])} />
);
AAndB.storyName = 'A and B';

/**
 * A required role with nothing chosen, as the form reports it on submit. The
 * rows the message is about are marked wrong themselves, so the field does not
 * rely on a line of red text under an untouched-looking control.
 * @returns The story.
 */
export const WithError = (): JSX.Element => <Field group={PROVIDERS} error="Choose at least one provider" />;
WithError.storyName = 'With error';
