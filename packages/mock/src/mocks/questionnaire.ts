import { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';

export const ExampleQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  id: '123',
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
  questionnaire: 'Questionnaire/123',
  subject: {
    reference: 'Patient/123',
  },
  source: {
    reference: 'Practitioner/123',
  },
};
