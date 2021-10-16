import { MedplumClient, Patient } from '@medplum/core';
import { render, waitFor } from '@testing-library/react';
import { randomUUID } from 'crypto';
import React from 'react';
import { Avatar, AvatarProps } from './Avatar';
import { MedplumProvider } from './MedplumProvider';

const patient: Patient = {
  resourceType: 'Patient',
  id: randomUUID(),
  name: [{
    given: ['Alice'],
    family: 'Smith'
  }],
  photo: [{
    contentType: 'image/jpeg',
    url: 'https://example.com/picture.jpg'
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

describe('Avatar', () => {

  beforeAll(async () => {
    global.URL.createObjectURL = jest.fn(() => 'details');
    await medplum.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
  });

  const setup = (args: AvatarProps) => {
    return render(
      <MedplumProvider medplum={medplum} router={mockRouter}>
        <Avatar {...args} />
      </MedplumProvider>
    );
  };

  test('Avatar renders system', () => {
    const utils = setup({ value: { reference: 'system' } });
    expect(utils.getByText('S')).not.toBeUndefined();
  });

  test('Avatar renders initials', () => {
    const utils = setup({ alt: 'Alice Smith' });
    expect(utils.getByTestId('avatar')).not.toBeUndefined();
  });

  test('Avatar renders resource directly', async () => {
    const utils = setup({
      value: patient
    });

    await waitFor(() => utils.getByTestId('avatar'));

    expect(utils.getByTestId('avatar')).not.toBeUndefined();
  });

  test('Avatar renders resource directly as link', async () => {
    const utils = setup({
      value: patient,
      link: true
    });

    await waitFor(() => utils.getByTestId('avatar'));

    expect(utils.getByTestId('avatar')).not.toBeUndefined();
  });

  test('Avatar renders after loading the resource', async () => {
    const utils = setup({
      value: {
        reference: 'Patient/' + patient.id
      }
    });

    await waitFor(() => utils.getByTestId('avatar'));

    expect(utils.getByTestId('avatar')).not.toBeUndefined();
  });

});
