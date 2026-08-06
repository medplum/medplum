// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Coding } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import {
  DrOkaforSchedule,
  DrRiveraSchedule,
  MainClinic,
  SchedulingFixtures,
  Ultrasound1Schedule,
  UltrasoundImagingService,
} from '../stories/scheduling';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';
import type { AppointmentSearchCriteria } from './AppointmentCriteriaForm';
import { AppointmentCriteriaForm, getCriteriaError, getRangeError } from './AppointmentCriteriaForm';
import type { ScheduleCandidate, ScheduleCandidateGroup } from './AppointmentFinder.utils';
import { filterCandidatesByClinic, groupCandidatesByRole, searchEligibleSchedules } from './AppointmentFinder.utils';

function candidate(
  schedule: typeof DrRiveraSchedule,
  display: string,
  actorType: 'Practitioner' | 'Device',
  qualifiers: Coding[] = []
): ScheduleCandidate {
  return {
    schedule,
    actor: schedule.actor[0],
    actorType,
    role: actorType === 'Device' ? 'device' : 'provider',
    actorDisplay: display,
    qualifiers,
    actorResource: undefined,
  };
}

function specialty(code: string, display: string): Coding {
  return { system: 'http://snomed.info/sct', code, display };
}

const PROVIDER_GROUP: ScheduleCandidateGroup = {
  role: 'provider',
  label: 'Provider',
  required: true,
  candidates: [
    candidate(DrRiveraSchedule, 'Dr. Maya Rivera', 'Practitioner'),
    candidate(DrOkaforSchedule, 'Dr. Tunde Okafor', 'Practitioner'),
  ],
};

const DEVICE_GROUP: ScheduleCandidateGroup = {
  role: 'device',
  label: 'Device',
  required: false,
  candidates: [candidate(Ultrasound1Schedule, 'Ultrasound 1 (Main Campus)', 'Device')],
};

const SURGERY = specialty('394609007', 'Surgery');
const ANAESTHETICS = specialty('394577000', 'Anaesthetics');

/** A service whose providers say which specialty they practise. */
const SURGICAL_GROUP: ScheduleCandidateGroup = {
  role: 'provider',
  label: 'Provider',
  required: true,
  candidates: [
    candidate(DrRiveraSchedule, 'Dr. Maya Rivera', 'Practitioner', [SURGERY]),
    candidate(DrOkaforSchedule, 'Dr. Tunde Okafor', 'Practitioner', [ANAESTHETICS]),
  ],
};

const BASE: AppointmentSearchCriteria = {
  actorSelections: { provider: ['schedule-dr-rivera'] },
  start: new Date(2026, 6, 27),
  end: new Date(2026, 7, 3),
  month: new Date(2026, 6, 1),
  timeOfDay: 'any',
};

function Harness(props: {
  groups: readonly ScheduleCandidateGroup[];
  initial?: AppointmentSearchCriteria;
  availableDates?: readonly Date[];
  availabilityCheckedThrough?: Date;
  onChange?: (value: AppointmentSearchCriteria) => void;
}): JSX.Element {
  const [value, setValue] = useState(props.initial ?? BASE);
  return (
    <AppointmentCriteriaForm
      groups={props.groups}
      value={value}
      availableDates={props.availableDates}
      availabilityCheckedThrough={props.availabilityCheckedThrough}
      onChange={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
    />
  );
}

function setup(props: Parameters<typeof Harness>[0]): void {
  render(<Harness {...props} />);
}

/**
 * Returns the field asking about one role.
 * @param role - The role the field asks about.
 * @returns The field's element.
 */
function field(role: string): HTMLElement {
  return screen.getByTestId(`actor-select-${role}`);
}

/**
 * Opens a role's list of actors.
 * @param label - The role's label.
 */
function openList(label: string): void {
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: `Add ${label.toLowerCase()}` }));
  });
}

/**
 * Adds an actor to a role.
 * @param label - The role's label.
 * @param option - The actor's name.
 */
async function choose(label: string, option: string): Promise<void> {
  openList(label);
  const item = await screen.findByText(option);
  await act(async () => {
    fireEvent.click(item);
  });
}

/**
 * Clicks a day of the month the calendar is showing.
 * @param day - The day of the month.
 */
async function clickDay(day: number): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: String(day) }));
  });
}

