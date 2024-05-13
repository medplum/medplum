import { Group, Stack, Title } from '@mantine/core';
import { formatDate, getQuestionnaireAnswers } from '@medplum/core';
import {
  Annotation,
  CodeableConcept,
  Encounter,
  Quantity,
  Questionnaire,
  QuestionnaireResponse,
} from '@medplum/fhirtypes';
import { CodeableConceptDisplay, Document, NoteDisplay, QuantityDisplay, useMedplum } from '@medplum/react';
import { parseAnswers } from './encounter-notes.utils';

interface EncounterNoteDisplayProps {
  response: QuestionnaireResponse;
  encounter: Encounter;
}

// interface NoteDisplay {
//   reasonForVisit: CodeableConcept;
//   date: string | undefined;
//   diastolic: Quantity;
//   systolic: Quantity;
//   height: Quantity;
//   weight: Quantity;
//   notes: Annotation[];
//   bmi: Quantity | undefined;
// }

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
    const questionnaire = medplum.readReference({ reference: response.questionnaire }).read() as Questionnaire;

    if (!questionnaire.useContext) {
      return 'general';
    }

    for (const use of questionnaire.useContext) {
      if (use.valueCodeableConcept?.coding?.[0].code === '83607001') {
        return 'gynecology';
      }
      if (use.valueCodeableConcept?.coding?.[0].code === '163497009') {
        return 'obstetric';
      }
    }

    return 'general';
  }
  const noteType = getNoteType();

  const answers = getQuestionnaireAnswers(props.response);

  const displayValues = parseAnswers(answers, noteType);

  return (
    <Document>
      <Stack>
        <Group key="date">
          <Title order={6}>Date of Encounter</Title>
          <p>{formatDate(displayValues.date)}</p>
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
            {displayValues.noteType === 'obstetric' && (
              <Group>
                <Title order={5}>Total Weight Gain</Title>
                <QuantityDisplay value={displayValues.totalWeightGain} />
              </Group>
            )}
            {/* <Group>
              <Title order={5}>BMI:</Title>
              <QuantityDisplay value={displayValues.bmi} />
            </Group> */}
          </Stack>
          <div>
            <Title order={4}>Notes and Comments</Title>
            <NoteDisplay value={displayValues.assessment} />
          </div>
        </Stack>
      </Stack>
    </Document>
  );
}

function GynecologyDisplay(): JSX.Element {
  return <div></div>;
}
