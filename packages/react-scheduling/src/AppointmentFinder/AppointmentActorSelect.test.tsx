// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Schedule } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useState } from 'react';
import { DrOkaforSchedule, DrRiveraSchedule, ExamRoomASchedule } from '../stories/scheduling';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { AppointmentActorSelect } from './AppointmentActorSelect';
import type { ActorRequirement, ScheduleCandidate, ScheduleCandidateGroup } from './AppointmentFinder.schedules';
import { toActorRequirements } from './AppointmentFinder.schedules';

// The name goes on the Schedule's own actor, which is where the field reads it
// from now that a candidate holds nothing but what a search fetched.
function candidate(schedule: WithId<Schedule>, display: string): ScheduleCandidate {
  return { schedule: { ...schedule, actor: [{ ...schedule.actor[0], display }] }, actorResource: undefined };
}

const RIVERA = candidate(DrRiveraSchedule, 'Dr. Maya Rivera');
const OKAFOR = candidate(DrOkaforSchedule, 'Dr. Tunde Okafor');

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
  candidates: [candidate(ExamRoomASchedule, 'Exam Room A')],
};

function Harness(props: {
  group?: ScheduleCandidateGroup;
  initial?: readonly ActorRequirement[];
  disabled?: boolean;
  error?: string;
  onChange?: (value: ActorRequirement[]) => void;
}): JSX.Element {
  const [value, setValue] = useState<readonly ActorRequirement[]>(props.initial ?? []);
  return (
    <AppointmentActorSelect
      group={props.group ?? PROVIDERS}
      value={value}
      disabled={props.disabled}
      error={props.error}
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

// Opens the list on one row, which is named after the role it fills.
function openList(row = 'Provider'): void {
  act(() => {
    fireEvent.click(screen.getByRole('textbox', { name: row }));
  });
}

// Picks a name from an open list. Options are queried by role, so a chosen
// name's own pill is not one of them.
async function pick(name: string): Promise<void> {
  const option = await screen.findByRole('option', { name });
  await act(async () => {
    fireEvent.click(option);
  });
}

// Closes the list, leaving only what was chosen in the document.
function closeList(): void {
  act(() => {
    fireEvent.blur(screen.getByRole('textbox', { name: 'Provider' }));
  });
}

// Narrows an open list by typing into the row it belongs to.
async function search(text: string): Promise<void> {
  await act(async () => {
    fireEvent.change(screen.getByRole('textbox', { name: 'Provider' }), { target: { value: text } });
  });
}

function addRow(): void {
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'Add provider' }));
  });
}

