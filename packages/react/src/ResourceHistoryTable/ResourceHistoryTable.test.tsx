// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bundle } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router';
import { act, render, screen } from '../test-utils/render';
import type { ResourceHistoryTableProps } from './ResourceHistoryTable';
import { ResourceHistoryTable } from './ResourceHistoryTable';

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

  test('Renders On Behalf Of column header', async () => {
    const history = await medplum.readHistory('Patient', '123');
    await setup({ history });
    expect(screen.getByText('On Behalf Of')).toBeDefined();
  });

  test('Renders onBehalfOf when present', async () => {
    const history: Bundle = {
      resourceType: 'Bundle',
      type: 'history',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: 'test-obo',
            meta: {
              versionId: '1',
              lastUpdated: '2024-01-01T00:00:00Z',
              author: { reference: 'Practitioner/123' },
              onBehalfOf: { reference: 'Practitioner/123' },
            },
          },
        },
      ],
    };
    await setup({ history });
    expect(await screen.findAllByText('Alice Smith')).toHaveLength(2);
  });
});
