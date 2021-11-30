import { notFound, Practitioner, Questionnaire } from '@medplum/core';
import { MedplumProvider, MockClient } from '@medplum/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FormPage } from './FormPage';

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

const questionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  id: '123',
  item: [{
    linkId: '1',
    text: 'First question',
    type: 'string'
  }]
};

const medplum = new MockClient({
  'fhir/R4/Practitioner/123': {
    'GET': practitioner
  },
  'fhir/R4/Questionnaire/not-found': {
    'GET': notFound
  },
  'fhir/R4/Questionnaire/123': {
    'GET': questionnaire
  },
});

describe('FormPage', () => {

  const setup = (url: string) => {
    return render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <Routes>
            <Route path="/forms/:id" element={<FormPage />} />
          </Routes>
        </MemoryRouter>
      </MedplumProvider>
    );
  };

  test('Not found', async () => {
    setup('/forms/not-found');

    await act(async () => {
      await waitFor(() => screen.getByTestId('error'));
    });

    expect(screen.getByTestId('error')).toBeInTheDocument();
  });

  test('Form renders', async () => {
    setup('/forms/123');

    await act(async () => {
      await waitFor(() => screen.getByText('First question'));
    });

    expect(screen.getByText('First question')).toBeInTheDocument();
  });

  test('Submit', async () => {
    setup('/forms/123');

    await act(async () => {
      await waitFor(() => screen.getByText('First question'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(screen.getByText('First question')).toBeInTheDocument();
  });

});
