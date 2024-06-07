import { getReferenceString } from '@medplum/core';
import {
  Bundle,
  BundleEntry,
  ClinicalImpression,
  CodeableConcept,
  Condition,
  Encounter,
  Observation,
  ObservationComponent,
  Patient,
  Practitioner,
  Quantity,
  QuestionnaireResponse,
  QuestionnaireResponseItemAnswer,
  Reference,
  Resource,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';

export interface BloodPressure {
  systolic?: Quantity;
  diastolic?: Quantity;
}

/**
 * This function takes data about observations and returns an array of Observation resources.
 *
 * @param observationData - An easily parseable object containing data for various observation resources
 * @param codes - A map of observation types to their coding
 * @param encounter - The encounter the observations are derived from
 * @param user - The user creating the observations
 * @param response - The QuestionnaireResponse that the observations are being created from
 * @param date - The date the measurements were taken
 * @returns An array of Observation resources.
 */
export function createObservations(
  observationData: Record<string, QuestionnaireResponseItemAnswer>,
  codes: Record<string, CodeableConcept>,
  encounter: Encounter,
  user: Practitioner,
  response: QuestionnaireResponse,
  date: string
): Observation[] {
  const observations: Observation[] = [];
  const bloodPressure: BloodPressure = {
    systolic: observationData.systolic?.valueQuantity,
    diastolic: observationData.diastolic?.valueQuantity,
  };

  const bloodPressureObservation = createBloodPressureObservation(bloodPressure, encounter, user, date, response);
  if (bloodPressureObservation) {
    observations.push(bloodPressureObservation);
  }

  for (const [key, value] of Object.entries(observationData)) {
    if (!value || key === 'systolic' || key === 'diastolic') {
      continue;
    }
    if (key === 'selfReportedHistory' && !value?.valueString) {
      throw new Error('Invalid reported history');
    }

    const code = key === 'selfReportedHistory' ? selfReportedHistory[value.valueString as string] : codes[key];

    if (!code) {
      throw new Error('No code provided');
    }

    const resource: Record<string, any> = {
      code,
      ...observationData[key],
    };

    const observation: Observation = {
      ...resource,
      resourceType: 'Observation',
      code,
      status: 'final',
      subject: encounter.subject,
      performer: [{ reference: getReferenceString(user) }],
      encounter: { reference: getReferenceString(encounter) },
      effectiveDateTime: date,
      derivedFrom: [{ reference: getReferenceString(response) }],
    };

    observations.push(observation);
  }

  return observations;
}

/**
 * Blood pressure is a special case, since it can often have two components - systolic and diastolic. Because of this it is handled on its own so both measurements can be added to the same Observation
 *
 * @param bloodPressure - The blood pressure measurements
 * @param encounter - The linked encounter that the blood pressure measurements were taken at
 * @param user - The user creating the blood pressure observations
 * @param date - The date of the observations
 * @param response - The QuestionnaireResponse that the answers are derived from
 * @returns A blood pressure Observation resource
 */
export function createBloodPressureObservation(
  bloodPressure: BloodPressure,
  encounter: Encounter,
  user: Practitioner,
  date: string,
  response: QuestionnaireResponse
): Observation | undefined {
  const { systolic, diastolic } = bloodPressure;
  if (!systolic && !diastolic) {
    return undefined;
  }
  const component = handleBloodPressure(systolic, diastolic);
  const bloodPressureObservation: Observation = {
    resourceType: 'Observation',
    status: 'final',
    code: {
      coding: [{ code: '35094-2', system: 'http://loinc.org', display: 'Blood pressure panel' }],
    },
    subject: encounter.subject,
    performer: [{ reference: getReferenceString(user) }],
    encounter: { reference: getReferenceString(encounter) },
    effectiveDateTime: date,
    derivedFrom: [{ reference: getReferenceString(response) }],
    component,
  };

  return bloodPressureObservation;
}

/**
 * This function handles adding blood pressure measurements to an observation since there are often both systolic and diastolic.
 * Blood pressure is handled specially because it is a single `Observation` with two `components`. See the U.S. Core Guidelines
 * for more details (https://hl7.org/fhir/us/core/StructureDefinition-us-core-blood-pressure.html)
 *
 * @param systolic - The systolic blood pressure value
 * @param diastolic - The diastolic blood pressure value
 * @returns An Observation component element with diastolic, systolic, or both blood pressure measurements
 */
function handleBloodPressure(systolic?: Quantity, diastolic?: Quantity): ObservationComponent[] {
  const components: ObservationComponent[] = [];

  // If a diastolic measurement exists, add it
  if (diastolic) {
    components.push({
      code: { coding: [{ code: '8462-4', system: 'http://loinc.org', display: 'Diastolic blood pressure' }] },
      valueQuantity: diastolic,
    });
  }

  // If a systolic measurement exists, add it
  if (systolic) {
    components.push({
      code: { coding: [{ code: '8480-6', system: 'http://loinc.org', display: 'Systolic blood pressure' }] },
      valueQuantity: systolic,
    });
  }

  return components;
}

/**
 * This function takes condition data and turns it into an array of Condition resources. If the
 * Condition is being added to the problem list, then an additional Condition resource will be created. For more details see the
 * Representing Diagnoses docs here: https://www.medplum.com/docs/charting/representing-diagnoses
 *
 * @param partialCondition - A partial Condition resource to be added to
 * @param encounter - The encounter the data is derived from.
 * @param user - The user creating the Condition resource
 * @param problemList - A boolean indicating if the condition should be added to the patient's problem list
 * @returns An array of Condition resources.
 */
export function createConditions(
  partialCondition: Partial<Condition>,
  encounter: Encounter,
  user: Practitioner,
  problemList: boolean
): Condition[] {
  const conditions: Condition[] = [];

  // Create a condition for the encounter diagnosis
  const encounterDiagnosis: Condition = {
    ...partialCondition,
    resourceType: 'Condition',
    subject: encounter.subject as Reference<Patient>,
    encounter: { reference: getReferenceString(encounter) },
    recorder: { reference: getReferenceString(user) },
    asserter: { reference: getReferenceString(user) },
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
  if (problemList) {
    conditions.push({
      ...partialCondition,
      resourceType: 'Condition',
      subject: encounter.subject as Reference<Patient>,
      encounter: { reference: getReferenceString(encounter) },
      recorder: { reference: getReferenceString(user) },
      asserter: { reference: getReferenceString(user) },
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
 * @param encounter - The encounter that the data is derived from
 * @param user - The user creating the ClinicalImpressions
 * @param note - A string of any notes that a Practitioner may have taken during the encounter
 * @returns A ClinicalImpression resource
 */
export function createClinicalImpression(
  encounter: Encounter,
  user: Practitioner,
  note?: string
): ClinicalImpression | undefined {
  if (!note) {
    return undefined;
  }

  // Create the clinical impression
  const clinicalImpression: ClinicalImpression = {
    resourceType: 'ClinicalImpression',
    status: 'in-progress',
    subject: encounter.subject as Reference<Patient>,
    encounter: { reference: getReferenceString(encounter) },
    assessor: { reference: getReferenceString(user) },
    note: [{ text: note }],
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
      request: { method: 'PUT', url: getUpsertUrl(resource) },
      resource,
    };

    return entry;
  });

  bundle.entry = entries;

  return bundle;
}

/**
 *
 * @param resource - The resource that is being upserted
 * @returns A search url that can be used to upsert a resource
 */
function getUpsertUrl(resource: Resource): string {
  if (resource.resourceType === 'Observation') {
    const code = resource.code;
    if (!code.coding?.[0].code) {
      throw new Error('No code provided');
    }
    if (!resource.encounter) {
      throw new Error('No linked encounter');
    }
    const url = `Observation?encounter=${getReferenceString(resource.encounter)}&code=${code.coding?.[0].code}`;

    return url;
  } else if (resource.resourceType === 'Condition') {
    const code = resource.code;
    if (!code) {
      throw new Error('No code provided');
    }
    if (!resource.encounter) {
      throw new Error('No linked encounter');
    }

    return `Condition?encounter=${getReferenceString(resource.encounter)}&code=${code.coding?.[0].code}`;
  } else if (resource.resourceType === 'ClinicalImpression') {
    if (!resource.encounter) {
      throw new Error('No linked encounter');
    }
    return `ClinicalImpression?encounter=${getReferenceString(resource.encounter)}`;
  } else {
    throw new Error('Invalid resource type');
  }
}

// A map of self-reported history types to the relevant coding.
const selfReportedHistory: Record<string, CodeableConcept> = {
  'Blood clots': {
    coding: [
      {
        code: 'I74.9',
        system: 'http://hl7.org/fhir/sid/icd-10',
        display: 'Embolism and thrombosis of unspecified artery',
      },
    ],
  },
  Stroke: {
    coding: [
      {
        code: 'I63.9',
        system: 'http://hl7.org/fhir/sid/icd-10',
        display: 'Cerebral infarction, unspecified',
      },
    ],
  },
  'Breast cancer': {
    coding: [
      {
        code: 'D05.10',
        system: 'http://hl7.org/fhir/sid/icd-10',
        display: 'Intraductal carcinoma in situ of unspecified breast',
      },
    ],
  },
  'Endometrial cancer': {
    coding: [
      {
        code: 'C54.1',
        system: 'http://hl7.org/fhir/sid/icd-10',
        display: 'Malignant neoplasm of endometrium',
      },
    ],
  },
  'Irregular bleeding': {
    coding: [
      {
        code: 'N92.1',
        system: 'http://hl7.org/fhir/sid/icd-10',
        display: 'Excessive and frequent menstruation with irregular cycle',
      },
    ],
  },
  'BMI > 30': {
    coding: [
      {
        code: 'E66.9',
        system: 'http://hl7.org/fhir/sid/icd-10',
        display: 'Obesity, unspecified',
      },
    ],
  },
};
