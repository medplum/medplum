import { Bundle, Practitioner } from '@medplum/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { MockClient } from './MockClient';
import { ResourceTable, ResourceTableProps } from './ResourceTable';

const practitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: '123',
  name: [{ given: ['Medplum'], family: 'Admin' }]
};

const practitionerStructureBundle: Bundle = {
  resourceType: 'Bundle',
  entry: [{
    resource: {
      resourceType: 'StructureDefinition',
      name: 'Practitioner',
      snapshot: {
        element: [
          {
            path: 'Practitioner.id',
            type: [{
              code: 'code'
            }]
          },
          {
            path: 'Practitioner.name',
            type: [{
              code: 'HumanName'
            }],
            max: '*'
          }
        ]
      }
    }
  }]
};

const medplum = new MockClient({
  'fhir/R4/StructureDefinition?name:exact=Practitioner': {
    'GET': practitionerStructureBundle
  },
  'fhir/R4/Practitioner/123': {
    'GET': practitioner
  },
});

describe('ResourceTable', () => {

  function setup(props: ResourceTableProps) {
    return render(
      <MedplumProvider medplum={medplum}>
        <ResourceTable {...props} />
      </MedplumProvider>
    );
  }

  test('Renders empty Practitioner form', async () => {
    setup({
      value: {
        resourceType: 'Practitioner'
      }
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Resource Type'));
    });

    const control = screen.getByText('Resource Type');
    expect(control).toBeDefined();
  });

  test('Renders Practitioner resource', async () => {
    setup({
      value: {
        reference: 'Practitioner/123'
      }
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Resource Type'));
    });

    const control = screen.getByText('Resource Type');
    expect(control).toBeDefined();
  });

});
