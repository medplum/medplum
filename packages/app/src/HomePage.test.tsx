import { Bundle, MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CreateResourcePage } from './CreateResourcePage';
import { getDefaultSearchForResourceType, HomePage } from './HomePage';

const patientStructureBundle: Bundle = {
  resourceType: 'Bundle',
  entry: [{
    resource: {
      resourceType: 'StructureDefinition',
      name: 'Patient',
      snapshot: {
        element: [
          {
            path: 'Patient.id',
            type: [{
              code: 'code'
            }]
          }
        ]
      }
    }
  }]
};

const patientSearchParameter: Bundle = {
  resourceType: 'Bundle',
  entry: [{
    resource: {
      resourceType: 'SearchParameter',
      id: 'Patient-name',
      code: 'name',
      name: 'name'
    }
  }]
};

const patientSearchBundle: Bundle = {
  resourceType: 'Bundle',
  total: 100,
  entry: [{
    resource: {
      resourceType: 'Patient',
      id: '123',
      name: [{
        given: ['Alice'],
        family: 'Smith'
      }]
    }
  }]
};

function mockFetch(url: string, options: any): Promise<any> {
  const method = options.method ?? 'GET';
  let result: any;

  if (method === 'GET' && url.includes('/fhir/R4/StructureDefinition?name:exact=Patient')) {
    result = patientStructureBundle;
  } else if (method === 'GET' && url.includes('/fhir/R4/SearchParameter?name=Patient')) {
    result = patientSearchParameter;
  } else if (method === 'GET' && url.includes('/fhir/R4/Patient?')) {
    result = patientSearchBundle;
  }

  const response: any = {
    request: {
      url,
      options
    },
    ...result
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

beforeAll(async () => {
  await medplum.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
});

const setup = (url = '/Patient') => {
  return render(
    <MedplumProvider medplum={medplum}>
      <MemoryRouter initialEntries={[url]} initialIndex={0}>
        <Routes>
          <Route path="/:resourceType/new" element={<CreateResourcePage />} />
          <Route path="/:resourceType" element={<HomePage />} />
          <Route path="/" element={<HomePage />} />
        </Routes>
      </MemoryRouter>
    </MedplumProvider>
  );
};

describe('HomePage', () => {

  test('Renders default page', async () => {
    setup('/');

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).not.toBeUndefined();
  });

  test('Renders with resourceType', async () => {
    setup('/Patient');

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).not.toBeUndefined();
  });

  test('Renders with resourceType and fields', async () => {
    setup('/Patient?_fields=id,_lastUpdated,name,birthDate,gender');

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).not.toBeUndefined();
  });

  test('Next page button', async () => {
    setup();

    await act(async () => {
      await waitFor(() => screen.getByTestId('next-page-button'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('next-page-button'));
    });
  });

  test('Prev page button', async () => {
    setup();

    await act(async () => {
      await waitFor(() => screen.getByTestId('prev-page-button'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('prev-page-button'));
    });
  });

  test('New button', async () => {
    setup();

    await act(async () => {
      await waitFor(() => screen.getByTestId('new-button'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('new-button'));
    });
  });

  test('Default search fields', () => {
    expect(getDefaultSearchForResourceType('AccessPolicy').fields).toEqual(['id', '_lastUpdated', 'name']);
    expect(getDefaultSearchForResourceType('ClientApplication').fields).toEqual(['id', '_lastUpdated', 'name']);
    expect(getDefaultSearchForResourceType('DiagnosticReport').fields).toEqual(['id', '_lastUpdated', 'subject']);
    expect(getDefaultSearchForResourceType('Encounter').fields).toEqual(['id', '_lastUpdated', 'subject']);
    expect(getDefaultSearchForResourceType('Observation').fields).toEqual(['id', '_lastUpdated', 'subject']);
    expect(getDefaultSearchForResourceType('Organization').fields).toEqual(['id', '_lastUpdated', 'name']);
    expect(getDefaultSearchForResourceType('Patient').fields).toEqual(['id', '_lastUpdated', 'name', 'birthDate', 'gender']);
    expect(getDefaultSearchForResourceType('Practitioner').fields).toEqual(['id', '_lastUpdated', 'name']);
    expect(getDefaultSearchForResourceType('Project').fields).toEqual(['id', '_lastUpdated', 'name']);
    expect(getDefaultSearchForResourceType('Questionnaire').fields).toEqual(['id', '_lastUpdated', 'name']);
    expect(getDefaultSearchForResourceType('ServiceRequest').fields).toEqual(['id', '_lastUpdated', 'subject', 'code', 'status', 'orderDetail']);
    expect(getDefaultSearchForResourceType('Subscription').fields).toEqual(['id', '_lastUpdated', 'criteria']);
  });

});
