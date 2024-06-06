import { Encounter, QuestionnaireResponse } from '@medplum/fhirtypes';

export const encounter: Encounter = {
  resourceType: 'Encounter',
  status: 'finished',
  class: { code: 'example' },
};

export const fullResponse: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  status: 'completed',
  item: [
    {
      linkId: 'date',
      answer: [{ valueDateTime: '2024-02-14T11:18:05.446Z' }],
    },
    {
      linkId: 'reason-for-visit',
      answer: [{ valueCoding: { code: '112233', system: 'http://hl7.org/fhir/sid/icd-10', display: 'DIAG-4' } }],
    },
    { linkId: 'problem-list', answer: [{ valueBoolean: true }] },
    { linkId: 'systolic', answer: [{ valueQuantity: { value: 180 } }] },
    { linkId: 'diastolic', answer: [{ valueQuantity: { value: 180 } }] },
    {
      id: 'id-23',
      linkId: 'g15',
      item: [
        { id: 'id-27', linkId: 'height', answer: [{ valueQuantity: { value: 160, unit: 'cm' } }] },
        { id: 'id-28', linkId: 'weight', answer: [{ valueQuantity: { value: 65, unit: 'kg' } }] },
        { id: 'id-29', linkId: 'total-weight-gain', answer: [{ valueQuantity: { value: 10, unit: 'kg' } }] },
      ],
    },
    {
      id: 'id-24',
      linkId: 'g16',
      item: [
        { id: 'id-25', linkId: 'gravida', answer: [{ valueInteger: 2 }] },
        { id: 'id-26', linkId: 'para', answer: [{ valueInteger: 2 }] },
        {
          id: 'id-31',
          linkId: 'g23',
          item: [
            { id: 'id-32', linkId: 'gestational-age-weeks', answer: [{ valueInteger: 22 }] },
            { id: 'id-33', linkId: 'gestational-age-days', answer: [{ valueInteger: 157 }] },
          ],
        },
      ],
    },
    {
      id: 'id-34',
      linkId: 'g26',
      item: [{ id: 'id-35', linkId: 'assessment', answer: [{ valueString: 'Everything is looking good.' }] }],
    },
  ],
};

export const responseWithNoAssessment: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  status: 'completed',
  item: [
    {
      linkId: 'date',
      answer: [{ valueDateTime: '2024-02-14T11:18:05.446Z' }],
    },
    {
      linkId: 'reason-for-visit',
      answer: [{ valueCoding: { code: '112233', system: 'http://hl7.org/fhir/sid/icd-10', display: 'DIAG-4' } }],
    },
    { linkId: 'problem-list', answer: [{ valueBoolean: true }] },
    { linkId: 'systolic', answer: [{ valueQuantity: { value: 180 } }] },
    { linkId: 'diastolic', answer: [{ valueQuantity: { value: 180 } }] },
    {
      id: 'id-23',
      linkId: 'g15',
      item: [
        {
          id: 'id-27',
          linkId: 'height',
          answer: [{ valueQuantity: { value: 160, unit: 'cm' } }],
        },
        {
          id: 'id-28',
          linkId: 'weight',
          answer: [{ valueQuantity: { value: 65, unit: 'kg' } }],
        },
        {
          id: 'id-29',
          linkId: 'total-weight-gain',
          answer: [{ valueQuantity: { value: 10, unit: 'kg' } }],
        },
      ],
    },
    {
      id: 'id-24',
      linkId: 'g16',
      item: [
        {
          id: 'id-25',
          linkId: 'gravida',
          answer: [{ valueInteger: 2 }],
        },
        {
          id: 'id-26',
          linkId: 'para',
          answer: [{ valueInteger: 2 }],
        },
        {
          id: 'id-31',
          linkId: 'g23',
          item: [
            {
              id: 'id-32',
              linkId: 'gestational-age-weeks',
              answer: [{ valueInteger: 22 }],
            },
            {
              id: 'id-33',
              linkId: 'gestational-age-days',
              answer: [{ valueInteger: 157 }],
            },
          ],
        },
      ],
    },
  ],
};