describe('AppointmentCriteriaForm', () => {
  test('Asks one question per role the service is booked against', () => {
    setup({ groups: [PROVIDER_GROUP, DEVICE_GROUP] });

    expect(field('provider')).toBeInTheDocument();
    expect(field('device')).toBeInTheDocument();
    expect(screen.queryByTestId('actor-select-room')).not.toBeInTheDocument();
  });

  test('Asks nothing extra when a service is booked against one role', () => {
    setup({ groups: [PROVIDER_GROUP] });

    expect(field('provider')).toBeInTheDocument();
    expect(screen.queryByTestId('actor-select-device')).not.toBeInTheDocument();
  });

  test('Says so when the service has no schedules at all', () => {
    setup({ groups: [] });
    expect(screen.getByText('No schedules are configured for this service.')).toBeInTheDocument();
  });

  test('Says which roles may be left empty', () => {
    setup({ groups: [PROVIDER_GROUP, DEVICE_GROUP] });

    expect(screen.getByText('Optional. Leave empty to search without a device.')).toBeInTheDocument();
    expect(screen.getByText('Any device')).toBeInTheDocument();
    expect(screen.queryByText(/Leave empty to search without a provider/)).not.toBeInTheDocument();
  });

  test('Choosing several actors for a role records all of them', async () => {
    const onChange = vi.fn();
    setup({ groups: [PROVIDER_GROUP], onChange });

    await choose('Provider', 'Dr. Tunde Okafor');

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ actorSelections: { provider: ['schedule-dr-rivera', 'schedule-dr-okafor'] } })
    );
  });

  test('Choosing an optional actor records it', async () => {
    const onChange = vi.fn();
    setup({ groups: [PROVIDER_GROUP, DEVICE_GROUP], onChange });

    await choose('Device', 'Ultrasound 1 (Main Campus)');

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        actorSelections: { provider: ['schedule-dr-rivera'], device: ['schedule-ultrasound-1'] },
      })
    );
  });

  test('Dropping an actor is reported', async () => {
    const onChange = vi.fn();
    setup({ groups: [PROVIDER_GROUP], onChange });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Dr. Maya Rivera' }));
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ actorSelections: { provider: [] } }));
  });

  test('Insists on a provider', () => {
    setup({ groups: [PROVIDER_GROUP, DEVICE_GROUP], initial: { ...BASE, actorSelections: {} } });

    expect(screen.getByText('Choose at least one provider')).toBeInTheDocument();
    expect(screen.queryByText('Choose at least one device')).not.toBeInTheDocument();
  });

  test('Searches the list by what an actor does, not only by name', async () => {
    setup({ groups: [SURGICAL_GROUP], initial: { ...BASE, actorSelections: {} } });

    openList('Provider');
    expect(await screen.findByText('Dr. Maya Rivera')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Search providers'), { target: { value: 'anaes' } });
    });

    expect(screen.getByText('Dr. Tunde Okafor')).toBeInTheDocument();
    expect(screen.queryByText('Dr. Maya Rivera')).not.toBeInTheDocument();
  });

  test('Does not offer an actor already chosen', () => {
    setup({ groups: [PROVIDER_GROUP] });

    openList('Provider');

    // Their name is in the field once: as a chosen actor, not as an option.
    expect(screen.getAllByText('Dr. Maya Rivera')).toHaveLength(1);
    expect(screen.getByText('Dr. Tunde Okafor')).toBeInTheDocument();
  });

  test('Says when there is nobody left to add', async () => {
    setup({
      groups: [PROVIDER_GROUP],
      initial: { ...BASE, actorSelections: { provider: ['schedule-dr-rivera', 'schedule-dr-okafor'] } },
    });

    openList('Provider');

    expect(await screen.findByText('No provider left to add')).toBeInTheDocument();
  });

  test('Changing the time of day is reported', async () => {
    const onChange = vi.fn();
    setup({ groups: [PROVIDER_GROUP], onChange });

    await act(async () => {
      fireEvent.click(screen.getByText('Morning'));
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ timeOfDay: 'morning' }));
  });

  test('Leaves a range longer than one request may cover alone', () => {
    // It is searched a page at a time rather than refused.
    setup({
      groups: [PROVIDER_GROUP],
      initial: { ...BASE, start: new Date(2026, 6, 1), end: new Date(2026, 11, 1) },
    });

    expect(screen.queryByText(/must be after/)).not.toBeInTheDocument();
  });

  test('Searches from as soon as possible until a day is picked', () => {
    setup({ groups: [PROVIDER_GROUP], initial: { ...BASE, start: undefined, end: undefined } });

    // No day is chosen, so there is neither a day to read back nor anything to
    // clear.
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '27' })).not.toHaveAttribute('aria-pressed', 'true');
  });

  test('Picking a day searches that day', async () => {
    const onChange = vi.fn();
    setup({ groups: [PROVIDER_GROUP], onChange });

    await clickDay(30);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ start: new Date(2026, 6, 30), end: new Date(2026, 6, 30) })
    );
    expect(screen.getByText('Thursday, July 30')).toBeInTheDocument();
  });

  test('Picking a second day moves to it rather than building a range', async () => {
    const onChange = vi.fn();
    setup({ groups: [PROVIDER_GROUP], initial: { ...BASE, end: BASE.start }, onChange });

    await clickDay(30);

    // Every click means "this day". Extending the day already picked would make
    // one gesture mean two things depending on what came before it.
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ start: new Date(2026, 6, 30), end: new Date(2026, 6, 30) })
    );
    expect(screen.getByText('Thursday, July 30')).toBeInTheDocument();
  });

  test('Dragging across the calendar searches every day dragged over', async () => {
    const onChange = vi.fn();
    setup({ groups: [PROVIDER_GROUP], initial: { ...BASE, start: undefined, end: undefined }, onChange });

    // Faster than naming both ends, and the one gesture that says "anywhere in
    // this week" without first asking for a single day.
    await act(async () => {
      fireEvent.pointerDown(screen.getByRole('button', { name: '27' }));
    });
    await act(async () => {
      fireEvent.pointerOver(screen.getByRole('button', { name: '29' }));
    });
    await act(async () => {
      fireEvent.pointerUp(window);
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ start: new Date(2026, 6, 27), end: new Date(2026, 6, 29) })
    );
    expect(screen.getByText('Monday, July 27 – Wednesday, July 29')).toBeInTheDocument();
  });

  test('Offers dragging as the way to ask for a range', () => {
    setup({ groups: [PROVIDER_GROUP], initial: { ...BASE, start: undefined, end: undefined } });

    // Gestures nobody would guess at, so the calendar says they are there.
    expect(
      screen.getByText('Drag across the calendar, or shift-click a second day, to search a range.')
    ).toBeInTheDocument();
  });

  test('Shift-clicking a second day searches the range between them', async () => {
    const onChange = vi.fn();
    setup({ groups: [PROVIDER_GROUP], initial: { ...BASE, end: BASE.start }, onChange });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '30' }), { shiftKey: true });
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ start: new Date(2026, 6, 27), end: new Date(2026, 6, 30) })
    );
    expect(screen.getByText('Monday, July 27 – Thursday, July 30')).toBeInTheDocument();
  });

  test('Picking the day already picked leaves it picked', async () => {
    const onChange = vi.fn();
    setup({ groups: [PROVIDER_GROUP], initial: { ...BASE, end: BASE.start }, onChange });

    await clickDay(27);

    // Reopening the search is what Clear is for, so a second click on the same day
    // is not a way out of it.
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ start: new Date(2026, 6, 27), end: new Date(2026, 6, 27) })
    );
    expect(screen.getByText('Monday, July 27')).toBeInTheDocument();
  });

  test('Clearing the dates is reported, so the search opens back up', async () => {
    const onChange = vi.fn();
    setup({ groups: [PROVIDER_GROUP], onChange });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ start: undefined, end: undefined }));
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });

  test('Reports an inverted date range', () => {
    setup({
      groups: [PROVIDER_GROUP],
      initial: { ...BASE, start: new Date(2026, 6, 27), end: new Date(2026, 6, 20) },
    });

    expect(screen.getByText('The end date must be after the start date')).toBeInTheDocument();
  });

  test('Marks the days with times on them, whichever day is being read', () => {
    setup({
      groups: [PROVIDER_GROUP],
      initial: { ...BASE, start: new Date(2026, 6, 27), end: new Date(2026, 6, 27) },
      availableDates: [new Date(2026, 6, 27), new Date(2026, 6, 30)],
    });

    // Which days are worth clicking does not depend on which one is open, so a
    // day picked out of the month does not empty the rest of it.
    expect(screen.getByRole('button', { name: '27' }).className).toContain('available');
    expect(screen.getByRole('button', { name: '30' }).className).toContain('available');
    expect(screen.getByRole('button', { name: '29' }).className).not.toContain('available');
    expect(screen.getByRole('button', { name: '27' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('Chooses no day of its own before one is asked for', () => {
    setup({
      groups: [PROVIDER_GROUP],
      initial: { ...BASE, start: undefined, end: undefined },
      availableDates: [new Date(2026, 6, 27), new Date(2026, 6, 30)],
    });

    // Both days have times and neither has been chosen. Marking the soonest of
    // them would read as a decision the user did not make.
    expect(screen.getByRole('button', { name: '27' })).not.toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '30' })).not.toHaveAttribute('aria-pressed', 'true');
  });

  test('Bands a chosen range across the days it covers', () => {
    setup({
      groups: [PROVIDER_GROUP],
      initial: { ...BASE, start: new Date(2026, 6, 27), end: new Date(2026, 6, 29) },
    });

    const middle = screen.getByRole('button', { name: '28' }).closest('td');
    expect(middle?.className).toContain('inRange');
    expect(screen.getByRole('button', { name: '30' }).closest('td')?.className).not.toContain('inRange');
    // Both ends of a range are chosen days, so neither is the one chosen day.
    expect(screen.getByRole('button', { name: '27' }).className).toContain('selected');
    expect(screen.getByRole('button', { name: '29' }).className).toContain('selected');
  });

  test('Says where the marks stop when the month was too busy to check', () => {
    setup({
      groups: [PROVIDER_GROUP],
      initial: { ...BASE, start: undefined, end: undefined },
      availabilityCheckedThrough: new Date(2026, 6, 19, 17, 0),
    });

    // Days nobody looked at would otherwise be drawn exactly like days with
    // nothing on them.
    expect(screen.getByText(/Days marked as far as Sunday, July 19/)).toBeInTheDocument();
  });

  test('Says nothing about the marks when the whole month was checked', () => {
    setup({
      groups: [PROVIDER_GROUP],
      initial: { ...BASE, start: undefined, end: undefined },
      availabilityCheckedThrough: new Date(2026, 6, 31, 23, 59, 59, 999),
    });

    expect(screen.queryByText(/Days marked as far as/)).not.toBeInTheDocument();
  });

  test('Reports the month the user pages to, since the marks follow it', async () => {
    const onChange = vi.fn();
    setup({ groups: [PROVIDER_GROUP], onChange });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Next month'));
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ month: new Date(2026, 7, 1) }));
  });

  test('Paging to another month picks nothing in it', async () => {
    const onChange = vi.fn();
    setup({ groups: [PROVIDER_GROUP], initial: { ...BASE, end: BASE.start }, onChange });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Next month'));
    });

    // Looking at August is not choosing a day in August: the day already asked
    // for stands until another one is picked.
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ month: new Date(2026, 7, 1), start: new Date(2026, 6, 27) })
    );
    expect(screen.getByText('Monday, July 27')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '27' })).not.toHaveAttribute('aria-pressed', 'true');
  });

  test('Reflects the actual eligible schedules for a service', async () => {
    const medplum = new MockClient();
    for (const resource of SchedulingFixtures) {
      await medplum.createResource(resource);
    }
    const candidates = await searchEligibleSchedules(medplum, UltrasoundImagingService);
    const atClinic = await filterCandidatesByClinic(medplum, candidates, MainClinic);

    const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
      <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
    );
    render(<Harness groups={groupCandidatesByRole(atClinic)} />, wrapper);

    await waitFor(() => expect(field('provider')).toBeInTheDocument());
    expect(field('room')).toBeInTheDocument();
    expect(field('device')).toBeInTheDocument();

    // The rooms on offer are the ones at this clinic.
    openList('Room');
    expect(await screen.findByText('Exam Room A')).toBeInTheDocument();
    expect(screen.getByText('Exam Room B')).toBeInTheDocument();
    expect(screen.queryByText('Satellite Exam Room')).not.toBeInTheDocument();
  });
});

