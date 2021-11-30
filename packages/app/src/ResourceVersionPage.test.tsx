import { Bundle, notFound, Practitioner } from '@medplum/core';
import { MedplumProvider, MockClient } from '@medplum/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ResourceVersionPage } from './ResourceVersionPage';

const practitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: '123',
  name: [{ given: ['Medplum'], family: 'Admin' }],
  active: true,
  meta: {
    versionId: '2',
    lastUpdated: '2021-01-02T12:00:00Z',
    author: {
      reference: 'Practitioner/123'
    }
  }
};

const practitionerHistory: Bundle = {
  resourceType: 'Bundle',
  entry: [
    {
      resource: practitioner
    },
    {
      resource: {
        resourceType: 'Practitioner',
        id: '123',
        name: [{ given: ['Medplum'], family: 'Admin' }],
        meta: {
          versionId: '1',
          lastUpdated: '2021-01-01T12:00:00Z',
          author: {
            reference: 'Practitioner/123'
          }
        }
      }
    }
  ]
};

const medplum = new MockClient({
  'fhir/R4/Practitioner/123': {
    'GET': practitioner
  },
  'fhir/R4/Practitioner/123/_history': {
    'GET': practitionerHistory
  },
  'fhir/R4/Practitioner/not-found/_history': {
    'GET': notFound
  },
});

describe('ResourcePage', () => {

  const setup = (url: string) => {
    return render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <Routes>
            <Route path="/:resourceType/:id/_history/:versionId/:tab" element={<ResourceVersionPage />} />
            <Route path="/:resourceType/:id/_history/:versionId" element={<ResourceVersionPage />} />
          </Routes>
        </MemoryRouter>
      </MedplumProvider>
    );
  };

  test('Resource not found', async () => {
    await act(async () => {
      setup('/Practitioner/not-found/_history/1');
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Resource not found'));
    });

    expect(screen.getByText('Resource not found')).toBeInTheDocument();
  });

  test('Version not found', async () => {
    await act(async () => {
      setup('/Practitioner/123/_history/3');
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Version not found'));
    });

    expect(screen.getByText('Version not found')).toBeInTheDocument();
  });

  test('Diff tab renders', async () => {
    await act(async () => {
      setup('/Practitioner/123/_history/1');
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Diff'));
    });

    expect(screen.getByText('Diff')).toBeInTheDocument();
  });

  test('Diff tab renders last version', async () => {
    await act(async () => {
      setup('/Practitioner/123/_history/2');
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Diff'));
    });

    expect(screen.getByText('Diff')).toBeInTheDocument();
  });

  test('Raw tab renders', async () => {
    await act(async () => {
      setup('/Practitioner/123/_history/1/raw');
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Raw'));
    });

    expect(screen.getByText('Raw')).toBeInTheDocument();
  });

  test('Change tab', async () => {
    await act(async () => {
      setup('/Practitioner/123/_history/1');
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Diff'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Raw'));
    });

    expect(screen.getByText('Raw')).toBeInTheDocument();
  });

});
