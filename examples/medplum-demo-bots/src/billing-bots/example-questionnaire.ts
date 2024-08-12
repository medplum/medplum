import { Questionnaire } from '@medplum/fhirtypes';

export const questionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  item: [
    {
      linkId: 'encounters',
      type: 'reference',
      repeats: true,
      text: 'Select the encounters to add to the superbill',
    },
  ],
};
