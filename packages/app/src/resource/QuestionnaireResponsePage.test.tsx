import { getReferenceString } from '@medplum/core';
import { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';
import { act, fireEvent, render, screen } from '../test-utils/render';

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

    // load questionnaire page
    await act(async () => {
      setup(`/Questionnaire/${questionnaire.id}`);
    });

    const questionnaireResponseTab = screen.getByRole('tab', { name: 'Responses' });

    // click on questionnaire response tab
    await act(async () => {
      fireEvent.click(questionnaireResponseTab);
    });

    expect(screen.getByText(`${response1.id}`)).toBeInTheDocument();

    // click on a question response
    await act(async () => {
      fireEvent.click(screen.getByText(`${response1.id}`));
    });

    expect(screen.getByLabelText(`Actions for QuestionnaireResponse/${response1.id}`));
  });

  test('Renders test changes', async () => {
    const questionnaire = await medplum.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
    });

    const response1 = await medplum.createResource<QuestionnaireResponse>({
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      questionnaire: getReferenceString(questionnaire),
    });

    // load questionnaire response page
    await act(async () => {
      setup(`/Questionnaire/${questionnaire.id}/responses`);
    });

    // click on a questionnaire response
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Last Updated' }));
    });

    const sortButton = await screen.findByRole('menuitem', { name: 'Sort Newest to Oldest' });

    await act(async () => {
      fireEvent.click(sortButton);
    });

    expect(screen.getByText(`${response1.id}`)).toBeInTheDocument();
  });
});