describe('getCriteriaError', () => {
  test('Accepts criteria a search can run from', () => {
    expect(getCriteriaError([PROVIDER_GROUP, DEVICE_GROUP], BASE)).toBeUndefined();
  });

  test('Reports the missing selection before the dates', () => {
    const criteria = { ...BASE, actorSelections: {}, end: new Date(2026, 6, 20) };
    expect(getCriteriaError([PROVIDER_GROUP], criteria)).toBe('Choose at least one provider');
  });

  test('Reports a date range that runs backwards', () => {
    expect(getCriteriaError([PROVIDER_GROUP], { ...BASE, end: new Date(2026, 6, 20) })).toBe(
      'The end date must be after the start date'
    );
  });

  test('Accepts criteria with no dates at all', () => {
    expect(getCriteriaError([PROVIDER_GROUP], { ...BASE, start: undefined, end: undefined })).toBeUndefined();
  });

  test('Accepts however many actors are chosen, because they are one request', () => {
    const criteria = { ...BASE, actorSelections: { provider: ['schedule-dr-rivera', 'schedule-dr-okafor'] } };
    expect(getCriteriaError([PROVIDER_GROUP], criteria)).toBeUndefined();
  });
});

describe('getRangeError', () => {
  test('Accepts a range that runs forwards, however long', () => {
    expect(getRangeError(new Date(2026, 6, 27), new Date(2026, 7, 3))).toBeUndefined();
    expect(getRangeError(new Date(2026, 6, 27), new Date(2027, 6, 27))).toBeUndefined();
  });

  test('Accepts a range that is only half given, or not given at all', () => {
    expect(getRangeError(new Date(2026, 6, 27), undefined)).toBeUndefined();
    expect(getRangeError(undefined, new Date(2026, 6, 27))).toBeUndefined();
    expect(getRangeError(undefined, undefined)).toBeUndefined();
  });
});
