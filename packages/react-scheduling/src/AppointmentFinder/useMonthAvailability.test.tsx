// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Appointment, Bundle, HealthcareService, Reference, Schedule } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { buildFindBundle, buildProposedAppointment } from '../stories/scheduling';
import { render, screen, waitFor } from '../test-utils/render';
import { endOfMonth } from './AppointmentFinder.times';
import type { MonthAvailabilityCriteria } from './useMonthAvailability';
import { MONTH_SCAN_COUNT, useMonthAvailability } from './useMonthAvailability';

const SERVICE: Reference<HealthcareService> = { reference: 'HealthcareService/ultrasound-imaging' };
const SCHEDULES: Reference<Schedule>[] = [{ reference: 'Schedule/schedule-ultrasound-1' }];
const MONTH = new Date('2026-07-15T00:00:00.000Z');

// Well before any start a test asserts on, so padding never becomes the latest.
const FILLER_START_MS = Date.parse('2026-07-02T00:00:00.000Z');

function Harness(props: { criteria: MonthAvailabilityCriteria | undefined }): JSX.Element {
  const { appointments, loading, error, checkedThrough } = useMonthAvailability(props.criteria);
  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'idle'}</div>
      <div data-testid="error">{error?.message ?? ''}</div>
      <div data-testid="checked-through">{checkedThrough?.toISOString() ?? ''}</div>
      <div data-testid="count">{appointments.length}</div>
    </div>
  );
}

function setup(medplum: MockClient, criteria: MonthAvailabilityCriteria | undefined): void {
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
  );
  render(<Harness criteria={criteria} />, wrapper);
}

/**
 * Builds a page the scan will read as cut short.
 *
 * A page counts as cut short only when it comes back at the count it asked for,
 * so the starts under test are padded out to it.
 *
 * @param starts - The starts to include beyond the padding.
 * @returns A full page of proposed appointments.
 */
function fullPage(starts: readonly string[]): Bundle<Appointment> {
  const filler = Array.from({ length: MONTH_SCAN_COUNT - starts.length }, (_, index) =>
    buildProposedAppointment({ start: new Date(FILLER_START_MS + index * 60_000).toISOString() })
  );
  return buildFindBundle([...filler, ...starts.map((start) => buildProposedAppointment({ start }))]);
}

function partialPage(starts: readonly string[]): Bundle<Appointment> {
  return buildFindBundle(starts.map((start) => buildProposedAppointment({ start })));
}

function criteria(overrides?: Partial<MonthAvailabilityCriteria>): MonthAvailabilityCriteria {
  return { service: SERVICE, schedules: SCHEDULES, month: MONTH, ...overrides };
}

describe('useMonthAvailability', () => {
  test('Trusts the whole month when no request was cut short', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'get')
      .mockResolvedValueOnce(partialPage(['2026-07-06T15:00:00.000Z']))
      .mockResolvedValueOnce(partialPage(['2026-07-20T15:00:00.000Z']));

    setup(medplum, criteria());

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('idle'));
    expect(screen.getByTestId('checked-through')).toHaveTextContent(endOfMonth(MONTH).toISOString());
    expect(screen.getByTestId('count')).toHaveTextContent('2');
  });

  test('Stops where a request that was cut short stopped counting', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'get')
      .mockResolvedValueOnce(fullPage(['2026-07-08T20:00:00.000Z']))
      .mockResolvedValueOnce(partialPage(['2026-07-20T15:00:00.000Z']));

    setup(medplum, criteria());

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('idle'));
    expect(screen.getByTestId('checked-through')).toHaveTextContent('2026-07-08T20:00:00.000Z');
  });

  test('Takes the earliest stopping point when both requests were cut short', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'get')
      .mockResolvedValueOnce(fullPage(['2026-07-08T20:00:00.000Z']))
      .mockResolvedValueOnce(fullPage(['2026-07-20T09:00:00.000Z']));

    setup(medplum, criteria());

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('idle'));
    // The later half being counted further does not make the gap in the earlier
    // one any smaller.
    expect(screen.getByTestId('checked-through')).toHaveTextContent('2026-07-08T20:00:00.000Z');
  });

  test('Compares starts as instants rather than as the strings they arrive as', async () => {
    const medplum = new MockClient();
    // 18:00+05:00 is 13:00Z, an hour before 14:00Z, but sorts after it as text.
    vi.spyOn(medplum, 'get')
      .mockResolvedValueOnce(fullPage(['2026-07-10T14:00:00.000Z', '2026-07-10T18:00:00.000+05:00']))
      .mockResolvedValueOnce(partialPage(['2026-07-20T15:00:00.000Z']));

    setup(medplum, criteria());

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('idle'));
    expect(screen.getByTestId('checked-through')).toHaveTextContent('2026-07-10T14:00:00.000Z');
  });

  test('Scans nothing without criteria', async () => {
    const medplum = new MockClient();
    const get = vi.spyOn(medplum, 'get');

    setup(medplum, undefined);

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('idle'));
    expect(get).not.toHaveBeenCalled();
    expect(screen.getByTestId('checked-through')).toHaveTextContent('');
  });
});
