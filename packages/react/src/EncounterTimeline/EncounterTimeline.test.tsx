import { createReference } from '@medplum/core';
import { HomerEncounter, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';
import { MemoryRouter } from 'react-router-dom';
import { EncounterTimeline, EncounterTimelineProps } from './EncounterTimeline';

const medplum = new MockClient();

describe('EncounterTimeline', () => {
  async function setup(args: EncounterTimelineProps): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <EncounterTimeline {...args} />
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  test('Renders reference', async () => {
    await setup({ encounter: createReference(HomerEncounter) });

    await waitFor(() => screen.getAllByTestId('timeline-item'));

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
  });

  test('Renders resource', async () => {
    await setup({ encounter: HomerEncounter });

    await waitFor(() => screen.getAllByTestId('timeline-item'));

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
  });

  test('Create comment', async () => {
    await setup({ encounter: HomerEncounter });

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
    await setup({ encounter: HomerEncounter });

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
