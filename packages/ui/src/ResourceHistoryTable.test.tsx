import { Bundle, Patient } from '@medplum/core';
import { render } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { MockClient } from './MockClient';
import { ResourceHistoryTable, ResourceHistoryTableProps } from './ResourceHistoryTable';

const historyBundle: Bundle = {
  resourceType: 'Bundle',
  entry: [
    {
      resource: {
        resourceType: 'Patient',
        id: '123',
        meta: {
          lastUpdated: new Date().toISOString(),
          versionId: '2',
          author: {
            reference: 'Practitioner/123'
          }
        },
        name: [{
          given: ['Alice'],
          family: 'Smith'
        }]
      } as Patient
    },
    {
      resource: {
        resourceType: 'Patient',
        id: '123',
        meta: {
          lastUpdated: new Date().toISOString(),
          versionId: '1',
          author: {
            reference: 'Practitioner/456'
          }
        },
        name: [{
          given: ['Alice'],
          family: 'Smith'
        }],
        active: true
      } as Patient
    }
  ]
}

const medplum = new MockClient({
  'fhir/R4/Patient/123/_history': {
    'GET': historyBundle
  }
});

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
      id: '123'
    });

    const el = await utils.findByText('Loading...');
    expect(el).not.toBeUndefined();
  });

  test('Renders preloaded history', async () => {
    const utils = setup({
      history: historyBundle
    });

    const el = await utils.findByText('1');
    expect(el).not.toBeUndefined();
  });

  test('Renders after loading the resource', async () => {
    const utils = setup({
      resourceType: 'Patient',
      id: '123'
    });

    const el = await utils.findByText('1');
    expect(el).not.toBeUndefined();
  });

});
