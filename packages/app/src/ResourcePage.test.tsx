import { Bundle, MedplumClient, notFound, Patient, Practitioner, Questionnaire, User } from '@medplum/core';
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
}

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
      await waitFor(() => screen.getByTestId('error'));
    });

    expect(screen.getByTestId('error')).not.toBeUndefined();
  });

  test('Details tab renders', async () => {
    setup('/Practitioner/123');

    await act(async () => {
      await waitFor(() => screen.getByText('Resource Type'));
    });

    expect(screen.getByText('Resource Type')).not.toBeUndefined();
  });

  test('Edit tab renders', async () => {
    setup('/Practitioner/123/edit');

    await act(async () => {
      await waitFor(() => screen.getByText('Edit'));
    });

    expect(screen.getByText('Edit')).not.toBeUndefined();
  });

  test('History tab renders', async () => {
    setup('/Practitioner/123/history');

    await act(async () => {
      await waitFor(() => screen.getByText('History'));
    });

    expect(screen.getByText('History')).not.toBeUndefined();
  });

  test('Blame tab renders', async () => {
    setup('/Practitioner/123/blame');

    await act(async () => {
      await waitFor(() => screen.getByText('Blame'));
    });

    expect(screen.getByText('Blame')).not.toBeUndefined();
  });

  test('JSON tab renders', async () => {
    setup('/Practitioner/123/json');

    await act(async () => {
      await waitFor(() => screen.getByTestId('resource-json'));
    });

    expect(screen.getByTestId('resource-json')).not.toBeUndefined();
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

    expect(screen.getByTestId('resource-json')).not.toBeUndefined();
  });

  test('Patient timeline', async () => {
    setup('/Patient/123/timeline');

    await act(async () => {
      await waitFor(() => screen.getByText('Timeline'));
    });

    expect(screen.getByText('Timeline')).not.toBeUndefined();

    // Expect identifiers
    expect(screen.getByText('abc')).not.toBeUndefined();
    expect(screen.getByText('123')).not.toBeUndefined();
    expect(screen.getByText('def')).not.toBeUndefined();
    expect(screen.getByText('456')).not.toBeUndefined();
  });

  test('Encounter timeline', async () => {
    setup('/Encounter/123/timeline');

    await act(async () => {
      await waitFor(() => screen.getByText('Timeline'));
    });

    expect(screen.getByText('Timeline')).not.toBeUndefined();
  });

  test('Questionnaire preview', async () => {
    setup('/Questionnaire/123/preview');

    await act(async () => {
      await waitFor(() => screen.getByText('Preview'));
    });

    expect(screen.getByText('Preview')).not.toBeUndefined();
  });

});
