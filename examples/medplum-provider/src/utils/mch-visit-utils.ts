// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type {
    CodeableConcept,
    Encounter,
    Flag,
    Observation,
    Patient,
    Quantity,
    QuestionnaireResponse,
    QuestionnaireResponseItem,
    QuestionnaireResponseItemAnswer,
} from '@medplum/fhirtypes';

const LOINC = 'http://loinc.org';
const OBSERVATION_CATEGORY_SYSTEM = 'http://terminology.hl7.org/CodeSystem/observation-category';
const FLAG_CATEGORY_SYSTEM = 'http://terminology.hl7.org/CodeSystem/flag-category';
const SNOMED = 'http://snomed.info/sct';

interface NumericObservationDefinition {
  linkId: string;
  code: string;
  display: string;
  unit: string;
  system: string;
  unitCode: string;
}

interface StringObservationDefinition {
  linkId: string;
  code: string;
  display: string;
}

interface DangerSignDefinition {
  linkId: string;
  code: string;
  display: string;
}

interface DateObservationDefinition {
  linkId: string;
  code: string;
  display: string;
}

const NUMERIC_OBSERVATIONS: NumericObservationDefinition[] = [
  { linkId: 'gestational-age-weeks', code: '11884-4', display: 'Gestational age', unit: 'weeks', system: 'http://unitsofmeasure.org', unitCode: 'wk' },
  { linkId: 'fundal-height-cm', code: '11881-0', display: 'Uterus fundal height', unit: 'cm', system: 'http://unitsofmeasure.org', unitCode: 'cm' },
  { linkId: 'fetal-heart-rate-bpm', code: '55283-6', display: 'Fetal heart rate', unit: 'beats/min', system: 'http://unitsofmeasure.org', unitCode: '/min' },
  { linkId: 'weight-kg', code: '29463-7', display: 'Body weight', unit: 'kg', system: 'http://unitsofmeasure.org', unitCode: 'kg' },
  { linkId: 'systolic-bp', code: '8480-6', display: 'Systolic blood pressure', unit: 'mmHg', system: 'http://unitsofmeasure.org', unitCode: 'mm[Hg]' },
  { linkId: 'diastolic-bp', code: '8462-4', display: 'Diastolic blood pressure', unit: 'mmHg', system: 'http://unitsofmeasure.org', unitCode: 'mm[Hg]' },
];

const STRING_OBSERVATIONS: StringObservationDefinition[] = [
  { linkId: 'urine-protein', code: '5804-0', display: 'Protein [Mass/volume] in urine by test strip' },
  { linkId: 'urine-glucose', code: '5792-7', display: 'Glucose [Mass/volume] in urine by test strip' },
];

const DANGER_SIGNS: DangerSignDefinition[] = [
  { linkId: 'danger-bleeding', code: '289530006', display: 'Vaginal bleeding in pregnancy' },
  { linkId: 'danger-severe-headache', code: '25064002', display: 'Headache' },
  { linkId: 'danger-abdominal-pain', code: '21522001', display: 'Abdominal pain' },
  { linkId: 'danger-reduced-fetal-movement', code: '276369006', display: 'Reduced fetal movement' },
];

const DATE_OBSERVATIONS: DateObservationDefinition[] = [
  { linkId: 'last-menstrual-period', code: '8665-2', display: 'Last menstrual period start date' },
  { linkId: 'estimated-delivery-date', code: '11778-8', display: 'Delivery date estimated' },
];

const INTEGER_OBSERVATIONS: StringObservationDefinition[] = [
  { linkId: 'gravida', code: '11996-6', display: 'Gravida' },
  { linkId: 'para', code: '11977-6', display: 'Para' },
];

export const ANC_OBSERVATION_CODES = new Set([
  ...NUMERIC_OBSERVATIONS.map((definition) => definition.code),
  ...STRING_OBSERVATIONS.map((definition) => definition.code),
  ...DATE_OBSERVATIONS.map((definition) => definition.code),
  ...INTEGER_OBSERVATIONS.map((definition) => definition.code),
]);

export const ANC_DANGER_SIGN_CODES = new Set(DANGER_SIGNS.map((definition) => definition.code));

