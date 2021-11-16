import { Bundle, MedplumClient, Practitioner, User } from '@medplum/core';
import { MedplumProvider } from '@medplum/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Switch } from 'react-router-dom';
import { CreateResourcePage } from './CreateResourcePage';

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
      profile: 'Practitioner/123'
    };
  } else if (method === 'GET' && url.includes('/fhir/R4/StructureDefinition?name:exact=Practitioner')) {
    result = practitionerStructureBundle;
  } else if (method === 'GET' && url.includes('/fhir/R4/SearchParameter?name=Practitioner')) {
    result = practitionerSearchParameter;
  } else if (method === 'GET' && url.includes('/fhir/R4/Practitioner/123')) {
    result = practitioner;
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

describe('CreateResourcePage', () => {

  beforeAll(async () => {
    await medplum.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
  });

  const setup = (url: string) => {
    return render(
      <MedplumProvider medplum={medplum} router={mockRouter}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <Switch>
            <Route exact path="/:resourceType/new"><CreateResourcePage /></Route>
          </Switch>
        </MemoryRouter>
      </MedplumProvider>
    );
  };

  test('Renders new Practitioner page', async () => {
    setup('/Practitioner/new');

    await act(async () => {
      await waitFor(() => screen.getByText('New Practitioner'));
    });

    expect(screen.getByText('New Practitioner')).toBeInTheDocument();
  });


  test('Submit new Practitioner', async () => {
    setup('/Practitioner/new');

    await act(async () => {
      await waitFor(() => screen.getByText('OK'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });
  });
});
