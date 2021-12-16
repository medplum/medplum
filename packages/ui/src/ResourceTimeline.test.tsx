import { createReference, getReferenceString, ProfileResource } from '@medplum/core';
import { Attachment, Bundle, Communication, Encounter, Media, Resource } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { randomUUID } from 'crypto';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { MockClient } from './MockClient';
import { ResourceTimeline, ResourceTimelineProps } from './ResourceTimeline';

const encounter: Encounter = {
  resourceType: 'Encounter',
  id: '123',
  meta: {
    versionId: '456'
  }
};

const encounterHistory: Bundle = {
  resourceType: 'Bundle',
  type: 'history',
  entry: [{
    resource: encounter
  }]
}

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
          lastUpdated: new Date().toISOString(),
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

const medplum = new MockClient({
  'auth/login': {
    'POST': {
      profile: { reference: 'Practitioner/123' }
    }
  },
  'fhir/R4/Encounter/123': {
    'GET': encounter
  },
  'fhir/R4': {
    'POST': {
      resourceType: 'Bundle',
      type: 'batch-response',
      entry: [
        { resource: encounterHistory },
        { resource: communications },
        { resource: media },
      ]
    }
  },
  'fhir/R4/Communication': {
    'POST': newComment
  },
  'fhir/R4/Media': {
    'POST': newMedia
  },
});

function buildEncounterSearch(encounter: Resource): Bundle {
  return {
    resourceType: 'Bundle',
    type: 'batch',
    entry: [
      {
        request: {
          method: 'GET',
          url: `${getReferenceString(encounter)}/_history`
        }
      },
      {
        request: {
          method: 'GET',
          url: `Communication?encounter=${getReferenceString(encounter)}`
        }
      },
      {
        request: {
          method: 'GET',
          url: `Media?encounter=${getReferenceString(encounter)}`
        }
      }
    ]
  };
}

describe('ResourceTimeline', () => {

  function setup<T extends Resource>(args: ResourceTimelineProps<T>) {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <ResourceTimeline {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders reference', async () => {
    setup({
      value: { reference: 'Encounter/' + encounter.id },
      buildSearchRequests: buildEncounterSearch
    });

    await act(async () => {
      await waitFor(() => screen.getAllByTestId('timeline-item'));
    });

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
    expect(items.length).toEqual(3);
  });

  test('Renders resource', async () => {
    setup({
      value: encounter,
      buildSearchRequests: buildEncounterSearch
    });

    await act(async () => {
      await waitFor(() => screen.getAllByTestId('timeline-item'));
    });

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
    expect(items.length).toEqual(3);
  });

  test('Create comment', async () => {
    setup({
      value: encounter,
      buildSearchRequests: buildEncounterSearch,
      createCommunication: (resource: Encounter, sender: ProfileResource, text: string) => ({
        resourceType: 'Communication',
        encounter: createReference(resource),
        subject: (resource as Encounter).subject,
        sender: createReference(sender),
        payload: [{ contentString: text }]
      })
    });

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
    expect(items).toBeDefined();
    expect(items.length).toEqual(4);
  });

  test('Upload media', async () => {
    setup({
      value: encounter,
      buildSearchRequests: buildEncounterSearch,
      createCommunication: jest.fn(),
      createMedia: (resource: Encounter, operator: ProfileResource, content: Attachment) => ({
        resourceType: 'Media',
        encounter: createReference(resource),
        subject: (resource as Encounter).subject,
        operator: createReference(operator),
        content
      })
    });

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
    expect(items).toBeDefined();
    expect(items.length).toEqual(4);
  });

});
