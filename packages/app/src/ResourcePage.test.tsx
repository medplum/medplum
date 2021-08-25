import { Bundle, MedplumClient, Practitioner, User } from '@medplum/core';
import { MedplumProvider } from '@medplum/ui';
import { act, render, screen, waitFor } from '@testing-library/react';
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

const patientSearchBundle: Bundle = {
  resourceType: 'Bundle',
  total: 100,
  entry: [{
    resource: {
      resourceType: 'Patient',
      id: '123',
      name: [{
        given: ['Alice'],
        family: 'Smith'
      }]
    }
  }]
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
  } else if (method === 'GET' && url.endsWith('/fhir/R4/Practitioner/123')) {
    result = practitioner;
  } else if (method === 'GET' && url.endsWith('/fhir/R4/Practitioner/123/_history')) {
    result = practitionerHistory;
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

  test('Details tab renders', async () => {
    setup('/Practitioner/123');

    await act(async () => {
      await waitFor(() => screen.getByText('Resource Type'));
    });

    const control = screen.getByText('Resource Type');
    expect(control).not.toBeUndefined();
  });

  test('Edit tab renders', async () => {
    setup('/Practitioner/123/edit');

    await act(async () => {
      await waitFor(() => screen.getByText('Edit'));
    });

    const control = screen.getByText('Edit');
    expect(control).not.toBeUndefined();
  });

  test('History tab renders', async () => {
    setup('/Practitioner/123/history');

    await act(async () => {
      await waitFor(() => screen.getByText('History'));
    });

    const control = screen.getByText('History');
    expect(control).not.toBeUndefined();
  });

  test('Blame tab renders', async () => {
    setup('/Practitioner/123/blame');

    await act(async () => {
      await waitFor(() => screen.getByText('Blame'));
    });

    const control = screen.getByText('Blame');
    expect(control).not.toBeUndefined();
  });

  test('JSON tab renders', async () => {
    setup('/Practitioner/123/json');

    await act(async () => {
      await waitFor(() => screen.getByTestId('resource-json'));
    });

    const control = screen.getByTestId('resource-json');
    expect(control).not.toBeUndefined();
  });

});