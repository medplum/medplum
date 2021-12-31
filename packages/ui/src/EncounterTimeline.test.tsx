import { createReference } from '@medplum/core';
import { HomerEncounter, MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { EncounterTimeline, EncounterTimelineProps } from './EncounterTimeline';
import { MedplumProvider } from './MedplumProvider';

const medplum = new MockClient();

describe('EncounterTimeline', () => {
  function setup(args: EncounterTimelineProps): void {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <EncounterTimeline {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders reference', async () => {
    setup({ encounter: createReference(HomerEncounter) });

    await act(async () => {
      await waitFor(() => screen.getAllByTestId('timeline-item'));
    });

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
    expect(items.length).toEqual(3);
  });

  test('Renders resource', async () => {
    setup({ encounter: HomerEncounter });

    await act(async () => {
      await waitFor(() => screen.getAllByTestId('timeline-item'));
    });

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
    expect(items.length).toEqual(3);
  });

  test('Create comment', async () => {
    setup({ encounter: HomerEncounter });

    // Wait for initial load
    await act(async () => {
      await waitFor(() => screen.getAllByTestId('timeline-item'));
    });

    // Enter the comment text
    await act(async () => {
      fireEvent.change(screen.getByTestId('timeline-input'), {
        target: { value: 'Test comment' },
      });
    });

    // Submit the form
    await act(async () => {
      fireEvent.submit(screen.getByTestId('timeline-form'), {
        target: { text: 'Test comment' },
      });
    });

    // Wait for new comment
    await act(async () => {
      await waitFor(() => screen.getAllByTestId('timeline-item'));
    });

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
    expect(items.length).toEqual(4);
  });

  test('Upload media', async () => {
    setup({ encounter: HomerEncounter });

    // Wait for initial load
    await act(async () => {
      await waitFor(() => screen.getAllByTestId('timeline-item'));
    });

    // Upload the file
    await act(async () => {
      const files = [new File(['hello'], 'hello.txt', { type: 'text/plain' })];
      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: { files },
      });
    });

    // Wait for new comment
    await act(async () => {
      await waitFor(() => screen.getAllByTestId('timeline-item'));
    });

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
    expect(items.length).toEqual(4);
  });
});
