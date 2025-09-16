// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString } from '@medplum/core';
import { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, renderAppRoutes, screen } from '../test-utils/render';

const medplum = new MockClient();

describe('QuestionnaireResponsePage', () => {
  function setup(url: string): void {
    renderAppRoutes(medplum, url);
  }

  test('Renders', async () => {
    const questionnaire = await medplum.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      url: 'https://example.com/another-example-questionnaire-1',
      status: 'active',
    });

    const response1 = await medplum.createResource<QuestionnaireResponse>({
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      questionnaire: questionnaire.url,
    });

    // Legacy: referencing questionnaire by reference string of Questionnaire rather than canonical URL
    const response2 = await medplum.createResource<QuestionnaireResponse>({
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
    expect(screen.getByText(`${response2.id}`)).toBeInTheDocument();

    // click on a question response
    await act(async () => {
      fireEvent.click(screen.getByText(`${response1.id}`));
    });

    expect(screen.getByLabelText(`Actions for QuestionnaireResponse/${response1.id}`));
  });

  test('Renders test changes', async () => {
    const questionnaire = await medplum.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      url: 'https://example.com/another-example-questionnaire-2',
      status: 'active',
    });

    const response1 = await medplum.createResource<QuestionnaireResponse>({
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      questionnaire: questionnaire.url,
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

    expect(screen.getByText(response1.id)).toBeInTheDocument();
  });
});
