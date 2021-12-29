import { HomerSimpsonHistory, MockClient } from '@medplum/mock';
import { render } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { ResourceHistoryTable, ResourceHistoryTableProps } from './ResourceHistoryTable';

const medplum = new MockClient();

describe('ResourceHistoryTable', () => {
  const setup = (args: ResourceHistoryTableProps) => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <ResourceHistoryTable {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Renders', async () => {
    const utils = setup({
      resourceType: 'Patient',
      id: '123',
    });

    const el = await utils.findByText('Loading...');
    expect(el).toBeDefined();
  });

  test('Renders preloaded history', async () => {
    const utils = setup({
      history: HomerSimpsonHistory,
    });

    const el = await utils.findByText('1');
    expect(el).toBeDefined();
  });

  test('Renders after loading the resource', async () => {
    const utils = setup({
      resourceType: 'Patient',
      id: '123',
    });

    const el = await utils.findByText('1');
    expect(el).toBeDefined();
  });
});
