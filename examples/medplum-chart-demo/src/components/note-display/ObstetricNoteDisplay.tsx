import { Group, List, ListItem, Stack, Title } from '@mantine/core';
import { Annotation, Quantity, QuestionnaireResponseItemAnswer } from '@medplum/fhirtypes';
import { NoteDisplay, QuantityDisplay } from '@medplum/react';

interface ObstetricNoteDisplay {
  answers: Record<string, QuestionnaireResponseItemAnswer>;
}

export interface ObstetricAnswers {
  totalWeightGain?: Quantity;
  gravida?: number;
  para?: number;
  gestationalWeeks?: number;
  gestationalDays?: number;
  noteType: 'obstetric';
  assessment: Annotation[];
}

export function ObstetricNoteDisplay({ answers }: ObstetricNoteDisplay): JSX.Element {
  const displayValues = parseObstetricAnswers(answers);

  // Get the pregnancy history and gestational data from the questionnaire response. These functions are specific to this //
  // questionnaire's structure, so you will need to make changes for different encounter notes.
  const pregnancyHistory = getPregnancyHistory(displayValues);
  const gestationalAges = getGestationalAges(displayValues);

  return (
    <Stack>
      <Group>
        <Title order={4}>Total Weight Gain</Title>
        <QuantityDisplay value={displayValues.totalWeightGain} />
      </Group>
      <Stack>
        <Title order={4}>Pregnancy History</Title>
        <List>
          {pregnancyHistory.map((history, idx) => (
            <ListItem key={idx}>
              {history[0]} {history[1]}
            </ListItem>
          ))}
        </List>
      </Stack>
      <Stack>
        <Title order={4}></Title>
        <List>
          {gestationalAges.map((age, idx) => (
            <ListItem key={idx}>
              {age[0]} {age[1]}
            </ListItem>
          ))}
        </List>
      </Stack>
      <Group>
        <Title order={4}>Notes and Comments</Title>
        <NoteDisplay value={displayValues.assessment} />
      </Group>
    </Stack>
  );
}

function parseObstetricAnswers(answers: Record<string, QuestionnaireResponseItemAnswer>): ObstetricAnswers {
  const totalWeightGain = answers['total-weight-gain']?.valueQuantity;

  const gravida = answers['gravida']?.valueInteger;
  const para = answers['para']?.valueInteger;
  const gestationalWeeks = answers['gestational-age-weeks']?.valueInteger;
  const gestationalDays = answers['gestational-age-days']?.valueInteger;

  const assessment: Annotation[] = [];

  if (answers['assessment']?.valueString) {
    assessment.push({ text: answers['assessment'].valueString });
  }

  return {
    totalWeightGain,
    gravida,
    para,
    gestationalWeeks,
    gestationalDays,
    assessment,
    noteType: 'obstetric',
  };
}

function getGestationalAges(displayValues: ObstetricAnswers): [string, number][] {
  // Store the gestational age data as an array of arrays of strings and numbers for easy display
  const gestationalAges: [string, number][] = [];
  // Add the gestational days value if it exists
  if (displayValues.gestationalDays) {
    gestationalAges.push(['Gestational Days: ', displayValues.gestationalDays]);
  }
  // Add the gestational weeks value if it exists
  if (displayValues.gestationalWeeks) {
    gestationalAges.push(['Gestational Weeks: ', displayValues.gestationalWeeks]);
  }
  return gestationalAges;
}

function getPregnancyHistory(displayValues: ObstetricAnswers): [string, number][] {
  // Store the pregnancy history data as an array of arrays of strings and numbers for easy display
  const pregnancyHistory: [string, number][] = [];
  // Add the gravida data if it exists
  if (displayValues.gravida) {
    pregnancyHistory.push(['Gravida: ', displayValues.gravida]);
  }
  // Add the para data if it exists
  if (displayValues.para) {
    pregnancyHistory.push(['Para: ', displayValues.para]);
  }

  return pregnancyHistory;
}
