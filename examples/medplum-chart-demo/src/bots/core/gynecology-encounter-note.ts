import { BotEvent, generateId, getQuestionnaireAnswers, MedplumClient } from '@medplum/core';
import {
  Bundle,
  BundleEntry,
  BundleEntryRequest,
  CodeableConcept,
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
  ObservationData,
} from './charting-utils';

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

  const conditionData: ConditionData = {
    reasonForVisit: answers['reason-for-visit'].valueCoding,
    problemList: answers['problem-list']?.valueBoolean ?? false,
  };

  const clinicalImpressionData: ClinicalImpressionData = {
    visitLength: answers['visit-length']?.valueInteger,
    assessment: answers['assessment']?.valueString,
  };

  // Create bundle entries from the above objects
  const partialObservations = createPartialGynecologyObservations(observationData, gynecologyCodes);
  const observationEntries = createObservationEntries(observationData, encounter, user, partialObservations);
  const conditionEntry = createConditionEntries(conditionData, encounter, user);
  const clinicalImpressionEntry = createClinicalImpressionEntry(clinicalImpressionData, encounter, user);

  // Create an array of bundle entries for all resource types
  const entry = [...observationEntries, ...conditionEntry];
  if (clinicalImpressionEntry) {
    entry.push(clinicalImpressionEntry);
  }

  // Create a batch
  const resourceBatch: Bundle = {
    resourceType: 'Bundle',
    type: 'batch',
    entry,
  };

  // Execute the batch to create all resources at once
  const responseBundle = await medplum.executeBatch(resourceBatch);
  return responseBundle;
}

function createPartialGynecologyObservations(
  observationData: GynecologyObservationData,
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
      case 'lastPeriod':
        resource.valueDateTime = observationData.lastPeriod;
        break;
      case 'contraception':
        resource.valueCodeableConcept = observationData.contraception;
        break;
      case 'lastMammogram':
        resource.valueDateTime = observationData.lastMammogram;
        break;
      case 'smokingStatus':
        resource.valueCodeableConcept = observationData.smokingStatus;
        break;
      case 'drugUse':
        resource.valueCodeableConcept = observationData.drugUse;
        break;
      case 'housingStatus':
        resource.valueCodeableConcept = observationData.housingStatus;
        break;
      case 'height':
        resource.valueQuantity = observationData.height;
        break;
      case 'weight':
        resource.valueQuantity = observationData.weight;
        break;
      case 'bloodPressure':
        // Add the blood pressure as a component instead of a value
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
