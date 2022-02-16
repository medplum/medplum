import { createReference } from '@medplum/core';
import { DrAliceSmith, MockClient } from '@medplum/mock';
import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { Scheduler } from './Scheduler';

const medplum = new MockClient();

function setup(): void {
  render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
        <Scheduler schedule={{ resourceType: 'Schedule', actor: [createReference(DrAliceSmith)] }} />
      </MedplumProvider>
    </MemoryRouter>
  );
}

describe('Scheduler', () => {
  test('Renders', async () => {
    setup();

    await act(async () => {
      await waitFor(() => screen.getByTestId('scheduler'));
    });

    const control = screen.getByTestId('scheduler');
    expect(control).toBeDefined();
  });
});
