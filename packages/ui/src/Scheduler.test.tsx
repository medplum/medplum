import { createReference } from '@medplum/core';
import { Reference, Schedule } from '@medplum/fhirtypes';
import { DrAliceSmith, MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { Scheduler } from './Scheduler';

const medplum = new MockClient();

function setup(schedule: Schedule | Reference<Schedule>): void {
  render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
        <Scheduler schedule={schedule} />
      </MedplumProvider>
    </MemoryRouter>
  );
}

describe('Scheduler', () => {
  test('Handle bad reference', async () => {
    await act(async () => {
      setup({ reference: 'Schedule/123' });
    });
  });

  test('Renders', async () => {
    setup({ resourceType: 'Schedule', actor: [createReference(DrAliceSmith)] });

    await act(async () => {
      await waitFor(() => screen.getByTestId('scheduler'));
    });

    const control = screen.getByTestId('scheduler');
    expect(control).toBeDefined();

    // Choose a date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayButton = screen.getByText(today.getDate().toString());
    expect(todayButton).toBeDefined();
    expect((todayButton as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      fireEvent.click(todayButton);
    });

    // Choose a time
    await act(async () => {
      fireEvent.click(screen.getByText('9:00am'));
    });

    // Click next
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    // Click next
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    expect(screen.getByText("You're all set!")).toBeDefined();
  });
});
