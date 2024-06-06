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
    { linkId: 'date', answer: [{ valueDateTime: '2024-02-14T11:18:05.446Z' }] },
    {
      linkId: 'reason-for-visit',
      answer: [{ valueCoding: { code: '112233', system: 'http://hl7.org/fhir/sid/icd-10', display: 'DIAG-4' } }],
    },
    { linkId: 'problem-list', answer: [{ valueBoolean: true }] },
    { linkId: 'systolic', answer: [{ valueQuantity: { value: 180 } }] },
    { linkId: 'diastolic', answer: [{ valueQuantity: { value: 180 } }] },
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
    { linkId: 'date', answer: [{ valueDateTime: '2024-02-14T11:18:05.446Z' }] },
    {
      linkId: 'reason-for-visit',
      answer: [{ valueCoding: { code: '112233', system: 'http://hl7.org/fhir/sid/icd-10', display: 'DIAG-4' } }],
    },
    { linkId: 'problem-list', answer: [{ valueBoolean: false }] },
    { linkId: 'systolic', answer: [{ valueQuantity: { value: 180 } }] },
    { linkId: 'diastolic', answer: [{ valueQuantity: { value: 180 } }] },
    { linkId: 'height', answer: [{ valueQuantity: { value: 180, unit: 'cm' } }] },
    { linkId: 'weight', answer: [{ valueQuantity: { value: 150, unit: 'lb' } }] },
    { linkId: 'hot-flashes', answer: [{ valueBoolean: true }] },
    { linkId: 'mood-swings', answer: [{ valueBoolean: true }] },
    { linkId: 'vaginal-dryness', answer: [{ valueBoolean: true }] },
    { linkId: 'sleep-disturbance', answer: [{ valueBoolean: true }] },
    { linkId: 'self-reported-history', answer: [{ valueString: 'Irregular bleeding' }] },
    { linkId: 'assessment', answer: [{ valueString: 'Everything looks bad' }] },
  ],
};

export const noReasonForVisit: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  status: 'completed',
  item: [
    { linkId: 'date', answer: [{ valueDateTime: '2024-02-14T11:18:05.446Z' }] },
    { linkId: 'systolic', answer: [{ valueQuantity: { value: 180 } }] },
    { linkId: 'diastolic', answer: [{ valueQuantity: { value: 180 } }] },
    { linkId: 'height', answer: [{ valueQuantity: { value: 180, unit: 'cm' } }] },
    { linkId: 'weight', answer: [{ valueQuantity: { value: 150, unit: 'lb' } }] },
    { linkId: 'hot-flashes', answer: [{ valueBoolean: true }] },
    { linkId: 'mood-swings', answer: [{ valueBoolean: true }] },
    { linkId: 'vaginal-dryness', answer: [{ valueBoolean: true }] },
    { linkId: 'sleep-disturbance', answer: [{ valueBoolean: true }] },
    { linkId: 'self-reported-history', answer: [{ valueString: 'Breast cancer' }] },
    { linkId: 'assessment', answer: [{ valueString: 'Everything looks bad' }] },
  ],
};

export const onlyCondition: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  status: 'completed',
  item: [
    { linkId: 'date', answer: [{ valueDateTime: '2024-02-14T11:18:05.446Z' }] },
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
    { linkId: 'date', answer: [{ valueDateTime: '2024-02-14T11:18:05.446Z' }] },
    {
      linkId: 'reason-for-visit',
      answer: [{ valueCoding: { code: '112233', system: 'http://hl7.org/fhir/sid/icd-10', display: 'DIAG-4' } }],
    },
    { linkId: 'problem-list', answer: [{ valueBoolean: true }] },
    { linkId: 'systolic', answer: [{ valueQuantity: { value: 180 } }] },
    { linkId: 'diastolic', answer: [{ valueQuantity: { value: 180 } }] },
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
    { linkId: 'date', answer: [{ valueDateTime: '2024-02-14T11:18:05.446Z' }] },
    {
      linkId: 'reason-for-visit',
      answer: [{ valueCoding: { code: '112233', system: 'http://hl7.org/fhir/sid/icd-10', display: 'DIAG-4' } }],
    },
    { linkId: 'problem-list', answer: [{ valueBoolean: true }] },
    { linkId: 'diastolic', answer: [{ valueQuantity: { value: 180 } }] },
    { linkId: 'height', answer: [{ valueQuantity: { value: 180, unit: 'cm' } }] },
    { linkId: 'weight', answer: [{ valueQuantity: { value: 150, unit: 'lb' } }] },
    { linkId: 'hot-flashes', answer: [{ valueBoolean: true }] },
    { linkId: 'mood-swings', answer: [{ valueBoolean: true }] },
    { linkId: 'vaginal-dryness', answer: [{ valueBoolean: true }] },
    { linkId: 'sleep-disturbance', answer: [{ valueBoolean: true }] },
    { linkId: 'self-reported-history', answer: [{ valueString: 'Stroke' }] },
    { linkId: 'assessment', answer: [{ valueString: 'Everything looks bad' }] },
  ],
};

