import { createReference } from '@medplum/core';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { PatientTimeline, PatientTimelineProps } from './PatientTimeline';

const medplum = new MockClient();

describe('PatientTimeline', () => {
  function setup(args: PatientTimelineProps): void {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <PatientTimeline {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders reference', async () => {
    setup({ patient: createReference(HomerSimpson) });

    await act(async () => {
      await waitFor(() => screen.getAllByTestId('timeline-item'));
    });

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
    expect(screen.getByText('SERVICE_REQUEST_CODE')).toBeInTheDocument();
  });

  test('Renders resource', async () => {
    setup({ patient: HomerSimpson });

    await act(async () => {
      await waitFor(() => screen.getAllByTestId('timeline-item'));
    });

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
    expect(screen.getByText('SERVICE_REQUEST_CODE')).toBeInTheDocument();
  });

  test('Create comment', async () => {
    setup({ patient: HomerSimpson });

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
  });

  test('Upload media', async () => {
    setup({ patient: HomerSimpson });

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
  });
});
