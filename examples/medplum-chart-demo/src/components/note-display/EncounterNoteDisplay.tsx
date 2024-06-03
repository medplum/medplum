import { Group, Stack, Title } from '@mantine/core';
import { formatDate, getQuestionnaireAnswers } from '@medplum/core';
import { Encounter, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { CodeableConceptDisplay, Document, QuantityDisplay, useMedplum } from '@medplum/react';
import { parseGenericAnswers } from './utils';
import { GeneralNoteDisplay } from './GeneralNoteDisplay';
import { GynecologyNoteDisplay } from './GynecologyNoteDisplay';
import { ObstetricNoteDisplay } from './ObstetricNoteDisplay';

interface EncounterNoteDisplayProps {
  response: QuestionnaireResponse;
  encounter: Encounter;
}

export function EncounterNoteDisplay(props: EncounterNoteDisplayProps): JSX.Element {
  const medplum = useMedplum();

  // Ensure that the correct response is being displayed
  function checkForValidResponse(): void {
    const response = props.response;
    const encounter = props.encounter;

    if (response.encounter?.reference !== `Encounter/${encounter.id}`) {
      throw new Error('Invalid note');
    }
  }
  checkForValidResponse();

  function getNoteType(): string {
    const response = props.response;
    // Get the questionnaire the response is linked to
    const questionnaire = medplum.readReference({ reference: response.questionnaire }).read() as Questionnaire;

    // If there is no use context, return the default note type
    if (!questionnaire.useContext) {
      return 'general';
    }

    // Check the use contexts. In this demo, we have a gynecology, obstetric, and general note type
    for (const use of questionnaire.useContext) {
      // Check for gynecology
      if (use.valueCodeableConcept?.coding?.[0].code === '83607001') {
        return 'gynecology';
      }
      // Check for obstetric
      if (use.valueCodeableConcept?.coding?.[0].code === '163497009') {
        return 'obstetric';
      }
    }

    // If the use context is not gynecology or obstetric, use the general as a default.
    return 'general';
  }

  const noteType = getNoteType();
  const answers = getQuestionnaireAnswers(props.response);
  const displayValues = parseGenericAnswers(answers, noteType);

  return (
    <Document>
      <Stack>
        <Group key="date">
          <Title order={6}>Date of Encounter</Title>
          <p>{displayValues.date ? formatDate(displayValues.date) : 'Unknown'}</p>
        </Group>
        <Group key="reason-for-visit">
          <Title order={6}>Reason for Visit</Title>
          <CodeableConceptDisplay value={displayValues.reasonForVisit} />
        </Group>
        <Stack key="vitals">
          <Title order={4}>Vitals</Title>
          <Stack>
            <Title order={5}>Blood Pressure</Title>
            <Group ml="md">
              <Title order={6}>Systolic BP:</Title>
              <QuantityDisplay value={displayValues.systolic} />
            </Group>
            <Group ml="md">
              <Title order={6}>Diastolic BP:</Title>
              <QuantityDisplay value={displayValues.diastolic} />
            </Group>
            <Group>
              <Title order={5}>Height:</Title>
              <QuantityDisplay value={displayValues.height} />
            </Group>
            <Group>
              <Title order={5}>Weight:</Title>
              <QuantityDisplay value={displayValues.weight} />
            </Group>
          </Stack>
          {noteType === 'general' && <GeneralNoteDisplay answers={answers} />}
          {noteType === 'gynecology' && <GynecologyNoteDisplay answers={answers} />}
          {noteType === 'obstetric' && <ObstetricNoteDisplay answers={answers} />}
        </Stack>
      </Stack>
    </Document>
  );
}
