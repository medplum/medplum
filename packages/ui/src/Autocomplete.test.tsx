import { MedplumClient } from '@medplum/core';
import React from 'react';
import ReactDOM from 'react-dom';
import { Autocomplete } from './Autocomplete';
import { MedplumProvider } from './MedplumProvider';

jest.useFakeTimers();

const mockRouter = {
  push: (path: string, state: any) => {
    alert('Navigate to: ' + path + ' (state=' + JSON.stringify(state) + ')');
  },
  listen: () => (() => undefined) // Return mock "unlisten" handler
}

function mockFetch(url: string, options: any): Promise<any> {
  const response: any = {
    request: {
      url,
      options
    }
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

test('Autocomplete renders', () => {
  const div = document.createElement('div');

  ReactDOM.render((
    <MedplumProvider medplum={medplum} router={mockRouter}>
      <Autocomplete id="foo" resourceType="Patient" />
    </MedplumProvider>
  ), div);
});
