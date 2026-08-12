// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ReadablePromise } from '@medplum/core';
import type { Appointment, Bundle } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { UltrasoundImagingService, buildFindBundle, buildProposedAppointment } from '../stories/scheduling';
import { act, render, screen, waitFor } from '../test-utils/render';
import type { ActorCombination } from './AppointmentFinder.schedules';
import type { DateRange } from './AppointmentFinder.times';
import { getActorsKey } from './AppointmentFinder.times';
import { useProposedAppointments } from './useProposedAppointments';

const medplum = new MockClient();

const RANGE: DateRange = { start: new Date('2026-08-10T00:00:00Z'), end: new Date('2026-08-11T00:00:00Z') };

/**
 * Builds a combination the way `getActorCombinations` would have.
 * @param actorReferences - The actors it holds the appointment on.
 * @returns The combination, with one schedule per actor.
 */
function combinationOf(...actorReferences: string[]): ActorCombination {
  const actors = actorReferences.map((reference) => ({ reference }));
  return {
    key: getActorsKey(actors),
    label: actorReferences.join(' · '),
    actors,
    schedules: actorReferences.map((reference) => ({ reference: `Schedule/${reference.split('/')[1]}` })),
  };
}

const WITH_RIVERA = combinationOf('Practitioner/dr-rivera');
const WITH_OKAFOR = combinationOf('Practitioner/dr-okafor');

/**
 * A time offered for one combination, named by its first actor so the harness
 * can read back who each returned time is held on.
 * @param combination - Who the time is offered for.
 * @param start - When it starts.
 * @returns The Bundle `$find` would have returned.
 */
function offered(combination: ActorCombination, start: string): Bundle<Appointment> {
  return buildFindBundle([
    buildProposedAppointment({
      start,
      scheduleReferences: combination.schedules.map((schedule) => schedule.reference as string),
      actorReferences: combination.actors.map((actor) => actor.reference as string),
    }),
  ]);
}

const medplumWrapper = ({ children }: { children: ReactNode }): JSX.Element => (
  <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
);

function Harness(props: { readonly combinations: readonly ActorCombination[] }): JSX.Element {
  const { appointments, requestCount, loading, error } = useProposedAppointments({
    service: UltrasoundImagingService,
    combinations: props.combinations,
    range: RANGE,
  });
  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'idle'}</div>
      <div data-testid="error">{error?.message ?? ''}</div>
      <div data-testid="requests">{requestCount}</div>
      <div data-testid="times">{appointments.map((appointment) => appointment.start).join(',')}</div>
      <div data-testid="actors">
        {appointments.map((appointment) => appointment.participant?.[0]?.actor?.reference).join(',')}
      </div>
    </div>
  );
}

function setup(combinations: readonly ActorCombination[]): void {
  render(<Harness combinations={combinations} />, medplumWrapper);
}

async function settle(): Promise<void> {
  await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('idle'));
}

/**
 * Answers each request by the schedules it names, so request order does not
 * matter and a single combination can be made to fail on its own.
 *
 * @param answers - What to return, keyed by the request's schedules joined by `+`.
 * @returns The spy standing in for `$find`.
 */
function respond(answers: Record<string, Bundle<Appointment> | Error>): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(medplum, 'get').mockImplementation((url) => {
    const schedules = new URL(url.toString()).searchParams.getAll('schedule');
    const answer = answers[schedules.join('+')];
    return new ReadablePromise(answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer as never));
  });
}

