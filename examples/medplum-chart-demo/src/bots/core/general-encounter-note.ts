import { BotEvent, generateId, getQuestionnaireAnswers, MedplumClient } from '@medplum/core';
import {
  QuestionnaireResponse,
  Practitioner,
  BundleEntry,
  Observation,
  Encounter,
  Reference,
  Bundle,
  BundleEntryRequest,
  CodeableConcept,
} from '@medplum/fhirtypes';
import {
  calculateBMI,
  ClinicalImpressionData,
  ConditionData,
  createClinicalImpressionEntry,
  createConditionEntries,
  createObservationEntries,
  GeneralObservationData,
  handleBloodPressure,
} from './bot-utils';

export async function handler(event: BotEvent<QuestionnaireResponse>, medplum: MedplumClient): Promise<Bundle> {
  // Parse the answers from the QuestionnaireResponse
  const response = event.input as QuestionnaireResponse;
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
  const observationEntries = createObservationEntries(observationData, encounter, user, createObservationEntry);
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

function createObservationEntry(
  key: string,
  request: BundleEntryRequest,
  genericObservation: Observation,
  observationData: GeneralObservationData
): BundleEntry {
  // Create the generic observation
  const resource = {
    ...genericObservation,
    code: {},
  };

  // Add the code and value based on the key
  switch (key) {
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
    case 'hotFlash':
      resource.code = {
        coding: [
          {
            code: '70376-9',
            system: 'http://loinc.org',
            display: 'I have hot flashes in the last 7 days',
          },
        ],
      };
      resource.valueBoolean = observationData.hotFlash;
      break;
    case 'moodSwings':
      resource.code = {
        coding: [
          {
            code: '70805-7',
            system: 'http://loing.org',
            display: 'I have mood swings in the last 7 days',
          },
        ],
      };
      resource.valueBoolean = observationData.moodSwings;
      break;
    case 'vaginalDryness':
      resource.code = {
        coding: [
          {
            code: '70802-4',
            system: 'http://loing.org',
            display: 'I have vaginal dryness in the last 7 days',
          },
        ],
      };
      resource.valueBoolean = observationData.vaginalDryness;
      break;
    case 'sleepDisturbance':
      resource.code = {
        coding: [
          {
            code: '77712-8',
            system: 'http://loing.org',
            display: 'Sleep disturbance indicator in the last week',
          },
        ],
      };
      resource.valueBoolean = observationData.sleepDisturbance;
      break;
    case 'selfReportedHistory':
      // Self reported history can have multiple codes
      resource.code = getSelfReportedCode(observationData.selfReportedHistory as string);
      resource.valueString = observationData.selfReportedHistory;
      break;
    case 'bloodPressure':
      resource.code = {
        coding: [{ code: '35094-2', system: 'http://loinc.org', display: 'Blood pressure panel' }],
      };
      // Add the blood pressure as a component instead of a value
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

function getSelfReportedCode(reportedHistory: string): CodeableConcept {
  const code: CodeableConcept = {
    coding: [],
  };

  // Add the appropriate code based on the answer provided for self-reported history
  switch (reportedHistory) {
    case 'Blood clots':
      code.coding?.push({ code: '75753009', system: 'http://snomed.info/sct', display: 'Blood clot' });
      break;
    case 'Stroke':
      code.coding?.push({ code: '230690007', system: 'http://snomed.info/sct', display: 'Stroke' });
      break;
    case 'Breast cancer':
      code.coding?.push({ code: '254837009', system: 'http://snomed.info/sct', display: 'Breast cancer' });
      break;
    case 'Endometrial cancer':
      code.coding?.push({
        code: '315267003',
        system: 'http://snomed.info/sct',
        display: 'Suspected endometrial canncer',
      });
      break;
    case 'Irregular bleeding':
      code.coding?.push({
        code: '64996003',
        system: 'http://snomed.info/sct',
        display: 'Irregular intermenstrual bleeding',
      });
      break;
    case 'BMI > 30':
      code.coding?.push({
        code: '162864005',
        system: 'http://snomed.info/sct',
        display: 'Body mass index 30+ - obesity',
      });
      break;
  }

  return code;
}
