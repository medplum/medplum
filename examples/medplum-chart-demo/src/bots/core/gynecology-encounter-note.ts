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
  // Get the linked encounter and user who initiated the bot
  const encounter = await medplum.readReference(response.encounter as Reference<Encounter>);
  const user = medplum.getProfile() as Practitioner;

  // Reason for visit is required to have an answer, so an error is thrown if there isn't one
  if (!answers['reason-for-visit']?.valueCoding) {
    throw new Error('Must provide a reason for the visit');
  }

  const date = answers['date'].valueDateTime as string;

  // Parse the answers into more easily usable objects
  const observationData: Record<string, QuestionnaireResponseItemAnswer> = {
    lastPeriod: answers['last-period'],
    contraception: answers['contraception'],
    lastMammogram: answers['mammogram'],
    smokingStatus: answers['smoking'],
    drugUse: answers['drugs'],
    housingStatus: answers['housing'],
    height: answers['height'],
    weight: answers['weight'],
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

  // Create resources from the above objects
  const observations = createObservations(observationData, gynecologyCodes, encounter, user, response, date);
  const conditions = createConditions(partialCondition, encounter, user, addToProblemList);
  const clinicalImpressions = createClinicalImpression(encounter, user, note);

  // Create an array of bundle entries for all resource types
  const resources: (Observation | Condition | ClinicalImpression)[] = [...observations, ...conditions];
  if (clinicalImpressions) {
    resources.push(clinicalImpressions);
  }

  const bundle = createBundle(resources);

  // Execute the batch to create all resources at once
  const responseBundle = await medplum.executeBatch(bundle);
  return responseBundle;
}

const gynecologyCodes: Record<string, CodeableConcept> = {
  lastPeriod: {
    coding: [{ code: '8665-2', system: LOINC, display: 'Last menstrual period start date' }],
  },
  contraception: {
    coding: [{ code: '8659-5', system: LOINC, display: 'Birth control method - Reported' }],
  },
  lastMammogram: {
    coding: [{ code: '429736008', system: SNOMED, display: 'Date of last mammogram' }],
  },
  smokingStatus: {
    coding: [{ code: '72166-2', system: LOINC, display: 'Tobacco smoking status' }],
  },
  drugUse: {
    coding: [{ code: '74204-9', system: LOINC, display: 'Drug use' }],
  },
  housingStatus: {
    coding: [{ code: '71802-3', system: LOINC, display: 'Housing status' }],
  },
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
};
