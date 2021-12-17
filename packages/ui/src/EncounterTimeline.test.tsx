import { Bundle, Communication, Encounter, Media } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { randomUUID } from 'crypto';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { EncounterTimeline, EncounterTimelineProps } from './EncounterTimeline';
import { MedplumProvider } from './MedplumProvider';
import { MockClient } from './MockClient';

const encounter: Encounter = {
  resourceType: 'Encounter',
  id: '123',
  meta: {
    versionId: '456',
  },
};

const encounterHistory: Bundle = {
  resourceType: 'Bundle',
  type: 'history',
  entry: [
    {
      resource: encounter,
    },
  ],
};

const communications: Bundle = {
  resourceType: 'Bundle',
  entry: [
    {
      resource: {
        resourceType: 'Communication',
        id: randomUUID(),
        meta: {
          lastUpdated: new Date().toISOString(),
          author: {
            reference: 'Practitioner/123',
          },
        },
        payload: [
          {
            contentString: 'Hello world',
          },
        ],
      },
    },
  ],
};

const media: Bundle = {
  resourceType: 'Bundle',
  entry: [
    {
      resource: {
        resourceType: 'Media',
        id: randomUUID(),
        meta: {
          lastUpdated: new Date().toISOString(),
          author: {
            reference: 'Practitioner/123',
          },
        },
        content: {
          contentType: 'text/plain',
          url: 'https://example.com/test.txt',
        },
      },
    },
  ],
};

const newComment: Communication = {
  resourceType: 'Communication',
  id: randomUUID(),
  payload: [
    {
      contentString: 'Test comment',
    },
  ],
};

const newMedia: Media = {
  resourceType: 'Media',
  id: randomUUID(),
  content: {
    contentType: 'text/plain',
    url: 'https://example.com/test2.txt',
  },
};

const medplum = new MockClient({
  'auth/login': {
    POST: {
      profile: { reference: 'Practitioner/123' },
    },
  },
  'fhir/R4/Encounter/123': {
    GET: encounter,
  },
  'fhir/R4': {
    POST: {
      resourceType: 'Bundle',
      type: 'batch-response',
      entry: [{ resource: encounterHistory }, { resource: communications }, { resource: media }],
    },
  },
  'fhir/R4/Communication': {
    POST: newComment,
  },
  'fhir/R4/Media': {
    POST: newMedia,
  },
});

describe('EncounterTimeline', () => {
  const setup = (args: EncounterTimelineProps) => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <EncounterTimeline {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Renders reference', async () => {
    setup({ encounter: { reference: 'Encounter/' + encounter.id } });

    await act(async () => {
      await waitFor(() => screen.getAllByTestId('timeline-item'));
    });

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
    expect(items.length).toEqual(3);
  });

  test('Renders resource', async () => {
    setup({ encounter });

    await act(async () => {
      await waitFor(() => screen.getAllByTestId('timeline-item'));
    });

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
    expect(items.length).toEqual(3);
  });

  test('Create comment', async () => {
    setup({ encounter });

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
    setup({ encounter });

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
