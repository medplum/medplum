import { Bundle, MedplumClient } from '@medplum/core';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { randomUUID } from 'crypto';
import React from 'react';
import { Autocomplete } from './Autocomplete';
import { MedplumProvider } from './MedplumProvider';

const mockRouter = {
  push: (path: string, state: any) => {
    alert('Navigate to: ' + path + ' (state=' + JSON.stringify(state) + ')');
  },
  listen: () => (() => undefined) // Return mock "unlisten" handler
}

function mockFetch(url: string, options: any): Promise<any> {
  const bundle: Bundle = {
    resourceType: 'Bundle',
    entry: [{
      resource: {
        resourceType: 'Patient',
        id: randomUUID(),
        name: [{
          given: ['Alice'],
          family: 'Smith'
        }]
      }
    }]
  }

  const response: any = {
    request: {
      url,
      options
    },
    ...bundle
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

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(async () => {
  act(() => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
});

const setup = () => {
  const utils = render(
    <MedplumProvider medplum={medplum} router={mockRouter}>
      <Autocomplete id="foo" resourceType="Patient" />
    </MedplumProvider>
  );

  const input = utils.getByTestId('input-element') as HTMLInputElement;

  return {
    input,
    ...utils
  }
};

test('Autocomplete renders', () => {
  const { input } = setup();
  expect(input.value).toBe('');
});

test('Autocomplete handles input', async (done) => {
  const utils = setup();
  const input = utils.input;

  await act(async () => {
    fireEvent.change(input, { target: { value: 'Alice' } });
  });

  expect(input.value).toBe('Alice');

  await act(async () => {
    jest.advanceTimersByTime(1000);
    await waitFor(() => utils.getByTestId('dropdown'));
  });

  const dropdown = utils.getByTestId('dropdown');
  expect(dropdown).not.toBeUndefined();
  done();
});
