import { Identifier, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '../test-utils/render';
import { PatientHeader } from './PatientHeader';
import { getDefaultColor } from './PatientHeader.utils';

const medplum = new MockClient();

describe('PatientHeader', () => {
  function setup(patient: Patient): void {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <PatientHeader patient={patient} />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders', async () => {
    setup({
      resourceType: 'Patient',
      name: [
        {
          given: ['Alice'],
          family: 'Smith',
        },
      ],
    });

    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  test('Renders identifiers', async () => {
    setup({
      resourceType: 'Patient',
      name: [
        {
          given: ['Alice'],
          family: 'Smith',
        },
      ],
      identifier: [
        { system: 'abc', value: '123' },
        { system: 'def', value: '456' },
      ],
      address: [
        {
          state: 'NY',
        },
      ],
    });

    expect(screen.getByText('abc')).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();
    expect(screen.getByText('def')).toBeInTheDocument();
    expect(screen.getByText('456')).toBeInTheDocument();
    expect(screen.getByText('NY')).toBeInTheDocument();
  });

  test('Handles null identifiers', async () => {
    setup({
      resourceType: 'Patient',
      name: [
        {
          given: ['Alice'],
          family: 'Smith',
        },
      ],
      identifier: [
        null,
        { system: 'system-with-null-value', value: null },
        { system: null, value: 'value-with-null-system' },
        { system: 'def', value: '456' },
      ] as unknown as Identifier[],
    });

    expect(screen.getByText('system-with-null-value')).toBeInTheDocument();
    expect(screen.getByText('value-with-null-system')).toBeInTheDocument();
    expect(screen.getByText('def')).toBeInTheDocument();
    expect(screen.getByText('456')).toBeInTheDocument();
  });

  test('Age in years day after birthday', async () => {
    const birthDate = new Date();
    birthDate.setUTCHours(0, 0, 0, 0);
    birthDate.setUTCFullYear(birthDate.getUTCFullYear() - 30);
    birthDate.setUTCDate(birthDate.getUTCDate() - 1);

    setup({
      resourceType: 'Patient',
      name: [
        {
          given: ['Unknown'],
          family: 'Smith',
        },
      ],
      birthDate: birthDate.toISOString().substring(0, 10),
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
      name: [
        {
          given: ['Unknown'],
          family: 'Smith',
        },
      ],
      birthDate: birthDate.toISOString().substring(0, 10),
    });

    expect(screen.getByText('029Y')).toBeInTheDocument();
  });

  test('Age in months day after birthday', async () => {
    const birthDate = new Date();
    birthDate.setUTCHours(0, 0, 0, 0);
    birthDate.setUTCMonth(birthDate.getUTCMonth() - 20);
    birthDate.setUTCDate(birthDate.getUTCDate() - 15);

    setup({
      resourceType: 'Patient',
      name: [
        {
          given: ['Unknown'],
          family: 'Smith',
        },
      ],
      birthDate: birthDate.toISOString().substring(0, 10),
    });

    expect(screen.getByText('020M')).toBeInTheDocument();
  });

  test('Age in months day before birthday', async () => {
    const birthDate = new Date();
    birthDate.setUTCHours(0, 0, 0, 0);
    birthDate.setUTCMonth(birthDate.getUTCMonth() - 20);
    birthDate.setUTCDate(birthDate.getUTCDate() + 15);

    setup({
      resourceType: 'Patient',
      name: [
        {
          given: ['Unknown'],
          family: 'Smith',
        },
      ],
      birthDate: birthDate.toISOString().substring(0, 10),
    });

    expect(screen.getByText('019M')).toBeInTheDocument();
  });

  test('Handles blank name', async () => {
    setup({
      resourceType: 'Patient',
    });

    expect(screen.getByText('[blank]')).toBeInTheDocument();
  });

  test('Avatar color', () => {
    expect(getDefaultColor({ resourceType: 'Patient', gender: 'male' })).toBe('blue');
    expect(getDefaultColor({ resourceType: 'Patient', gender: 'female' })).toBe('pink');
    expect(getDefaultColor({ resourceType: 'Patient', gender: 'other' })).toBeUndefined();
    expect(getDefaultColor({ resourceType: 'Patient' })).toBeUndefined();
  });
});
