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

/**
 * This function takes data about observations and returns an array of Observation resources.
 *
 * @param observationData - An easily parseable object containing data for various observation resources
 * @param codes - A map of observation types to their coding
 * @param observationTypes - A map of observations types to their type of value
 * @param encounter - The encounter the observations are derived from
 * @param user - The user creating the observations
 * @returns An array of Observation resources.
 */
export function createObservations(
  observationData: ObservationData,
  codes: Record<string, CodeableConcept>,
  observationTypes: { [key: string]: string },
  encounter: Encounter,
  user: Practitioner
): Observation[] {
  const observations: Observation[] = [];

  for (const [key, value] of Object.entries(observationData)) {
    if (!value || (key === 'bloodPressure' && !value.systolic && !value.diastolic) || key === 'date') {
      continue;
    }

    const code =
      key === 'selfReportedHistory'
        ? getSelfReportedCode(observationData['selfReportedHistory' as keyof ObservationData] as string)
        : codes[key];

    if (!code) {
      throw new Error('No code provided');
    }

    const obsKey = observationTypes[key] as keyof Observation;

    const resource: Record<string, any> = {
      code,
    };

    if (key !== 'bloodPressure') {
      resource[obsKey] = observationData[key as keyof ObservationData];
    }

    if (key === 'bloodPressure') {
      resource.component = handleBloodPressure(
        observationData.bloodPressure.systolic,
        observationData.bloodPressure.diastolic
      );
    }

    const observation: Observation = {
      ...resource,
      resourceType: 'Observation',
      code:
        key === 'selfReportedHistory'
          ? getSelfReportedCode(observationData['selfReportedHistory' as keyof ObservationData] as string)
          : codes[key],
      status: 'final',
      subject: encounter.subject,
      performer: [{ reference: getReferenceString(user) }],
      encounter: { reference: getReferenceString(encounter) },
      effectiveDateTime: observationData.date,
    };

    observations.push(observation);
  }

  return observations;
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
export function handleBloodPressure(systolic?: number, diastolic?: number): ObservationComponent[] {
  const components: ObservationComponent[] = [];

  // If a diastolic measurement exists, add it
  if (diastolic) {
    components.push({
      code: { coding: [{ code: '8462-4', system: 'http://loinc.org', display: 'Diastolic blood pressure' }] },
      valueQuantity: {
        value: diastolic,
        unit: 'mm[Hg]',
      },
    });
  }

  // If a systolic measurement exists, add it
  if (systolic) {
    components.push({
      code: { coding: [{ code: '8480-6', system: 'http://loinc.org', display: 'Systolic blood pressure' }] },
      valueQuantity: {
        value: systolic,
        unit: 'mm[Hg]',
      },
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
export function createClinicalImpressions(
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

/**
 *
 * @param reportedHistory - The value provided in the questionnaire for a patient's self-reported history
 * @returns A codeable concept to identify the reported history in the observation
 */
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
