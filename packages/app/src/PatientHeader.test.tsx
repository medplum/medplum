import { Patient } from '@medplum/fhirtypes';
import { MedplumProvider, MockClient } from '@medplum/ui';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { PatientHeader } from './PatientHeader';

const medplum = new MockClient({});

describe('PatientHeader', () => {

  const setup = (patient: Patient) => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <PatientHeader patient={patient} />
        </MedplumProvider>
      </MemoryRouter>
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

    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
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

    expect(screen.getByText('abc')).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();
    expect(screen.getByText('def')).toBeInTheDocument();
    expect(screen.getByText('456')).toBeInTheDocument();
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
    expect(avatar).toBeDefined();
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
    expect(avatar).toBeDefined();
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
    expect(avatar).toBeDefined();
    expect(avatar.style.backgroundColor).toEqual('rgb(108, 181, 120)');
  });

  test('Age in years day after birthday', async () => {
    const birthDate = new Date();
    birthDate.setUTCHours(0, 0, 0, 0);
    birthDate.setUTCFullYear(birthDate.getUTCFullYear() - 30);
    birthDate.setUTCDate(birthDate.getUTCDate() - 1);

    setup({
      resourceType: 'Patient',
      name: [{
        given: ['Unknown'],
        family: 'Smith'
      }],
      birthDate: birthDate.toISOString().substring(0, 10)
    });

    expect(screen.getByText('030Y')).toBeInTheDocument();
  });

  test('Age in years day before birthday', async () => {
    const birthDate = new Date();
    birthDate.setUTCHours(0, 0, 0, 0);
    birthDate.setUTCFullYear(birthDate.getUTCFullYear() - 30);
    birthDate.setUTCDate(birthDate.getUTCDate() + 1);

    setup({
      resourceType: 'Patient',
      name: [{
        given: ['Unknown'],
        family: 'Smith'
      }],
      birthDate: birthDate.toISOString().substring(0, 10)
    });

    expect(screen.getByText('029Y')).toBeInTheDocument();
  });

  test('Age in months day after birthday', async () => {
    const birthDate = new Date();
    birthDate.setUTCHours(0, 0, 0, 0);
    birthDate.setUTCMonth(birthDate.getUTCMonth() - 20);
    birthDate.setUTCDate(birthDate.getUTCDate() - 1);

    setup({
      resourceType: 'Patient',
      name: [{
        given: ['Unknown'],
        family: 'Smith'
      }],
      birthDate: birthDate.toISOString().substring(0, 10)
    });

    expect(screen.getByText('020M')).toBeInTheDocument();
  });

  test('Age in months day before birthday', async () => {
    const birthDate = new Date();
    birthDate.setUTCHours(0, 0, 0, 0);
    birthDate.setUTCMonth(birthDate.getUTCMonth() - 20);
    birthDate.setUTCDate(birthDate.getUTCDate() + 2);

    setup({
      resourceType: 'Patient',
      name: [{
        given: ['Unknown'],
        family: 'Smith'
      }],
      birthDate: birthDate.toISOString().substring(0, 10)
    });

    expect(screen.getByText('019M')).toBeInTheDocument();
  });

});
