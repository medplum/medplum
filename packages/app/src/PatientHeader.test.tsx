import { MedplumClient, Patient } from '@medplum/core';
import { MedplumProvider } from '@medplum/ui';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { PatientHeader } from './PatientHeader';

const mockRouter = {
  push: (path: string, state: any) => {
    console.log('Navigate to: ' + path + ' (state=' + JSON.stringify(state) + ')');
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

describe('PatientHeader', () => {

  beforeAll(async () => {
    await medplum.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
  });

  const setup = (patient: Patient) => {
    return render(
      <MedplumProvider medplum={medplum} router={mockRouter}>
        <PatientHeader patient={patient} />
      </MedplumProvider>
    );
  };

  test('Renders', async () => {
    setup({
      resourceType: 'Patient',
      name: [{
        given: ['Alice'],
        family: 'Smith'
      }]
    });

    expect(screen.getByText('Alice Smith')).not.toBeUndefined();
  });

  test('Renders identifiers', async () => {
    setup({
      resourceType: 'Patient',
      name: [{
        given: ['Alice'],
        family: 'Smith'
      }],
      identifier: [
        { system: 'abc', value: '123' },
        { system: 'def', value: '456' }
      ]
    });

    expect(screen.getByText('abc')).not.toBeUndefined();
    expect(screen.getByText('123')).not.toBeUndefined();
    expect(screen.getByText('def')).not.toBeUndefined();
    expect(screen.getByText('456')).not.toBeUndefined();
  });

  test('Male avatar', async () => {
    setup({
      resourceType: 'Patient',
      name: [{
        given: ['Bob'],
        family: 'Jones'
      }],
      gender: 'male'
    });

    const avatar = screen.getByTestId('avatar');
    expect(avatar).not.toBeUndefined();
    expect(avatar.style.backgroundColor).toEqual('rgb(121, 163, 210)');
  });

  test('Female avatar', async () => {
    setup({
      resourceType: 'Patient',
      name: [{
        given: ['Alice'],
        family: 'Smith'
      }],
      gender: 'female'
    });

    const avatar = screen.getByTestId('avatar');
    expect(avatar).not.toBeUndefined();
    expect(avatar.style.backgroundColor).toEqual('rgb(197, 134, 134)');
  });

  test('Other gender avatar', async () => {
    setup({
      resourceType: 'Patient',
      name: [{
        given: ['Unknown'],
        family: 'Smith'
      }],
      gender: 'other'
    });

    const avatar = screen.getByTestId('avatar');
    expect(avatar).not.toBeUndefined();
    expect(avatar.style.backgroundColor).toEqual('rgb(108, 181, 120)');
  });

  test('Age in years day after birthday', async () => {
    const birthDate = new Date();
    birthDate.setFullYear(birthDate.getFullYear() - 30);
    birthDate.setDate(birthDate.getDate() - 1);

    setup({
      resourceType: 'Patient',
      name: [{
        given: ['Unknown'],
        family: 'Smith'
      }],
      birthDate: birthDate.toISOString().substring(0, 10)
    });

    expect(screen.getByText('030Y')).not.toBeUndefined();
  });

  test('Age in years day before birthday', async () => {
    const birthDate = new Date();
    birthDate.setFullYear(birthDate.getFullYear() - 30);
    birthDate.setDate(birthDate.getDate() + 1);

    setup({
      resourceType: 'Patient',
      name: [{
        given: ['Unknown'],
        family: 'Smith'
      }],
      birthDate: birthDate.toISOString().substring(0, 10)
    });

    expect(screen.getByText('029Y')).not.toBeUndefined();
  });

  test('Age in months day after birthday', async () => {
    const birthDate = new Date();
    birthDate.setFullYear(birthDate.getFullYear() - 2);
    birthDate.setMonth(birthDate.getMonth() + 5);
    birthDate.setDate(birthDate.getDate() - 1);

    setup({
      resourceType: 'Patient',
      name: [{
        given: ['Unknown'],
        family: 'Smith'
      }],
      birthDate: birthDate.toISOString().substring(0, 10)
    });

    expect(screen.getByText('020M')).not.toBeUndefined();
  });

  test('Age in months day before birthday', async () => {
    const birthDate = new Date();
    birthDate.setFullYear(birthDate.getFullYear() - 2);
    birthDate.setMonth(birthDate.getMonth() + 5);
    birthDate.setDate(birthDate.getDate() + 1);

    setup({
      resourceType: 'Patient',
      name: [{
        given: ['Unknown'],
        family: 'Smith'
      }],
      birthDate: birthDate.toISOString().substring(0, 10)
    });

    expect(screen.getByText('019M')).not.toBeUndefined();
  });

});
