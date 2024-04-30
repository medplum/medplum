import { Tabs } from '@mantine/core';
import { getReferenceString, MedplumClient } from '@medplum/core';
import {
  ClinicalImpression,
  Encounter,
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
import encounterNoteQuestionnaire from '../../data/encounter-note-q';
import { EncounterNoteDisplay } from './EncounterNoteDisplay';

interface EncounterDetailsProps {
  encounter: Encounter;
}

export function EncounterDetails(props: EncounterDetailsProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  // const currentUser = useMedplumProfile() as Practitioner;
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
  }, [response, medplum]);

  function handleTabChange(newTab: string | null): void {
    navigate(`/Encounter/${id}/${newTab ?? ''}`);
  }

  function handleQuestionnaireSubmit(formData: QuestionnaireResponse): void {
    const encounterNote: QuestionnaireResponse = {
      ...formData,
      encounter: { reference: getReferenceString(props.encounter) },
      subject: { reference: getReferenceString(props.encounter.subject as Reference<Patient>) },
    };

    medplum.createResource(encounterNote).then(setResponse).catch(console.error);
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
            <QuestionnaireForm questionnaire={encounterNoteQuestionnaire} onSubmit={handleQuestionnaireSubmit} />
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
