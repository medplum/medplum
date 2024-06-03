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
  Quantity,
  QuestionnaireResponse,
  Reference,
} from '@medplum/fhirtypes';
import {
  ClinicalImpressionData,
  ConditionData,
  createBundle,
  createClinicalImpressions,
  createConditions,
  createObservations,
  handleBloodPressure,
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

  const conditionData: ConditionData = {
    reasonForVisit: answers['reason-for-visit'].valueCoding as Coding,
    problemList: answers['problem-list']?.valueBoolean ?? false,
  };

  const clinicalImpressionData: ClinicalImpressionData = {
    assessment: answers['assessment']?.valueString,
  };

  // Take the above objects and create bundle entries for each resource type.
  const partialObservations = createPartialObstetricObservations(observationData, obstetricCodes);
  const observations = createObservations(observationData, encounter, user, partialObservations);
  const conditions = createConditions(conditionData, encounter, user);
  const clinicalImpressions = createClinicalImpressions(clinicalImpressionData, encounter, user);

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

function createPartialObstetricObservations(
  observationData: ObstetricObservationData,
  codes: Record<string, CodeableConcept>
): Partial<Observation>[] {
  const partials: Partial<Observation>[] = [];
  for (const [key, value] of Object.entries(observationData)) {
    if (!value || (key === 'bloodPressure' && !value.systolic && !value.diastolic) || key === 'date') {
      continue;
    }

    const resource: Partial<Observation> = {
      code: codes[key],
    };

    switch (key) {
      case 'gravida':
        resource.valueInteger = observationData.gravida;
        break;
      case 'para':
        resource.valueInteger = observationData.para;
        break;
      case 'gestationalDays':
        resource.valueInteger = observationData.gestationalDays;
        break;
      case 'gestationalWeeks':
        resource.valueInteger = observationData.gestationalWeeks;
        break;
      case 'height':
        resource.valueQuantity = observationData.height;
        break;
      case 'weight':
        resource.valueQuantity = observationData.weight;
        break;
      case 'totalWeightGain':
        resource.valueQuantity = observationData.totalWeightGain;
        break;
      case 'bloodPressure':
        // Since there may be multiple blood pressure values, we create a component instead of a value like the other observations
        resource.component = handleBloodPressure(observationData);
        break;
      case 'bmi':
        resource.valueQuantity = observationData.bmi;
        break;
    }

    partials.push(resource);
  }

  return partials;
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
