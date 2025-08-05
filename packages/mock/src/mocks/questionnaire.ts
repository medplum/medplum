// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';

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
    reference: 'Patient/123',
  },
  source: {
    reference: 'Practitioner/123',
  },
};
