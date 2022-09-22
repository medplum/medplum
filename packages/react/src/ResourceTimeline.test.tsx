import { createReference, getReferenceString, ProfileResource } from '@medplum/core';
import { Attachment, Bundle, Encounter, Resource } from '@medplum/fhirtypes';
import { HomerEncounter, MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { ResourceTimeline, ResourceTimelineProps } from './ResourceTimeline';

const medplum = new MockClient();

function buildEncounterSearch(encounter: Resource): Bundle {
  return {
    resourceType: 'Bundle',
    type: 'batch',
    entry: [
      {
        request: {
          method: 'GET',
          url: `${getReferenceString(encounter)}/_history`,
        },
      },
      {
        request: {
          method: 'GET',
          url: `Communication?encounter=${getReferenceString(encounter)}`,
        },
      },
      {
        request: {
          method: 'GET',
          url: `Media?encounter=${getReferenceString(encounter)}`,
        },
      },
    ],
  };
}

describe('ResourceTimeline', () => {
  async function setup<T extends Resource>(args: ResourceTimelineProps<T>): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <ResourceTimeline {...args} />
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  test('Renders reference', async () => {
    await setup({
      value: createReference(HomerEncounter),
      buildSearchRequests: buildEncounterSearch,
    });

    await waitFor(() => screen.getAllByTestId('timeline-item'));

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
  });

  test('Renders resource', async () => {
    await setup({
      value: HomerEncounter,
      buildSearchRequests: buildEncounterSearch,
    });

    await waitFor(() => screen.getAllByTestId('timeline-item'));

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
  });

  test('Create comment', async () => {
    await setup({
      value: HomerEncounter,
      buildSearchRequests: buildEncounterSearch,
      createCommunication: (resource: Encounter, sender: ProfileResource, text: string) => ({
        resourceType: 'Communication',
        status: 'completed',
        encounter: createReference(resource),
        subject: (resource as Encounter).subject,
        sender: createReference(sender),
        payload: [{ contentString: text }],
      }),
    });

    // Wait for initial load
    await waitFor(() => screen.getAllByTestId('timeline-item'));

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
    await waitFor(() => screen.getAllByTestId('timeline-item'));

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
  });

  test('Upload media', async () => {
    await setup({
      value: HomerEncounter,
      buildSearchRequests: buildEncounterSearch,
      createCommunication: jest.fn(),
      createMedia: (resource: Encounter, operator: ProfileResource, content: Attachment) => ({
        resourceType: 'Media',
        encounter: createReference(resource),
        subject: (resource as Encounter).subject,
        operator: createReference(operator),
        content,
      }),
    });

    // Wait for initial load
    await waitFor(() => screen.getAllByTestId('timeline-item'));

    // Upload the file
    await act(async () => {
      const files = [new File(['hello'], 'hello.txt', { type: 'text/plain' })];
      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: { files },
      });
    });

    // Wait for new comment
    await waitFor(() => screen.getAllByTestId('timeline-item'));

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
  });
});
