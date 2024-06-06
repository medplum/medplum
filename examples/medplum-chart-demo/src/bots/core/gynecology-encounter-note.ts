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
  QuestionnaireResponseItemAnswer,
  Reference,
} from '@medplum/fhirtypes';
import {
  BloodPressure,
  createBloodPressureObservation,
  createBundle,
  createClinicalImpressions,
  createConditions,
  createObservations,
} from './charting-utils';
import { calculateBMI } from './observation-utils';

export async function handler(event: BotEvent<QuestionnaireResponse>, medplum: MedplumClient): Promise<Bundle> {
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
    date: answers['date'],
  };

  const bloodPressure: BloodPressure = {
    systolic: answers['systolic']?.valueQuantity,
    diastolic: answers['diastolic']?.valueQuantity,
  };

  if (observationData.height && observationData.weight) {
    observationData.bmi = calculateBMI(observationData.height.valueQuantity, observationData.weight.valueQuantity);
  }

  const problemList = answers['problem-list']?.valueBoolean ?? false;

  const partialCondition: Partial<Condition> = {
    resourceType: 'Condition',
    code: answers['reason-for-visit'].valueCoding,
  };

  const note = answers['assessment']?.valueString;

  // Create resources from the above objects
  const observations = createObservations(observationData, gynecologyCodes, encounter, user, response);
  const bloodPressureObservation = createBloodPressureObservation(bloodPressure, encounter, user, date, response);
  const conditions = createConditions(partialCondition, encounter, user, problemList);
  const clinicalImpressions = createClinicalImpressions(encounter, user, note);

  // Create an array of bundle entries for all resource types
  const resources: (Observation | Condition | ClinicalImpression)[] = [...observations, ...conditions];
  if (bloodPressureObservation) {
    resources.push(bloodPressureObservation);
  }
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
    coding: [{ code: '8665-2', system: 'http://loinc.org', display: 'Last menstrual period start date' }],
  },
  contraception: {
    coding: [{ code: '8659-5', system: 'http://loinc.org', display: 'Birth control method - Reported' }],
  },
  lastMammogram: {
    coding: [{ code: '429736008', system: 'http://snomed.info/sct', display: 'Date of last mammogram' }],
  },
  smokingStatus: {
    coding: [{ code: '72166-2', system: 'http://loinc.org', display: 'Tobacco smoking status' }],
  },
  drugUse: {
    coding: [{ code: '74204-9', system: 'http://loinc.org', display: 'Drug use' }],
  },
  housingStatus: {
    coding: [{ code: '71802-3', system: 'http://loinc.org', display: 'Housing status' }],
  },
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
};