describe('useProposedAppointments', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('Searches one set of actors with one request', async () => {
    const get = respond({ 'Schedule/dr-rivera': offered(WITH_RIVERA, '2026-08-10T15:00:00.000Z') });

    setup([WITH_RIVERA]);
    await settle();

    expect(get).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('requests')).toHaveTextContent('1');
    expect(screen.getByTestId('times')).toHaveTextContent('2026-08-10T15:00:00.000Z');

    const url = new URL(get.mock.calls[0][0].toString());
    expect(url.pathname).toContain('Appointment/$find');
    expect(url.searchParams.getAll('schedule')).toStrictEqual(['Schedule/dr-rivera']);
    expect(url.searchParams.get('service-type-reference')).toBe(`HealthcareService/${UltrasoundImagingService.id}`);
    expect(url.searchParams.get('start')).toBe(RANGE.start?.toISOString());
  });

  test('Offers what several sets of actors found, as one list in time order', async () => {
    // `$find` cannot be asked for a choice, so a choice is a request each and
    // the alternatives are read back together.
    const get = respond({
      'Schedule/dr-rivera': offered(WITH_RIVERA, '2026-08-10T16:00:00.000Z'),
      'Schedule/dr-okafor': offered(WITH_OKAFOR, '2026-08-10T09:00:00.000Z'),
    });

    setup([WITH_RIVERA, WITH_OKAFOR]);
    await settle();

    expect(get).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('requests')).toHaveTextContent('2');
    expect(screen.getByTestId('times')).toHaveTextContent('2026-08-10T09:00:00.000Z,2026-08-10T16:00:00.000Z');
    expect(screen.getByTestId('actors')).toHaveTextContent('Practitioner/dr-okafor,Practitioner/dr-rivera');
  });

  test('Offers a time found for the same actors twice only once', async () => {
    const time = '2026-08-10T15:00:00.000Z';
    respond({
      'Schedule/dr-rivera': offered(WITH_RIVERA, time),
      'Schedule/dr-okafor': offered(WITH_RIVERA, time),
    });

    setup([WITH_RIVERA, WITH_OKAFOR]);
    await settle();

    expect(screen.getByTestId('times')).toHaveTextContent(time);
    expect(screen.getByTestId('times').textContent).not.toContain(',');
  });

  test('Loses one alternative rather than the whole search when a set of actors fails', async () => {
    // `$find` rejects a whole request over a single unschedulable actor — a
    // planning horizon that ends before the range, say. That must not hide the
    // times the other actors are free for.
    respond({
      'Schedule/dr-rivera': new Error('Search range ends before schedule planning horizon starts'),
      'Schedule/dr-okafor': offered(WITH_OKAFOR, '2026-08-10T09:00:00.000Z'),
    });

    setup([WITH_RIVERA, WITH_OKAFOR]);
    await settle();

    expect(screen.getByTestId('error')).toHaveTextContent('');
    expect(screen.getByTestId('times')).toHaveTextContent('2026-08-10T09:00:00.000Z');
  });

  test('Reports a search where nothing could be asked at all', async () => {
    respond({
      'Schedule/dr-rivera': new Error('Availability search is down'),
      'Schedule/dr-okafor': new Error('Availability search is down'),
    });

    setup([WITH_RIVERA, WITH_OKAFOR]);
    await settle();

    // An empty list would read as "no times are free", which is a different
    // thing to tell the user than "we could not find out".
    expect(screen.getByTestId('error')).toHaveTextContent('Availability search is down');
    expect(screen.getByTestId('times')).toHaveTextContent('');
  });

  test('Asks nothing when there is nobody to search for', async () => {
    const get = vi.spyOn(medplum, 'get');

    setup([]);
    await settle();

    expect(get).not.toHaveBeenCalled();
    expect(screen.getByTestId('requests')).toHaveTextContent('0');
    expect(screen.getByTestId('times')).toHaveTextContent('');
  });

  test('Keeps the times already found while the next search runs', async () => {
    const found = '2026-08-10T15:00:00.000Z';
    vi.spyOn(medplum, 'get').mockImplementationOnce(
      () => new ReadablePromise(Promise.resolve(offered(WITH_RIVERA, found) as never))
      // The second combination is left pending, so the render under test is the
      // one between asking and being answered.
    );

    const { rerender } = render(<Harness combinations={[WITH_RIVERA]} />, medplumWrapper);
    await settle();
    const pending = new ReadablePromise(
      new Promise<never>(() => {
        // Never settles, so the search stays in flight for the assertion below.
      })
    );
    vi.spyOn(medplum, 'get').mockImplementation(() => pending);
    rerender(<Harness combinations={[WITH_OKAFOR]} />);

    // Blanking the list on every keystroke of a date would flash empty between
    // two sets of results that mostly agree.
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('loading'));
    expect(screen.getByTestId('times')).toHaveTextContent(found);
  });

  test('Drops the times when there is no longer anybody to search for', async () => {
    respond({ 'Schedule/dr-rivera': offered(WITH_RIVERA, '2026-08-10T15:00:00.000Z') });

    const { rerender } = render(<Harness combinations={[WITH_RIVERA]} />, medplumWrapper);
    await settle();
    rerender(<Harness combinations={[]} />);
    await settle();

    // Times held on somebody nobody is asking about any more are not an answer
    // to the question now being asked.
    expect(screen.getByTestId('times')).toHaveTextContent('');
    expect(screen.getByTestId('requests')).toHaveTextContent('0');
  });

  test('Ignores times from a search the actors have already moved on from', async () => {
    const stale = '2026-08-10T15:00:00.000Z';
    const current = '2026-08-10T09:00:00.000Z';
    let answerFirstSearch = (): void => {};
    vi.spyOn(medplum, 'get').mockImplementationOnce(
      () =>
        new ReadablePromise(
          new Promise<never>((resolve) => {
            answerFirstSearch = () => resolve(offered(WITH_RIVERA, stale) as never);
          })
        )
    );

    const { rerender } = render(<Harness combinations={[WITH_RIVERA]} />, medplumWrapper);
    vi.spyOn(medplum, 'get').mockImplementation(
      () => new ReadablePromise(Promise.resolve(offered(WITH_OKAFOR, current) as never))
    );
    rerender(<Harness combinations={[WITH_OKAFOR]} />);
    await settle();

    // Rivera's times answer a question nobody is asking any more. Landing them
    // would both show times held on the wrong actors and strand the hook, whose
    // state would be keyed to a search no render asks for.
    await act(async () => {
      answerFirstSearch();
    });

    expect(screen.getByTestId('times')).toHaveTextContent(current);
    expect(screen.getByTestId('times').textContent).not.toContain(stale);
    expect(screen.getByTestId('loading')).toHaveTextContent('idle');
  });

  test('Searches again only when the actors searched for change', async () => {
    const get = respond({ 'Schedule/dr-rivera': offered(WITH_RIVERA, '2026-08-10T15:00:00.000Z') });

    const { rerender } = render(<Harness combinations={[WITH_RIVERA]} />, medplumWrapper);
    await settle();
    // A combination is derived, so it is a new array on every render. Re-running
    // the search on each of them would loop.
    rerender(<Harness combinations={[combinationOf('Practitioner/dr-rivera')]} />);
    await settle();

    expect(get).toHaveBeenCalledTimes(1);
  });
});
