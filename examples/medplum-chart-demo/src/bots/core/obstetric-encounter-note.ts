import { BotEvent, getQuestionnaireAnswers, MedplumClient } from '@medplum/core';
import {
  Bundle,
  ClinicalImpression,
  CodeableConcept,
  Condition,
  Encounter,
  Observation,
  Practitioner,
  Quantity,
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

export interface ObstetricObservationData extends ObservationData {
  gravida?: number;
  para?: number;
  gestationalDays?: number;
  gestationalWeeks?: number;
  totalWeightGain?: Quantity;
}

export async function handler(event: BotEvent<QuestionnaireResponse>, medplum: MedplumClient): Promise<Bundle> {
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

  // Parse the answers into more easily usable objects
  const observationData: ObstetricObservationData = {
    gravida: answers['gravida']?.valueInteger,
    para: answers['para']?.valueInteger,
    gestationalDays: answers['gestational-age-days']?.valueInteger,
    gestationalWeeks: answers['gestational-age-weeks']?.valueInteger,
    height: answers['height']?.valueQuantity,
    weight: answers['weight']?.valueQuantity,
    totalWeightGain: answers['total-weight-gain']?.valueQuantity,
    bloodPressure: {
      systolic: answers['systolic']?.valueInteger,
      diastolic: answers['diastolic']?.valueInteger,
    },
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
    gravida: 'valueInteger',
    para: 'valueInteger',
    gestationalDays: 'valueInteger',
    gestationalWeeks: 'valueInteger',
    totalWeightGain: 'valueQuantity',
  };

  // Take the above objects and create resources for each type
  const observations = createObservations(observationData, obstetricCodes, observationTypes, encounter, user);
  const conditions = createConditions(partialCondition, encounter, user, problemList);
  const clinicalImpressions = createClinicalImpressions(encounter, user, note);

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
  gravida: {
    coding: [{ code: '161732006', system: 'http://snomed.info/sct', display: 'Gravida' }],
  },
  para: {
    coding: [{ code: '118212000', system: 'http://snomed.info/sct', display: 'Parity finding' }],
  },
  gestationalDays: {
    coding: [{ code: '49052-4', system: 'http://loinc.org', display: 'Gestational age in days' }],
  },
  gestationalWeeks: {
    coding: [{ code: '49051-6', system: 'http://loinc.org', display: 'Gestational age in weeks' }],
  },
  totalWeightGain: {
    coding: [{ code: '56078-9', system: 'http://loinc.org', display: 'Weight gain [Mass] --during current pregnancy' }],
  },
};
