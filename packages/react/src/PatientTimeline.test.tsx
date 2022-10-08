import { createReference, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, SearchParameter } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { PatientTimeline, PatientTimelineProps } from './PatientTimeline';

const medplum = new MockClient();

describe('PatientTimeline', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
  });

  async function setup(args: PatientTimelineProps): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <PatientTimeline {...args} />
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  test('Renders reference', async () => {
    await setup({ patient: createReference(HomerSimpson) });

    await waitFor(() => screen.getAllByTestId('timeline-item'));

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
    expect(screen.getByText('SERVICE_REQUEST_CODE')).toBeInTheDocument();
  });

  test('Renders resource', async () => {
    await setup({ patient: HomerSimpson });

    await waitFor(() => screen.getAllByTestId('timeline-item'));

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
    expect(screen.getByText('SERVICE_REQUEST_CODE')).toBeInTheDocument();
  });

  test('Create comment', async () => {
    await setup({ patient: HomerSimpson });

    // Wait for initial load
    await waitFor(() => screen.getAllByTestId('timeline-item'));

    // Enter the comment text
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Add comment'), {
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
    await waitFor(() => screen.getAllByTestId('timeline-item'));

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
  });

  test('Upload media', async () => {
    await setup({ patient: HomerSimpson });

    // Wait for initial load
    await waitFor(() => screen.getAllByTestId('timeline-item'));

    // Upload the file
    await act(async () => {
      const files = [new File(['hello'], 'hello.txt', { type: 'text/plain' })];
      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: { files },
      });
    });

    // Wait for new media
    await waitFor(() => screen.getAllByTestId('timeline-item'));

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
  });
});
