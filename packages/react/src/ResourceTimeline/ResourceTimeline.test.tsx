import { createReference, MedplumClient, ProfileResource } from '@medplum/core';
import { Attachment, Bundle, Encounter, Resource, ResourceType } from '@medplum/fhirtypes';
import { HomerEncounter, MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from '@medplum/react-hooks';
import { ResourceTimeline, ResourceTimelineProps } from './ResourceTimeline';

const medplum = new MockClient();

async function loadTimelineResources(
  medplum: MedplumClient,
  resourceType: ResourceType,
  id: string
): Promise<PromiseSettledResult<Bundle>[]> {
  return Promise.allSettled([
    medplum.readHistory(resourceType, id),
    medplum.search('Communication', 'encounter=' + resourceType + '/' + id),
    medplum.search('Media', 'encounter=' + resourceType + '/' + id),
  ]);
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
      loadTimelineResources,
    });

    await waitFor(() => screen.getAllByTestId('timeline-item'));

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
  });

  test('Renders resource', async () => {
    await setup({
      value: HomerEncounter,
      loadTimelineResources,
    });

    await waitFor(() => screen.getAllByTestId('timeline-item'));

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
  });

  test('Create comment', async () => {
    await setup({
      value: HomerEncounter,
      loadTimelineResources,
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
    await setup({
      value: HomerEncounter,
      loadTimelineResources,
      createCommunication: jest.fn(),
      createMedia: (resource: Encounter, operator: ProfileResource, content: Attachment) => ({
        resourceType: 'Media',
        status: 'completed',
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
