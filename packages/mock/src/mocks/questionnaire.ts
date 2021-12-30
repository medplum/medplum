import { Bundle, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';

export const ExampleQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  id: '123',
  name: 'Vitals',
  title: 'Vitals',
  item: [
    {
      linkId: '1',
      text: 'First question',
      type: 'string',
    },
  ],
};

export const ExampleQuestionnaireBundle: Bundle<Questionnaire> = {
  resourceType: 'Bundle',
  type: 'searchset',
  entry: [
    {
      resource: ExampleQuestionnaire,
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
