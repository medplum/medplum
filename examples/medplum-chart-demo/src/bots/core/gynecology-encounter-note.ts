import { BotEvent, getQuestionnaireAnswers, MedplumClient } from '@medplum/core';
import {
  Bundle,
  ClinicalImpression,
  CodeableConcept,
  Coding,
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

export interface GynecologyObservationData extends ObservationData {
  lastPeriod?: string;
  contraception?: Coding;
  lastMammogram?: string;
  smokingStatus?: Coding;
  drugUse?: Coding;
  housingStatus?: Coding;
}

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

  // Parse the answers into more easily usable objects
  const observationData: GynecologyObservationData = {
    lastPeriod: answers['last-period']?.valueDate,
    contraception: answers['contraception']?.valueCoding,
    lastMammogram: answers['mammogram']?.valueDate,
    smokingStatus: answers['smoking']?.valueCoding,
    drugUse: answers['drugs']?.valueCoding,
    housingStatus: answers['housing']?.valueCoding,
    bloodPressure: {
      systolic: answers['systolic']?.valueInteger,
      diastolic: answers['diastolic']?.valueInteger,
    },
    height: answers['height']?.valueQuantity,
    weight: answers['weight']?.valueQuantity,
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
    lastPeriod: 'valueDateTime',
    contraception: 'valueCodeableConcept',
    lastMammogram: 'valueDateTime',
    smokingStatus: 'valueCodeableConcept',
    drugUse: 'valueCodeableConcept',
    housingStatus: 'valueCodeableConcept',
  };

  // Create bundle entries from the above objects
  // const partialObservations = createPartialGynecologyObservations(observationData, gynecologyCodes);
  const observations = createObservations(
    observationData,
    gynecologyCodes,
    observationTypes,
    encounter,
    user,
    response
  );
  const conditions = createConditions(partialCondition, encounter, user, problemList);
  const clinicalImpressions = createClinicalImpressions(encounter, user, note);

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
