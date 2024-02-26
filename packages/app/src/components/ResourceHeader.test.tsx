import { Coding, Identifier, Reference, Resource, ServiceRequest } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { randomUUID } from 'crypto';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen } from '../test-utils/render';
import { ResourceHeader } from './ResourceHeader';

const medplum = new MockClient();

const baseServiceRequest: ServiceRequest = {
  resourceType: 'ServiceRequest',
  status: 'active',
  intent: 'order',
  identifier: [
    { system: 'abc', value: '456' },
    { system: 'def', value: '789' },
  ],
  subject: { reference: 'Patient/123' },
};

describe('ResourceHeader', () => {
  async function setup(resource: Resource | Reference): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <ResourceHeader resource={resource} />
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  test('Renders ID', async () => {
    const id = randomUUID();

    await setup({
      resourceType: 'ServiceRequest',
      id,
    });

    expect(screen.getByText(id)).toBeInTheDocument();
  });

  test('Renders single identifier', async () => {
    const id = randomUUID();

    await setup({
      resourceType: 'Bundle',
      id,
      identifier: { system: 'abc', value: '456' },
    });

    expect(screen.queryByText(id)).not.toBeInTheDocument();
    expect(screen.getByText('abc')).toBeInTheDocument();
    expect(screen.getByText('456')).toBeInTheDocument();
  });

  test('Renders identifier array', async () => {
    const id = randomUUID();

    await setup({
      ...baseServiceRequest,
      id,
      identifier: [
        { system: 'abc', value: '456' },
        { system: 'def', value: '789' },
      ],
    });

    expect(screen.queryByText(id)).not.toBeInTheDocument();
    expect(screen.getByText('abc')).toBeInTheDocument();
    expect(screen.getByText('456')).toBeInTheDocument();
    expect(screen.getByText('def')).toBeInTheDocument();
    expect(screen.getByText('789')).toBeInTheDocument();
  });

  test('Renders name', async () => {
    await setup({
      resourceType: 'Organization',
      id: '123',
      name: 'Test Organization',
    });

    expect(screen.queryByText('123')).not.toBeInTheDocument();
    expect(screen.getByText('Test Organization')).toBeInTheDocument();
  });

  test('Handles reference', async () => {
    await setup({
      reference: 'Organization/123',
    });

    expect(await screen.findByText('Test Organization')).toBeInTheDocument();
  });

  test('Handles null identifier', async () => {
    const id = randomUUID();

    await setup({
      ...baseServiceRequest,
      id,
      identifier: [null as unknown as Identifier],
    });

    expect(screen.getByText(id)).toBeInTheDocument();
  });

  test('Handles missing identifier system', async () => {
    const id = randomUUID();

    await setup({
      ...baseServiceRequest,
      id,
      identifier: [{ value: 'abc' }],
    });

    expect(screen.getByText(id)).toBeInTheDocument();
    expect(screen.queryByText('abc')).not.toBeInTheDocument();
  });

  test('Handles missing identifier value', async () => {
    const id = randomUUID();

    await setup({
      ...baseServiceRequest,
      id,
      identifier: [{ system: 'abc' }],
    });

    expect(screen.getByText(id)).toBeInTheDocument();
    expect(screen.queryByText('abc')).not.toBeInTheDocument();
  });

  test('Renders code and category text', async () => {
    const id = randomUUID();

    await setup({
      ...baseServiceRequest,
      id,
      code: { text: 'TEST_CODE' },
      category: [{ text: 'TEST_CATEGORY' }],
    });

    expect(screen.getByText('TEST_CODE')).toBeInTheDocument();
    expect(screen.getByText('TEST_CATEGORY')).toBeInTheDocument();
  });

  test('Renders code and category coding', async () => {
    const id = randomUUID();

    await setup({
      resourceType: 'ServiceRequest',
      id,
      code: { coding: [{ display: 'TEST_CODE' }] },
      category: [{ text: 'TEST_CATEGORY' }],
    });

    expect(screen.getByText('TEST_CODE')).toBeInTheDocument();
    expect(screen.getByText('TEST_CATEGORY')).toBeInTheDocument();
  });

  test('Renders code without display', async () => {
    const id = randomUUID();

    await setup({
      resourceType: 'ServiceRequest',
      id,
      code: { coding: [{ code: 'TEST_CODE' }] },
    });

    expect(screen.getByText('TEST_CODE')).toBeInTheDocument();
  });

  test('Renders compound code', async () => {
    const id = randomUUID();

    await setup({
      resourceType: 'ServiceRequest',
      id,
      code: { coding: [{ display: 'TEST_CODE1' }, { display: 'TEST_CODE2' }] },
      category: [{ text: 'TEST_CATEGORY' }],
    });

    expect(screen.getByText('TEST_CODE1, TEST_CODE2')).toBeInTheDocument();
    expect(screen.getByText('TEST_CATEGORY')).toBeInTheDocument();
  });

  test('Renders malformed code', async () => {
    const id = randomUUID();

    await setup({
      resourceType: 'ServiceRequest',
      id,
      code: { coding: 'not-a-coding' as unknown as Coding[] },
    });

    expect(screen.getByText(id)).toBeInTheDocument();
    expect(screen.queryByText('not-a-coding')).not.toBeInTheDocument();
  });

  test('Does not render Bot code', async () => {
    const id = randomUUID();

    await setup({
      resourceType: 'Bot',
      id,
      code: 'console.log("Hello World")',
    });

    expect(screen.getByText(id)).toBeInTheDocument();
    expect(screen.queryByText('console.log("Hello World")')).toBeNull();
  });
});
