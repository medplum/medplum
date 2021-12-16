import { Bundle, Practitioner } from '@medplum/fhirtypes';
import { MedplumProvider, MockClient } from '@medplum/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CreateResourcePage } from './CreateResourcePage';
import { ResourcePage } from './ResourcePage';

const practitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: '123',
  name: [{ given: ['Medplum'], family: 'Admin' }],
  meta: {
    versionId: '456',
    lastUpdated: '2021-01-01T12:00:00Z',
    author: {
      reference: 'Practitioner/123'
    }
  }
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
          }
        ]
      }
    }
  }]
};

const practitionerSearchParameter: Bundle = {
  resourceType: 'Bundle',
  entry: [{
    resource: {
      resourceType: 'SearchParameter',
      id: 'Practitioner-name',
      code: 'name',
      name: 'name'
    }
  }]
};

const medplum = new MockClient({
  'fhir/R4/StructureDefinition?name:exact=Practitioner': {
    'GET': practitionerStructureBundle
  },
  'fhir/R4/SearchParameter?name=Practitioner': {
    'GET': practitionerSearchParameter
  },
  'fhir/R4/Practitioner/123': {
    'GET': practitioner
  },
});

describe('CreateResourcePage', () => {

  const setup = (url: string) => {
    return render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <Routes>
            <Route path="/:resourceType/new" element={<CreateResourcePage />} />
            <Route path="/:resourceType/:id" element={<ResourcePage />} />
          </Routes>
        </MemoryRouter>
      </MedplumProvider>
    );
  };

  test('Renders new Practitioner page', async () => {
    setup('/Practitioner/new');

    await act(async () => {
      await waitFor(() => screen.getByText('New Practitioner'));
    });

    expect(screen.getByText('New Practitioner')).toBeInTheDocument();
  });

  test('Submit new Practitioner', async () => {
    setup('/Practitioner/new');

    await act(async () => {
      await waitFor(() => screen.getByText('OK'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });
  });
});
