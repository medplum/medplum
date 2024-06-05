import { BotEvent, getQuestionnaireAnswers, MedplumClient } from '@medplum/core';
import {
  Bundle,
  ClinicalImpression,
  CodeableConcept,
  Condition,
  Encounter,
  Observation,
  Practitioner,
  QuestionnaireResponse,
  Reference,
} from '@medplum/fhirtypes';
import {
  createBundle,
  createClinicalImpressions,
  createConditions,
  createObservations,
  ObservationData,
} from './charting-utils';
import { calculateBMI } from './observation-utils';

export interface GeneralObservationData extends ObservationData {
  hotFlash?: boolean;
  moodSwings?: boolean;
  vaginalDryness?: boolean;
  sleepDisturbance?: boolean;
  selfReportedHistory?: string;
}

export async function handler(event: BotEvent<QuestionnaireResponse>, medplum: MedplumClient): Promise<Bundle> {
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

  // Parse the answers into more easily usable objects
  const observationData: GeneralObservationData = {
    bloodPressure: {
      diastolic: answers['diastolic']?.valueInteger,
      systolic: answers['systolic']?.valueInteger,
    },
    height: answers['height']?.valueQuantity,
    weight: answers['weight']?.valueQuantity,
    hotFlash: answers['hot-flashes']?.valueBoolean,
    moodSwings: answers['mood-swings']?.valueBoolean,
    vaginalDryness: answers['vaginal-dryness']?.valueBoolean,
    sleepDisturbance: answers['sleep-disturbance']?.valueBoolean,
    selfReportedHistory: answers['self-reported-history']?.valueString,
    date: answers['date']?.valueDateTime,
  };

  if (observationData.height && observationData.weight) {
    observationData.bmi = calculateBMI(observationData.height, observationData.weight);
  }

  const problemList = answers['problem-list']?.valueBoolean ?? false;

  const partialCondition: Partial<Condition> = {
    resourceType: 'Condition',
    code: answers['reason-for-visit'].valueCoding,
  };

  const note = answers['assessment']?.valueString;

  const observationTypes: { [key: string]: string } = {
    height: 'valueQuantity',
    weight: 'valueQuantity',
    bmi: 'valueQuantity',
    hotFlash: 'valueBoolean',
    moodSwings: 'valueBoolean',
    vaginalDryness: 'valueBoolean',
    sleepDisturbance: 'valueBoolean',
    selfReportedHistory: 'valueString',
  };

  // Take the objects and create full resources of each type
  // const partialObservations = createPartialGeneralObservations(observationData, generalCodes);
  const observations = createObservations(observationData, generalCodes, observationTypes, encounter, user, response);
  const conditions = createConditions(partialCondition, encounter, user, problemList);
  const clinicalImpressions = createClinicalImpressions(encounter, user, note);

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
    coding: [{ code: '8302-2', system: 'http://loinc.org', display: 'Body height' }],
  },
  weight: {
    coding: [{ code: '29463-7', system: 'http://loinc.org', display: 'Body weight' }],
  },
  bloodPressure: {
    coding: [{ code: '35094-2', system: 'http://loinc.org', display: 'Blood pressure panel' }],
  },
  bmi: {
    coding: [{ code: '39156-5', system: 'http://loinc.org', display: 'Body Mass Index (BMI)' }],
  },
  hotFlash: {
    coding: [{ code: '70376-9', system: 'http://loinc.org', display: 'I have hot flashes in the last 7 days' }],
  },
  moodSwings: {
    coding: [{ code: '70805-7', system: 'http://loing.org', display: 'I have mood swings in the last 7 days' }],
  },
  vaginalDryness: {
    coding: [{ code: '70802-4', system: 'http://loing.org', display: 'I have vaginal dryness in the last 7 days' }],
  },
  sleepDisturbance: {
    coding: [{ code: '77712-8', system: 'http://loing.org', display: 'Sleep disturbance indicator in the last week' }],
  },
};
