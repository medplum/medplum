// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getQuestionnaireAnswers } from '@medplum/core';
import type { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { QuestionnaireForm } from './QuestionnaireForm';

// Load the documentation fixture and actual assembler without making server source part of the UI build.
const examplePath = '../../../examples/src/questionnaires/assembled-questionnaires.ts';
const exampleUrl = new URL(examplePath, import.meta.url).href;
const assemblerPath = '../../../server/src/fhir/operations/questionnaireassembly.ts';
const assemblerUrl = new URL(assemblerPath, import.meta.url).href;

test('renders repeated assembled modules as one response and removes a disabled contact', async () => {
  const medplum = new MockClient();
  const example = await import(exampleUrl);
  const { assembleQuestionnaire } = await import(assemblerUrl);
  await medplum.createResource(example.visitModule);
  await medplum.createResource(example.contactModule);
  const { questionnaire }: { questionnaire: Questionnaire } = await assembleQuestionnaire(
    medplum.repo,
    example.contactIntake
  );
  const onSubmit = vi.fn<(response: QuestionnaireResponse) => void>();
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <QuestionnaireForm questionnaire={questionnaire} onSubmit={onSubmit} />
      </MedplumProvider>
    );
  });
  expect(screen.getAllByLabelText(/Contact name/)).toHaveLength(1);
  await act(async () => {
    fireEvent.change(screen.getByLabelText(/Contact name/), { target: { value: 'First Contact' } });
  });
  await act(async () => {
    fireEvent.click(screen.getByLabelText('Add another contact?'));
  });
  expect(screen.getAllByLabelText(/Contact name/)).toHaveLength(2);
  await act(async () => {
    fireEvent.change(screen.getAllByLabelText(/Contact name/)[1], { target: { value: 'Second Contact' } });
  });
  await act(async () => {
    fireEvent.click(screen.getByText('Submit'));
  });
  const response = onSubmit.mock.calls[0][0];
  expect(response.questionnaire).toBe(questionnaire.url);
  expect(getQuestionnaireAnswers(response)['primary.name'].valueString).toBe('First Contact');
  expect(getQuestionnaireAnswers(response)['secondary.name'].valueString).toBe('Second Contact');
  await act(async () => {
    fireEvent.click(screen.getByLabelText('Add another contact?'));
  });
  await act(async () => {
    fireEvent.click(screen.getByText('Submit'));
  });
  expect(
    getQuestionnaireAnswers((onSubmit.mock.calls.at(-1) as [QuestionnaireResponse])[0])['secondary.name']
  ).toBeUndefined();
});
