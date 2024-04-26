import { Tabs } from '@mantine/core';
import { getQuestionnaireAnswers, getReferenceString, MedplumClient } from '@medplum/core';
import {
  ClinicalImpression,
  CodeableConcept,
  Encounter,
  Observation,
  Patient,
  Practitioner,
  Quantity,
  QuestionnaireResponse,
  Reference,
  Specimen,
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
import encounterNoteQuestionnaire from '../../data/encounter-note-q';

interface EncounterDetailsProps {
  encounter: Encounter;
}

interface ObservationResponse {
  'observation-status': CodeableConcept;
  'observation-category'?: CodeableConcept;
  'observation-interpretation'?: CodeableConcept;
  'observation-specimen'?: Reference<Specimen>;
  'observation-reference-range-low'?: Quantity;
  'observation-reference-range-high'?: Quantity;
  'observation-note'?: string;
}

interface ConditionResponse {
  'condition-clinical-status': CodeableConcept;
  'condition-verification-status'?: CodeableConcept;
  'condition-problem-list'?: boolean;
  'condition-code'?: CodeableConcept;
  'condition-severity'?: CodeableConcept;
  'condition-onset'?: Date;
  'condition-abatement'?: Date;
  'condition-evidence'?: CodeableConcept;
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

  useEffect(() => {
    medplum
      .searchOne('QuestionnaireResponse', {
        encounter: getReferenceString(props.encounter),
      })
      .then(setResponse)
      .catch(console.error);

    console.log(response);
  }, [response, medplum]);

  function handleTabChange(newTab: string | null) {
    navigate(`/Encounter/${id}/${newTab ?? ''}`);
  }

  function handleSaveNote(formData: QuestionnaireResponse): void {
    console.log(formData);
    if (response) {
      const draftResponse: QuestionnaireResponse = {
        ...formData,
        id: response.id,
        meta: response.meta,
        status: 'in-progress',
        encounter: { reference: getReferenceString(props.encounter) },
      };

      medplum.updateResource(draftResponse).then(setResponse).catch(console.error);
    } else {
      const draftResponse: QuestionnaireResponse = {
        ...formData,
        status: 'in-progress',
        encounter: { reference: getReferenceString(props.encounter) },
      };

      medplum.createResource(draftResponse).then(setResponse).catch(console.error);
    }
  }

  function handleFinalizeNote(formData: QuestionnaireResponse) {
    const answers = getQuestionnaireAnswers(formData);
    const observations: Record<string, Object> = {};
    const conditions: Record<string, Object> = {};
    const clinicalImpressionNote = answers['clinical-impressions'].valueString as string;
    for (const key in answers) {
      if (key === 'clinical-impressions') {
        continue;
      }
      if (key.slice(0, 9) === 'condition') {
        conditions[key] = answers[key];
      } else {
        observations[key] = answers[key];
      }
    }
    console.log(observations, conditions, clinicalImpressionNote);
    createObservations(medplum, observations, props.encounter, currentUser);
    createConditions(medplum, conditions, props.encounter, currentUser);
    createClinicalImpressions(medplum, currentUser, props.encounter, clinicalImpressionNote);
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
          <QuestionnaireForm
            submitButtonText="Save Changes"
            questionnaire={encounterNoteQuestionnaire}
            onSubmit={handleSaveNote}
          />
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

function createObservations(
  medplum: MedplumClient,
  observations: Record<string, Object>,
  encounter: Encounter,
  user: Practitioner
) {
  const observation = parseObservations(observations);
}

function createConditions(
  medplum: MedplumClient,
  conditions: Record<string, Object>,
  encounter: Encounter,
  user: Practitioner
) {}

function createClinicalImpressions(
  medplum: MedplumClient,
  user: Practitioner,
  encounter: Encounter,
  clinicalImpressionNote: string
) {
  const clinicalImpression: ClinicalImpression = {
    resourceType: 'ClinicalImpression',
    status: 'completed',
    subject: encounter.subject as Reference<Patient>,
    note: [{ text: clinicalImpressionNote }],
    date: new Date().toISOString(),
    encounter: { reference: getReferenceString(encounter) },
    assessor: { reference: getReferenceString(user) },
  };

  medplum.createResource(clinicalImpression).catch(console.error);
}

function parseObservations(observations: Record<string, Object>) {}
