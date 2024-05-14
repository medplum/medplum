import { BotEvent, generateId, getQuestionnaireAnswers, MedplumClient } from '@medplum/core';
import {
  Bundle,
  BundleEntry,
  BundleEntryRequest,
  Coding,
  Encounter,
  Observation,
  Practitioner,
  QuestionnaireResponse,
  Reference,
} from '@medplum/fhirtypes';
import {
  calculateBMI,
  ClinicalImpressionData,
  ConditionData,
  createClinicalImpressionEntry,
  createConditionEntries,
  createObservationEntries,
  handleBloodPressure,
  ObstetricObservationData,
} from './bot-utils';

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
  const observationEntries = createObservationEntries(observationData, encounter, user, createObservationEntry);
  const conditionEntries = createConditionEntries(conditionData, encounter, user);
  const clinicalImpressionEntry = createClinicalImpressionEntry(clinicalImpressionData, encounter, user);

  // Create an entry array of all the bundle entries
  const entry = observationEntries.concat(conditionEntries);
  if (clinicalImpressionEntry) {
    entry.push(clinicalImpressionEntry);
  }

  // Build the bundle
  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'batch',
    entry,
  };

  // Execute the bundle as a batch to create all of the Observation, Condition, and ClinicalImpression resources at once
  const responseBundle = await medplum.executeBatch(bundle);
  return responseBundle;
}

function createObservationEntry(
  key: string,
  request: BundleEntryRequest,
  generic: Observation,
  observationData: ObstetricObservationData
): BundleEntry {
  // Use the generic data from above
  const resource: Observation = {
    ...generic,
  };

  // Based on the key add the appropriate code and value
  switch (key) {
    case 'gravida':
      resource.code = {
        coding: [{ code: '161732006', system: 'http://snomed.info/sct', display: 'Gravida' }],
      };
      resource.valueInteger = observationData.gravida;
      break;
    case 'para':
      resource.code = {
        coding: [{ code: '118212000', system: 'http://snomed.info/sct', display: 'Parity finding' }],
      };
      resource.valueInteger = observationData.para;
      break;
    case 'gestationalDays':
      resource.code = {
        coding: [{ code: '49052-4', system: 'http://loinc.org', display: 'Gestational age in days' }],
      };
      resource.valueInteger = observationData.gestationalDays;
      break;
    case 'gestationalWeeks':
      resource.code = {
        coding: [{ code: '49051-6', system: 'http://loinc.org', display: 'Gestational age in weeks' }],
      };
      resource.valueInteger = observationData.gestationalWeeks;
      break;
    case 'height':
      resource.code = {
        coding: [{ code: '8302-2', system: 'http://loinc.org', display: 'Body height' }],
      };
      resource.valueQuantity = observationData.height;
      break;
    case 'weight':
      resource.code = {
        coding: [{ code: '29463-7', system: 'http://loinc.org', display: 'Body weight' }],
      };
      resource.valueQuantity = observationData.weight;
      break;
    case 'totalWeightGain':
      resource.code = {
        coding: [
          { code: '56078-9', system: 'http://loinc.org', display: 'Weight gain [Mass] --during current pregnancy' },
        ],
      };
      resource.valueQuantity = observationData.totalWeightGain;
      break;
    case 'bloodPressure':
      resource.code = {
        coding: [{ code: '35094-2', system: 'http://loinc.org', display: 'Blood pressure panel' }],
      };
      // Since there may be multiple blood pressure values, we create a component instead of a value like the other observations
      resource.component = handleBloodPressure(observationData);
      break;
    case 'bmi':
      resource.code = {
        coding: [{ code: '39156-5', system: 'http://loinc.org', display: 'Body Mass Index (BMI)' }],
      };
      resource.valueQuantity = observationData.bmi;
      break;
  }

  return {
    fullUrl: generateId(),
    request,
    resource,
  };
}
