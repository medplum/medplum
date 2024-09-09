import { BotEvent, getQuestionnaireAnswers, MedplumClient, LOINC } from '@medplum/core';
import {
  Bundle,
  ClinicalImpression,
  CodeableConcept,
  Condition,
  Encounter,
  Observation,
  Practitioner,
  QuestionnaireResponse,
  QuestionnaireResponseItemAnswer,
  Reference,
} from '@medplum/fhirtypes';
import { createBundle, createClinicalImpression, createConditions, createObservations } from './charting-utils';
import { calculateBMI } from './observation-utils';

export async function handler(medplum: MedplumClient, event: BotEvent<QuestionnaireResponse>): Promise<Bundle> {
  // Parse the answers from the QuestionnaireResponse
  const response = event.input;
  const answers = getQuestionnaireAnswers(response);
  // Get the linked encounter and the user who initiated the bot
  const encounter = await medplum.readReference(response.encounter as Reference<Encounter>);
  const user = medplum.getProfile() as Practitioner;

  // Reason for visit is a required answer, so if it is missing throw an error
  if (!answers['reason-for-visit']?.valueCoding) {
    throw new Error('Must provide a reason for the visit');
  }

  const date = answers['date'].valueDateTime as string;

  // Parse the answers into more easily usable objects
  const observationData: Record<string, QuestionnaireResponseItemAnswer> = {
    height: answers['height'],
    weight: answers['weight'],
    hotFlash: answers['hot-flashes'],
    moodSwings: answers['mood-swings'],
    vaginalDryness: answers['vaginal-dryness'],
    sleepDisturbance: answers['sleep-disturbance'],
    selfReportedHistory: answers['self-reported-history'],
    systolic: answers['systolic'],
    diastolic: answers['diastolic'],
  };

  if (observationData.height && observationData.weight) {
    observationData.bmi = calculateBMI(observationData.height.valueQuantity, observationData.weight.valueQuantity);
  }

  const addToProblemList = answers['problem-list']?.valueBoolean ?? false;

  const partialCondition: Partial<Condition> = {
    resourceType: 'Condition',
    code: answers['reason-for-visit'].valueCoding,
  };

  const note = answers['assessment']?.valueString;

  // Take the objects and create full resources of each type
  const observations = createObservations(observationData, generalCodes, encounter, user, response, date);
  const conditions = createConditions(partialCondition, encounter, user, addToProblemList);
  const clinicalImpressions = createClinicalImpression(encounter, user, note);

  // Create an array of all resources
  const resources: (Condition | Observation | ClinicalImpression)[] = [...observations, ...conditions];
  if (clinicalImpressions) {
    resources.push(clinicalImpressions);
  }

  const bundle = createBundle(resources);

  // Execute the batch to create all resources at once
  const responseBundle = await medplum.executeBatch(bundle);
  return responseBundle;
}

export const generalCodes: Record<string, CodeableConcept> = {
  height: {
    coding: [{ code: '8302-2', system: LOINC, display: 'Body height' }],
  },
  weight: {
    coding: [{ code: '29463-7', system: LOINC, display: 'Body weight' }],
  },
  bloodPressure: {
    coding: [{ code: '35094-2', system: LOINC, display: 'Blood pressure panel' }],
  },
  bmi: {
    coding: [{ code: '39156-5', system: LOINC, display: 'Body Mass Index (BMI)' }],
  },
  hotFlash: {
    coding: [{ code: '70376-9', system: LOINC, display: 'I have hot flashes in the last 7 days' }],
  },
  moodSwings: {
    coding: [{ code: '70805-7', system: LOINC, display: 'I have mood swings in the last 7 days' }],
  },
  vaginalDryness: {
    coding: [{ code: '70802-4', system: LOINC, display: 'I have vaginal dryness in the last 7 days' }],
  },
  sleepDisturbance: {
    coding: [{ code: '77712-8', system: LOINC, display: 'Sleep disturbance indicator in the last week' }],
  },
};
