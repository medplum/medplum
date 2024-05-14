import { generateId, getReferenceString } from '@medplum/core';
import {
  BundleEntry,
  BundleEntryRequest,
  ClinicalImpression,
  Coding,
  Condition,
  Encounter,
  Observation,
  ObservationComponent,
  Patient,
  Practitioner,
  Quantity,
  Reference,
} from '@medplum/fhirtypes';

interface ObservationData {
  bloodPressure: {
    systolic?: number;
    diastolic?: number;
  };
  height?: Quantity;
  weight?: Quantity;
  bmi?: Quantity;
  date?: string;
}

export interface GeneralObservationData extends ObservationData {
  hotFlash?: boolean;
  moodSwings?: boolean;
  vaginalDryness?: boolean;
  sleepDisturbance?: boolean;
  selfReportedHistory?: string;
}

export interface GynecologyObservationData extends ObservationData {
  lastPeriod?: string;
  contraception?: Coding;
  lastMammogram?: string;
  smokingStatus?: Coding;
  drugUse?: Coding;
  housingStatus?: Coding;
}

export interface ObstetricObservationData extends ObservationData {
  gravida?: number;
  para?: number;
  gestationalDays?: number;
  gestationalWeeks?: number;
  totalWeightGain?: Quantity;
}

export interface ConditionData {
  reasonForVisit: Coding;
  problemList: boolean;
}

export interface ClinicalImpressionData {
  visitLength?: number;
  assessment?: string;
}

export function createObservationEntries(
  observationData: GeneralObservationData | GynecologyObservationData | ObstetricObservationData,
  encounter: Encounter,
  user: Practitioner,
  createEntryFunction: (
    key: string,
    request: BundleEntryRequest,
    genericObservation: Observation,
    observationData: GeneralObservationData | GynecologyObservationData | ObstetricObservationData
  ) => BundleEntry
): BundleEntry[] {
  const entries: BundleEntry[] = [];
  const request: BundleEntryRequest = { method: 'POST', url: 'Observation' };
  // Create a generic observation that just needs to have a code and value added to it
  const genericObservation: Observation = {
    resourceType: 'Observation',
    status: 'preliminary',
    subject: encounter.subject,
    encounter: { reference: getReferenceString(encounter) },
    performer: [{ reference: getReferenceString(user) }],
    effectiveDateTime: observationData.date,
    code: {},
  };

  // Loop over each entry of the observation data
  for (const [key, value] of Object.entries(observationData)) {
    // If there is no value for a key, skip
    // Check that blood pressure has a measurement for at least one of systolic and diastolic, otherwise skip
    // Date is used to get the time for each observation, but does not create its own observation so skip it
    if (!value || (key === 'bloodPressure' && !value.systolic && !value.diastolic) || key === 'date') {
      continue;
    }

    // Create an entry and add it to the entries array
    entries.push(createEntryFunction(key, request, genericObservation, observationData));
  }

  return entries;
}

export function handleBloodPressure(observationData: ObservationData): ObservationComponent[] {
  const components: ObservationComponent[] = [];
  const bloodPressure = observationData.bloodPressure;

  // If a diastolic measurement exists, add it
  if (bloodPressure.diastolic) {
    components.push({
      code: { coding: [{ code: '8462-4', system: 'http://loinc.org', display: 'Diastolic blood pressure' }] },
      valueQuantity: {
        value: bloodPressure.diastolic,
        unit: 'mm[Hg]',
      },
    });
  }

  // If a systolic measurement exists, add it
  if (bloodPressure.systolic) {
    components.push({
      code: { coding: [{ code: '8480-6', system: 'http://loinc.org', display: 'Systolic blood pressure' }] },
      valueQuantity: {
        value: bloodPressure.systolic,
        unit: 'mm[Hg]',
      },
    });
  }

  return components;
}

export function createConditionEntries(
  conditionData: ConditionData,
  encounter: Encounter,
  user: Practitioner
): BundleEntry[] {
  const entries: BundleEntry[] = [];
  const request: BundleEntryRequest = { method: 'POST', url: 'Condition' };
  // Create a condition for the encounter diagnosis
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

  // If the problem list question was checked, create an additional condition for it
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

export function createClinicalImpressionEntry(
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
    encounter: { reference: getReferenceString(encounter) },
    assessor: { reference: getReferenceString(user) },
    note: [{ text: clinicalImpressionData.assessment }],
  };

  // Return the clinical impression in a bundle entry
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
