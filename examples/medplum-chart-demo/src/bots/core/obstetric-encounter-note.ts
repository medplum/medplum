import { BotEvent, getQuestionnaireAnswers, LOINC, MedplumClient, SNOMED } from '@medplum/core';
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

  // The reason for visit question is required. If it is not included, we throw an error
  if (!answers['reason-for-visit']) {
    throw new Error('Must provide a reason for the visit');
  }

  const date = answers['date'].valueDateTime as string;

  // Parse the answers into more easily usable objects
  const observationData: Record<string, QuestionnaireResponseItemAnswer> = {
    gravida: answers['gravida'],
    para: answers['para'],
    gestationalDays: answers['gestational-age-days'],
    gestationalWeeks: answers['gestational-age-weeks'],
    height: answers['height'],
    weight: answers['weight'],
    totalWeightGain: answers['total-weight-gain'],
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

  // Take the above objects and create resources for each type
  const observations = createObservations(observationData, obstetricCodes, encounter, user, response, date);
  const conditions = createConditions(partialCondition, encounter, user, addToProblemList);
  const clinicalImpressions = createClinicalImpression(encounter, user, note);

  // Create an entry array of all the bundle entries
  const resources: (Observation | Condition | ClinicalImpression)[] = [...observations, ...conditions];
  if (clinicalImpressions) {
    resources.push(clinicalImpressions);
  }

  // Build the bundle
  const bundle = createBundle(resources);

  // Execute the bundle as a batch to create all of the Observation, Condition, and ClinicalImpression resources at once
  const responseBundle = await medplum.executeBatch(bundle);
  return responseBundle;
}

const obstetricCodes: Record<string, CodeableConcept> = {
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
  gravida: {
    coding: [{ code: '161732006', system: SNOMED, display: 'Gravida' }],
  },
  para: {
    coding: [{ code: '118212000', system: SNOMED, display: 'Parity finding' }],
  },
  gestationalDays: {
    coding: [{ code: '49052-4', system: LOINC, display: 'Gestational age in days' }],
  },
  gestationalWeeks: {
    coding: [{ code: '49051-6', system: LOINC, display: 'Gestational age in weeks' }],
  },
  totalWeightGain: {
    coding: [{ code: '56078-9', system: LOINC, display: 'Weight gain [Mass] --during current pregnancy' }],
  },
};
