// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { SchedulingActorResource } from '../actors';
import type { ParticipantActor } from '../stories/scheduling';
import { buildProposedAppointment, DrRiveraPractitioner, ExamRoomA, indexByReference } from '../stories/scheduling';
import { fireEvent, renderWithMedplum, screen } from '../test-utils/render';
import type { AppointmentSlotGroup } from './AppointmentFinder.times';
import { groupAppointmentsByDay } from './AppointmentFinder.times';
import { AppointmentSlotGroupCard } from './AppointmentSlotGroupCard';

const EASTERN = 'America/New_York';

/** 9:00 and 9:30 Eastern on the 27th. */
const MORNING = '2026-07-27T13:00:00.000Z';
const LATER = '2026-07-27T13:30:00.000Z';

const RIVERA = 'Practitioner/dr-rivera';
const EXAM_ROOM = 'Location/exam-room-a';

/**
 * Builds a group of times, as the picker would have grouped them.
 * @param actors - Who the times are held on, as `$find` names them.
 * @param resources - The actors' own resources the caller had already read.
 * @returns The group.
 */
function buildGroup(
  actors: readonly ParticipantActor[],
  resources: readonly SchedulingActorResource[] = []
): AppointmentSlotGroup {
  const appointments = [MORNING, LATER].map((start) => buildProposedAppointment({ start, actorReferences: actors }));
  return groupAppointmentsByDay(appointments, EASTERN, undefined, indexByReference(resources))[0].groups[0];
}

function setup(
  group: AppointmentSlotGroup,
  options: { onSelectAppointment?: () => void; medplum?: MedplumClient; selected?: Appointment } = {}
): ReturnType<typeof renderWithMedplum> {
  const { onSelectAppointment = vi.fn(), medplum = new MockClient(), selected } = options;
  return renderWithMedplum(
    <AppointmentSlotGroupCard
      group={group}
      timezone={EASTERN}
      viewerTimezone={EASTERN}
      onSelectAppointment={onSelectAppointment}
      selected={selected}
    />,
    medplum
  );
}

describe('AppointmentSlotGroupCard', () => {
  test('Names each actor by its role and the resource behind it', () => {
    setup(buildGroup([{ reference: RIVERA }, { reference: EXAM_ROOM }], [DrRiveraPractitioner, ExamRoomA]));

    expect(screen.getByText('Provider')).toBeInTheDocument();
    expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument();
    expect(screen.getByText('Room')).toBeInTheDocument();
    expect(screen.getByText('Exam Room A')).toBeInTheDocument();
  });

  test('The resource beats the name the proposal carries', () => {
    // `$find` copies `Schedule.actor` onto every proposal, display and all, and
    // that copy was written once and never revised.
    setup(buildGroup([{ reference: RIVERA, display: 'Maya Rivera' }], [DrRiveraPractitioner]));

    expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument();
    expect(screen.queryByText('Maya Rivera')).not.toBeInTheDocument();
  });

  test('Reads an actor it was given no resource for', async () => {
    const medplum = new MockClient();
    await medplum.createResource(DrRiveraPractitioner);

    setup(buildGroup([{ reference: RIVERA, display: 'Maya Rivera' }]), { medplum });

    expect(await screen.findByText('Dr. Maya Rivera')).toBeInTheDocument();
  });

  test('Offers each time, and hands back the one that was clicked', () => {
    const onSelectAppointment = vi.fn();
    const group = buildGroup([{ reference: RIVERA }], [DrRiveraPractitioner]);

    setup(group, { onSelectAppointment });

    expect(screen.getByText('30 min visit')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '9:30 AM' }));

    expect(onSelectAppointment).toHaveBeenCalledWith(group.appointments[1]);
  });

  test('Marks the chosen time by its times and actors, not by which object it is', () => {
    const group = buildGroup([{ reference: RIVERA }], [DrRiveraPractitioner]);

    // A refetch offers the time chosen as a new object; it's still the one marked.
    const { unmount } = setup(group, { selected: { ...group.appointments[0] } });
    expect(screen.getByRole('button', { name: '9:00 AM' })).toHaveAttribute('data-variant', 'filled');
    expect(screen.getByRole('button', { name: '9:30 AM' })).toHaveAttribute('data-variant', 'outline');
    unmount();

    // A typed time can start with an offered one and run longer; that's not the time offered.
    setup(group, { selected: { ...group.appointments[0], end: '2026-07-27T14:00:00.000Z' } });
    expect(screen.getByRole('button', { name: '9:00 AM' })).toHaveAttribute('data-variant', 'outline');
  });
});
