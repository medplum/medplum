import { createReference } from '@medplum/core';
import { ExampleSubscription, MockClient } from '@medplum/mock';
import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { DefaultResourceTimeline, DefaultResourceTimelineProps } from './DefaultResourceTimeline';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';

const medplum = new MockClient();

describe('DefaultResourceTimeline', () => {
  async function setup(args: DefaultResourceTimelineProps): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <DefaultResourceTimeline {...args} />
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  test('Renders reference', async () => {
    await setup({ resource: createReference(ExampleSubscription) });

    await waitFor(() => screen.getAllByTestId('timeline-item'));

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
  });

  test('Renders resource', async () => {
    await setup({ resource: ExampleSubscription });

    await waitFor(() => screen.getAllByTestId('timeline-item'));

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
  });
});
