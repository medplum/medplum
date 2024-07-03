import { Box, Paper, Stack, Title, TitleOrder } from '@mantine/core';
import { formatDate } from '@medplum/core';
import { QuestionnaireResponseItem, QuestionnaireResponseItemAnswer } from '@medplum/fhirtypes';
import { CodeableConceptDisplay, QuantityDisplay, RangeDisplay, useMedplum } from '@medplum/react';
import { useParams } from 'react-router-dom';

export function Response(): JSX.Element {
  const medplum = useMedplum();
  const { responseId } = useParams();
  const questionnaireResponse = medplum.searchOne('QuestionnaireResponse', `_id=${responseId}`).read();

  const items = questionnaireResponse?.item || [];

  return (
    <Box p="xl">
      <Paper>
        <Stack>
          {items.map((item) => (
            <ItemDisplay item={item} order={4} />
          ))}
        </Stack>
      </Paper>
    </Box>
  );
}

interface ItemDisplayProps {
  item: QuestionnaireResponseItem;
  order: TitleOrder;
}

function ItemDisplay({ item, order }: ItemDisplayProps): JSX.Element {
  const title = item.text;
  const answer = item.answer;
  const nestedAnswers = item.item;

  return (
    <Stack key={item.id}>
      <Title order={order}>{title}</Title>
      <Stack key={item.linkId}>
        {answer && answer.length > 0 ? (
          <AnswerDisplay answer={answer[0]} />
        ) : (
          nestedAnswers?.map((nestedAnswer) => (
            <ItemDisplay item={nestedAnswer} order={Math.min(order + 1, 6) as TitleOrder} />
          ))
        )}
      </Stack>
    </Stack>
  );
}

interface AnswerDisplayProps {
  answer: QuestionnaireResponseItemAnswer;
}

function AnswerDisplay({ answer }: AnswerDisplayProps): JSX.Element {
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
