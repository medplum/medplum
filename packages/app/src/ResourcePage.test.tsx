import { notFound } from '@medplum/core';
import { Bot, Bundle, DiagnosticReport, Patient, Practitioner, Questionnaire } from '@medplum/fhirtypes';
import { MedplumProvider, MockClient } from '@medplum/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from './HomePage';
import { ResourcePage } from './ResourcePage';

const practitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: '123',
  name: [{ given: ['Medplum'], family: 'Admin' }],
  meta: {
    versionId: '456',
    lastUpdated: '2021-01-01T12:00:00Z',
    author: {
      reference: 'Practitioner/123',
    },
  },
};

const practitionerHistory: Bundle = {
  resourceType: 'Bundle',
  type: 'history',
  entry: [
    {
      resource: practitioner,
    },
  ],
};

const practitionerStructureBundle: Bundle = {
  resourceType: 'Bundle',
  entry: [
    {
      resource: {
        resourceType: 'StructureDefinition',
        name: 'Practitioner',
        snapshot: {
          element: [
            {
              path: 'Practitioner.id',
              type: [
                {
                  code: 'code',
                },
              ],
            },
            {
              path: 'Practitioner.name',
              type: [
                {
                  code: 'HumanName',
                },
              ],
              max: '*',
            },
            {
              path: 'Practitioner.gender',
              type: [
                {
                  code: 'code',
                },
              ],
            },
          ],
        },
      },
    },
  ],
};

const practitionerSearchParameter: Bundle = {
  resourceType: 'Bundle',
  entry: [
    {
      resource: {
        resourceType: 'SearchParameter',
        id: 'Practitioner-name',
        code: 'name',
        name: 'name',
      },
    },
  ],
};

const patient: Patient = {
  resourceType: 'Patient',
  id: '123',
  identifier: [
    { system: 'abc', value: '123' },
    { system: 'def', value: '456' },
  ],
  name: [
    {
      given: ['Alice'],
      family: 'Smith',
    },
  ],
  birthDate: '1990-01-01',
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

const patientSearchBundle: Bundle = {
  resourceType: 'Bundle',
  total: 100,
  entry: [
    {
      resource: patient,
    },
  ],
};

const questionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  id: '123',
  item: [
    {
      linkId: '1',
      text: 'Hello',
      type: 'string',
    },
  ],
};

const bot: Bot = {
  resourceType: 'Bot',
  id: '123',
  name: 'Test Bot',
  code: 'console.log("hello world");',
};

const diagnosticReport: DiagnosticReport = {
  resourceType: 'DiagnosticReport',
  id: '123',
  status: 'final',
  result: [{ reference: 'Observation/123' }],
};

const medplum = new MockClient({
  'fhir/R4/StructureDefinition?name:exact=Practitioner': {
    GET: practitionerStructureBundle,
  },
  'fhir/R4/SearchParameter?name=Practitioner': {
    GET: practitionerSearchParameter,
  },
  'fhir/R4/Patient?': {
    GET: patientSearchBundle,
  },
  'fhir/R4/Patient/123': {
    GET: patient,
  },
  'fhir/R4/Patient/123/_history': {
    GET: patientSearchBundle,
  },
  'fhir/R4/Practitioner/123': {
    GET: practitioner,
    PUT: practitioner,
  },
  'fhir/R4/Practitioner/123/_history': {
    GET: practitionerHistory,
  },
  'fhir/R4/Practitioner/not-found': {
    GET: notFound,
  },
  'fhir/R4/Questionnaire/123': {
    GET: questionnaire,
  },
  'fhir/R4/Bot/123': {
    GET: bot,
  },
  'fhir/R4/DiagnosticReport/123': {
    GET: diagnosticReport,
  },
  'fhir/R4': {
    POST: {
      resourceType: 'Bundle',
      type: 'batch-response',
      entry: [{ resource: patientHistory }],
    },
  },
});

