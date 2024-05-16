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

export interface ObservationData {
  bloodPressure: {
    systolic?: number;
    diastolic?: number;
  };
  height?: Quantity;
  weight?: Quantity;
  bmi?: Quantity;
  date?: string;
}

export interface ConditionData {
  reasonForVisit: Coding;
  problemList: boolean;
}

export interface ClinicalImpressionData {
  visitLength?: number;
  assessment?: string;
}

/**
 * This function takes partial observations with the code and value and fills them out with generic observation data. It then creates a
 * bundle entry and adds that to an array. These bundle entries can then be used in a batch transaction to create all of the necessary
 * Observations at once.
 *
 * @param observationData - The values to be added to the created Observations
 * @param encounter - The encounter the observations are derived from
 * @param user - The user creating the Observations
 * @param partialObservations - An array of the partial Observations containing the code and value for each given observation
 * @returns An array of bundle entries which can be added to a batch transaction
 */
export function createObservationEntries(
  observationData: ObservationData,
  encounter: Encounter,
  user: Practitioner,
  partialObservations: Partial<Observation>[]
): BundleEntry[] {
  const entries: BundleEntry[] = [];
  for (const partial of partialObservations) {
    const code = partial.code;
    if (!code) {
      throw new Error('No code provided');
    }
    const request: BundleEntryRequest = {
      method: 'PUT',
      url: code.coding?.[0].code
        ? `Observation?encounter=${getReferenceString(encounter)}&code=${code.coding?.[0].code}`
        : `Observation?encounter=${getReferenceString(encounter)}`,
    };

    const observation: Observation = {
      ...partial,
      resourceType: 'Observation',
      status: 'final',
      code,
      subject: encounter.subject,
      encounter: { reference: getReferenceString(encounter) },
      performer: [{ reference: getReferenceString(user) }],
      effectiveDateTime: observationData.date,
    };

    entries.push({
      fullUrl: generateId(),
      request,
      resource: observation,
    });
  }

  return entries;
}

/**
 * This function handles adding blood pressure measurements to an observation since there are often both systolic and diastolic
 * measurements which need to be added to the component element.
 *
 * @param observationData - The data object containing the blood pressure values
 * @returns An Observation component element with diastolic, systolic, or both blood pressure measurements
 */
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

/**
 * This function takes condition data and turns it into an array of bundle entries that can be used in a batch transaction. If the
 * Condition is being added to the problem list, then an additional Condition resource will be created. For more details see the
 * Representing Diagnoses docs here: https://www.medplum.com/docs/charting/representing-diagnoses
 *
 * @param conditionData - Data object containg codes and values for a condition/reason for the visit.
 * @param encounter - The encounter the data is derived from.
 * @param user - The user creating the Condition resource
 * @returns An array of bundle entries containing the Condition resource that can be created in a batch request.
 */
export function createConditionEntries(
  conditionData: ConditionData,
  encounter: Encounter,
  user: Practitioner
): BundleEntry[] {
  const code = conditionData.reasonForVisit.code;
  const entries: BundleEntry[] = [];
  const request: BundleEntryRequest = {
    method: 'PUT',
    url: `Condition?encounter=${getReferenceString(encounter)}&code=${code}`,
  };
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

/**
 * This function takes ClinicalImpression data and creates a bundle entry so that it can be added to a batch transaction. The
 * ClinicalImpression resource represents any notes on an encounter in this context.
 *
 * @param clinicalImpressionData - Data object containing codes and values for the ClinicalImpression resources
 * @param encounter - The encounter that the data is derived from
 * @param user - The user creating the ClinicalImpressions
 * @returns A bundle entry with the ClinicalImpression resource that can be used in a batch transaction
 */
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
    request: { method: 'PUT', url: `ClinicalImpression?encounter=${getReferenceString(encounter)}` },
    resource: clinicalImpression,
  };
}

/**
 * This function calculates the BMI of a patient based on their height and weight. Reference: https://my.clevelandclinic.org/health/articles/9464-body-mass-index-bmi
 *
 * @param height - The height of the patient
 * @param weight - The weight of the patient
 * @returns The BMI of the patient
 */
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
