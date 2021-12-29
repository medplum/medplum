import { createReference } from '@medplum/core';
import { ExampleSubscription, MockClient } from '@medplum/mock';
import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { DefaultResourceTimeline, DefaultResourceTimelineProps } from './DefaultResourceTimeline';
import { MedplumProvider } from './MedplumProvider';

const medplum = new MockClient();

describe('DefaultResourceTimeline', () => {
  const setup = (args: DefaultResourceTimelineProps) => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <DefaultResourceTimeline {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Renders reference', async () => {
    setup({ resource: createReference(ExampleSubscription) });

    await act(async () => {
      await waitFor(() => screen.getAllByTestId('timeline-item'));
    });

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
    expect(items.length).toEqual(2);
  });

  test('Renders resource', async () => {
    setup({ resource: ExampleSubscription });

    await act(async () => {
      await waitFor(() => screen.getAllByTestId('timeline-item'));
    });

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
    expect(items.length).toEqual(2);
  });
});