export const selfReportedHistoryBmi: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  status: 'completed',
  item: [
    { linkId: 'date', answer: [{ valueDateTime: '2024-02-14T11:18:05.446Z' }] },
    {
      linkId: 'reason-for-visit',
      answer: [{ valueCoding: { code: '112233', system: 'http://hl7.org/fhir/sid/icd-10', display: 'DIAG-4' } }],
    },
    { linkId: 'problem-list', answer: [{ valueBoolean: true }] },
    { linkId: 'diastolic', answer: [{ valueQuantity: { value: 180 } }] },
    { linkId: 'height', answer: [{ valueQuantity: { value: 180, unit: 'cm' } }] },
    { linkId: 'weight', answer: [{ valueQuantity: { value: 150, unit: 'lb' } }] },
    { linkId: 'hot-flashes', answer: [{ valueBoolean: true }] },
    { linkId: 'mood-swings', answer: [{ valueBoolean: true }] },
    { linkId: 'vaginal-dryness', answer: [{ valueBoolean: true }] },
    { linkId: 'sleep-disturbance', answer: [{ valueBoolean: true }] },
    { linkId: 'self-reported-history', answer: [{ valueString: 'BMI > 30' }] },
    { linkId: 'assessment', answer: [{ valueString: 'Everything looks bad' }] },
  ],
};

export const selfReportedHistoryBreastCancer: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  status: 'completed',
  item: [
    { linkId: 'date', answer: [{ valueDateTime: '2024-02-14T11:18:05.446Z' }] },
    {
      linkId: 'reason-for-visit',
      answer: [{ valueCoding: { code: '112233', system: 'http://hl7.org/fhir/sid/icd-10', display: 'DIAG-4' } }],
    },
    { linkId: 'problem-list', answer: [{ valueBoolean: true }] },
    { linkId: 'diastolic', answer: [{ valueQuantity: { value: 180 } }] },
    { linkId: 'height', answer: [{ valueQuantity: { value: 180, unit: 'cm' } }] },
    { linkId: 'weight', answer: [{ valueQuantity: { value: 150, unit: 'lb' } }] },
    { linkId: 'hot-flashes', answer: [{ valueBoolean: true }] },
    { linkId: 'mood-swings', answer: [{ valueBoolean: true }] },
    { linkId: 'vaginal-dryness', answer: [{ valueBoolean: true }] },
    { linkId: 'sleep-disturbance', answer: [{ valueBoolean: true }] },
    { linkId: 'self-reported-history', answer: [{ valueString: 'Breast cancer' }] },
    { linkId: 'assessment', answer: [{ valueString: 'Everything looks bad' }] },
  ],
};

export const selfReportedHistoryEndometrialCancer: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  status: 'completed',
  item: [
    { linkId: 'date', answer: [{ valueDateTime: '2024-02-14T11:18:05.446Z' }] },
    {
      linkId: 'reason-for-visit',
      answer: [{ valueCoding: { code: '112233', system: 'http://hl7.org/fhir/sid/icd-10', display: 'DIAG-4' } }],
    },
    { linkId: 'problem-list', answer: [{ valueBoolean: true }] },
    { linkId: 'diastolic', answer: [{ valueQuantity: { value: 180 } }] },
    { linkId: 'height', answer: [{ valueQuantity: { value: 180, unit: 'cm' } }] },
    { linkId: 'weight', answer: [{ valueQuantity: { value: 150, unit: 'lb' } }] },
    { linkId: 'hot-flashes', answer: [{ valueBoolean: true }] },
    { linkId: 'mood-swings', answer: [{ valueBoolean: true }] },
    { linkId: 'vaginal-dryness', answer: [{ valueBoolean: true }] },
    { linkId: 'sleep-disturbance', answer: [{ valueBoolean: true }] },
    { linkId: 'self-reported-history', answer: [{ valueString: 'Endometrial cancer' }] },
    { linkId: 'assessment', answer: [{ valueString: 'Everything looks bad' }] },
  ],
};
