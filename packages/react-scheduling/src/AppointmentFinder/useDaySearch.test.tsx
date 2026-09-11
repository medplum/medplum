// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ReadablePromise } from '@medplum/core';
import type { Appointment, Bundle } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { UltrasoundImagingService, buildFindBundle, buildProposedAppointment } from '../stories/scheduling';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';
import type { ActorCombination } from './AppointmentFinder.schedules';
import { getActorsKey } from './AppointmentFinder.times';
import { useDaySearch } from './useDaySearch';

const medplum = new MockClient();

// A day the search opens on, fixed so "how many days" never depends on the clock.
const DAY = new Date('2026-08-10T12:00:00Z');

/**
 * A combination over one made-up provider, enough to be one `$find` request.
 * @param index - Tells one from another.
 * @returns The combination.
 */
function combinationOf(index: number): ActorCombination {
  const actors = [{ reference: `Practitioner/p-${index}` }];
  return {
    key: getActorsKey(actors),
    label: `Provider ${index}`,
    actors,
    schedules: [{ reference: `Schedule/p-${index}` }],
  };
}

const medplumWrapper = ({ children }: { children: ReactNode }): JSX.Element => (
  <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
);

function Harness(props: { readonly combinations: readonly ActorCombination[] }): JSX.Element {
  const search = useDaySearch({
    service: UltrasoundImagingService,
    combinations: props.combinations,
    timezone: 'UTC',
    defaultStart: DAY,
  });
  return (
    <div>
      <div data-testid="loading">{search.loadingFirstDays || search.loadingMoreDays ? 'loading' : 'idle'}</div>
      <div data-testid="searched">{search.searchedCombinationCount}</div>
      <div data-testid="total">{search.totalCombinationCount}</div>
      <div data-testid="more">{search.hasMoreCombinations ? 'yes' : 'no'}</div>
      <button type="button" onClick={search.searchMoreCombinations}>
        Search more options
      </button>
      <button type="button" onClick={search.showMoreDays}>
        Show more days
      </button>
    </div>
  );
}

/**
 * Answers every `$find` with one time, so nothing depends on the fixtures.
 * @returns The spy standing in for `$find`.
 */
function respond(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(medplum, 'get').mockImplementation((url) => {
    const [schedule] = new URL(url.toString()).searchParams.getAll('schedule');
    const bundle: Bundle<Appointment> = buildFindBundle([
      buildProposedAppointment({
        start: '2026-08-10T15:00:00.000Z',
        scheduleReferences: [schedule],
        actorReferences: [schedule.replace('Schedule/', 'Practitioner/')],
      }),
    ]);
    return new ReadablePromise(Promise.resolve(bundle as never));
  });
}

async function settle(): Promise<void> {
  await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('idle'));
}

async function click(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
  await settle();
}

/**
 * The schedules each `$find` was asked about, in the order they were asked.
 * @param get - The spy standing in for `$find`.
 * @returns One schedule reference per request.
 */
function schedulesAsked(get: ReturnType<typeof vi.spyOn>): string[] {
  return get.mock.calls.map((call: unknown[]) => new URL(String(call[0])).searchParams.get('schedule') as string);
}

/**
 * The stretch of days each `$find` was asked about, as whole days.
 * @param get - The spy standing in for `$find`.
 * @returns One `start/end` pair per request, to the day.
 */
function daysAsked(get: ReturnType<typeof vi.spyOn>): string[] {
  return get.mock.calls.map((call: unknown[]) => {
    const { searchParams } = new URL(String(call[0]));
    return `${searchParams.get('start')?.slice(0, 10)}/${searchParams.get('end')?.slice(0, 10)}`;
  });
}

describe('useDaySearch combination rounds', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('Asks about every combination at once while they fit in one round', async () => {
    const get = respond();

    render(<Harness combinations={[combinationOf(1), combinationOf(2)]} />, medplumWrapper);
    await settle();

    expect(get).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('searched')).toHaveTextContent('2');
    expect(screen.getByTestId('more')).toHaveTextContent('no');
  });

  test('Holds back the combinations past the first round', async () => {
    const get = respond();
    const combinations = Array.from({ length: 9 }, (_, index) => combinationOf(index));

    render(<Harness combinations={combinations} />, medplumWrapper);
    await settle();

    // One of five providers and one of five rooms is twenty-five requests. A round
    // is asked and the rest are offered, rather than all of them going out at once.
    expect(get).toHaveBeenCalledTimes(6);
    expect(schedulesAsked(get)).toStrictEqual([
      'Schedule/p-0',
      'Schedule/p-1',
      'Schedule/p-2',
      'Schedule/p-3',
      'Schedule/p-4',
      'Schedule/p-5',
    ]);
    expect(screen.getByTestId('searched')).toHaveTextContent('6');
    expect(screen.getByTestId('total')).toHaveTextContent('9');
    expect(screen.getByTestId('more')).toHaveTextContent('yes');
  });

  test('Taking in another round searches the days over, so no day is left behind', async () => {
    const get = respond();
    const combinations = Array.from({ length: 9 }, (_, index) => combinationOf(index));

    render(<Harness combinations={combinations} />, medplumWrapper);
    await settle();
    get.mockClear();

    await click('Search more options');

    // Every combination, not only the three that are new: the days already on show
    // were searched for the first round alone, so they are asked about again.
    expect(schedulesAsked(get)).toHaveLength(9);
    expect(screen.getByTestId('searched')).toHaveTextContent('9');
    expect(screen.getByTestId('more')).toHaveTextContent('no');
  });

  test('Taking in another round keeps the days reached into, and asks about them again', async () => {
    const get = respond();
    const combinations = Array.from({ length: 9 }, (_, index) => combinationOf(index));

    render(<Harness combinations={combinations} />, medplumWrapper);
    await settle();
    // Read the two stretches off the requests rather than naming days: the search opens
    // on today whenever the day it was handed has already gone by.
    const [opened] = daysAsked(get);
    get.mockClear();

    await click('Show more days');
    const [extension] = daysAsked(get);
    get.mockClear();

    await click('Search more options');

    // Widening the actors is not narrowing the days: the stretch paged into stays, and
    // the whole of it goes out as one window. Asked about the newest days alone, the
    // added combinations would never be searched over the earlier ones, which would go
    // on showing the narrower round's times with no sign that they were narrower.
    const asked = daysAsked(get);
    const wholeStretch = `${opened.split('/')[0]}/${extension.split('/')[1]}`;
    expect(asked).toHaveLength(9);
    expect(new Set(asked)).toStrictEqual(new Set([wholeStretch]));
  });

  test('Reaching further into the days keeps the round it is searching', async () => {
    const get = respond();
    const combinations = Array.from({ length: 9 }, (_, index) => combinationOf(index));

    render(<Harness combinations={combinations} />, medplumWrapper);
    await settle();
    get.mockClear();

    await click('Show more days');

    expect(get).toHaveBeenCalledTimes(6);
    expect(screen.getByTestId('searched')).toHaveTextContent('6');
  });
});
