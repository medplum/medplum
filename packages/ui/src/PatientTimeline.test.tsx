import { Bundle, Communication, Media, Patient, Practitioner } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { randomUUID } from 'crypto';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { MockClient } from './MockClient';
import { PatientTimeline, PatientTimelineProps } from './PatientTimeline';

const patient: Patient = {
  resourceType: 'Patient',
  id: '123',
  meta: {
    versionId: '456',
  },
};

const patientHistory: Bundle = {
  resourceType: 'Bundle',
  type: 'history',
  entry: [
    {
      resource: patient,
    },
  ],
};

const practitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: '123',
  name: [
    {
      given: ['John'],
      family: 'Doe',
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

const serviceRequest: Bundle = {
  resourceType: 'Bundle',
  entry: [
    {
      resource: {
        resourceType: 'ServiceRequest',
        id: randomUUID(),
        meta: {
          lastUpdated: new Date().toISOString(),
          author: {
            reference: 'Practitioner/123',
          },
        },
        code: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: 'SERVICE_REQUEST_CODE',
            },
          ],
        },
      },
    },
  ],
};

const serviceRequestStructureBundle: Bundle = {
  resourceType: 'Bundle',
  entry: [
    {
      resource: {
        resourceType: 'StructureDefinition',
        name: 'ServiceRequest',
        snapshot: {
          element: [
            {
              path: 'ServiceRequest.id',
              type: [
                {
                  code: 'code',
                },
              ],
            },
            {
              path: 'ServiceRequest.code',
              type: [
                {
                  code: 'CodeableConcept',
                },
              ],
            },
          ],
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
  'fhir/R4/Patient/123': {
    GET: patient,
  },
  'fhir/R4/Practitioner/123': {
    GET: practitioner,
  },
  'fhir/R4': {
    POST: {
      resourceType: 'Bundle',
      type: 'batch-response',
      entry: [
        { resource: patientHistory },
        { resource: communications },
        { resource: media },
        { resource: serviceRequest },
      ],
    },
  },
  'fhir/R4/Communication': {
    POST: newComment,
  },
  'fhir/R4/Media': {
    POST: newMedia,
  },
  'fhir/R4/StructureDefinition?name:exact=ServiceRequest': {
    GET: serviceRequestStructureBundle,
  },
});

describe('PatientTimeline', () => {
  const setup = (args: PatientTimelineProps) => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <PatientTimeline {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Renders reference', async () => {
    setup({ patient: { reference: 'Patient/' + patient.id } });

    await act(async () => {
      await waitFor(() => screen.getAllByTestId('timeline-item'));
    });

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
    expect(items.length).toEqual(4);
    expect(screen.getByText('SERVICE_REQUEST_CODE')).toBeInTheDocument();
  });

  test('Renders resource', async () => {
    setup({ patient });

    await act(async () => {
      await waitFor(() => screen.getAllByTestId('timeline-item'));
    });

    const items = screen.getAllByTestId('timeline-item');
    expect(items).toBeDefined();
    expect(items.length).toEqual(4);
    expect(screen.getByText('SERVICE_REQUEST_CODE')).toBeInTheDocument();
  });

  test('Create comment', async () => {
    setup({ patient });

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
    expect(items.length).toEqual(5);
  });

  test('Upload media', async () => {
    setup({ patient });

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
    expect(items.length).toEqual(5);
  });
});
