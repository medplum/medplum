import { Questionnaire } from '@medplum/fhirtypes';

export const ExampleQuestionnaire: Questionnaire = {
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