export const noCondition: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  status: 'completed',
  item: [
    {
      linkId: 'date',
      answer: [{ valueDateTime: '2024-02-14T11:18:05.446Z' }],
    },
    { linkId: 'systolic', answer: [{ valueQuantity: { value: 180 } }] },
    { linkId: 'diastolic', answer: [{ valueQuantity: { value: 180 } }] },
    {
      id: 'id-23',
      linkId: 'g15',
      item: [
        {
          id: 'id-27',
          linkId: 'height',
          answer: [{ valueQuantity: { value: 160, unit: 'cm' } }],
        },
        {
          id: 'id-28',
          linkId: 'weight',
          answer: [{ valueQuantity: { value: 65, unit: 'kg' } }],
        },
        {
          id: 'id-29',
          linkId: 'total-weight-gain',
          answer: [{ valueQuantity: { value: 10, unit: 'kg' } }],
        },
      ],
    },
    {
      id: 'id-24',
      linkId: 'g16',
      item: [
        {
          id: 'id-25',
          linkId: 'gravida',
          answer: [{ valueInteger: 2 }],
        },
        {
          id: 'id-26',
          linkId: 'para',
          answer: [{ valueInteger: 2 }],
        },
        {
          id: 'id-31',
          linkId: 'g23',
          item: [
            {
              id: 'id-32',
              linkId: 'gestational-age-weeks',
              answer: [{ valueInteger: 22 }],
            },
            {
              id: 'id-33',
              linkId: 'gestational-age-days',
              answer: [{ valueInteger: 157 }],
            },
          ],
        },
      ],
    },
    {
      id: 'id-34',
      linkId: 'g26',
      item: [
        {
          id: 'id-35',
          linkId: 'assessment',
          answer: [{ valueString: 'Everything is looking good.' }],
        },
      ],
    },
  ],
};

export const onlyCondition: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  status: 'completed',
  item: [
    {
      linkId: 'date',
      answer: [{ valueDateTime: '2024-02-14T11:18:05.446Z' }],
    },
    {
      linkId: 'reason-for-visit',
      answer: [{ valueCoding: { code: '112233', system: 'http://hl7.org/fhir/sid/icd-10', display: 'DIAG-4' } }],
    },
  ],
};

export const oneBloodPressureMeasurement: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  status: 'completed',
  item: [
    {
      linkId: 'date',
      answer: [{ valueDateTime: '2024-02-14T11:18:05.446Z' }],
    },
    {
      linkId: 'reason-for-visit',
      answer: [{ valueCoding: { code: '112233', system: 'http://hl7.org/fhir/sid/icd-10', display: 'DIAG-4' } }],
    },
    { linkId: 'problem-list', answer: [{ valueBoolean: true }] },
    { linkId: 'diastolic', answer: [{ valueQuantity: { value: 180 } }] },
    {
      id: 'id-23',
      linkId: 'g15',
      item: [
        { id: 'id-27', linkId: 'height', answer: [{ valueQuantity: { value: 160, unit: 'cm' } }] },
        { id: 'id-28', linkId: 'weight', answer: [{ valueQuantity: { value: 65, unit: 'kg' } }] },
        { id: 'id-29', linkId: 'total-weight-gain', answer: [{ valueQuantity: { value: 10, unit: 'kg' } }] },
      ],
    },
    {
      id: 'id-24',
      linkId: 'g16',
      item: [
        { id: 'id-25', linkId: 'gravida', answer: [{ valueInteger: 2 }] },
        { id: 'id-26', linkId: 'para', answer: [{ valueInteger: 2 }] },
        {
          id: 'id-31',
          linkId: 'g23',
          item: [
            { id: 'id-32', linkId: 'gestational-age-weeks', answer: [{ valueInteger: 22 }] },
            { id: 'id-33', linkId: 'gestational-age-days', answer: [{ valueInteger: 157 }] },
          ],
        },
      ],
    },
    {
      id: 'id-34',
      linkId: 'g26',
      item: [{ id: 'id-35', linkId: 'assessment', answer: [{ valueString: 'Everything is looking good.' }] }],
    },
  ],
};
