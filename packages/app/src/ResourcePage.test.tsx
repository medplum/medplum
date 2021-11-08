import { Bot, Bundle, DiagnosticReport, MedplumClient, notFound, Patient, Practitioner, Questionnaire, User } from '@medplum/core';
import { MedplumProvider } from '@medplum/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Switch } from 'react-router-dom';
import { ResourcePage } from './ResourcePage';

const user: User = {
  resourceType: 'User',
  id: '123'
};

const practitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: '123',
  name: [{ given: ['Medplum'], family: 'Admin' }],
  meta: {
    versionId: '456',
    lastUpdated: '2021-01-01T12:00:00Z',
    author: {
      reference: 'Practitioner/123'
    }
  }
};

const practitionerHistory: Bundle = {
  resourceType: 'Bundle',
  entry: [{
    resource: practitioner
  }]
};

const practitionerStructureBundle: Bundle = {
  resourceType: 'Bundle',
  entry: [{
    resource: {
      resourceType: 'StructureDefinition',
      name: 'Practitioner',
      snapshot: {
        element: [
          {
            path: 'Practitioner.id',
            type: [{
              code: 'code'
            }]
          }
        ]
      }
    }
  }]
};

const practitionerSearchParameter: Bundle = {
  resourceType: 'Bundle',
  entry: [{
    resource: {
      resourceType: 'SearchParameter',
      id: 'Practitioner-name',
      code: 'name',
      name: 'name'
    }
  }]
};

const patient: Patient = {
  resourceType: 'Patient',
  id: '123',
  identifier: [
    { system: 'abc', value: '123' },
    { system: 'def', value: '456' }
  ],
  name: [{
    given: ['Alice'],
    family: 'Smith'
  }],
  birthDate: '1990-01-01'
};

const patientSearchBundle: Bundle = {
  resourceType: 'Bundle',
  total: 100,
  entry: [{
    resource: patient
  }]
};

const questionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  id: '123',
  item: [{
    linkId: '1',
    text: 'Hello',
    type: 'string'
  }]
};

const bot: Bot = {
  resourceType: 'Bot',
  id: '123',
  name: 'Test Bot',
  code: 'console.log("hello world");'
};

const diagnosticReport: DiagnosticReport = {
  resourceType: 'DiagnosticReport',
  id: '123',
  status: 'final',
  result: [
    { reference: 'Observation/123' }
  ]
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

  if (method === 'POST' && url.endsWith('/auth/login')) {
    result = {
      user,
      profile: practitioner
    };
  } else if (method === 'GET' && url.includes('/fhir/R4/StructureDefinition?name:exact=Practitioner')) {
    result = practitionerStructureBundle;
  } else if (method === 'GET' && url.includes('/fhir/R4/SearchParameter?name=Practitioner')) {
    result = practitionerSearchParameter;
  } else if (method === 'GET' && url.includes('/fhir/R4/Patient?')) {
    result = patientSearchBundle;
  } else if (method === 'GET' && url.includes('/fhir/R4/Patient/123')) {
    result = patient;
  } else if (method === 'GET' && url.includes('/fhir/R4/Patient/123/_history')) {
    result = patientSearchBundle;
  } else if (method === 'GET' && url.endsWith('/fhir/R4/Practitioner/123')) {
    result = practitioner;
  } else if (method === 'PUT' && url.endsWith('/fhir/R4/Practitioner/123')) {
    result = practitioner;
  } else if (method === 'GET' && url.endsWith('/fhir/R4/Practitioner/123/_history')) {
    result = practitionerHistory;
  } else if (method === 'GET' && url.endsWith('/fhir/R4/Practitioner/not-found')) {
    result = notFound
  } else if (method === 'GET' && url.endsWith('/fhir/R4/Questionnaire/123')) {
    result = questionnaire;
  } else if (method === 'GET' && url.includes('/fhir/R4/Bot/123')) {
    result = bot;
  } else if (method === 'GET' && url.includes('/fhir/R4/DiagnosticReport/123')) {
    result = diagnosticReport;
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

describe('ResourcePage', () => {

  beforeAll(async () => {
    await medplum.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
  });

  const setup = (url: string) => {
    return render(
      <MedplumProvider medplum={medplum} router={mockRouter}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <Switch>
            <Route exact path="/:resourceType/:id/:tab?"><ResourcePage /></Route>
          </Switch>
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
      await waitFor(() => screen.getByText('Resource Type'));
    });

    expect(screen.getByText('Resource Type')).toBeInTheDocument();
  });

  test('Edit tab renders', async () => {
    setup('/Practitioner/123/edit');

    await act(async () => {
      await waitFor(() => screen.getByText('Edit'));
    });

    expect(screen.getByText('Edit')).toBeInTheDocument();
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
      fireEvent.change(screen.getByTestId('resource-json'), { target: { value: '{"resourceType":"Practitioner","id":"123"}' } });
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
      fireEvent.change(
        screen.getByTestId('resource-json'),
        {
          target: {
            value: JSON.stringify({
              resourceType: 'Practitioner',
              id: '123',
              meta: {
                lastUpdated: '2020-01-01T00:00:00.000Z',
                author: {
                  reference: 'Practitioner/111'
                }
              }
            })
          }
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

    expect(screen.getByText('OK')).not.toBeUndefined();
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
