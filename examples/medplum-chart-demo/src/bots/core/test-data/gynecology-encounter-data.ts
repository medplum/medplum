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
    { linkId: 'weight', answer: [{ valueQuantity: { value: 180, unit: 'lb' } }] },
    {
      id: 'id-5',
      linkId: 'last-period',
      answer: [{ valueDate: '2024-03-03' }],
    },
    {
      id: 'id-6',
      linkId: 'contraception',
      answer: [{ valueCoding: { code: 'Condom', display: 'Condom' } }],
    },
    {
      id: 'id-10',
      linkId: 'mammogram',
      answer: [{ valueDate: '2024-02-08' }],
    },
    {
      id: 'id-12',
      linkId: 'smoking',
      answer: [{ valueCoding: { system: 'http://snomed.info/sct', code: '8392000', display: 'Non-smoker' } }],
    },
    {
      id: 'id-13',
      linkId: 'drugs',
      answer: [{ valueCoding: { system: 'http://snomed.info/sct', code: '44870007', display: 'Ex-drug user' } }],
    },
    {
      id: 'id-14',
      linkId: 'housing',
      answer: [{ valueCoding: { system: 'http://snomed.info/sct', code: '160943002', display: 'Lives in own home' } }],
    },
    {
      id: 'id-16',
      linkId: 'visit-length',
      answer: [{ valueInteger: 15 }],
    },
    {
      id: 'id-21',
      linkId: 'assessment',
      answer: [{ valueString: 'Everything looks good.' }],
    },
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
    { linkId: 'weight', answer: [{ valueQuantity: { value: 180, unit: 'lb' } }] },
    {
      id: 'id-5',
      linkId: 'last-period',
      answer: [{ valueDate: '2024-03-03' }],
    },
    {
      id: 'id-6',
      linkId: 'contraception',
      answer: [{ valueCoding: { code: 'Condom', display: 'Condom' } }],
    },
    {
      id: 'id-10',
      linkId: 'mammogram',
      answer: [{ valueDate: '2024-02-08' }],
    },
    {
      id: 'id-12',
      linkId: 'smoking',
      answer: [{ valueCoding: { system: 'http://snomed.info/sct', code: '8392000', display: 'Non-smoker' } }],
    },
    {
      id: 'id-13',
      linkId: 'drugs',
      answer: [{ valueCoding: { system: 'http://snomed.info/sct', code: '44870007', display: 'Ex-drug user' } }],
    },
    {
      id: 'id-14',
      linkId: 'housing',
      answer: [{ valueCoding: { system: 'http://snomed.info/sct', code: '160943002', display: 'Lives in own home' } }],
    },
    {
      id: 'id-16',
      linkId: 'visit-length',
      answer: [{ valueInteger: 15 }],
    },
    {
      id: 'id-21',
      linkId: 'assessment',
      answer: [{ valueString: 'Everything looks good.' }],
    },
  ],
};

export const noAssessment: QuestionnaireResponse = {
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
    { linkId: 'weight', answer: [{ valueQuantity: { value: 180, unit: 'lb' } }] },
    {
      id: 'id-5',
      linkId: 'last-period',
      answer: [{ valueDate: '2024-03-03' }],
    },
    {
      id: 'id-6',
      linkId: 'contraception',
      answer: [{ valueCoding: { code: 'Condom', display: 'Condom' } }],
    },
    {
      id: 'id-10',
      linkId: 'mammogram',
      answer: [{ valueDate: '2024-02-08' }],
    },
    {
      id: 'id-12',
      linkId: 'smoking',
      answer: [{ valueCoding: { system: 'http://snomed.info/sct', code: '8392000', display: 'Non-smoker' } }],
    },
    {
      id: 'id-13',
      linkId: 'drugs',
      answer: [{ valueCoding: { system: 'http://snomed.info/sct', code: '44870007', display: 'Ex-drug user' } }],
    },
    {
      id: 'id-14',
      linkId: 'housing',
      answer: [{ valueCoding: { system: 'http://snomed.info/sct', code: '160943002', display: 'Lives in own home' } }],
    },
  ],
};

export const noCondition: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  status: 'completed',
  item: [
    { linkId: 'date', answer: [{ valueDateTime: '2024-02-14T11:18:05.446Z' }] },
    { linkId: 'systolic', answer: [{ valueQuantity: { value: 180 } }] },
    { linkId: 'diastolic', answer: [{ valueQuantity: { value: 180 } }] },
    { linkId: 'height', answer: [{ valueQuantity: { value: 180, unit: 'cm' } }] },
    { linkId: 'weight', answer: [{ valueQuantity: { value: 180, unit: 'lb' } }] },
    {
      id: 'id-5',
      linkId: 'last-period',
      answer: [{ valueDate: '2024-03-03' }],
    },
    {
      id: 'id-6',
      linkId: 'contraception',
      answer: [{ valueCoding: { code: 'Condom', display: 'Condom' } }],
    },
    {
      id: 'id-10',
      linkId: 'mammogram',
      answer: [{ valueDate: '2024-02-08' }],
    },
    {
      id: 'id-12',
      linkId: 'smoking',
      answer: [{ valueCoding: { system: 'http://snomed.info/sct', code: '8392000', display: 'Non-smoker' } }],
    },
    {
      id: 'id-13',
      linkId: 'drugs',
      answer: [{ valueCoding: { system: 'http://snomed.info/sct', code: '44870007', display: 'Ex-drug user' } }],
    },
    {
      id: 'id-14',
      linkId: 'housing',
      answer: [{ valueCoding: { system: 'http://snomed.info/sct', code: '160943002', display: 'Lives in own home' } }],
    },
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
    { linkId: 'weight', answer: [{ valueQuantity: { value: 180, unit: 'lb' } }] },
    { id: 'id-5', linkId: 'last-period', answer: [{ valueDate: '2024-03-03' }] },
    { id: 'id-6', linkId: 'contraception', answer: [{ valueCoding: { code: 'Condom', display: 'Condom' } }] },
    { id: 'id-10', linkId: 'mammogram', answer: [{ valueDate: '2024-02-08' }] },
    {
      id: 'id-12',
      linkId: 'smoking',
      answer: [{ valueCoding: { system: 'http://snomed.info/sct', code: '8392000', display: 'Non-smoker' } }],
    },
    {
      id: 'id-13',
      linkId: 'drugs',
      answer: [{ valueCoding: { system: 'http://snomed.info/sct', code: '44870007', display: 'Ex-drug user' } }],
    },
    {
      id: 'id-14',
      linkId: 'housing',
      answer: [{ valueCoding: { system: 'http://snomed.info/sct', code: '160943002', display: 'Lives in own home' } }],
    },
    { id: 'id-16', linkId: 'visit-length', answer: [{ valueInteger: 15 }] },
    { id: 'id-21', linkId: 'assessment', answer: [{ valueString: 'Everything looks good.' }] },
  ],
};
