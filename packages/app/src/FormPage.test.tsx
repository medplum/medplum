import { MedplumClient, notFound, Practitioner, Questionnaire, User } from '@medplum/core';
import { MedplumProvider } from '@medplum/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Switch } from 'react-router-dom';
import { FormPage } from './FormPage';

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

const questionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  id: '123',
  item: [{
    linkId: '1',
    text: 'First question',
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
  } else if (method === 'GET' && url.endsWith('/fhir/R4/Practitioner/123')) {
    result = practitioner;
  } else if (method === 'GET' && url.endsWith('/fhir/R4/Questionnaire/not-found')) {
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

describe('FormPage', () => {

  beforeAll(async () => {
    await medplum.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
  });

  const setup = (url: string) => {
    return render(
      <MedplumProvider medplum={medplum} router={mockRouter}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <Switch>
            <Route exact path="/forms/:id"><FormPage /></Route>
          </Switch>
        </MemoryRouter>
      </MedplumProvider>
    );
  };

  test('Not found', async () => {
    setup('/forms/not-found');

    await act(async () => {
      await waitFor(() => screen.getByTestId('error'));
    });

    expect(screen.getByTestId('error')).not.toBeUndefined();
  });

  test('Form renders', async () => {
    setup('/forms/123');

    await act(async () => {
      await waitFor(() => screen.getByText('First question'));
    });

    expect(screen.getByText('First question')).not.toBeUndefined();
  });

  test('Submit', async () => {
    setup('/forms/123');

    await act(async () => {
      await waitFor(() => screen.getByText('First question'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(screen.getByText('First question')).not.toBeUndefined();
  });

});
