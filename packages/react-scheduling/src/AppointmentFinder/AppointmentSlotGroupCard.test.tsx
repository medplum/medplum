// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Reference } from '@medplum/fhirtypes';
import { buildProposedAppointment } from '../stories/scheduling';
import { fireEvent, render, screen } from '../test-utils/render';
import type { AppointmentSlotGroup } from './AppointmentFinder.times';
import { groupAppointmentsByDay } from './AppointmentFinder.times';
import { AppointmentSlotGroupCard } from './AppointmentSlotGroupCard';

const EASTERN = 'America/New_York';

/** 9:00 and 9:30 Eastern on the 27th. */
const MORNING = '2026-07-27T13:00:00.000Z';
const LATER = '2026-07-27T13:30:00.000Z';

const RIVERA = 'Practitioner/dr-rivera';
const EXAM_ROOM = 'Location/exam-room-a';

function buildGroup(actors: readonly Reference[]): AppointmentSlotGroup {
  const appointments = [MORNING, LATER].map((start) =>
    buildProposedAppointment({ start, actorReferences: actors as { reference: string }[] })
  );
  return groupAppointmentsByDay(appointments, EASTERN)[0].groups[0];
}

describe('AppointmentSlotGroupCard', () => {
  test('Names each actor by its role and the resource behind it', () => {
    render(
      <AppointmentSlotGroupCard
        group={buildGroup([{ reference: RIVERA }, { reference: EXAM_ROOM }])}
        timezone={EASTERN}
        actorNames={
          new Map([
            [RIVERA, 'Dr. Maya Rivera'],
            [EXAM_ROOM, 'Exam Room A'],
          ])
        }
        onSelectAppointment={vi.fn()}
      />
    );

    expect(screen.getByText('Provider')).toBeInTheDocument();
    expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument();
    expect(screen.getByText('Room')).toBeInTheDocument();
    expect(screen.getByText('Exam Room A')).toBeInTheDocument();
  });

  test('A resolved name beats the one the proposal carries', () => {
    render(
      <AppointmentSlotGroupCard
        group={buildGroup([{ reference: RIVERA, display: 'Maya Rivera' }])}
        timezone={EASTERN}
        actorNames={new Map([[RIVERA, 'Dr. Maya Rivera']])}
        onSelectAppointment={vi.fn()}
      />
    );

    expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument();
    expect(screen.queryByText('Maya Rivera')).not.toBeInTheDocument();
  });

  test('Falls back to the name the proposal carries, then to the bare reference', () => {
    render(
      <AppointmentSlotGroupCard
        group={buildGroup([{ reference: RIVERA, display: 'Dr. Maya Rivera' }, { reference: EXAM_ROOM }])}
        timezone={EASTERN}
        onSelectAppointment={vi.fn()}
      />
    );

    expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument();
    expect(screen.getByText(EXAM_ROOM)).toBeInTheDocument();
  });

  test('Offers each time, and hands back the one that was clicked', () => {
    const onSelectAppointment = vi.fn();
    const group = buildGroup([{ reference: RIVERA }]);

    render(
      <AppointmentSlotGroupCard
        group={group}
        timezone={EASTERN}
        actorNames={new Map([[RIVERA, 'Dr. Maya Rivera']])}
        onSelectAppointment={onSelectAppointment}
      />
    );

    expect(screen.getByText('30 min visit')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '9:30 AM' }));

    expect(onSelectAppointment).toHaveBeenCalledWith(group.appointments[1]);
  });
});
