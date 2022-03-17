import { MockClient } from '@medplum/mock';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { ResourceHistoryTable, ResourceHistoryTableProps } from './ResourceHistoryTable';

const medplum = new MockClient();

describe('ResourceHistoryTable', () => {
  function setup(args: ResourceHistoryTableProps): void {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <ResourceHistoryTable {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders', async () => {
    setup({
      resourceType: 'Patient',
      id: '123',
    });

    const el = await screen.findByText('Loading...');
    expect(el).toBeDefined();
  });

  test('Renders preloaded history', async () => {
    const history = await medplum.readHistory('Patient', '123');
    setup({
      history,
    });

    const el = await screen.findByText('1');
    expect(el).toBeDefined();
  });

  test('Renders after loading the resource', async () => {
    setup({
      resourceType: 'Patient',
      id: '123',
    });

    const el = await screen.findByText('1');
    expect(el).toBeDefined();
  });
});
