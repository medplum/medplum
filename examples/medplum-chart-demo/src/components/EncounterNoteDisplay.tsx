import { Paper, Stack, Title, TitleOrder } from '@mantine/core';
import { formatDate } from '@medplum/core';
import {
  Encounter,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
} from '@medplum/fhirtypes';
import { CodeableConceptDisplay, QuantityDisplay, RangeDisplay } from '@medplum/react';

interface EncounterNoteDisplayProps {
  response: QuestionnaireResponse;
  encounter: Encounter;
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

  if (!props.response.item) {
    throw new Error('No answers provided');
  }
  const items = props.response.item;

  return (
    <Paper>
      <Stack>{items.map((item) => getItemDisplay(item, 4))}</Stack>
    </Paper>
  );
}

function getItemDisplay(item: QuestionnaireResponseItem, order: TitleOrder): JSX.Element {
  const title = item.text;
  const answer = item.answer;
  const nestedAnswers = item.item;
  if (item.linkId === 'problem-list') {
    return <></>;
  }

  return (
    <Stack>
      <Title order={order}>{title}</Title>
      <Stack key={item.linkId}>
        {answer && answer.length > 0
          ? getAnswerDisplay(answer[0])
          : nestedAnswers?.map((nestedAnswer) => getItemDisplay(nestedAnswer, Math.min(order + 1, 6) as TitleOrder))}
      </Stack>
    </Stack>
  );
}

function getAnswerDisplay(answer?: QuestionnaireResponseItemAnswer): JSX.Element {
  if (!answer) {
    throw new Error('No answer');
  }
  const [[key, value]] = Object.entries(answer);

  switch (key) {
    case 'valueInteger':
      return <p>{value}</p>;
    case 'valueQuantity':
      return <QuantityDisplay value={value} />;
    case 'valueString':
      return <p>{value}</p>;
    case 'valueCoding':
      return <CodeableConceptDisplay value={{ coding: [value] }} />;
    case 'valueRange':
      return <RangeDisplay value={value} />;
    case 'valueDateTime':
      return <p>{formatDate(value)}</p>;
    default:
      return <p>{value}</p>;
  }
}
