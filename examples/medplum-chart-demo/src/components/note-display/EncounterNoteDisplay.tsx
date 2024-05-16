import { Group, List, ListItem, Stack, Title } from '@mantine/core';
import { formatDate, getQuestionnaireAnswers } from '@medplum/core';
import { CodeableConcept, Coding, Encounter, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { CodeableConceptDisplay, Document, NoteDisplay, QuantityDisplay, useMedplum } from '@medplum/react';
import { GeneralAnswers, GynecologyAnswers, ObstetricAnswers, parseAnswers } from './encounter-notes.utils';

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
  console.log(answers, displayValues);

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
          {noteType === 'general' && <GeneralNoteDisplay displayValues={displayValues as GeneralAnswers} />}
          {noteType === 'gynecology' && <GynecologyNoteDisplay displayValues={displayValues as GynecologyAnswers} />}
          {noteType === 'obstetric' && <ObstetricNoteDisplay displayValues={displayValues as ObstetricAnswers} />}
          <div>
            <Title order={4}>Notes and Comments</Title>
            <NoteDisplay value={displayValues.assessment} />
          </div>
        </Stack>
      </Stack>
    </Document>
  );
}

interface GeneralNoteDisplayProps {
  displayValues: GeneralAnswers;
}

function GeneralNoteDisplay({ displayValues }: GeneralNoteDisplayProps): JSX.Element {
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
    </Stack>
  );
}

interface ObstetricNoteDisplay {
  displayValues: ObstetricAnswers;
}

function ObstetricNoteDisplay({ displayValues }: ObstetricNoteDisplay): JSX.Element {
  const pregnancyHistory = getPregnancyHistory(displayValues);
  const gestationalAges = getGestationalAges(displayValues);

  return (
    <Stack>
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
    </Stack>
  );
}

function getGestationalAges(displayValues: ObstetricAnswers): [string, number][] {
  const gestationalAges: [string, number][] = [];
  if (displayValues.gestationalDays) {
    gestationalAges.push(['Gestational Days: ', displayValues.gestationalDays]);
  }
  if (displayValues.gestationalWeeks) {
    gestationalAges.push(['Gestational Weeks: ', displayValues.gestationalWeeks]);
  }
  return gestationalAges;
}

function getPregnancyHistory(displayValues: ObstetricAnswers): [string, number][] {
  const pregnancyHistory: [string, number][] = [];
  if (displayValues.gravida) {
    pregnancyHistory.push(['Gravida: ', displayValues.gravida]);
  }
  if (displayValues.para) {
    pregnancyHistory.push(['Para: ', displayValues.para]);
  }

  return pregnancyHistory;
}

interface GynecologyNoteDisplayProps {
  displayValues: GynecologyAnswers;
}

function GynecologyNoteDisplay({ displayValues }: GynecologyNoteDisplayProps): JSX.Element {
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
    </Stack>
  );
}

function getPresentIllnessArray(displayValues: GynecologyAnswers): [string, string | CodeableConcept][] {
  const presentIllness: [string, string | Coding][] = [];
  if (displayValues.lastPeriod) {
    presentIllness.push(['Last Period:', displayValues.lastPeriod]);
  }
  if (displayValues.contraception) {
    presentIllness.push(['Contraception Method: ', { coding: [displayValues.contraception] } as CodeableConcept]);
  }
  if (displayValues.lastMammogram) {
    presentIllness.push(['Last Mammogram:', displayValues.lastMammogram]);
  }

  return presentIllness;
}

function getSocialHistory(displayValues: GynecologyAnswers): [string, CodeableConcept][] {
  const socialHistory: [string, CodeableConcept][] = [];
  if (displayValues.smokingStatus) {
    socialHistory.push(['Smoking Status', { coding: [displayValues.smokingStatus] }]);
  }
  if (displayValues.drugUse) {
    socialHistory.push(['Drug Use', { coding: [displayValues.drugUse] }]);
  }
  if (displayValues.housingStatus) {
    socialHistory.push(['Housing Status', { coding: [displayValues.housingStatus] }]);
  }

  return socialHistory;
}
