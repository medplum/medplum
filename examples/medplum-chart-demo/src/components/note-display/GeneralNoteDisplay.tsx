import { Group, List, Stack, Title } from '@mantine/core';
import { Annotation, CodeableConcept, QuestionnaireResponseItemAnswer } from '@medplum/fhirtypes';
import { CodeableConceptDisplay, NoteDisplay } from '@medplum/react';

interface GeneralNoteDisplayProps {
  answers: Record<string, QuestionnaireResponseItemAnswer>;
}

export interface GeneralAnswers {
  subjective: [string, boolean][];
  selfReportedHistory?: CodeableConcept;
  assessment: Annotation[];
}

export function GeneralNoteDisplay({ answers }: GeneralNoteDisplayProps): JSX.Element {
  const displayValues = parseGeneralAnswers(answers);
  return (
    <Stack>
      <Stack>
        <Title order={4}>Symptoms Displayed by Patient</Title>
        <List>
          {displayValues.subjective
            .filter((obs) => obs[1])
            .map((evaluation, idx) => (
              <List.Item key={idx}>{evaluation[0]}</List.Item>
            ))}
        </List>
      </Stack>
      {displayValues.selfReportedHistory?.coding?.[0].display && (
        <Stack>
          <Title order={4}>Patient History</Title>
          <li>
            <CodeableConceptDisplay value={displayValues.selfReportedHistory} />
          </li>
        </Stack>
      )}
      <Group>
        <Title order={4}>Notes and Comments</Title>
        <NoteDisplay value={displayValues.assessment} />
      </Group>
    </Stack>
  );
}

function parseGeneralAnswers(answers: Record<string, QuestionnaireResponseItemAnswer>): GeneralAnswers {
  // Parse out the note into a more easily usable data structure
  const hotFlashes = answers['hot-flashes']?.valueBoolean || false;
  const moodSwings = answers['mood-swings']?.valueBoolean || false;
  const vaginalDryness = answers['vaginal-dryness']?.valueBoolean || false;
  const sleepDisturbance = answers['sleep-disturbance']?.valueBoolean || false;

  const subjective: [string, boolean][] = [
    ['Hot Flashes', hotFlashes],
    ['Mood Swings', moodSwings],
    ['Vaginal Dryness', vaginalDryness],
    ['Sleep Disturbances', sleepDisturbance],
  ];

  const selfReportedHistory: CodeableConcept = { coding: [{ display: answers['self-reported-history']?.valueString }] };

  const assessment: Annotation[] = [];

  if (answers['assessment']?.valueString) {
    assessment.push({ text: answers['assessment'].valueString });
  }

  return {
    assessment,
    subjective,
    selfReportedHistory,
  };
}
