import { createReference } from '@medplum/core';
import { Reference, Resource } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { useResource } from './useResource';

interface TestComponentProps {
  value?: Reference | Resource;
}

function TestComponent(props: TestComponentProps): JSX.Element {
  const resource = useResource(props.value);
  return <div data-testid="test-component">{JSON.stringify(resource)}</div>;
}

const medplum = new MockClient();

describe('useResource', () => {
  function setup(props: TestComponentProps): void {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <TestComponent {...props} />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders null', () => {
    setup({ value: null as unknown as Reference });
    const el = screen.getByTestId('test-component');
    expect(el).toBeInTheDocument();
    expect(el.innerHTML).toBe('');
  });

  test('Renders undefined', () => {
    setup({ value: undefined as unknown as Reference });
    const el = screen.getByTestId('test-component');
    expect(el).toBeInTheDocument();
    expect(el.innerHTML).toBe('');
  });

  test('Renders resource', () => {
    setup({ value: HomerSimpson });
    const el = screen.getByTestId('test-component');
    expect(el).toBeInTheDocument();
    expect(el.innerHTML).not.toBe('');
  });

  test('Renders reference', async () => {
    setup({ value: createReference(HomerSimpson) });
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

  test('Handles 404 not found', () => {
    setup({ value: { reference: 'Patient/not-found' } });
    const el = screen.getByTestId('test-component');
    expect(el).toBeInTheDocument();
    expect(el.innerHTML).toBe('');
  });
});
