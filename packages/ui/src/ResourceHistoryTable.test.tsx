import { Bundle, MedplumClient, Patient } from '@medplum/core';
import { render } from '@testing-library/react';
import { randomUUID } from 'crypto';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { ResourceHistoryTable, ResourceHistoryTableProps } from './ResourceHistoryTable';

const patientId = randomUUID();
const version1Id = randomUUID();
const version2Id = randomUUID();

const historyBundle: Bundle = {
  resourceType: 'Bundle',
  entry: [
    {
      resource: {
        resourceType: 'Patient',
        id: patientId,
        meta: {
          lastUpdated: new Date().toISOString(),
          versionId: version1Id,
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
        id: patientId,
        meta: {
          lastUpdated: new Date().toISOString(),
          versionId: version2Id,
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

function mockFetch(url: string, options: any): Promise<any> {
  const response: any = {
    request: {
      url,
      options
    },
    ...historyBundle
  };

  return Promise.resolve({
    blob: () => Promise.resolve(response),
    json: () => Promise.resolve(response)
  });
}

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: mockFetch
});

describe('ResourceHistoryTable', () => {

  beforeAll(async () => {
    await medplum.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
  });

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
      id: patientId
    });

    const el = await utils.findByText('Loading...');
    expect(el).not.toBeUndefined();
  });

  test('Renders preloaded history', async () => {
    const utils = setup({
      history: historyBundle
    });

    const el = await utils.findByText(version1Id);
    expect(el).not.toBeUndefined();
  });

  test('Renders after loading the resource', async () => {
    const utils = setup({
      resourceType: 'Patient',
      id: patientId
    });

    const el = await utils.findByText(version1Id);
    expect(el).not.toBeUndefined();
  });

});
