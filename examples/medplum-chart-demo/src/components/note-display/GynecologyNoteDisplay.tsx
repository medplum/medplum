import { Group, List, ListItem, Stack, Title } from '@mantine/core';
import { formatDate } from '@medplum/core';
import { Annotation, CodeableConcept, Coding, QuestionnaireResponseItemAnswer } from '@medplum/fhirtypes';
import { CodeableConceptDisplay, NoteDisplay } from '@medplum/react';

interface GynecologyNoteDisplayProps {
  answers: Record<string, QuestionnaireResponseItemAnswer>;
}

export interface GynecologyAnswers {
  lastPeriod?: string;
  contraception?: Coding;
  lastMammogram?: string;
  smokingStatus?: Coding;
  drugUse?: Coding;
  housingStatus?: Coding;
  visitLength?: number;
  assessment: Annotation[];
}

export function GynecologyNoteDisplay({ answers }: GynecologyNoteDisplayProps): JSX.Element {
  const displayValues = parseGynecologyAnswers(answers);
  // Get the present illness and social history data from the questionnaire response. These functions are specific to this //
  // questionnaire's structure, so you will need to make changes for different encounter notes.
  const presentIllness = getPresentIllnessArray(displayValues);
  const socialHistory = getSocialHistory(displayValues);

  return (
    <Stack>
      <Title order={4}>History of Present Illness</Title>
      <Stack>
        <List icon={null}>
          {presentIllness.map((illness, idx) => (
            <ListItem key={idx}>
              <Group>
                {illness[0]}
                {typeof illness[1] === 'string' ? (
                  <p>{formatDate(illness[1])}</p>
                ) : (
                  <CodeableConceptDisplay key={idx} value={illness[1]} />
                )}
              </Group>
            </ListItem>
          ))}
        </List>
      </Stack>
      <Title order={4}>Social History</Title>
      <List icon={null}>
        {socialHistory.map((history, idx) => (
          <ListItem key={idx}>
            {history[0]}: <CodeableConceptDisplay value={history[1]} />
          </ListItem>
        ))}
      </List>
      <Group>
        <Title order={4}>Notes and Comments</Title>
        <NoteDisplay value={displayValues.assessment} />
      </Group>
    </Stack>
  );
}

function parseGynecologyAnswers(answers: Record<string, QuestionnaireResponseItemAnswer>): GynecologyAnswers {
  const lastPeriod = answers['last-period']?.valueDate;
  const contraception = answers['contraception']?.valueCoding;
  const lastMammogram = answers['mammogram']?.valueDate;

  const smokingStatus = answers['smoking']?.valueCoding;
  const drugUse = answers['drugs']?.valueCoding;
  const housingStatus = answers['housing']?.valueCoding;

  const visitLength = answers['visit-length']?.valueInteger;
  const assessment: Annotation[] = [];
  if (answers['assessment']?.valueString) {
    assessment.push({ text: answers['assessment'].valueString });
  }

  return {
    lastPeriod,
    contraception,
    lastMammogram,
    smokingStatus,
    drugUse,
    housingStatus,
    visitLength,
    assessment,
  };
}

function getPresentIllnessArray(displayValues: GynecologyAnswers): [string, string | CodeableConcept][] {
  // Create an array to store the present illness data
  const presentIllness: [string, string | Coding][] = [];
  // Add data on the patient's last period if it exists
  if (displayValues.lastPeriod) {
    presentIllness.push(['Last Period:', displayValues.lastPeriod]);
  }
  // Add the contraception method if it exists
  if (displayValues.contraception) {
    presentIllness.push(['Contraception Method: ', { coding: [displayValues.contraception] } as CodeableConcept]);
  }
  // Add the last mammogram date if it exists
  if (displayValues.lastMammogram) {
    presentIllness.push(['Last Mammogram:', displayValues.lastMammogram]);
  }

  return presentIllness;
}

function getSocialHistory(displayValues: GynecologyAnswers): [string, CodeableConcept][] {
  // Create an array to store the social history data
  const socialHistory: [string, CodeableConcept][] = [];
  // Add the smoking status if it exists
  if (displayValues.smokingStatus) {
    socialHistory.push(['Smoking Status', { coding: [displayValues.smokingStatus] }]);
  }
  // Add drug use if it exists
  if (displayValues.drugUse) {
    socialHistory.push(['Drug Use', { coding: [displayValues.drugUse] }]);
  }
  // Add the housing status if it exists
  if (displayValues.housingStatus) {
    socialHistory.push(['Housing Status', { coding: [displayValues.housingStatus] }]);
  }

  return socialHistory;
}
