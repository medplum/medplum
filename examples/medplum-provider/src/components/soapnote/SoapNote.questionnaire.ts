import { Questionnaire } from '@medplum/fhirtypes';

export const defaultSoapNoteQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  name: 'SOAP Note - Menopause',
  title: 'SOAP Note - Menopause Service',
  status: 'active',
  id: 'b0166b1b-d4b8-4d09-b6bc-2f094cf7de9e',
  item: [
    {
      id: 'id-55',
      linkId: 'date',
      type: 'date',
      text: 'Date of Visit',
      initial: [
        {
          valueDate: '2023-10-19',
        },
      ],
    },
    {
      id: 'id-64',
      linkId: 'g10',
      type: 'group',
      text: 'Subjective Evaluation',
      item: [
        {
          id: 'id-94',
          linkId: 'q29',
          type: 'boolean',
          text: 'Hot flashes',
        },
        {
          id: 'id-96',
          linkId: 'q31',
          type: 'boolean',
          text: 'Mood swings',
        },
        {
          id: 'id-95',
          linkId: 'q30',
          type: 'boolean',
          text: 'Vaginal dryness',
        },
        {
          id: 'id-97',
          linkId: 'q32',
          type: 'boolean',
          text: 'Sleep Disturbance',
        },
        {
          id: 'id-67',
          linkId: 'q13',
          type: 'open-choice',
          text: 'Self-reported history',
          answerOption: [
            {
              id: 'id-76',
              valueString: 'Blood clots',
            },
            {
              id: 'id-77',
              valueString: 'Stroke',
            },
            {
              id: 'id-78',
              valueString: 'Breast cancer',
            },
            {
              id: 'id-79',
              valueString: 'Endometrial cancer',
            },
            {
              id: 'id-80',
              valueString: 'Irregular bleeding',
            },
            {
              id: 'id-81',
              valueString: 'BMI > 30',
            },
          ],
        },
        {
          id: 'id-100',
          linkId: 'q34',
          type: 'text',
          text: 'Details',
        },
      ],
    },
    {
      id: 'id-68',
      linkId: 'g14',
      type: 'group',
      text: 'Objective Evaluation',
      item: [
        {
          id: 'id-92',
          linkId: 'q27',
          type: 'boolean',
          text: 'Confirmed patient age > 45 y as of today',
        },
      ],
    },
    {
      id: 'id-71',
      linkId: 'g17',
      type: 'group',
      text: 'Assessment',
      item: [
        {
          id: 'id-72',
          linkId: 'q18',
          type: 'choice',
          text: 'Based on data, submit the SNOMED diagnosis codes for this patient.',
          answerOption: [
            {
              id: 'id-83',
              valueString: 'No current problems (160245001)',
            },
            {
              id: 'id-84',
              valueString: 'Early menopause (160397006)',
            },
            {
              id: 'id-85',
              valueString: 'Late menopause (160398001)',
            },
          ],
        },
        {
          id: 'id-98',
          linkId: 'q33',
          type: 'string',
          text: 'Other Diagnosis Code',
        },
      ],
    },
    {
      id: 'id-86',
      linkId: 'g21',
      type: 'group',
      text: 'Plan',
      item: [
        {
          id: 'id-87',
          linkId: 'q22',
          type: 'open-choice',
          text: 'Outline next steps',
          answerOption: [
            {
              id: 'id-88',
              valueString: 'Order cholesterol test',
            },
            {
              id: 'id-89',
              valueString: 'Order imaging',
            },
            {
              id: 'id-90',
              valueString: 'Refer to specialist',
            },
            {
              id: 'id-99',
              valueString: 'Systemic HRT',
            },
            {
              id: 'id-100',
              valueString: 'SSRI/SNRI',
            },
            {
              id: 'id-101',
              valueString: 'Local HRT',
            },
            {
              id: 'id-102',
              valueString: 'OTC treatment',
            },
          ],
        },
      ],
    },
    {
      id: 'id-103',
      linkId: 'q37',
      type: 'choice',
      text: 'Choose a code for this visit',
      answerOption: [
        {
          id: 'id-104',
          valueString: '99204 (Moderate Complexity)',
        },
        {
          id: 'id-105',
          valueString: '99205 (High Complexity)',
        },
      ],
    },
  ],
  subjectType: ['Patient'],
};
