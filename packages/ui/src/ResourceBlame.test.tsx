import { Bundle, Patient } from '@medplum/core';
import { render } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { MockClient } from './MockClient';
import { ResourceBlame, ResourceBlameProps } from './ResourceBlame';

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

describe('ResourceBlame', () => {

  const setup = (args: ResourceBlameProps) => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <ResourceBlame {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('ResourceBlame renders', async () => {
    const utils = setup({
      resourceType: 'Patient',
      id: '123'
    });

    const el = await utils.findByText('Loading...');
    expect(el).toBeDefined();
  });

  test('ResourceBlame renders preloaded history', async () => {
    const utils = setup({
      history: historyBundle
    });

    const el = await utils.findAllByText('1');
    expect(el).toBeDefined();
    expect(el.length).not.toBe(0);
  });

  test('ResourceBlame renders after loading the resource', async () => {
    const utils = setup({
      resourceType: 'Patient',
      id: '123'
    });

    const el = await utils.findAllByText('1');
    expect(el).toBeDefined();
    expect(el.length).not.toBe(0);
  });

});
