import { MedplumClient, Patient } from '@medplum/core';
import { render, waitFor } from '@testing-library/react';
import { randomUUID } from 'crypto';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { ResourceName, ResourceNameProps } from './ResourceName';

const patient: Patient = {
  resourceType: 'Patient',
  id: randomUUID(),
  name: [{
    given: ['Alice'],
    family: 'Smith'
  }]
};

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
    },
    ...patient
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

const setup = (args: ResourceNameProps) => {
  const utils = render(
    <MedplumProvider medplum={medplum} router={mockRouter}>
      <ResourceName {...args} />
    </MedplumProvider>
  );

  const element = utils.getByTestId('link');

  return {
    element,
    ...utils
  }
};

test('ResourceName renders', () => {
  const { element } = setup({});
  expect(element.innerText).toBeUndefined();
});

test('ResourceName renders resource directly', async (done) => {
  const utils = setup({
    resource: patient
  });

  await waitFor(() => utils.getByText('Alice Smith'));

  expect(utils.getByText('Alice Smith')).not.toBeUndefined();
  done();
});

test('ResourceName renders after loading the resource', async (done) => {
  const utils = setup({
    reference: 'Patient/' + patient.id
  });

  await waitFor(() => utils.getByText('Alice Smith'));

  expect(utils.getByText('Alice Smith')).not.toBeUndefined();
  done();
});
