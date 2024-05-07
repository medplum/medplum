import { Tabs } from '@mantine/core';
import { generateId, getDisplayString, getQuestionnaireAnswers, getReferenceString } from '@medplum/core';
import {
  Bundle,
  BundleEntry,
  ClinicalImpression,
  Coding,
  Condition,
  Encounter,
  Observation,
  Patient,
  Practitioner,
  QuestionnaireResponse,
  Reference,
} from '@medplum/fhirtypes';
import {
  Document,
  QuestionnaireForm,
  ResourceHistoryTable,
  ResourceTable,
  useMedplum,
  useMedplumProfile,
} from '@medplum/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import encounterNoteQuestionnaire from '../../data/core/encounter-note-q';
import { EncounterNoteDisplay } from './EncounterNoteDisplay';
import { obstetricQuestionnaire, gynecologyQuestionnaire } from '../../data/example/encounter-note-questionnaires';

interface EncounterDetailsProps {
  encounter: Encounter;
}

export function EncounterDetails(props: EncounterDetailsProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const currentUser = useMedplumProfile() as Practitioner;
  const [response, setResponse] = useState<QuestionnaireResponse>();

  const id = props.encounter.id;

  const tabs = ['Note', 'Details', 'History'];
  const tab = window.location.pathname.split('/').pop();
  const currentTab = tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0].toLowerCase();

  let questionnaire = encounterNoteQuestionnaire;

  if (props.encounter.type?.[0].coding?.[0].code === '408470005') {
    questionnaire = obstetricQuestionnaire;
  }
  if (props.encounter.type?.[0].coding?.[0].code === '394586005') {
    questionnaire = gynecologyQuestionnaire;
  }

  useEffect(() => {
    medplum
      .searchOne('QuestionnaireResponse', {
        encounter: getReferenceString(props.encounter),
      })
      .then(setResponse)
      .catch(console.error);
  }, [response, medplum, props.encounter]);

  function handleTabChange(newTab: string | null): void {
    navigate(`/Encounter/${id}/${newTab ?? ''}`);
  }

  async function handleQuestionnaireSubmit(formData: QuestionnaireResponse): Promise<void> {
    // Add details to the QuestionnaireResponse based on the encounter
    const encounterNote: QuestionnaireResponse = {
      ...formData,
      encounter: { reference: getReferenceString(props.encounter) },
      subject: { reference: getReferenceString(props.encounter.subject as Reference<Patient>) },
    };

    try {
      // Store the QuestionnaireResponse in the database and set it so that the page renders correctly
      const response = await medplum.createResource(encounterNote);
      setResponse(response);

      // Parse the answers to separate the observation, condition, and clinical impression data
      const [observationData, conditionData, clinicalImpressionData] = parseResponse(response);

      // Build an array of bundle entries so that all resources can be created as a batch
      const bundleEntries = createObservationBatch(observationData, props.encounter, currentUser).concat(
        createConditionBatch(conditionData, props.encounter, currentUser)
      );

      // If there are notes, add them to the bundle
      if (clinicalImpressionData.notes) {
        bundleEntries.push(createClinicalImpressionEntries(clinicalImpressionData, props.encounter, currentUser));
      }

      const encounterDataBundle: Bundle = {
        resourceType: 'Bundle',
        type: 'transaction',
        entry: bundleEntries,
      };

      // Execute the batch
      await medplum.executeBatch(encounterDataBundle);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <Document>
      <Tabs defaultValue="details" value={currentTab.toLowerCase()} onChange={handleTabChange}>
        <Tabs.List mb="sm">
          {tabs.map((tab) => (
            <Tabs.Tab key={tab} value={tab.toLowerCase()}>
              {tab}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="note">
          {response ? (
            <EncounterNoteDisplay response={response} encounter={props.encounter} />
          ) : (
            <QuestionnaireForm questionnaire={questionnaire} onSubmit={handleQuestionnaireSubmit} />
          )}
        </Tabs.Panel>
        <Tabs.Panel value="details">
          <ResourceTable value={props.encounter} ignoreMissingValues={true} />
        </Tabs.Panel>
        <Tabs.Panel value="history">
          <ResourceHistoryTable resourceType="Encounter" id={props.encounter.id} />
        </Tabs.Panel>
      </Tabs>
    </Document>
  );
}

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
