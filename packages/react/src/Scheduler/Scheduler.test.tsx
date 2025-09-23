// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, WithId } from '@medplum/core';
import { Period, Reference, Schedule, Slot } from '@medplum/fhirtypes';
import { DrAliceSmithSchedule, ExampleQuestionnaire, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';
import { Scheduler, SlotSearchFunction } from './Scheduler';

const medplum = new MockClient();

// Create a second schedule for testing arrays
const DrBobSchedule: WithId<Schedule> = {
  ...DrAliceSmithSchedule,
  id: 'dr-bob-schedule',
  actor: [{ reference: 'Practitioner/dr-bob', display: 'Dr. Bob Jones' }],
};

// Create mock slots for Dr. Bob's schedule
function makeDrBobSlots(): WithId<Slot>[] {
  const schedule = createReference(DrBobSchedule);
  const result: WithId<Slot>[] = [];
  // Use a consistent base date for slot generation
  const slotDate = new Date();
  for (let day = 0; day < 60; day++) {
    for (const hour of [8, 12, 16, 17]) {
      // Different hours than Alice
      slotDate.setUTCHours(hour, 0, 0, 0);
      result.push({
        resourceType: 'Slot',
        id: `bob-slot-${day}-${hour}`,
        status: 'free',
        start: slotDate.toISOString(),
        end: new Date(slotDate.getTime() + 60 * 60 * 1000).toISOString(),
        schedule,
      });
    }
    slotDate.setUTCDate(slotDate.getUTCDate() + 1);
  }
  return result;
}

// Add Bob's slots to the mock client after time is mocked
const DrBobSlots = makeDrBobSlots();
DrBobSlots.forEach((slot) => medplum.createResource(slot));

function setup(
  schedule: Schedule | Reference<Schedule> | Schedule[] | Reference<Schedule>[] | SlotSearchFunction,
  questionnaire = ExampleQuestionnaire
): void {
  render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
        <Scheduler schedule={schedule} questionnaire={questionnaire} />
      </MedplumProvider>
    </MemoryRouter>
  );
}

