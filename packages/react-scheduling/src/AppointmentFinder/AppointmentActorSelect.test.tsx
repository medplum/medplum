// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Coding } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useState } from 'react';
import { DrOkaforSchedule, DrRiveraSchedule, ExamRoomASchedule } from '../stories/scheduling';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { AppointmentActorSelect } from './AppointmentActorSelect';
import type { ActorRequirement, ScheduleCandidate, ScheduleCandidateGroup } from './AppointmentFinder.schedules';
import { toActorRequirements } from './AppointmentFinder.schedules';

const SURGERY: Coding = { system: 'http://snomed.info/sct', code: '394609007', display: 'Surgery' };
const ANAESTHETICS: Coding = { system: 'http://snomed.info/sct', code: '394577000', display: 'Anaesthetics' };
const DOCTOR: Coding = { system: 'http://example.org/roles', code: 'doctor', display: 'Doctor' };

function candidate(schedule: typeof DrRiveraSchedule, display: string, qualifiers: Coding[] = []): ScheduleCandidate {
  return {
    schedule,
    actor: schedule.actor[0],
    actorType: 'PractitionerRole',
    role: 'provider',
    actorDisplay: display,
    qualifiers,
    actorResource: undefined,
  };
}

const RIVERA = candidate(DrRiveraSchedule, 'Dr. Maya Rivera', [DOCTOR, SURGERY]);
const OKAFOR = candidate(DrOkaforSchedule, 'Dr. Tunde Okafor', [DOCTOR, ANAESTHETICS]);

const PROVIDERS: ScheduleCandidateGroup = {
  role: 'provider',
  label: 'Provider',
  required: true,
  candidates: [RIVERA, OKAFOR],
};

const ROOMS: ScheduleCandidateGroup = {
  role: 'room',
  label: 'Room',
  required: false,
  candidates: [{ ...candidate(ExamRoomASchedule, 'Exam Room A'), actorType: 'Location', role: 'room' }],
};

function Harness(props: {
  group?: ScheduleCandidateGroup;
  initial?: readonly ActorRequirement[];
  disabled?: boolean;
  onChange?: (value: ActorRequirement[]) => void;
}): JSX.Element {
  const [value, setValue] = useState<readonly ActorRequirement[]>(props.initial ?? []);
  return (
    <AppointmentActorSelect
      group={props.group ?? PROVIDERS}
      value={value}
      disabled={props.disabled}
      onChange={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
    />
  );
}

function setup(props: Parameters<typeof Harness>[0] = {}): void {
  render(<Harness {...props} />);
}

function openList(label = 'provider'): void {
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: `Add ${label}` }));
  });
}

describe('AppointmentActorSelect', () => {
  test('Shows the value the caller passes, following it when the caller changes or empties it', () => {
    const onChange = vi.fn();
    // Rendered without the harness, so `value` only ever changes from outside.
    // An uncontrolled field seeded once — `defaultValue`, which is what
    // AsyncAutocomplete does — would pass the first assertion and fail the rest.
    const field = (value: readonly ActorRequirement[]): JSX.Element => (
      <AppointmentActorSelect group={PROVIDERS} value={value} onChange={onChange} />
    );
    const { rerender } = render(field([]));

    expect(screen.queryByText('Dr. Maya Rivera')).not.toBeInTheDocument();

    // Deep-linking and reschedule both fill in an already-mounted field.
    rerender(field(toActorRequirements(['schedule-dr-rivera'])));
    expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument();

    rerender(field(toActorRequirements(['schedule-dr-okafor'])));
    expect(screen.getByText('Dr. Tunde Okafor')).toBeInTheDocument();
    expect(screen.queryByText('Dr. Maya Rivera')).not.toBeInTheDocument();

    // Changing the service or the site has to be able to clear actors it no
    // longer offers.
    rerender(field([]));
    expect(screen.queryByText('Dr. Tunde Okafor')).not.toBeInTheDocument();

    // Adopting a value is not an edit: only the field's own controls call back.
    expect(onChange).not.toHaveBeenCalled();
  });

  test('Names each actor, both chosen and on offer', async () => {
    setup({ initial: toActorRequirements(['schedule-dr-rivera']) });

    expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument();

    openList();

    expect(await screen.findByText('Dr. Tunde Okafor')).toBeInTheDocument();
    // The name is the whole of what an actor is read by. What they do narrows
    // the list when it is typed, but is not written out beside them.
    expect(screen.queryByText('Anaesthetics')).not.toBeInTheDocument();
  });

  test('Adds an actor as a requirement of its own, keeping the ones already chosen', async () => {
    const onChange = vi.fn();
    setup({ initial: toActorRequirements(['schedule-dr-rivera']), onChange });

    openList();
    const okafor = await screen.findByText('Dr. Tunde Okafor');
    await act(async () => {
      fireEvent.click(okafor);
    });

    // Two requirements, not one requirement of two: both are held, because
    // $find intersects their schedules.
    expect(onChange).toHaveBeenCalledWith([
      { scheduleIds: ['schedule-dr-rivera'] },
      { scheduleIds: ['schedule-dr-okafor'] },
    ]);
    expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument();
    expect(screen.getByText('Dr. Tunde Okafor')).toBeInTheDocument();
  });

  test('Drops an actor', async () => {
    const onChange = vi.fn();
    setup({ initial: toActorRequirements(['schedule-dr-rivera', 'schedule-dr-okafor']), onChange });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Dr. Maya Rivera' }));
    });

    expect(onChange).toHaveBeenCalledWith([{ scheduleIds: ['schedule-dr-okafor'] }]);
    expect(screen.queryByText('Dr. Maya Rivera')).not.toBeInTheDocument();
  });

  test('Searches by what an actor does as well as by name', async () => {
    setup();

    openList();
    expect(await screen.findByText('Dr. Maya Rivera')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Search providers'), { target: { value: 'anaesthetics' } });
    });

    expect(screen.getByText('Dr. Tunde Okafor')).toBeInTheDocument();
    expect(screen.queryByText('Dr. Maya Rivera')).not.toBeInTheDocument();
  });

  test('Says when there is nobody left to add', () => {
    setup({ initial: toActorRequirements(['schedule-dr-rivera', 'schedule-dr-okafor']) });

    openList();

    expect(screen.getByText('No provider left to add')).toBeInTheDocument();
  });

  test('Says an optional role may be left alone', () => {
    setup({ group: ROOMS });

    expect(screen.getByText('Optional. Leave empty to search without a room.')).toBeInTheDocument();
    expect(screen.getByText('No room held')).toBeInTheDocument();
  });

  test('Takes nothing while disabled', () => {
    setup({ initial: toActorRequirements(['schedule-dr-rivera']), disabled: true });

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add provider' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Remove Dr. Maya Rivera' }).disabled).toBe(true);
  });
});