export async function saveAncVisitResponse(
  medplum: MedplumClient,
  patient: WithId<Patient>,
  encounter: WithId<Encounter>,
  response: QuestionnaireResponse
): Promise<void> {
  const authored = new Date().toISOString();
  const encounterReference = createReference(encounter);
  const patientReference = createReference(patient);

  await medplum.createResource<QuestionnaireResponse>({
    ...response,
    status: response.status ?? 'completed',
    authored,
    subject: patientReference,
    encounter: encounterReference,
  });

  const answers = flattenAnswers(response.item ?? []);
  const observations: Observation[] = [];
  const flags: Flag[] = [];

  for (const definition of NUMERIC_OBSERVATIONS) {
    const value = getNumericAnswer(answers.get(definition.linkId));
    if (value === undefined) {
      continue;
    }
    observations.push({
      resourceType: 'Observation',
      status: 'final',
      category: [vitalSignsCategory()],
      code: loincCode(definition.code, definition.display),
      subject: patientReference,
      encounter: encounterReference,
      effectiveDateTime: authored,
      valueQuantity: quantity(value, definition.unit, definition.system, definition.unitCode),
    });
  }

  for (const definition of STRING_OBSERVATIONS) {
    const value = getStringAnswer(answers.get(definition.linkId));
    if (!value) {
      continue;
    }
    observations.push({
      resourceType: 'Observation',
      status: 'final',
      category: [laboratoryCategory()],
      code: loincCode(definition.code, definition.display),
      subject: patientReference,
      encounter: encounterReference,
      effectiveDateTime: authored,
      valueString: value,
    });
  }

  for (const definition of DATE_OBSERVATIONS) {
    const value = getDateAnswer(answers.get(definition.linkId));
    if (!value) {
      continue;
    }
    observations.push({
      resourceType: 'Observation',
      status: 'final',
      category: [surveyCategory()],
      code: loincCode(definition.code, definition.display),
      subject: patientReference,
      encounter: encounterReference,
      effectiveDateTime: authored,
      valueDateTime: value,
    });
  }

  for (const definition of INTEGER_OBSERVATIONS) {
    const value = getNumericAnswer(answers.get(definition.linkId));
    if (value === undefined) {
      continue;
    }
    observations.push({
      resourceType: 'Observation',
      status: 'final',
      category: [surveyCategory()],
      code: loincCode(definition.code, definition.display),
      subject: patientReference,
      encounter: encounterReference,
      effectiveDateTime: authored,
      valueInteger: value,
    });
  }

  for (const definition of DANGER_SIGNS) {
    if (getBooleanAnswer(answers.get(definition.linkId)) !== true) {
      continue;
    }
    flags.push({
      resourceType: 'Flag',
      status: 'active',
      category: [clinicalFlagCategory()],
      code: {
        coding: [{ system: SNOMED, code: definition.code, display: definition.display }],
        text: definition.display,
      },
      subject: patientReference,
      encounter: encounterReference,
      period: { start: authored },
    });
  }

  await Promise.all([
    ...observations.map((observation) => medplum.createResource<Observation>(observation)),
    ...flags.map((flag) => medplum.createResource<Flag>(flag)),
  ]);
}

function flattenAnswers(items: QuestionnaireResponseItem[]): Map<string, QuestionnaireResponseItemAnswer> {
  const answers = new Map<string, QuestionnaireResponseItemAnswer>();
  for (const item of items) {
    if (item.answer?.[0]) {
      answers.set(item.linkId, item.answer[0]);
    }
    for (const answer of item.answer ?? []) {
      for (const nestedItem of answer.item ?? []) {
        for (const [linkId, nestedAnswer] of flattenAnswers([nestedItem])) {
          answers.set(linkId, nestedAnswer);
        }
      }
    }
    for (const nestedItem of item.item ?? []) {
      for (const [linkId, nestedAnswer] of flattenAnswers([nestedItem])) {
        answers.set(linkId, nestedAnswer);
      }
    }
  }
  return answers;
}

function getNumericAnswer(answer: QuestionnaireResponseItemAnswer | undefined): number | undefined {
  return answer?.valueDecimal ?? answer?.valueInteger;
}

function getStringAnswer(answer: QuestionnaireResponseItemAnswer | undefined): string | undefined {
  return answer?.valueString?.trim() || answer?.valueCoding?.display || answer?.valueCoding?.code;
}

function getBooleanAnswer(answer: QuestionnaireResponseItemAnswer | undefined): boolean | undefined {
  return answer?.valueBoolean;
}

function getDateAnswer(answer: QuestionnaireResponseItemAnswer | undefined): string | undefined {
  return answer?.valueDate;
}

function loincCode(code: string, display: string): CodeableConcept {
  return { coding: [{ system: LOINC, code, display }], text: display };
}

function quantity(value: number, unit: string, system: string, code: string): Quantity {
  return { value, unit, system, code };
}

function vitalSignsCategory(): CodeableConcept {
  return { coding: [{ system: OBSERVATION_CATEGORY_SYSTEM, code: 'vital-signs', display: 'Vital Signs' }] };
}

function laboratoryCategory(): CodeableConcept {
  return { coding: [{ system: OBSERVATION_CATEGORY_SYSTEM, code: 'laboratory', display: 'Laboratory' }] };
}

function surveyCategory(): CodeableConcept {
  return { coding: [{ system: OBSERVATION_CATEGORY_SYSTEM, code: 'survey', display: 'Survey' }] };
}

function clinicalFlagCategory(): CodeableConcept {
  return { coding: [{ system: FLAG_CATEGORY_SYSTEM, code: 'clinical', display: 'Clinical' }] };
}
