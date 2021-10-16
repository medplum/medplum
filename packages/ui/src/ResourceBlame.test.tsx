import { Bundle, MedplumClient, Patient } from '@medplum/core';
import { render } from '@testing-library/react';
import { randomUUID } from 'crypto';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { ResourceBlame, ResourceBlameProps } from './ResourceBlame';

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

const mockRouter = {
  push: (path: string, state: any) => {
    alert('Navigate to: ' + path + ' (state=' + JSON.stringify(state) + ')');
  },
  listen: () => (() => undefined) // Return mock "unlisten" handler
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

describe('ResourceBlame', () => {

  beforeAll(async () => {
    await medplum.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
  });

  const setup = (args: ResourceBlameProps) => {
    return render(
      <MedplumProvider medplum={medplum} router={mockRouter}>
        <ResourceBlame {...args} />
      </MedplumProvider>
    );
  };

  test('ResourceBlame renders', async () => {
    const utils = setup({
      resourceType: 'Patient',
      id: patientId
    });

    const el = await utils.findByText('Loading...');
    expect(el).not.toBeUndefined();
  });

  test('ResourceBlame renders preloaded history', async () => {
    const utils = setup({
      history: historyBundle
    });

    const el = await utils.findAllByText(version1Id);
    expect(el).not.toBeUndefined();
    expect(el.length).not.toBe(0);
  });

  test('ResourceBlame renders after loading the resource', async () => {
    const utils = setup({
      resourceType: 'Patient',
      id: patientId
    });

    const el = await utils.findAllByText(version1Id);
    expect(el).not.toBeUndefined();
    expect(el.length).not.toBe(0);
  });

});
