import { Group, Stack, Title } from '@mantine/core';
import { formatDate, getQuestionnaireAnswers } from '@medplum/core';
import {
  Annotation,
  CodeableConcept,
  Coding,
  Encounter,
  Quantity,
  QuestionnaireResponse,
  QuestionnaireResponseItemAnswer,
} from '@medplum/fhirtypes';
import { CodeableConceptDisplay, Document, NoteDisplay, QuantityDisplay } from '@medplum/react';

interface EncounterNoteDisplayProps {
  response: QuestionnaireResponse;
  encounter: Encounter;
}

interface NoteDisplay {
  reasonForVisit: CodeableConcept;
  date: string | undefined;
  diastolic: Quantity;
  systolic: Quantity;
  height: Quantity;
  weight: Quantity;
  notes: Annotation[];
  bmi: Quantity | undefined;
}

export function EncounterNoteDisplay(props: EncounterNoteDisplayProps): JSX.Element {
  // Ensure that the correct response is being displayed
  function checkForValidResponse(): void {
    const response = props.response;
    const encounter = props.encounter;

    if (response.encounter?.reference !== `Encounter/${encounter.id}`) {
      throw new Error('Invalid note');
    }
  }
  checkForValidResponse();

  const answers = getQuestionnaireAnswers(props.response);

  const displayValues = parseAnswers(answers);

  function parseAnswers(answers: Record<string, QuestionnaireResponseItemAnswer>): NoteDisplay {
    // Parse out the note into a more easily usable data structure
    const reasonForVisit: CodeableConcept = {
      coding: [answers['reason-for-visit'].valueCoding as Coding],
    };

    const date = answers['encounter-date'].valueDate;

    const diastolic = {
      value: answers['diastolic-blood-pressure'].valueInteger,
      unit: 'mmHg',
      system: 'http://unitsofmeasure.com',
      code: 'mm[Hg]',
    };

    const systolic = {
      value: answers['systolic-blood-pressure'].valueInteger,
      unit: 'mmHg',
      system: 'http://unitsofmeasure.com',
      code: 'mm[Hg]',
    };

    const height = {
      value: answers['vitals-height'].valueInteger,
      unit: 'cm',
      system: 'http://unitsofmeasure.com',
      code: 'cm',
    };

    const weight = {
      value: answers['vitals-weight'].valueInteger,
      unit: 'lbs.',
      system: 'http://unitsofmeasure.com',
      code: '[lb_av]',
    };

    const notes: Annotation[] = [];

    if (answers['notes-and-comments'].valueString) {
      notes.push({ text: answers['notes-and-comments'].valueString });
    }

    return {
      reasonForVisit,
      date,
      diastolic,
      systolic,
      height,
      weight,
      bmi: calculateBMI(answers['vitals-height'].valueInteger, answers['vitals-weight'].valueInteger),
      notes,
    };
  }

  function calculateBMI(height?: number, weight?: number): Quantity | undefined {
    if (!weight || !height) {
      return undefined;
    }
    const weightKg = weight / 2.2;

    const bmi = Math.floor((weightKg / (height / 100) ** 2) * 10) / 10;

    return {
      value: bmi,
      unit: 'kg/m^2',
    };
  }

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
              <Title order={5}>Height (cm):</Title>
              <QuantityDisplay value={displayValues.height} />
            </Group>
            <Group>
              <Title order={5}>Weight:</Title>
              <QuantityDisplay value={displayValues.weight} />
            </Group>
            <Group>
              <Title order={5}>BMI:</Title>
              <QuantityDisplay value={displayValues.bmi} />
            </Group>
          </Stack>
          <div>
            <Title order={4}>Notes and Comments</Title>
            <NoteDisplay value={displayValues.notes} />
          </div>
        </Stack>
      </Stack>
    </Document>
  );
}