function expectCannotAdd(): void {
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add provider' }).disabled).toBe(true);
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

  test('Offers one empty row before anything is chosen, named after the role', () => {
    setup();

    expect(screen.getByRole('textbox', { name: 'Provider' })).toBeInTheDocument();
    // Numbering is what the second row introduces, so a field of one row does
    // not read as the first of several.
    expect(screen.queryByRole('textbox', { name: 'Provider 1' })).not.toBeInTheDocument();
    // Nor is there a row to remove while the field is a single row.
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
  });

  test('Names each actor, both chosen and on offer', async () => {
    setup({ initial: toActorRequirements(['schedule-dr-rivera']) });

    expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument();

    openList();

    expect(await screen.findByRole('option', { name: 'Dr. Tunde Okafor' })).toBeInTheDocument();
  });

  test('Joins a second actor as a row of its own, numbering both and writing AND between them', async () => {
    const onChange = vi.fn();
    setup({ initial: toActorRequirements(['schedule-dr-rivera']), onChange });

    addRow();

    // The row is added empty and joined to the one above it by a word of its
    // own. Both rows are numbered, but only as an accessible name: the field is
    // titled once, and nothing draws `Provider 2`.
    expect(screen.getByRole('textbox', { name: 'Provider 1' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Provider 2' })).toBeInTheDocument();
    expect(screen.getByText('AND')).toBeInTheDocument();
    expect(screen.queryByText('Provider 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Provider 2')).not.toBeInTheDocument();

    openList('Provider 2');
    await pick('Dr. Tunde Okafor');

    // Two requirements, not one requirement of two: both are held, because
    // $find intersects their schedules.
    expect(onChange).toHaveBeenLastCalledWith([
      { scheduleIds: ['schedule-dr-rivera'] },
      { scheduleIds: ['schedule-dr-okafor'] },
    ]);
  });

  test('Will not stack empty rows', () => {
    setup();

    // Which requirement an empty row stood for would be anyone's guess, so the
    // row that exists has to be filled before it can be joined to another.
    expectCannotAdd();
  });

  test('Will not offer a row with nobody left to fill it', () => {
    setup({ initial: toActorRequirements(['schedule-dr-rivera', 'schedule-dr-okafor']) });

    // Both providers are asked for already, and an actor is only asked for once.
    expectCannotAdd();
  });

  test('Drops a row, and stops numbering when one is left', async () => {
    const onChange = vi.fn();
    setup({ initial: toActorRequirements(['schedule-dr-rivera', 'schedule-dr-okafor']), onChange });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Dr. Maya Rivera' }));
    });

    expect(onChange).toHaveBeenCalledWith([{ scheduleIds: ['schedule-dr-okafor'] }]);
    expect(screen.queryByText('Dr. Maya Rivera')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Provider' })).toBeInTheDocument();
  });

  test('Leaves an actor off the other rows once it is asked for', async () => {
    setup({ initial: toActorRequirements(['schedule-dr-rivera']) });

    addRow();
    openList('Provider 2');

    // Holding one schedule twice would ask for the times it is free from itself.
    expect(await screen.findByRole('option', { name: 'Dr. Tunde Okafor' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Dr. Maya Rivera' })).not.toBeInTheDocument();
  });

  test('Takes one actor per row, a later pick replacing the one before it', async () => {
    const onChange = vi.fn();
    setup({ onChange });

    openList();
    await pick('Dr. Maya Rivera');
    expect(onChange).toHaveBeenLastCalledWith([{ scheduleIds: ['schedule-dr-rivera'] }]);

    openList();
    await pick('Dr. Tunde Okafor');

    // A row is one actor, so the second pick stands in for the first rather
    // than joining it.
    expect(onChange).toHaveBeenLastCalledWith([{ scheduleIds: ['schedule-dr-okafor'] }]);
    closeList();
    expect(screen.getByText('Dr. Tunde Okafor')).toBeInTheDocument();
    expect(screen.queryByText('Dr. Maya Rivera')).not.toBeInTheDocument();
  });

  test('Narrows a row by name as it is typed into', async () => {
    setup();

    openList();
    expect(await screen.findByRole('option', { name: 'Dr. Maya Rivera' })).toBeInTheDocument();

    await search('okafor');

    expect(screen.getByRole('option', { name: 'Dr. Tunde Okafor' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Dr. Maya Rivera' })).not.toBeInTheDocument();
  });

  test('Says when a search matches nobody', async () => {
    setup();

    openList();
    await search('radiology');

    expect(screen.getByText('No providers found')).toBeInTheDocument();
  });

  test('Marks the rows an error is about, saying it only once', () => {
    setup({ initial: toActorRequirements(['schedule-dr-rivera']), error: 'Choose at least one provider' });

    // A message under a field that looks untouched is easy to miss, and leaves a
    // screen reader with nothing to go on: the row has to report itself invalid.
    expect(screen.getByRole('textbox', { name: 'Provider' })).toHaveAttribute('aria-invalid', 'true');
    // The wrapper prints it. A row printing its own copy would say it twice.
    expect(screen.getAllByText('Choose at least one provider')).toHaveLength(1);
  });

  test('Marks a role that has to be filled', () => {
    setup();

    // The asterisk is the only thing a required role adds, so the row that
    // stands for the obligation has to carry it for a screen reader too.
    expect(screen.getByText('*')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Provider' })).toHaveAttribute('aria-required', 'true');
  });

  test('Says when a role may be left alone', () => {
    setup({ group: ROOMS });

    expect(screen.getByText('Optional. Leave empty to search without a room.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Room' })).not.toHaveAttribute('aria-required');
  });

  test('Takes nothing while disabled', () => {
    setup({ initial: toActorRequirements(['schedule-dr-rivera', 'schedule-dr-okafor']), disabled: true });

    expectCannotAdd();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Remove Dr. Maya Rivera' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Provider 1' }).disabled).toBe(true);
  });
});
