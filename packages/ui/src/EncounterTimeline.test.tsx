import { Bundle, Communication, Encounter, Media, MedplumClient } from '@medplum/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { randomUUID } from 'crypto';
import React from 'react';
import { EncounterTimeline, EncounterTimelineProps } from './EncounterTimeline';
import { MedplumProvider } from './MedplumProvider';

const encounterId = randomUUID();

const encounter: Encounter = {
  resourceType: 'Encounter',
  id: encounterId
};

const communications: Bundle = {
  resourceType: 'Bundle',
  entry: [
    {
      resource: {
        resourceType: 'Communication',
        id: randomUUID(),
        meta: {
          lastUpdated: new Date(),
          author: {
            reference: 'Practitioner/123'
          }
        },
        payload: [{
          contentString: 'Hello world'
        }]
      }
    }
  ]
};

const media: Bundle = {
  resourceType: 'Bundle',
  entry: [
    {
      resource: {
        resourceType: 'Media',
        id: randomUUID(),
        meta: {
          lastUpdated: new Date(),
          author: {
            reference: 'Practitioner/123'
          }
        },
        content: {
          contentType: 'text/plain',
          url: 'https://example.com/test.txt'
        }
      }
    }
  ]
};

const newComment: Communication = {
  resourceType: 'Communication',
  id: randomUUID(),
  payload: [{
    contentString: 'Test comment'
  }]
};

const newMedia: Media = {
  resourceType: 'Media',
  id: randomUUID(),
  content: {
    contentType: 'text/plain',
    url: 'https://example.com/test2.txt'
  }
};

const mockRouter = {
  push: (path: string, state: any) => {
    console.log('Navigate to: ' + path + ' (state=' + JSON.stringify(state) + ')');
  },
  listen: () => (() => undefined) // Return mock "unlisten" handler
}

function mockFetch(url: string, options: any): Promise<any> {
  const method = options.method ?? 'GET';
  let result: any;

  if (method === 'GET' && url.includes('/fhir/R4/Encounter/' + encounterId)) {
    result = encounter;
  } else if (method === 'GET' && url.includes('/fhir/R4/Communication?')) {
    result = communications;
  } else if (method === 'GET' && url.includes('/fhir/R4/Media?')) {
    result = media;
  } else if (method === 'POST' && url.includes('/fhir/R4/Communication')) {
    result = newComment;
  } else if (method === 'POST' && url.includes('/fhir/R4/Media')) {
    result = newMedia;
  }

  const response: any = {
    request: {
      url,
      options
    },
    ...result
  };

  return Promise.resolve({
    blob: () => Promise.resolve(response),
    json: () => Promise.resolve(response)
  });
}

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: mockFetch
});

beforeAll(async () => {
  await medplum.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
});

const setup = (args?: EncounterTimelineProps) => {
  return render(
    <MedplumProvider medplum={medplum} router={mockRouter}>
      <EncounterTimeline {...args} />
    </MedplumProvider>
  );
};

test('EncounterTimeline renders reference', async (done) => {
  setup({ reference: { reference: 'Encounter/' + encounterId } });

  await act(async () => {
    await waitFor(() => screen.getAllByTestId('timeline-item'));
  });

  const items = screen.getAllByTestId('timeline-item');
  expect(items).not.toBeUndefined();
  expect(items.length).toEqual(2);
  done();
});

test('EncounterTimeline renders resource', async (done) => {
  setup({ resource: encounter });

  await act(async () => {
    await waitFor(() => screen.getAllByTestId('timeline-item'));
  });

  const items = screen.getAllByTestId('timeline-item');
  expect(items).not.toBeUndefined();
  expect(items.length).toEqual(2);
  done();
});

test('EncounterTimeline create comment', async (done) => {
  setup({ resource: encounter });

  // Wait for initial load
  await act(async () => {
    await waitFor(() => screen.getAllByTestId('timeline-item'));
  });

  // Enter the comment text
  await act(async () => {
    fireEvent.change(screen.getByTestId('timeline-input'), { target: { value: 'Test comment' } });
  });

  // Submit the form
  await act(async () => {
    fireEvent.submit(screen.getByTestId('timeline-form'), { target: { text: 'Test comment' } });
  });

  // Wait for new comment
  await act(async () => {
    await waitFor(() => screen.getAllByTestId('timeline-item'));
  });

  const items = screen.getAllByTestId('timeline-item');
  expect(items).not.toBeUndefined();
  expect(items.length).toEqual(3);
  done();
});

test('EncounterTimeline upload media', async (done) => {
  setup({ resource: encounter });

  // Wait for initial load
  await act(async () => {
    await waitFor(() => screen.getAllByTestId('timeline-item'));
  });

  // Upload the file
  await act(async () => {
    const files = [
      new File(['hello'], 'hello.txt', { type: 'text/plain' })
    ];
    fireEvent.change(screen.getByTestId('upload-file-input'), { target: { files } });
  });

  // Wait for new comment
  await act(async () => {
    await waitFor(() => screen.getAllByTestId('timeline-item'));
  });

  const items = screen.getAllByTestId('timeline-item');
  expect(items).not.toBeUndefined();
  expect(items.length).toEqual(3);
  done();
});
