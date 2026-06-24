// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { MOCK_HOMER_PATIENT_ID } from '../constants';
import { DrAliceSmith } from './alice';

export const ExampleQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  id: '123',
  url: 'https://example.com/example-questionnaire',
  status: 'active',
  name: 'Vitals',
  title: 'Vitals',
  subjectType: ['Patient'],
  item: [
    {
      linkId: '1',
      text: 'First question',
      type: 'string',
    },
  ],
};

export const ExampleQuestionnaireResponse: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  id: '123',
  status: 'completed',
  questionnaire: 'https://example.com/example-questionnaire',
  subject: {
    reference: `Patient/${MOCK_HOMER_PATIENT_ID}`,
  },
  source: createReference(DrAliceSmith),
};
