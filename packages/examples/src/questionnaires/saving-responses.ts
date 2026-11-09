// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// start-block persistenceImports
import type { MedplumClient } from '@medplum/core';
import { deepClone, getQuestionnaireAnswers, getReferenceString } from '@medplum/core';
import type { Questionnaire, QuestionnaireResponse, Reference } from '@medplum/fhirtypes';
import { activityQuestionnaire } from './advanced-questionnaires';
// end-block persistenceImports

// start-block publishDefinition
export async function publishActivityQuestionnaire(medplum: MedplumClient): Promise<Questionnaire> {
  const identifier = { system: 'https://example.org/questionnaire-definition', value: 'daily-activity-v1' };
  return medplum.createResourceIfNoneExist<Questionnaire>(
    { ...activityQuestionnaire, status: 'active', version: '1', identifier: [identifier] },
    new URLSearchParams({ identifier: `${identifier.system}|${identifier.value}` }).toString()
  );
}
// end-block publishDefinition

// start-block createDraft
export async function getOrCreateDraft(
  medplum: MedplumClient,
  questionnaire: Questionnaire,
  subject: Reference,
  assignmentId: string
): Promise<QuestionnaireResponse> {
  const questionnaireReference = getReferenceString(questionnaire);
  if (!questionnaire.id || !questionnaireReference || !subject.reference) {
    throw new Error('Load a stored Questionnaire and a subject reference before assigning a form.');
  }
  // Use a stable ID for this assigned form, including across retries.
  const identifier = { system: 'https://example.org/form-assignment', value: assignmentId };
  const response = await medplum.createResourceIfNoneExist<QuestionnaireResponse>(
    {
      resourceType: 'QuestionnaireResponse',
      identifier,
      questionnaire: questionnaireReference,
      subject,
      status: 'in-progress',
    },
    new URLSearchParams({ identifier: `${identifier.system}|${identifier.value}` }).toString()
  );
  if (response.subject?.reference !== subject.reference || response.questionnaire !== questionnaireReference) {
    throw new Error('This assignment belongs to a different subject or Questionnaire.');
  }
  return response;
}
// end-block createDraft

// start-block loadAssignment
export async function loadActivityForm(
  medplum: MedplumClient,
  questionnaireId: string,
  patientId: string,
  assignmentId: string
): Promise<{ questionnaire: Questionnaire; response: QuestionnaireResponse }> {
  const questionnaire = await medplum.readResource('Questionnaire', questionnaireId);
  const response = await getOrCreateDraft(medplum, questionnaire, { reference: `Patient/${patientId}` }, assignmentId);
  return { questionnaire, response };
}
// end-block loadAssignment

// start-block validateCompletion
export function validateActivityResponse(response: QuestionnaireResponse): void {
  // These linkIds belong to this non-repeating example form.
  const answers = getQuestionnaireAnswers(response);
  const morning = answers['morning-minutes']?.valueInteger;
  const afternoon = answers['afternoon-minutes']?.valueInteger;
  if (
    morning === undefined ||
    afternoon === undefined ||
    !Number.isSafeInteger(morning) ||
    !Number.isSafeInteger(afternoon) ||
    morning < 0 ||
    afternoon < 0
  ) {
    throw new Error('On the Activity page, enter a non-negative whole number for both morning and afternoon minutes.');
  }
  if (answers['total-minutes']?.valueInteger !== morning + afternoon) {
    throw new Error('The calculated total does not match the activity answers.');
  }
}
// end-block validateCompletion

// start-block saveResponse
export async function saveResponse(
  medplum: MedplumClient,
  saved: QuestionnaireResponse,
  edited: QuestionnaireResponse
): Promise<QuestionnaireResponse> {
  if (!saved.id || !saved.meta?.versionId) {
    throw new Error('Load the saved response before updating it.');
  }
  return medplum.updateResource(
    {
      ...saved,
      ...deepClone(edited),
      // Retain the identity and context of the assigned form.
      id: saved.id,
      meta: saved.meta,
      identifier: saved.identifier,
      questionnaire: saved.questionnaire,
      subject: saved.subject,
      encounter: saved.encounter,
    },
    { headers: { 'If-Match': `W/"${saved.meta.versionId}"` } }
  );
}
// end-block saveResponse
