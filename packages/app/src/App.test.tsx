import { Bundle, MedplumClient, Practitioner, User } from '@medplum/core';
import { MedplumProvider } from '@medplum/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { Router } from 'react-router-dom';
import { App } from './App';
import { history } from './history';

const user: User = {
  resourceType: 'User',
  id: '123'
};

const practitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: '123',
  name: [{ given: ['Medplum'], family: 'Admin' }]
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

const patientStructureBundle: Bundle = {
  resourceType: 'Bundle',
  entry: [{
    resource: {
      resourceType: 'StructureDefinition',
      name: 'Patient',
      snapshot: {
        element: [
          {
            path: 'Patient.id',
            type: [{
              code: 'code'
            }]
          }
        ]
      }
    }
  }]
};

const patientSearchParameter: Bundle = {
  resourceType: 'Bundle',
  entry: [{
    resource: {
      resourceType: 'SearchParameter',
      id: 'Patient-name',
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
      profile: 'Practitioner/123'
    };
  } else if (method === 'GET' && url.includes('/fhir/R4/StructureDefinition?name:exact=Practitioner')) {
    result = practitionerStructureBundle;
  } else if (method === 'GET' && url.includes('/fhir/R4/StructureDefinition?name:exact=Patient')) {
    result = patientStructureBundle;
  } else if (method === 'GET' && url.includes('/fhir/R4/SearchParameter?name=Practitioner')) {
    result = practitionerSearchParameter;
  } else if (method === 'GET' && url.includes('/fhir/R4/SearchParameter?name=Patient')) {
    result = patientSearchParameter;
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

beforeAll(async () => {
  await medplum.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
});

const setup = () => {
  return render(
    <MedplumProvider medplum={medplum} router={mockRouter}>
      <Router history={history}>
        <App />
      </Router>
    </MedplumProvider>
  );
};

describe('App', () => {

  test('Renders', async () => {
    setup();

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).not.toBeUndefined();
  });

  test('Click logo', async () => {
    mockRouter.push = jest.fn();

    setup();

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('header-logo'));
    });

    expect(mockRouter.push).toBeCalledWith('/');
  });

  test('Click profile', async () => {
    mockRouter.push = jest.fn();

    setup();

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('header-profile-menu-button'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('header-profile-link'));
    });

    expect(mockRouter.push).toBeCalledWith('/Practitioner/123');
  });

  test('Click sign out', async () => {
    mockRouter.push = jest.fn();

    setup();

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('header-profile-menu-button'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('header-signout-button'));
    });

    expect(mockRouter.push).toBeCalledWith('/signin');
  });

});