describe('ResourcePage', () => {
  const setup = (url: string) => {
    return render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <Routes>
            <Route path="/:resourceType/:id/:tab" element={<ResourcePage />} />
            <Route path="/:resourceType/:id" element={<ResourcePage />} />
            <Route path="/:resourceType" element={<HomePage />} />
          </Routes>
        </MemoryRouter>
      </MedplumProvider>
    );
  };

  test('Not found', async () => {
    setup('/Practitioner/not-found');

    await act(async () => {
      await waitFor(() => screen.getByText('Resource not found'));
    });

    expect(screen.getByText('Resource not found')).toBeInTheDocument();
  });

  test('Details tab renders', async () => {
    setup('/Practitioner/123');

    await act(async () => {
      await waitFor(() => screen.getByText('Name'));
    });

    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  test('Edit tab renders', async () => {
    setup('/Practitioner/123/edit');

    await act(async () => {
      await waitFor(() => screen.getByText('Edit'));
    });

    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  test('Delete button confirm', async () => {
    window.confirm = jest.fn(() => true);

    setup('/Practitioner/123/edit');

    await act(async () => {
      await waitFor(() => screen.getByText('Delete'));
    });

    expect(screen.getByText('Delete')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });

    expect(window.confirm).toHaveBeenCalled();
  });

  test('Delete button decline', async () => {
    window.confirm = jest.fn(() => false);

    setup('/Practitioner/123/edit');

    await act(async () => {
      await waitFor(() => screen.getByText('Delete'));
    });

    expect(screen.getByText('Delete')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });

    expect(window.confirm).toHaveBeenCalled();
  });

  test('History tab renders', async () => {
    setup('/Practitioner/123/history');

    await act(async () => {
      await waitFor(() => screen.getByText('History'));
    });

    expect(screen.getByText('History')).toBeInTheDocument();
  });

  test('Blame tab renders', async () => {
    setup('/Practitioner/123/blame');

    await act(async () => {
      await waitFor(() => screen.getByText('Blame'));
    });

    expect(screen.getByText('Blame')).toBeInTheDocument();
  });

  test('JSON tab renders', async () => {
    setup('/Practitioner/123/json');

    await act(async () => {
      await waitFor(() => screen.getByTestId('resource-json'));
    });

    expect(screen.getByTestId('resource-json')).toBeInTheDocument();
  });

  test('JSON submit', async () => {
    setup('/Practitioner/123/json');

    await act(async () => {
      await waitFor(() => screen.getByTestId('resource-json'));
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('resource-json'), {
        target: { value: '{"resourceType":"Practitioner","id":"123"}' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(screen.getByTestId('resource-json')).toBeInTheDocument();
  });

  test('JSON submit with meta', async () => {
    setup('/Practitioner/123/json');

    await act(async () => {
      await waitFor(() => screen.getByTestId('resource-json'));
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('resource-json'), {
        target: {
          value: JSON.stringify({
            resourceType: 'Practitioner',
            id: '123',
            meta: {
              lastUpdated: '2020-01-01T00:00:00.000Z',
              author: {
                reference: 'Practitioner/111',
              },
            },
          }),
        },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(screen.getByTestId('resource-json')).toBeInTheDocument();
  });

  test('Patient timeline', async () => {
    setup('/Patient/123/timeline');

    await act(async () => {
      await waitFor(() => screen.getByText('Timeline'));
    });

    expect(screen.getByText('Timeline')).toBeInTheDocument();

    // Expect identifiers
    expect(screen.getByText('abc')).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();
    expect(screen.getByText('def')).toBeInTheDocument();
    expect(screen.getByText('456')).toBeInTheDocument();
  });

  test('Encounter timeline', async () => {
    setup('/Encounter/123/timeline');

    await act(async () => {
      await waitFor(() => screen.getByText('Timeline'));
    });

    expect(screen.getByText('Timeline')).toBeInTheDocument();
  });

  test('Questionnaire builder', async () => {
    setup('/Questionnaire/123/builder');

    await act(async () => {
      await waitFor(() => screen.getByText('OK'));
    });

    expect(screen.getByText('OK')).toBeDefined();
  });

  test('Questionnaire preview', async () => {
    setup('/Questionnaire/123/preview');

    await act(async () => {
      await waitFor(() => screen.getByText('Preview'));
    });

    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  test('Bot editor', async () => {
    setup('/Bot/123/editor');

    await act(async () => {
      await waitFor(() => screen.getByText('Editor'));
    });

    expect(screen.getByText('Editor')).toBeInTheDocument();
  });

  test('DiagnosticReport display', async () => {
    setup('/DiagnosticReport/123/report');

    await act(async () => {
      await waitFor(() => screen.getByText('Report'));
    });

    expect(screen.getByText('Report')).toBeInTheDocument();
  });
});
