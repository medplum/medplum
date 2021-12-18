import { createReference } from '@medplum/core';
import { Patient, Reference, Resource } from '@medplum/fhirtypes';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { MockClient } from './MockClient';
import { useResource } from './useResource';

interface TestComponentProps {
  value?: Reference | Resource;
}

function TestComponent(props: TestComponentProps) {
  const resource = useResource(props.value);
  return <div data-testid="test-component">{JSON.stringify(resource)}</div>;
}

const patient: Patient = {
  resourceType: 'Patient',
  id: '123',
  meta: {
    versionId: '456',
  },
  name: [
    {
      given: ['Alice'],
      family: 'Smith',
    },
  ],
};

const medplum = new MockClient({
  'auth/login': {
    POST: {
      profile: { reference: 'Practitioner/123' },
    },
  },
  'fhir/R4/Patient/123': {
    GET: patient,
  },
});

describe('useResource', () => {
  const setup = (props: TestComponentProps) => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <TestComponent {...props} />
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Renders null', () => {
    setup({ value: null as any as Reference });
    const el = screen.getByTestId('test-component');
    expect(el).toBeInTheDocument();
    expect(el.innerHTML).toBe('');
  });

  test('Renders undefined', () => {
    setup({ value: undefined as any as Reference });
    const el = screen.getByTestId('test-component');
    expect(el).toBeInTheDocument();
    expect(el.innerHTML).toBe('');
  });

  test('Renders resource', () => {
    setup({ value: patient });
    const el = screen.getByTestId('test-component');
    expect(el).toBeInTheDocument();
    expect(el.innerHTML).not.toBe('');
  });

  test('Renders reference', async () => {
    setup({ value: createReference(patient) });
    const el = screen.getByTestId('test-component');
    expect(el).toBeInTheDocument();
    expect(el.innerHTML).toBe('');

    await waitFor(() => expect(screen.getByTestId('test-component').innerHTML).not.toBe(''));
    expect(screen.getByTestId('test-component').innerHTML).not.toBe('');
  });

  test('Renders system', () => {
    setup({ value: { reference: 'system' } });
    const el = screen.getByTestId('test-component');
    expect(el).toBeInTheDocument();
    expect(el.innerHTML).not.toBe('');
  });
});
