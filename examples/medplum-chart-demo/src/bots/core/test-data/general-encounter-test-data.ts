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
      linkId: 'reason-for-visit',
      answer: [{ valueCoding: { code: '112233', system: 'http://hl7.org/fhir/sid/icd-10', display: 'DIAG-4' } }],
    },
    { linkId: 'problem-list', answer: [{ valueBoolean: true }] },
    { linkId: 'systolic', answer: [{ valueInteger: 180 }] },
    { linkId: 'diastolic', answer: [{ valueInteger: 180 }] },
    { linkId: 'height', answer: [{ valueQuantity: { value: 180, unit: 'cm' } }] },
    { linkId: 'weight', answer: [{ valueQuantity: { value: 150, unit: 'lb' } }] },
    { linkId: 'hot-flashes', answer: [{ valueBoolean: true }] },
    { linkId: 'mood-swings', answer: [{ valueBoolean: true }] },
    { linkId: 'vaginal-dryness', answer: [{ valueBoolean: true }] },
    { linkId: 'sleep-disturbance', answer: [{ valueBoolean: true }] },
    { linkId: 'self-reported-history', answer: [{ valueString: 'Blood clots' }] },
    { linkId: 'assessment', answer: [{ valueString: 'Everything looks bad' }] },
  ],
};

export const fullResponseNoProblemList: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  status: 'completed',
  item: [
    {
      linkId: 'reason-for-visit',
      answer: [{ valueCoding: { code: '112233', system: 'http://hl7.org/fhir/sid/icd-10', display: 'DIAG-4' } }],
    },
    { linkId: 'problem-list', answer: [{ valueBoolean: false }] },
    { linkId: 'systolic', answer: [{ valueInteger: 180 }] },
    { linkId: 'diastolic', answer: [{ valueInteger: 180 }] },
    { linkId: 'height', answer: [{ valueQuantity: { value: 180, unit: 'cm' } }] },
    { linkId: 'weight', answer: [{ valueQuantity: { value: 150, unit: 'lb' } }] },
    { linkId: 'hot-flashes', answer: [{ valueBoolean: true }] },
    { linkId: 'mood-swings', answer: [{ valueBoolean: true }] },
    { linkId: 'vaginal-dryness', answer: [{ valueBoolean: true }] },
    { linkId: 'sleep-disturbance', answer: [{ valueBoolean: true }] },
    { linkId: 'self-reported-history', answer: [{ valueString: 'Blood clots' }] },
    { linkId: 'assessment', answer: [{ valueString: 'Everything looks bad' }] },
  ],
};

export const noReasonForVisit: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  status: 'completed',
  item: [
    { linkId: 'systolic', answer: [{ valueInteger: 180 }] },
    { linkId: 'diastolic', answer: [{ valueInteger: 180 }] },
    { linkId: 'height', answer: [{ valueQuantity: { value: 180, unit: 'cm' } }] },
    { linkId: 'weight', answer: [{ valueQuantity: { value: 150, unit: 'lb' } }] },
    { linkId: 'hot-flashes', answer: [{ valueBoolean: true }] },
    { linkId: 'mood-swings', answer: [{ valueBoolean: true }] },
    { linkId: 'vaginal-dryness', answer: [{ valueBoolean: true }] },
    { linkId: 'sleep-disturbance', answer: [{ valueBoolean: true }] },
    { linkId: 'self-reported-history', answer: [{ valueString: 'Blood clots' }] },
    { linkId: 'assessment', answer: [{ valueString: 'Everything looks bad' }] },
  ],
};

export const onlyCondition: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  status: 'completed',
  item: [
    {
      linkId: 'reason-for-visit',
      answer: [{ valueCoding: { code: '112233', system: 'http://hl7.org/fhir/sid/icd-10', display: 'DIAG-4' } }],
    },
    { linkId: 'problem-list', answer: [{ valueBoolean: false }] },
  ],
};

export const noSelfReportedHistory: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  status: 'completed',
  item: [
    {
      linkId: 'reason-for-visit',
      answer: [{ valueCoding: { code: '112233', system: 'http://hl7.org/fhir/sid/icd-10', display: 'DIAG-4' } }],
    },
    { linkId: 'problem-list', answer: [{ valueBoolean: true }] },
    { linkId: 'systolic', answer: [{ valueInteger: 180 }] },
    { linkId: 'diastolic', answer: [{ valueInteger: 180 }] },
    { linkId: 'height', answer: [{ valueQuantity: { value: 180, unit: 'cm' } }] },
    { linkId: 'weight', answer: [{ valueQuantity: { value: 150, unit: 'lb' } }] },
    { linkId: 'hot-flashes', answer: [{ valueBoolean: true }] },
    { linkId: 'mood-swings', answer: [{ valueBoolean: true }] },
    { linkId: 'vaginal-dryness', answer: [{ valueBoolean: true }] },
    { linkId: 'sleep-disturbance', answer: [{ valueBoolean: true }] },
    { linkId: 'assessment', answer: [{ valueString: 'Everything looks bad' }] },
  ],
};

export const oneBloodPressureMeasurement: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  status: 'completed',
  item: [
    {
      linkId: 'reason-for-visit',
      answer: [{ valueCoding: { code: '112233', system: 'http://hl7.org/fhir/sid/icd-10', display: 'DIAG-4' } }],
    },
    { linkId: 'problem-list', answer: [{ valueBoolean: true }] },
    { linkId: 'diastolic', answer: [{ valueInteger: 180 }] },
    { linkId: 'height', answer: [{ valueQuantity: { value: 180, unit: 'cm' } }] },
    { linkId: 'weight', answer: [{ valueQuantity: { value: 150, unit: 'lb' } }] },
    { linkId: 'hot-flashes', answer: [{ valueBoolean: true }] },
    { linkId: 'mood-swings', answer: [{ valueBoolean: true }] },
    { linkId: 'vaginal-dryness', answer: [{ valueBoolean: true }] },
    { linkId: 'sleep-disturbance', answer: [{ valueBoolean: true }] },
    { linkId: 'self-reported-history', answer: [{ valueString: 'Blood clots' }] },
    { linkId: 'assessment', answer: [{ valueString: 'Everything looks bad' }] },
  ],
};
