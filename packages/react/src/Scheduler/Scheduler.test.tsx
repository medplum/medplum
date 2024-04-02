import { createReference } from '@medplum/core';
import { Reference, Schedule } from '@medplum/fhirtypes';
import { DrAliceSmithSchedule, ExampleQuestionnaire, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { Scheduler } from './Scheduler';

const medplum = new MockClient();

function setup(schedule: Schedule | Reference<Schedule>): void {
  render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
        <Scheduler schedule={schedule} questionnaire={ExampleQuestionnaire} />
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
});