describe('Scheduler', () => {
  test('Renders by reference', async () => {
    await act(async () => {
      setup(createReference(DrAliceSmithSchedule));
    });
  });

  test('Renders resources', async () => {
    await act(async () => {
      setup(DrAliceSmithSchedule);
    });
  });

  test('Success', async () => {
    await act(async () => {
      setup(DrAliceSmithSchedule);
    });

    expect(await screen.findByTestId('scheduler')).toBeInTheDocument();

    // Move forward one month
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Next month'));
    });

    // Expect the 15th to be available
    const dayButton = screen.getByRole('button', { name: '15' });
    expect((dayButton as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      fireEvent.click(dayButton);
    });

    // Choose a time
    await act(async () => {
      fireEvent.click(screen.getByText('9:00 AM'));
    });

    // Click next
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    expect(screen.getByText("You're all set!")).toBeDefined();
  });

  test('Renders with schedule array', async () => {
    await act(async () => {
      setup([DrAliceSmithSchedule, DrBobSchedule]);
    });

    expect(await screen.findByTestId('scheduler')).toBeInTheDocument();
  });

  test('Renders with schedule reference array', async () => {
    await act(async () => {
      setup([createReference(DrAliceSmithSchedule), createReference(DrBobSchedule)]);
    });

    expect(await screen.findByTestId('scheduler')).toBeInTheDocument();
  });

  test('Renders with custom slot search function', async () => {
    const mockSlots: Slot[] = [
      {
        resourceType: 'Slot',
        id: 'slot-1',
        schedule: { reference: 'Schedule/dr-alice' },
        status: 'free',
        start: '2023-12-15T09:00:00.000Z',
        end: '2023-12-15T10:00:00.000Z',
      },
      {
        resourceType: 'Slot',
        id: 'slot-2',
        schedule: { reference: 'Schedule/dr-alice' },
        status: 'free',
        start: '2023-12-15T10:00:00.000Z',
        end: '2023-12-15T11:00:00.000Z',
      },
    ];

    const customSlotSearch: SlotSearchFunction = async (period: Period): Promise<Slot[]> => {
      expect(period.start).toBeDefined();
      expect(period.end).toBeDefined();
      return mockSlots;
    };

    await act(async () => {
      setup(customSlotSearch);
    });

    expect(await screen.findByTestId('scheduler')).toBeInTheDocument();
  });

  test('Displays actor information for single schedule', async () => {
    await act(async () => {
      setup(DrAliceSmithSchedule);
    });

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });
  });

  test('Does not display actor for schedule array', async () => {
    await act(async () => {
      setup([DrAliceSmithSchedule, DrBobSchedule]);
    });

    expect(await screen.findByTestId('scheduler')).toBeInTheDocument();
    // Should not show actor when multiple schedules are provided
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
  });

  test('Does not display actor for custom slot search function', async () => {
    const customSlotSearch: SlotSearchFunction = async (): Promise<Slot[]> => [];

    await act(async () => {
      setup(customSlotSearch);
    });

    expect(await screen.findByTestId('scheduler')).toBeInTheDocument();
    // Should not show actor when using custom function
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
  });

  test('Handles empty schedule array', async () => {
    await act(async () => {
      setup([]);
    });

    expect(await screen.findByTestId('scheduler')).toBeInTheDocument();
  });

  test('Handles custom slot search function returning empty array', async () => {
    const emptySlotSearch: SlotSearchFunction = async (): Promise<Slot[]> => [];

    await act(async () => {
      setup(emptySlotSearch);
    });

    expect(await screen.findByTestId('scheduler')).toBeInTheDocument();

    // Should show calendar but no available times when slots are empty
    expect(screen.getByText('Select date')).toBeInTheDocument();
  });

  test('Shows slots from multiple schedules in array', async () => {
    await act(async () => {
      setup([DrAliceSmithSchedule, DrBobSchedule]);
    });

    expect(await screen.findByTestId('scheduler')).toBeInTheDocument();

    // Move forward one month to get to a date with slots
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Next month'));
    });

    // Find a day with available slots and click it
    const dayButton = screen.getByRole('button', { name: '15' });
    expect((dayButton as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      fireEvent.click(dayButton);
    });

    // Should show time selection with slots from both schedules
    expect(screen.getByText('Select time')).toBeInTheDocument();

    // Alice's slots (9, 10, 11, 13, 14, 15)
    await waitFor(() => {
      expect(screen.queryByText('9:00 AM')).toBeInTheDocument();
      expect(screen.queryByText('10:00 AM')).toBeInTheDocument();
      expect(screen.queryByText('11:00 AM')).toBeInTheDocument();
      expect(screen.queryByText('1:00 PM')).toBeInTheDocument();
      expect(screen.queryByText('2:00 PM')).toBeInTheDocument();
      expect(screen.queryByText('3:00 PM')).toBeInTheDocument();
    });

    // Bob's slots (8, 12, 16, 17)
    await waitFor(() => {
      expect(screen.queryByText('8:00 AM')).toBeInTheDocument();
      expect(screen.queryByText('12:00 PM')).toBeInTheDocument();
      expect(screen.queryByText('4:00 PM')).toBeInTheDocument();
      expect(screen.queryByText('5:00 PM')).toBeInTheDocument();
    });
  });

  test('Slot selection updates selected slot state', async () => {
    const mockSlots: Slot[] = [
      {
        resourceType: 'Slot',
        id: 'slot-1',
        schedule: { reference: 'Schedule/dr-alice' },
        status: 'free',
        start: '2023-11-15T09:00:00.000Z',
        end: '2023-11-15T10:00:00.000Z',
      },
      {
        resourceType: 'Slot',
        id: 'slot-2',
        schedule: { reference: 'Schedule/dr-alice' },
        status: 'free',
        start: '2023-11-15T10:00:00.000Z',
        end: '2023-11-15T11:00:00.000Z',
      },
    ];

    const customSlotSearch: SlotSearchFunction = async (): Promise<Slot[]> => mockSlots;

    await act(async () => {
      setup(customSlotSearch);
    });

    expect(await screen.findByTestId('scheduler')).toBeInTheDocument();

    // Select the 15th
    const dayButton = screen.getByRole('button', { name: '15' });
    await act(async () => {
      fireEvent.click(dayButton);
    });

    // Should show time selection
    expect(screen.getByText('Select time')).toBeInTheDocument();
    expect(screen.getByText('9:00 AM')).toBeInTheDocument();

    // Select the time slot
    await act(async () => {
      fireEvent.click(screen.getByText('9:00 AM'));
    });

    // Should show the selected time in the info panel
    expect(screen.getByText('9:00 AM')).toBeInTheDocument();
  });
});
