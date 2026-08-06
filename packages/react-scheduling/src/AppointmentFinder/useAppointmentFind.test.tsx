// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { HealthcareService, Reference, Schedule } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { buildFindBundle, buildProposedAppointment } from '../stories/scheduling';
import { render, screen, userEvent, waitFor } from '../test-utils/render';
import type { AppointmentFindCriteria } from './useAppointmentFind';
import { useAppointmentFind } from './useAppointmentFind';

const SERVICE: Reference<HealthcareService> = { reference: 'HealthcareService/ultrasound-imaging' };
const DAY_MS = 24 * 60 * 60 * 1000;

function scheduleRefs(...ids: string[]): Reference<Schedule>[] {
  return ids.map((id) => ({ reference: `Schedule/${id}` }));
}

function Harness(props: { criteria: AppointmentFindCriteria | undefined }): JSX.Element {
  const { appointments, loading, loadingMore, error, loadedThrough, canLoadMore, loadMore } = useAppointmentFind(
    props.criteria
  );
  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'idle'}</div>
      <div data-testid="loading-more">{loadingMore ? 'loading' : 'idle'}</div>
      <div data-testid="error">{error?.message ?? ''}</div>
      <div data-testid="loaded-through">{loadedThrough?.toISOString() ?? ''}</div>
      <button type="button" disabled={!canLoadMore} onClick={loadMore}>
        Load more
      </button>
      <ul>
        {appointments.map((appointment) => (
          <li key={`${appointment.start}-${appointment.participant?.[0]?.actor?.reference}`}>
            {appointment.start} {appointment.participant?.[0]?.actor?.reference}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Reads how many days a request covered.
 * @param url - The `$find` URL that was requested.
 * @returns The days between the window's start and end.
 */
function windowDays(url: string | URL): number {
  const params = new URL(url).searchParams;
  return (Date.parse(params.get('end') as string) - Date.parse(params.get('start') as string)) / DAY_MS;
}

function setup(medplum: MockClient, criteria: AppointmentFindCriteria | undefined): void {
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
  );
  render(<Harness criteria={criteria} />, wrapper);
}

function baseCriteria(overrides?: Partial<AppointmentFindCriteria>): AppointmentFindCriteria {
  return {
    service: SERVICE,
    schedules: scheduleRefs('schedule-ultrasound-1'),
    start: new Date('2026-07-27T00:00:00.000Z'),
    end: new Date('2026-08-03T00:00:00.000Z'),
    ...overrides,
  };
}

describe('useAppointmentFind', () => {
  test('Builds a $find request from the criteria', async () => {
    const medplum = new MockClient();
    const get = vi
      .spyOn(medplum, 'get')
      .mockResolvedValue(buildFindBundle([buildProposedAppointment({ start: '2026-07-27T13:00:00.000Z' })]));

    setup(medplum, baseCriteria({ count: 50 }));

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('idle'));

    expect(get).toHaveBeenCalledTimes(1);
    const url = new URL(get.mock.calls[0][0]);
    expect(url.pathname).toContain('/Appointment/$find');
    expect(url.searchParams.get('start')).toBe('2026-07-27T00:00:00.000Z');
    expect(url.searchParams.get('end')).toBe('2026-08-03T00:00:00.000Z');
    expect(url.searchParams.get('service-type-reference')).toBe('HealthcareService/ultrasound-imaging');
    expect(url.searchParams.getAll('schedule')).toStrictEqual(['Schedule/schedule-ultrasound-1']);
    expect(url.searchParams.get('_count')).toBe('50');
    expect(await screen.findByText(/2026-07-27T13:00:00.000Z/)).toBeInTheDocument();
  });

  test('Searches a fortnight at a time when the range is open-ended', async () => {
    const medplum = new MockClient();
    const get = vi.spyOn(medplum, 'get').mockResolvedValue(buildFindBundle([]));

    setup(medplum, baseCriteria({ end: undefined }));

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('idle'));

    expect(get).toHaveBeenCalledTimes(1);
    expect(new URL(get.mock.calls[0][0]).searchParams.get('start')).toBe('2026-07-27T00:00:00.000Z');
    // The window ends at the close of a day, so it is a fortnight less the part
    // of the first day that had already passed.
    expect(windowDays(get.mock.calls[0][0])).toBeGreaterThan(13);
    expect(windowDays(get.mock.calls[0][0])).toBeLessThanOrEqual(14);
    expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled();
  });

  test('Loads the next page without dropping the times already found', async () => {
    const medplum = new MockClient();
    // One time per page, an hour into the window, so the two pages are telling apart.
    const get = vi.spyOn(medplum, 'get').mockImplementation(((url: string | URL) => {
      const start = Date.parse(new URL(url).searchParams.get('start') as string);
      return Promise.resolve(
        buildFindBundle([buildProposedAppointment({ start: new Date(start + 60 * 60 * 1000).toISOString() })])
      );
    }) as never);

    setup(medplum, baseCriteria({ end: undefined }));

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('idle'));
    const firstPageEnd = new URL(get.mock.calls[0][0]).searchParams.get('end');
    expect(screen.getByTestId('loaded-through')).toHaveTextContent(firstPageEnd as string);

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    await waitFor(() => expect(screen.getByTestId('loading-more')).toHaveTextContent('idle'));
    expect(get).toHaveBeenCalledTimes(2);
    // The second page picks up where the first one left off.
    expect(new URL(get.mock.calls[1][0]).searchParams.get('start')).toBe(firstPageEnd);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByTestId('loaded-through')).toHaveTextContent(
      new URL(get.mock.calls[1][0]).searchParams.get('end') as string
    );
    // A fresh search was never claimed to be running, so the times stayed up.
    expect(screen.getByTestId('loading')).toHaveTextContent('idle');
  });

  test('Offers nothing more once the requested range is covered', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'get').mockResolvedValue(buildFindBundle([]));

    setup(medplum, baseCriteria());

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('idle'));

    expect(screen.getByTestId('loaded-through')).toHaveTextContent('2026-08-03T00:00:00.000Z');
    expect(screen.getByRole('button', { name: 'Load more' })).toBeDisabled();
  });

  test('Starts over at the first page when the criteria change', async () => {
    const medplum = new MockClient();
    const get = vi.spyOn(medplum, 'get').mockImplementation(((url: string | URL) => {
      const params = new URL(url).searchParams;
      return Promise.resolve(
        buildFindBundle([
          buildProposedAppointment({
            start: new Date(Date.parse(params.get('start') as string) + 60 * 60 * 1000).toISOString(),
            actorReferences: [`Practitioner/${params.get('schedule')?.split('/')[1]}`],
          }),
        ])
      );
    }) as never);

    const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
      <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
    );
    const { rerender } = render(<Harness criteria={baseCriteria({ end: undefined })} />, wrapper);

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('idle'));
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));

    rerender(<Harness criteria={baseCriteria({ end: undefined, schedules: scheduleRefs('schedule-dr-okafor') })} />);

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(new URL(get.mock.calls[get.mock.calls.length - 1][0]).searchParams.get('start')).toBe(
      '2026-07-27T00:00:00.000Z'
    );
  });

  test('Holds every chosen actor in the one request, because $find intersects them', async () => {
    const medplum = new MockClient();
    const get = vi.spyOn(medplum, 'get').mockResolvedValue(buildFindBundle([]));

    setup(
      medplum,
      baseCriteria({
        schedules: scheduleRefs('schedule-dr-rivera', 'schedule-dr-okafor', 'schedule-ultrasound-1'),
      })
    );

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('idle'));

    // Two providers and a device is one request, not six.
    expect(get).toHaveBeenCalledTimes(1);
    const url = new URL(get.mock.calls[0][0]);
    expect(url.searchParams.getAll('schedule')).toStrictEqual([
      'Schedule/schedule-dr-rivera',
      'Schedule/schedule-dr-okafor',
      'Schedule/schedule-ultrasound-1',
    ]);
  });

  test('Reports a time offered on both sides of a page boundary once', async () => {
    const medplum = new MockClient();
    // The same time comes back for either window, as one at the boundary would.
    vi.spyOn(medplum, 'get').mockResolvedValue(
      buildFindBundle([buildProposedAppointment({ start: '2026-07-27T13:00:00.000Z' })])
    );

    setup(medplum, baseCriteria({ end: undefined }));

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('idle'));
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    await waitFor(() => expect(screen.getByTestId('loading-more')).toHaveTextContent('idle'));
    expect(screen.getAllByText(/2026-07-27T13:00:00.000Z/)).toHaveLength(1);
  });

  test('Searches for nothing when there are no criteria', async () => {
    const medplum = new MockClient();
    const get = vi.spyOn(medplum, 'get').mockResolvedValue(buildFindBundle([]));

    setup(medplum, undefined);

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('idle'));
    expect(get).not.toHaveBeenCalled();
  });

  test('Searches for nothing when no actor is chosen', async () => {
    const medplum = new MockClient();
    const get = vi.spyOn(medplum, 'get').mockResolvedValue(buildFindBundle([]));

    setup(medplum, baseCriteria({ schedules: [] }));

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('idle'));
    expect(get).not.toHaveBeenCalled();
  });

  test('Surfaces a failed request', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'get').mockRejectedValue(new Error('Search range cannot exceed 31 days'));

    setup(medplum, baseCriteria());

    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('Search range cannot exceed 31 days'));
    expect(screen.getByTestId('loading')).toHaveTextContent('idle');
  });

  test('Does not re-search when a parent rebuilds equal criteria', async () => {
    const medplum = new MockClient();
    const get = vi.spyOn(medplum, 'get').mockResolvedValue(buildFindBundle([]));

    const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
      <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
    );
    const { rerender } = render(<Harness criteria={baseCriteria()} />, wrapper);

    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));

    // Fresh objects holding the same values, as a re-rendering parent would build.
    rerender(<Harness criteria={baseCriteria()} />);

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('idle'));
    expect(get).toHaveBeenCalledTimes(1);
  });
});
