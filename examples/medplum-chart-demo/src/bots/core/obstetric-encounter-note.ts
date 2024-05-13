import { BotEvent, generateId, getQuestionnaireAnswers, getReferenceString, MedplumClient } from '@medplum/core';
import {
  Bundle,
  BundleEntry,
  BundleEntryRequest,
  ClinicalImpression,
  CodeableConcept,
  Coding,
  Condition,
  Encounter,
  Observation,
  ObservationComponent,
  Patient,
  Practitioner,
  Quantity,
  QuestionnaireResponse,
  Reference,
} from '@medplum/fhirtypes';

interface ObservationData {
  gravida?: number;
  para?: number;
  gestationalDays?: number;
  gestationalWeeks?: number;
  height?: Quantity;
  weight?: Quantity;
  totalWeightGain?: Quantity;
  bloodPressure: {
    systolic?: number;
    diastolic?: number;
  };
}

interface ConditionData {
  reasonForVisit: CodeableConcept;
  problemList: boolean;
}

interface ClinicalImpressionData {
  assessment?: string;
}

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
  const observationData: ObservationData = {
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
  };

  const conditionData: ConditionData = {
    reasonForVisit: answers['reason-for-visit'].valueCoding as Coding,
    problemList: answers['problem-list']?.valueBoolean ?? false,
  };

  const clinicalImpressionData: ClinicalImpressionData = {
    assessment: answers['assessment']?.valueString,
  };

  // Take the above objects and create bundle entries for each resource type.
  const observationEntries = createObservationEntries(observationData, encounter, user);
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

function createObservationEntries(
  observationData: ObservationData,
  encounter: Encounter,
  user: Practitioner
): BundleEntry[] {
  const entries: BundleEntry[] = [];
  const request: BundleEntryRequest = { method: 'POST', url: 'Observation' };

  // A generic observation resource that can be used for all of the Observations by adding a code and value
  const genericObservation: Observation = {
    resourceType: 'Observation',
    status: 'preliminary',
    subject: encounter.subject,
    encounter: { reference: getReferenceString(encounter) },
    performer: [{ reference: getReferenceString(user) }],
    code: {},
  };

  // Loop over each answer from the data
  for (const [key, value] of Object.entries(observationData)) {
    // If there is no value, skip that key
    // Additionally, if it is blood pressure check that at least one value is populated, otherwise skip it
    if (!value || (key === 'bloodPressure' && !value.systolic && !value.diastolic)) {
      continue;
    }
    // Create a Bundle entry with the obsevation and add it to the entry array
    entries.push(createObservationEntry(key, request, genericObservation, observationData));
  }

  // Return all of the created entries
  return entries;
}

function createObservationEntry(
  key: string,
  request: BundleEntryRequest,
  generic: Observation,
  observationData: ObservationData
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

  // Add the diastolic measurement if it exists
  if (bloodPressure.diastolic) {
    components.push({
      code: { coding: [{ code: '8462-4', system: 'http://loinc.org', display: 'Diastolic blood pressure' }] },
      valueQuantity: {
        value: bloodPressure.diastolic,
        unit: 'mm[Hg]',
      },
    });
  }

  // Add the sytolic measurement if it exists
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

function createConditionEntries(conditionData: ConditionData, encounter: Encounter, user: Practitioner): BundleEntry[] {
  const entries: BundleEntry[] = [];
  // Create an encounter diagnosis condition
  const encounterDiagnosis: Condition = {
    resourceType: 'Condition',
    subject: encounter.subject as Reference<Patient>,
    encounter: { reference: getReferenceString(encounter) },
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
    code: conditionData.reasonForVisit,
  };

  entries.push({ fullUrl: generateId(), request: { method: 'POST', url: 'Condition' }, resource: encounterDiagnosis });

  // If the response specified that the condition should be added to the problem list, create an additional condition to add to the problem list
  if (conditionData.problemList) {
    entries.push({
      fullUrl: generateId(),
      request: { method: 'POST', url: 'Condition' },
      resource: {
        resourceType: 'Condition',
        subject: encounter.subject as Reference<Patient>,
        encounter: { reference: getReferenceString(encounter) },
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
        code: conditionData.reasonForVisit,
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
