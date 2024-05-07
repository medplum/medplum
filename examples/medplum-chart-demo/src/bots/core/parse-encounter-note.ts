import {
  BotEvent,
  generateId,
  getDisplayString,
  getQuestionnaireAnswers,
  getReferenceString,
  MedplumClient,
} from '@medplum/core';
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
} from '@medplum/fhirtypes';

interface ObservationData {
  diastolicBloodPressure?: number;
  systolicBloodPressure?: number;
  height?: number;
  weight?: number;
}

interface ConditionData {
  reasonForVisit?: Coding;
  problemList: boolean;
}

interface ClinicalImpressionData {
  notes?: string;
}

export async function handler(medplum: MedplumClient, event: BotEvent<QuestionnaireResponse>): Promise<boolean> {
  const response = event.input as QuestionnaireResponse;

  const [observationData, conditionData, clinicalImpressionData] = parseResponse(response);

  return false;
}

function parseResponse(response: QuestionnaireResponse): [ObservationData, ConditionData, ClinicalImpressionData] {
  // Get the answers
  const answers = getQuestionnaireAnswers(response);

  // Separate the answers into observations, conditions, and clinical impressions
  const observationData = {
    diastolicBloodPressure: answers['diastolic-blood-pressure'].valueInteger,
    systolicBloodPressure: answers['systolic-blood-pressure'].valueInteger,
    height: answers['vitals-height'].valueInteger,
    weight: answers['vitals-weight'].valueInteger,
  };

  const conditionData = {
    reasonForVisit: answers['reason-for-visit'].valueCoding,
    problemList: answers['problem-list'].valueBoolean || false,
  };

  const clinicalImpressionData = {
    notes: answers['notes-and-comments'].valueString,
  };

  // Return a tuple of the observation, condition, and clinical impression data
  return [observationData, conditionData, clinicalImpressionData];
}

function createObservationBatch(
  observationData: ObservationData,
  encounter: Encounter,
  user: Practitioner
): BundleEntry[] {
  // Create the blood pressure observation with components for both systolic and diastolic
  const bloodPressureObservation: Observation = {
    resourceType: 'Observation',
    status: 'preliminary',
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: '85354-9',
          display: 'Blood pressure panel with all children optional',
        },
      ],
      text: 'Blood pressure systolic & diastolic',
    },
    subject: encounter.subject,
    encounter: { reference: getReferenceString(encounter) },
    performer: [{ reference: getReferenceString(user) }],
    component: [
      {
        code: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '271649006',
              display: 'Systolic blood pressure',
            },
          ],
        },
        valueQuantity: {
          value: observationData.systolicBloodPressure,
          unit: 'mmHg',
          system: 'http://unitsofmeasure.org',
          code: 'mm[Hg]',
        },
      },
      {
        code: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '271650006',
              display: 'Diastolic blood pressure',
            },
          ],
        },
        valueQuantity: {
          value: observationData.diastolicBloodPressure,
          unit: 'mmHg',
          system: 'http://unitsofmeasure.org',
          code: 'mm[Hg]',
        },
      },
    ],
  };

  // Create the height observation
  const heightObservation: Observation = {
    resourceType: 'Observation',
    status: 'preliminary',
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: '8302-2',
          display: 'Body height',
        },
      ],
    },
    subject: encounter.subject,
    encounter: { reference: getReferenceString(encounter) },
    performer: [{ reference: getReferenceString(user) }],
    valueQuantity: {
      value: observationData.height,
      unit: 'cm',
      system: 'http://unitsofmeasure.org',
      code: 'cm',
    },
  };

  // Create the weight observation
  const weightObservation: Observation = {
    resourceType: 'Observation',
    status: 'preliminary',
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: '29463-7',
          display: 'Body Weight',
        },
      ],
    },
    subject: encounter.subject,
    encounter: { reference: getReferenceString(encounter) },
    performer: [{ reference: getReferenceString(user) }],
    valueQuantity: {
      value: observationData.weight,
      unit: 'lbs',
      system: 'http://unitsofmeasure.org',
      code: '[lb_av]',
    },
  };

  // Create a bundle entry with all observations
  const observationBatch: BundleEntry[] = [
    {
      fullUrl: 'urn:uuid:4c644324-0ac7-4014-ab1f-2dd3c64aef60',
      request: { method: 'POST', url: 'Observation' },
      resource: bloodPressureObservation,
    },
    {
      fullUrl: 'urn:uuid:0d0a71ab-b038-4cb5-9e3a-dc7a59c76a07',
      request: { method: 'POST', url: 'Observation' },
      resource: heightObservation,
    },
    {
      fullUrl: 'urn:uuid:afa0caef-fa18-482e-b88d-2d381905af8b',
      request: { method: 'POST', url: 'Observation' },
      resource: weightObservation,
    },
  ];

  return observationBatch;
}

function createConditionBatch(conditionData: ConditionData, encounter: Encounter, user: Practitioner): BundleEntry[] {
  // Build the encounter diagnosis condition
  const encounterDiagnosisCondition: Condition = {
    resourceType: 'Condition',
    subject: encounter.subject as Reference<Patient>,
    code: {
      coding: conditionData.reasonForVisit ? [conditionData.reasonForVisit] : [],
    },
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
    encounter: { reference: getReferenceString(encounter) },
    recorder: { reference: getReferenceString(user) },
    asserter: { reference: getReferenceString(user) },
  };

  // Clone the condition, but with a category of problem list item instead.
  const problemListCondition: Condition = {
    ...encounterDiagnosisCondition,
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
  };

  const entries: BundleEntry[] = [
    {
      fullUrl: generateId(),
      request: { method: 'POST', url: 'Condition' },
      resource: encounterDiagnosisCondition,
    },
  ];

  // If this item is being added to the problem list, we will create two copies of the condition - one as an encounter diagnosis and one as a problem list item. For more details see https://www.medplum.com/docs/charting/representing-diagnoses#problem-list-item
  if (conditionData.problemList) {
    entries.push({
      fullUrl: generateId(),
      request: { method: 'POST', url: 'Condition' },
      resource: problemListCondition,
    });
  }

  return entries;
}

function createClinicalImpressionEntries(
  clinicalImpressionData: ClinicalImpressionData,
  encounter: Encounter,
  user: Practitioner
): BundleEntry {
  // Create the clinical impression
  const clinicalImpression: ClinicalImpression = {
    resourceType: 'ClinicalImpression',
    status: 'completed',
    subject: encounter.subject as Reference<Patient>,
    note: clinicalImpressionData.notes
      ? [
          {
            text: clinicalImpressionData.notes,
            authorReference: { reference: getReferenceString(user) },
            authorString: getDisplayString(user),
          },
        ]
      : [],
    date: new Date().toISOString(),
    encounter: { reference: getReferenceString(encounter) },
    assessor: { reference: getReferenceString(user) },
  };

  // Return the clinical impression as a bundle entry
  return {
    fullUrl: 'urn:uuid:0107b717-61df-4ddb-9164-f13efea7ba31',
    request: { method: 'POST', url: 'ClinicalImpression' },
    resource: clinicalImpression,
  };
}
