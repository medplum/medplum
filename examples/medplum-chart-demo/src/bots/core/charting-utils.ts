import { getReferenceString } from '@medplum/core';
import {
  Bundle,
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
  Resource,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';

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
export function createObservations(
  observationData: ObservationData,
  encounter: Encounter,
  user: Practitioner,
  partialObservations: Partial<Observation>[]
): Observation[] {
  const observations: Observation[] = [];
  for (const partial of partialObservations) {
    const code = partial.code;
    if (!code) {
      throw new Error('No code provided');
    }
    // const request: BundleEntryRequest = {
    //   method: 'PUT',
    //   url: code.coding?.[0].code
    //     ? `Observation?encounter=${getReferenceString(encounter)}&code=${code.coding?.[0].code}`
    //     : `Observation?encounter=${getReferenceString(encounter)}`,
    // };

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

    observations.push(observation);
  }

  return observations;
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
export function createConditions(conditionData: ConditionData, encounter: Encounter, user: Practitioner): Condition[] {
  const conditions: Condition[] = [];
  // const request: BundleEntryRequest = {
  //   method: 'PUT',
  //   url: `Condition?encounter=${getReferenceString(encounter)}&code=${code}`,
  // };
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

  conditions.push(encounterDiagnosis);

  // If the problem list question was checked, create an additional condition for it
  if (conditionData.problemList) {
    conditions.push({
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
    });
  }

  return conditions;
}

/**
 * This function takes ClinicalImpression data and creates a ClinicalImpression resource. The ClinicalImpression resource
 * represents any notes on an encounter in this context.
 *
 * @param clinicalImpressionData - Data object containing codes and values for the ClinicalImpression resources
 * @param encounter - The encounter that the data is derived from
 * @param user - The user creating the ClinicalImpressions
 * @returns A bundle entry with the ClinicalImpression resource that can be used in a batch transaction
 */
export function createClinicalImpressions(
  clinicalImpressionData: ClinicalImpressionData,
  encounter: Encounter,
  user: Practitioner
): ClinicalImpression | undefined {
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

  // Return the clinical impressions
  return clinicalImpression;
}

/**
 * This function takes an array of resources and creates a bundle that can be executed to create multiple resources at
 * once. It will perform an upsert on the resources so that they are not duplicated.
 *
 * @param resources - An array of Conditions, Observations, and ClinicalImpressions to be added to the bundle
 * @returns A bundle entry that can be executed to simultaneously create all the necessary Conditions, Observations, and
 * ClinicalImpressions
 */
export function createBundle(resources: (Condition | Observation | ClinicalImpression)[]): Bundle {
  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'transaction',
  };

  const entries: BundleEntry[] = resources.map((resource) => {
    const entry: BundleEntry = {
      fullUrl: `urn:uuid:${randomUUID()}`,
      request: { method: 'PUT', url: getUrl(resource) },
      resource,
    };

    return entry;
  });

  bundle.entry = entries;

  return bundle;
}

function getUrl(resource: Resource): string {
  if (resource.resourceType === 'Observation') {
    const code = resource.code;
    if (!code) {
      throw new Error('No code provided');
    }
    if (!resource.encounter) {
      throw new Error('No linked encounter');
    }
    const url = code.coding?.[0].code
      ? `Observation?encounter=${getReferenceString(resource.encounter)}&code=${code.coding?.[0].code}`
      : `Observation?encounter=${getReferenceString(resource.encounter)}`;

    return url;
  } else if (resource.resourceType === 'Condition') {
    const code = resource.code;
    if (!code) {
      throw new Error('No code provided');
    }
    if (!resource.encounter) {
      throw new Error('No linked encounter');
    }

    return `Condition?encounter=${getReferenceString(resource.encounter)}&code=${code}`;
  } else if (resource.resourceType === 'ClinicalImpression') {
    if (!resource.encounter) {
      throw new Error('No linked encounter');
    }
    return `ClinicalImpression?encounter=${getReferenceString(resource.encounter)}`;
  } else {
    throw new Error('Invalid resource type');
  }
}
