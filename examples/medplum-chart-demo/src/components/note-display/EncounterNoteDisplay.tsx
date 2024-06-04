import { Group, Stack, Title } from '@mantine/core';
import { formatDate, getQuestionnaireAnswers } from '@medplum/core';
import { Encounter, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { CodeableConceptDisplay, Document, QuantityDisplay, useMedplum } from '@medplum/react';
import { GeneralNoteDisplay } from './GeneralNoteDisplay';
import { GynecologyNoteDisplay } from './GynecologyNoteDisplay';
import { ObstetricNoteDisplay } from './ObstetricNoteDisplay';
import { parseGenericAnswers } from './utils';

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

  /**
   * This function gets the questionnaire response for the linked encounter and returns the type of the note. This is used to determine
   * what additional data should be displayed on the page.
   *
   * @returns The code for the type of encounter note to be displayed
   */
  function getNoteType(): string {
    const response = props.response;
    // Get the questionnaire the response is linked to
    const questionnaire = medplum.readReference({ reference: response.questionnaire }).read() as Questionnaire;

    // If there is no use context, return the default note type
    if (!questionnaire.useContext) {
      return 'general';
    }

    const focus = questionnaire.useContext.find((code) => code.code.code === 'focus');

    const code = focus ? focus.valueCodeableConcept?.coding?.[0].code : undefined;

    // If the code is not for gynecology or obstetrics, return the code for the general encounter
    if (code !== '83607001' && code !== '163497009') {
      return '1287706006';
    }

    // Otherwise, return the code.
    return code;
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
          {noteType === '1287706006' && <GeneralNoteDisplay answers={answers} />}
          {noteType === '83607001' && <GynecologyNoteDisplay answers={answers} />}
          {noteType === '163497009' && <ObstetricNoteDisplay answers={answers} />}
        </Stack>
      </Stack>
    </Document>
  );
}
