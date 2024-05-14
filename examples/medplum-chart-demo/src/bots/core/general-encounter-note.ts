import { BotEvent, generateId, getQuestionnaireAnswers, getReferenceString, MedplumClient } from '@medplum/core';
import {
  QuestionnaireResponse,
  ClinicalImpression,
  Coding,
  Practitioner,
  BundleEntry,
  Observation,
  Encounter,
  Patient,
  Reference,
  Condition,
  Bundle,
  BundleEntryRequest,
  CodeableConcept,
  Quantity,
  ObservationComponent,
} from '@medplum/fhirtypes';

interface ObservationData {
  bloodPressure: {
    diastolic?: number;
    systolic?: number;
  };
  height?: Quantity;
  weight?: Quantity;
  hotFlash?: boolean;
  moodSwings?: boolean;
  vaginalDryness?: boolean;
  sleepDisturbance?: boolean;
  selfReportedHistory?: string;
  bmi?: Quantity;
  date?: string;
}

interface ConditionData {
  reasonForVisit?: Coding;
  problemList: boolean;
}

interface ClinicalImpressionData {
  assessment?: string;
}

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
  const observationData: ObservationData = {
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
  const observationEntries = createObservationEntries(observationData, encounter, user);
  const conditionEntries = createConditionEntries(conditionData, encounter, user);
  const clinicalImpressionEntries = createClinicalImpressionEntries(clinicalImpressionData, encounter, user);

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

function createObservationEntries(
  observationData: ObservationData,
  encounter: Encounter,
  user: Practitioner
): BundleEntry[] {
  const entries: BundleEntry[] = [];
  const request: BundleEntryRequest = { method: 'POST', url: 'Observation' };
  // Create a generic observation that just needs to have a code and value added to it
  const genericObservationData: Observation = {
    resourceType: 'Observation',
    status: 'preliminary',
    subject: encounter.subject,
    encounter: { reference: getReferenceString(encounter) },
    performer: [{ reference: getReferenceString(user) }],
    effectiveDateTime: observationData.date,
    code: {},
  };

  // Loop over each observation data point
  for (const [key, value] of Object.entries(observationData)) {
    // If there is no value, skip
    // If it is a blood pressure observation, check for one of systolic or diastolic, otherwise skip
    if (!value || (key === 'bloodPressure' && !value.systolic && !value.diastolic) || key === 'date') {
      continue;
    }

    // Create the entry and add it to the array of entries
    entries.push(createObservationEntry(key, request, genericObservationData, observationData));
  }

  return entries;
}

function createObservationEntry(
  key: string,
  request: BundleEntryRequest,
  genericObservation: Observation,
  observationData: ObservationData
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

function handleBloodPressure(observationData: ObservationData): ObservationComponent[] {
  const components: ObservationComponent[] = [];
  const bloodPressure = observationData.bloodPressure;

  // Add diastolic if it exists
  if (bloodPressure.diastolic) {
    components.push({
      code: { coding: [{ code: '8462-4', system: 'http://loinc.org', display: 'Diastolic blood pressure' }] },
      valueQuantity: {
        value: observationData.bloodPressure.diastolic,
        unit: 'mm[Hg]',
      },
    });
  }

  // Add systolic if it exists
  if (bloodPressure.systolic) {
    components.push({
      code: { coding: [{ code: '8480-6', system: 'http://loinc.org', display: 'Systolic blood pressure' }] },
      valueQuantity: {
        value: observationData.bloodPressure.systolic,
        unit: 'mm[Hg]',
      },
    });
  }

  return components;
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

function createConditionEntries(conditionData: ConditionData, encounter: Encounter, user: Practitioner): BundleEntry[] {
  const entries: BundleEntry[] = [];
  const request: BundleEntryRequest = { method: 'POST', url: 'Condition' };
  // Create an encounter diagnosis condition
  const encounterDiagnosis: Condition = {
    resourceType: 'Condition',
    subject: encounter.subject as Reference<Patient>,
    encounter: { reference: getReferenceString(encounter) },
    recorder: { reference: getReferenceString(user) },
    asserter: { reference: getReferenceString(user) },
    code: conditionData.reasonForVisit,
    category: [
      {
        coding: [
          {
            system: 'http://hl7.org/fhir/ValueSet/condition-category',
            code: 'encounter-diagnosis',
            display: 'Encounter Diagnosis',
          },
        ],
      },
    ],
  };

  entries.push({ fullUrl: generateId(), request, resource: encounterDiagnosis });

  // If the response specified that the condition should be added to the problem list, create an additional condition to add to the problem list
  if (conditionData.problemList) {
    entries.push({
      fullUrl: generateId(),
      request,
      resource: {
        resourceType: 'Condition',
        subject: encounter.subject as Reference<Patient>,
        encounter: { reference: getReferenceString(encounter) },
        recorder: { reference: getReferenceString(user) },
        asserter: { reference: getReferenceString(user) },
        code: conditionData.reasonForVisit,
        category: [
          {
            coding: [
              {
                system: 'http://hl7.org/fhir/ValueSet/condition-category',
                code: 'problem-list-item',
                display: 'Problem List Item',
              },
            ],
          },
        ],
      },
    });
  }

  return entries;
}

function createClinicalImpressionEntries(
  clinicalImpressionData: ClinicalImpressionData,
  encounter: Encounter,
  user: Practitioner
): BundleEntry | undefined {
  if (!clinicalImpressionData.assessment) {
    return undefined;
  }

  // Create the clinical impression
  const clinicalImpression: ClinicalImpression = {
    resourceType: 'ClinicalImpression',
    status: 'in-progress',
    subject: encounter.subject as Reference<Patient>,
    date: new Date().toISOString(),
    encounter: { reference: getReferenceString(encounter) },
    assessor: { reference: getReferenceString(user) },
    note: [{ text: clinicalImpressionData.assessment }],
  };

  // Return the clinical impression as a bundle entry
  return {
    fullUrl: generateId(),
    request: { method: 'POST', url: 'ClinicalImpression' },
    resource: clinicalImpression,
  };
}

export function calculateBMI(height: Quantity, weight: Quantity): Quantity {
  if (!height?.value || !weight?.value) {
    throw new Error('All values must be provided');
  }
  const heightM = getHeightInMeters(height);
  const weightKg = getWeightInKilograms(weight);

  const bmi = Math.round((weightKg / heightM ** 2) * 10) / 10;
  return {
    value: bmi,
    unit: 'kg/m^2',
  };
}

function getWeightInKilograms(weight: Quantity): number {
  if (!weight.unit) {
    throw new Error('No unit defined');
  }
  const unit = weight.unit;
  const weightVal = weight.value as number;

  switch (unit) {
    case 'lb':
      return weightVal / 2.2;
    case 'kg':
      return weightVal;
    default:
      throw new Error('Unknown unit. Please provide weight in one of the following units: Pounds or kilograms.');
  }
}

function getHeightInMeters(height: Quantity): number {
  if (!height.unit) {
    throw new Error('No unit defined');
  }
  const unit = height.unit;
  const heightVal = height.value as number;

  switch (unit) {
    case 'in':
      return (heightVal * 2.54) / 100;
    case 'ft':
      return (heightVal * 12 * 2.54) / 100;
    case 'cm':
      return heightVal / 100;
    case 'm':
      return heightVal;
    default:
      throw new Error(
        'Unknown unit. Please provide height in one of the following units: Inches, feet, centimeters, or meters.'
      );
  }
}
