import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';
import { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { getReferenceString } from '@medplum/core';

const medplum = new MockClient();

describe('QuestionnaireResponsePage', () => {
  function setup(url: string): void {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <AppRoutes />
        </MemoryRouter>
      </MedplumProvider>
    );
  }

  test('Renders', async () => {
    const questionnaire = await medplum.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
    });

    const response1 = await medplum.createResource<QuestionnaireResponse>({
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      questionnaire: getReferenceString(questionnaire),
    });
    await act(async () => {
      setup(`/Questionnaire/${questionnaire.id}/questionnaireresponse`);
    });

    expect(screen.getByText(`${response1.id}`)).toBeInTheDocument();
  });
});
