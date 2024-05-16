import { BotEvent, getQuestionnaireAnswers, MedplumClient } from '@medplum/core';
import {
  Bundle,
  CodeableConcept,
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

  const conditionData: ConditionData = {
    reasonForVisit: answers['reason-for-visit']?.valueCoding,
    problemList: answers['problem-list']?.valueBoolean || false,
  };

  const clinicalImpressionData: ClinicalImpressionData = {
    assessment: answers['assessment']?.valueString,
  };

  // Take the objects and create bundle entries from the data for each resource
  const partialObservations = createPartialGeneralObservations(observationData, generalCodes);
  const observationEntries = createObservationEntries(observationData, encounter, user, partialObservations);
  const conditionEntries = createConditionEntries(conditionData, encounter, user);
  const clinicalImpressionEntries = createClinicalImpressionEntry(clinicalImpressionData, encounter, user);

  // Create an array of all entries
  const entry = [...observationEntries, ...conditionEntries];
  if (clinicalImpressionEntries) {
    entry.push(clinicalImpressionEntries);
  }

  // Create the bundle
  const encounterNoteBatch: Bundle = {
    resourceType: 'Bundle',
    type: 'batch',
    entry,
  };

  // Execute the batch to create all resources at once
  const responseBundle = await medplum.executeBatch(encounterNoteBatch);
  return responseBundle;
}

function createPartialGeneralObservations(
  observationData: GeneralObservationData,
  codes: Record<string, CodeableConcept>
): Partial<Observation>[] {
  const partials: Partial<Observation>[] = [];
  for (const [key, value] of Object.entries(observationData)) {
    if (!value || (key === 'bloodPressure' && !value.systolic && !value.diastolic) || key === 'date') {
      continue;
    }

    const resource: Partial<Observation> = {
      code:
        key === 'selfReportedHistory' ? getSelfReportedCode(observationData.selfReportedHistory as string) : codes[key],
    };

    switch (key) {
      case 'height':
        resource.valueQuantity = observationData.height;
        break;
      case 'weight':
        resource.valueQuantity = observationData.weight;
        break;
      case 'hotFlash':
        resource.valueBoolean = observationData.hotFlash;
        break;
      case 'moodSwings':
        resource.valueBoolean = observationData.moodSwings;
        break;
      case 'vaginalDryness':
        resource.valueBoolean = observationData.vaginalDryness;
        break;
      case 'sleepDisturbance':
        resource.valueBoolean = observationData.sleepDisturbance;
        break;
      case 'bloodPressure':
        // Add the blood pressure as a component instead of a value
        resource.component = handleBloodPressure(observationData);
        break;
      case 'bmi':
        resource.valueQuantity = observationData.bmi;
        break;
      case 'selfReportedHistory':
        resource.valueString = observationData.selfReportedHistory;
        break;
    }

    partials.push(resource);
  }

  return partials;
}

function getSelfReportedCode(reportedHistory: string): CodeableConcept {
  const code: CodeableConcept = {
    coding: [],
  };

  // Add the appropriate code based on the answer provided for self-reported history
  switch (reportedHistory) {
    case 'Blood clots':
      code.coding?.push({
        code: 'I74.9',
        system: 'http://hl7.org/fhir/sid/icd-10',
        display: 'Embolism and thrombosis of unspecified artery',
      });
      break;
    case 'Stroke':
      code.coding?.push({
        code: 'I63.9',
        system: 'http://hl7.org/fhir/sid/icd-10',
        display: 'Cerebral infarction, unspecified',
      });
      break;
    case 'Breast cancer':
      code.coding?.push({
        code: 'D05.10',
        system: 'http://hl7.org/fhir/sid/icd-10',
        display: 'Intraductal carcinoma in situ of unspecified breast',
      });
      break;
    case 'Endometrial cancer':
      code.coding?.push({
        code: 'C54.1',
        system: 'http://hl7.org/fhir/sid/icd-10',
        display: 'Malignant neoplasm of endometrium',
      });
      break;
    case 'Irregular bleeding':
      code.coding?.push({
        code: 'N92.1',
        system: 'http://hl7.org/fhir/sid/icd-10',
        display: 'Excessive and frequent menstruation with irregular cycle',
      });
      break;
    case 'BMI > 30':
      code.coding?.push({
        code: 'E66.9',
        system: 'http://hl7.org/fhir/sid/icd-10',
        display: 'Obesity, unspecified',
      });
      break;
  }

  return code;
}

const generalCodes: Record<string, CodeableConcept> = {
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
