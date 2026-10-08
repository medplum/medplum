// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { badRequest, getReferenceString, OperationOutcomeError } from '@medplum/core';
import type { Bundle, Slot } from '@medplum/fhirtypes';
import type { MockClient } from '@medplum/mock';
import type { Mock } from 'vitest';
import type { ScheduleCandidate } from '../../AppointmentFinder/AppointmentFinder.schedules';
import { DrOkaforSchedule, DrRiveraSchedule, ExamRoomASchedule } from '../../stories/scheduling';
import { installAutocompleteTimers } from '../../test-utils/asyncAutocomplete';
import { chooseActor, setupBookingClient } from '../../test-utils/bookingForm';
import { act, fireEvent, renderWithMedplum, screen } from '../../test-utils/render';
import type { DateTimeRange } from '../../types';
import { BlockTimeForm } from './BlockTimeForm';

installAutocompleteTimers();

const CANDIDATES = {
  Practitioner: [DrOkaforSchedule, DrRiveraSchedule].map(toCandidate),
  Location: [ExamRoomASchedule].map(toCandidate),
  Device: [],
};

const RANGE = { start: new Date(2026, 7, 18, 12, 0), end: new Date(2026, 7, 18, 13, 0) };

function toCandidate(schedule: ScheduleCandidate['schedule']): ScheduleCandidate {
  return { schedule, actorResource: undefined };
}

function blockButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Block time' });
}

async function type(label: string, value: string): Promise<void> {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
  });
}

async function clickBlock(): Promise<void> {
  await act(async () => {
    fireEvent.click(blockButton());
  });
}

/**
 * The transaction the form sent.
 * @param medplum - The client, with `executeBatch` spied on.
 * @returns The bundle of the first call.
 */
function sentBundle(medplum: MockClient): Bundle<Slot> {
  return vi.mocked(medplum.executeBatch).mock.calls[0][0] as Bundle<Slot>;
}

describe('BlockTimeForm', () => {
  let medplum: MockClient;
  let onChangeTime: Mock<(range: DateTimeRange | undefined) => void>;
  let onBlocked: Mock<(slots: WithId<Slot>[]) => void>;

  beforeEach(async () => {
    medplum = await setupBookingClient();
    vi.spyOn(medplum, 'executeBatch');
    vi.spyOn(medplum, 'notifyResourceModified');
    onChangeTime = vi.fn();
    onBlocked = vi.fn();
    renderWithMedplum(
      <BlockTimeForm
        candidatesByActorType={CANDIDATES}
        defaultRange={RANGE}
        onChangeTime={onChangeTime}
        onBlocked={onBlocked}
      />,
      medplum
    );
  });

  test('Blocks the time on each calendar named, in one transaction', async () => {
    // Opens on the time it was given, naming no calendar, so nothing can be blocked yet.
    expect(screen.getByLabelText(/^Start/)).toHaveValue('2026-08-18T12:00');
    expect(screen.getByLabelText(/^End/)).toHaveValue('2026-08-18T13:00');
    expect(blockButton()).toBeDisabled();
    expect(onChangeTime).not.toHaveBeenCalled();

    await type('End', '2026-08-18T14:30');
    expect(onChangeTime).toHaveBeenLastCalledWith({ start: RANGE.start, end: new Date(2026, 7, 18, 14, 30) });

    await chooseActor(/Provider/, 'riv', 'Dr. Maya Rivera');
    await chooseActor(/Room/, 'exam', 'Exam Room A');
    await type('Comment', 'Staff meeting');
    expect(blockButton()).toBeEnabled();

    await clickBlock();

    const bundle = sentBundle(medplum);
    expect(bundle.type).toBe('transaction');
    expect(bundle.entry?.map((entry) => entry.resource)).toStrictEqual([
      expect.objectContaining({
        schedule: { reference: getReferenceString(DrRiveraSchedule) },
        status: 'busy',
        start: RANGE.start.toISOString(),
        end: new Date(2026, 7, 18, 14, 30).toISOString(),
        comment: 'Staff meeting',
      }),
      expect.objectContaining({ schedule: { reference: getReferenceString(ExamRoomASchedule) } }),
    ]);

    // Each Slot written is announced, so calendars draw it, and handed over.
    const [slots] = onBlocked.mock.calls[0];
    expect(slots).toHaveLength(2);
    for (const slot of slots) {
      expect(medplum.notifyResourceModified).toHaveBeenCalledWith(
        expect.objectContaining({ resourceType: 'Slot', operation: 'create', id: slot.id })
      );
    }
    // And not offered again until something changes.
    expect(blockButton()).toBeDisabled();
  });

  test('Refuses a time that ends before it starts, and says so when a write fails in whole or in part', async () => {
    await chooseActor(/Provider/, 'riv', 'Dr. Maya Rivera');

    await type('End', '2026-08-18T11:00');
    expect(screen.getByText('End must be after start.')).toBeInTheDocument();
    expect(blockButton()).toBeDisabled();
    expect(onChangeTime).toHaveBeenLastCalledWith(undefined);

    await type('End', '2026-08-18T13:00');
    vi.mocked(medplum.executeBatch).mockRejectedValueOnce(new OperationOutcomeError(badRequest('Rejected by policy')));
    await clickBlock();

    expect(screen.getByText('Rejected by policy')).toBeInTheDocument();
    expect(onBlocked).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^End/)).toHaveValue('2026-08-18T13:00');
    expect(blockButton()).toBeEnabled();

    // A batch that lands only some Slots: what landed is drawn, and the shortfall is said.
    await chooseActor(/Room/, 'exam', 'Exam Room A');
    const riveraOnly = await medplum.createResource<Slot>({
      resourceType: 'Slot',
      schedule: { reference: getReferenceString(DrRiveraSchedule) },
      status: 'busy',
      start: RANGE.start.toISOString(),
      end: RANGE.end.toISOString(),
    });
    vi.mocked(medplum.executeBatch).mockResolvedValueOnce({
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: [{ resource: riveraOnly, response: { status: '201' } }, { response: { status: '400' } }],
    });
    await clickBlock();

    expect(screen.getByText(/Blocked 1 of 2 calendars/)).toBeInTheDocument();
    expect(medplum.notifyResourceModified).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: 'Slot', operation: 'create', id: riveraOnly.id })
    );
    expect(onBlocked).not.toHaveBeenCalled();
    expect(blockButton()).toBeDisabled();
  });
});
