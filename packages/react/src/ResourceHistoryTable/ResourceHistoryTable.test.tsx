import { MockClient } from '@medplum/mock';
import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { ResourceHistoryTable, ResourceHistoryTableProps } from './ResourceHistoryTable';

const medplum = new MockClient();

describe('ResourceHistoryTable', () => {
  async function setup(args: ResourceHistoryTableProps): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <ResourceHistoryTable {...args} />
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  test('Renders preloaded history', async () => {
    const history = await medplum.readHistory('Patient', '123');
    await setup({
      history,
    });

    const el = await screen.findByText('1');
    expect(el).toBeDefined();
  });

  test('Renders after loading the resource', async () => {
    await setup({
      resourceType: 'Patient',
      id: '123',
    });

    const el = await screen.findByText('1');
    expect(el).toBeDefined();
  });
});
