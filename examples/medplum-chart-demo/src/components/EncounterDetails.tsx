import { Tabs } from '@mantine/core';
import { getQuestionnaireAnswers, getReferenceString } from '@medplum/core';
import { Encounter, Patient, Questionnaire, QuestionnaireResponse, Reference } from '@medplum/fhirtypes';
import { Document, Loading, QuestionnaireForm, ResourceHistoryTable, ResourceTable, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EncounterNoteDisplay } from './EncounterNoteDisplay';

interface EncounterDetailsProps {
  encounter: Encounter;
}

export function EncounterDetails(props: EncounterDetailsProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [response, setResponse] = useState<QuestionnaireResponse>();
  const [questionnaire, setQuestionnaire] = useState<Questionnaire>();

  const id = props.encounter.id;

  const tabs = ['Note', 'Details', 'History'];
  const tab = window.location.pathname.split('/').pop();
  const currentTab = tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0].toLowerCase();

  // Get the encounter type so the correct questionnaire can be retrieved
  const encounterType = props.encounter.type?.[0].coding?.[0].code;
  const GENERAL_ENCOUNTER_CODE = '1287706006';

  useEffect(() => {
    // Search for a response if there is one
    medplum
      .searchOne('QuestionnaireResponse', {
        encounter: getReferenceString(props.encounter),
      })
      .then(setResponse)
      .catch(console.error);

    // Get the questionnaire
    medplum
      .searchOne('Questionnaire', {
        // If the code is for gynecology or obstetrics, use it, otherwise search for the default
        context: encounterType ?? GENERAL_ENCOUNTER_CODE,
      })
      .then(setQuestionnaire)
      .catch(console.error);
  }, [response, questionnaire, encounterType, medplum, props.encounter]);

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

    const answers = getQuestionnaireAnswers(formData);

    try {
      // Store the QuestionnaireResponse in the database and set it so that the page renders correctly
      const response = await medplum.createResource(encounterNote);
      setResponse(response);

      // If an answer was provided for the visit length, update the encounter to include the length
      const updatedEncounter: Encounter = {
        ...props.encounter,
        length: answers['visit-length']?.valueInteger
          ? { value: answers['visit-length'].valueInteger, unit: 'minutes' }
          : undefined,
      };
      await medplum.upsertResource(updatedEncounter, {
        _id: id,
      });
    } catch (err) {
      console.error(err);
    }
  }

  if (!questionnaire) {
    return <Loading />;
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
