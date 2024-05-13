import { BotEvent, generateId, getQuestionnaireAnswers, getReferenceString, MedplumClient } from '@medplum/core';
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
  QuestionnaireResponse,
  Reference,
} from '@medplum/fhirtypes';

interface ObservationData {
  lastPeriod?: string;
  contraception?: Coding;
  lastMammogram?: string;
  smokingStatus?: Coding;
  drugUse?: Coding;
  housingStatus?: Coding;
  bloodPressure: {
    systolic?: number;
    diastolic?: number;
  };
  height?: Quantity;
  weight?: Quantity;
}

interface ConditionData {
  reasonForVisit: Coding;
  problemList: boolean;
}

interface ClinicalImpressionData {
  visitLength?: number;
  assessment?: string;
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
  const observationData: ObservationData = {
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
  };

  const conditionData: ConditionData = {
    reasonForVisit: answers['reason-for-visit'].valueCoding,
    problemList: answers['problem-list']?.valueBoolean ?? false,
  };

  const clinicalImpressionData: ClinicalImpressionData = {
    visitLength: answers['visit-length']?.valueInteger,
    assessment: answers['assessment']?.valueString,
  };

  // Create bundle entries from the above objects
  const observationEntries = createObservationEntries(observationData, encounter, user);
  const conditionEntry = createConditionEntry(conditionData, encounter, user);
  const clinicalImpressionEntry = createClinicalImpressionEntry(clinicalImpressionData, encounter, user);

  // Create an array of bundle entries for all resource types
  const entry = [...observationEntries, ...conditionEntry];
  clinicalImpressionEntry && entry.push(clinicalImpressionEntry);

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

function createObservationEntries(
  observationData: ObservationData,
  encounter: Encounter,
  user: Practitioner
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
    code: {},
  };

  // Loop over each entry of the observation data
  for (const [key, value] of Object.entries(observationData)) {
    // If there is no value for a key, skip
    // Check that blood pressure has a measurement for at least one of systolic and diastolic, otherwise skip
    if (!value || (key === 'bloodPressure' && !value.systolic && !value.diastolic)) {
      continue;
    }

    // Create an entry and add it to the entries array
    entries.push(createObservationEntry(key, request, genericObservation, observationData));
  }

  return entries;
}

function createObservationEntry(
  key: string,
  request: BundleEntryRequest,
  genericObservation: Observation,
  observationData: ObservationData
): BundleEntry {
  // Create a base resource from the generic
  const resource: Observation = {
    ...genericObservation,
    code: {},
  };

  // Add the appropriate code and value based on the key
  switch (key) {
    case 'lastPeriod':
      resource.code = {
        coding: [{ code: '8665-2', system: 'http://loinc.org', display: 'Last menstrual period start date' }],
      };
      resource.valueDateTime = observationData.lastPeriod;
      break;
    case 'contraception':
      resource.code = {
        coding: [{ code: '8659-5', system: 'http://loinc.org', display: 'Birth control method - Reported' }],
      };
      resource.valueCodeableConcept = observationData.contraception;
      break;
    case 'lastMammogram':
      resource.code = {
        coding: [{ code: '429736008', system: 'http://snomed.info/sct', display: 'Date of last mammogram' }],
      };
      resource.valueDateTime = observationData.lastMammogram;
      break;
    case 'smokingStatus':
      resource.code = {
        coding: [{ code: '72166-2', system: 'http://loinc.org', display: 'Tobacco smoking status' }],
      };
      resource.valueCodeableConcept = observationData.smokingStatus;
      break;
    case 'drugUse':
      resource.code = {
        coding: [{ code: '74204-9', system: 'http://loinc.org', display: 'Drug use' }],
      };
      resource.valueCodeableConcept = observationData.drugUse;
      break;
    case 'housingStatus':
      resource.code = {
        coding: [{ code: '71802-3', system: 'http://loinc.org', display: 'Housing status' }],
      };
      resource.valueCodeableConcept = observationData.housingStatus;
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
    case 'bloodPressure':
      resource.code = {
        coding: [{ code: '35094-2', system: 'http://loinc.org', display: 'Blood pressure panel' }],
      };
      // Add the blood pressure as a component instead of a value
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

function createConditionEntry(conditionData: ConditionData, encounter: Encounter, user: Practitioner): BundleEntry[] {
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
  conditionData.problemList &&
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

  return entries;
}

function createClinicalImpressionEntry(
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
