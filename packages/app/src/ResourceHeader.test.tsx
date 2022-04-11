import { Identifier, Reference, Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/ui';
import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ResourceHeader } from './ResourceHeader';

const medplum = new MockClient();

describe('ResourceHeader', () => {
  function setup(resource: Resource | Reference): void {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <ResourceHeader resource={resource} />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders ID', async () => {
    setup({
      resourceType: 'ServiceRequest',
      id: '123',
    });

    expect(screen.getByText('123')).toBeInTheDocument();
  });

  test('Renders single identifier', async () => {
    setup({
      resourceType: 'Bundle',
      id: '123',
      identifier: { system: 'abc', value: '456' },
    });

    expect(screen.queryByText('123')).not.toBeInTheDocument();
    expect(screen.getByText('abc')).toBeInTheDocument();
    expect(screen.getByText('456')).toBeInTheDocument();
  });

  test('Renders identifier array', async () => {
    setup({
      resourceType: 'ServiceRequest',
      id: '123',
      identifier: [
        { system: 'abc', value: '456' },
        { system: 'def', value: '789' },
      ],
    });

    expect(screen.queryByText('123')).not.toBeInTheDocument();
    expect(screen.getByText('abc')).toBeInTheDocument();
    expect(screen.getByText('456')).toBeInTheDocument();
    expect(screen.getByText('def')).toBeInTheDocument();
    expect(screen.getByText('789')).toBeInTheDocument();
  });

  test('Renders name', async () => {
    setup({
      resourceType: 'Organization',
      id: '123',
      name: 'Test Org',
    });

    expect(screen.queryByText('123')).not.toBeInTheDocument();
    expect(screen.getByText('Test Org')).toBeInTheDocument();
  });

  test('Handles reference', async () => {
    setup({
      reference: 'Organization/123',
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Test Organization'));
    });

    expect(screen.getByText('Test Organization')).toBeInTheDocument();
  });

  test('Handles null identifier', async () => {
    setup({
      resourceType: 'ServiceRequest',
      id: '123',
      identifier: [null as unknown as Identifier],
    });

    expect(screen.getByText('123')).toBeInTheDocument();
  });

  test('Handles missing identifier system', async () => {
    setup({
      resourceType: 'ServiceRequest',
      id: '123',
      identifier: [{ value: 'abc' }],
    });

    expect(screen.getByText('123')).toBeInTheDocument();
    expect(screen.queryByText('abc')).not.toBeInTheDocument();
  });

  test('Handles missing identifier value', async () => {
    setup({
      resourceType: 'ServiceRequest',
      id: '123',
      identifier: [{ system: 'abc' }],
    });

    expect(screen.getByText('123')).toBeInTheDocument();
    expect(screen.queryByText('abc')).not.toBeInTheDocument();
  });

  test('Renders code and category text', async () => {
    setup({
      resourceType: 'ServiceRequest',
      id: '123',
      code: { text: 'TEST_CODE' },
      category: [{ text: 'TEST_CATEGORY' }],
    });

    expect(screen.getByText('TEST_CODE')).toBeInTheDocument();
    expect(screen.getByText('TEST_CATEGORY')).toBeInTheDocument();
  });

  test('Renders code and category coding', async () => {
    setup({
      resourceType: 'ServiceRequest',
      id: '123',
      code: { coding: [{ display: 'TEST_CODE' }] },
      category: [{ text: 'TEST_CATEGORY' }],
    });

    expect(screen.getByText('TEST_CODE')).toBeInTheDocument();
    expect(screen.getByText('TEST_CATEGORY')).toBeInTheDocument();
  });
});
