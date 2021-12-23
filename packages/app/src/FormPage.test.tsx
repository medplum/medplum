import { notFound } from '@medplum/core';
import { Bundle, Practitioner, Questionnaire, SearchParameter, StructureDefinition } from '@medplum/fhirtypes';
import { MedplumProvider, MockClient } from '@medplum/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FormPage } from './FormPage';

const structureDefinitionBundle: Bundle<StructureDefinition> = {
  resourceType: 'Bundle',
  type: 'searchset',
  entry: [
    {
      resource: {
        resourceType: 'StructureDefinition',
        name: 'Questionnaire',
        snapshot: {
          element: [
            {
              id: 'Questionnaire.item',
              path: 'Questionnaire.item',
              type: [
                {
                  code: 'BackboneElement',
                },
              ],
            },
            {
              id: 'Questionnaire.item.answerOption',
              path: 'Questionnaire.item.answerOption',
              type: [
                {
                  code: 'BackboneElement',
                },
              ],
            },
            {
              id: 'Questionnaire.item.answerOption.value[x]',
              path: 'Questionnaire.item.answerOption.value[x]',
              min: 1,
              max: '1',
              type: [
                {
                  code: 'integer',
                },
                {
                  code: 'date',
                },
                {
                  code: 'time',
                },
                {
                  code: 'string',
                },
                {
                  code: 'Coding',
                },
                {
                  code: 'Reference',
                  targetProfile: ['http://hl7.org/fhir/StructureDefinition/Resource'],
                },
              ],
            },
          ],
        },
      },
    },
  ],
};

const searchParamBundle: Bundle<SearchParameter> = {
  resourceType: 'Bundle',
  type: 'searchset',
};

const practitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: '123',
  name: [{ given: ['Medplum'], family: 'Admin' }],
  meta: {
    versionId: '456',
    lastUpdated: '2021-01-01T12:00:00Z',
    author: {
      reference: 'Practitioner/123',
    },
  },
};

const questionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  id: '123',
  item: [
    {
      linkId: '1',
      text: 'First question',
      type: 'string',
    },
  ],
};

const medplum = new MockClient({
  'fhir/R4/StructureDefinition?name:exact=Questionnaire': {
    GET: structureDefinitionBundle,
  },
  'fhir/R4/SearchParameter?_count=100&base=Questionnaire': {
    GET: searchParamBundle,
  },
  'fhir/R4/Practitioner/123': {
    GET: practitioner,
  },
  'fhir/R4/Questionnaire/not-found': {
    GET: notFound,
  },
  'fhir/R4/Questionnaire/123': {
    GET: questionnaire,
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
