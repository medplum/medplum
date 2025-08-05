import { Stack, Text } from '@mantine/core';
import { formatDate } from '@medplum/core';
import { QuestionnaireResponseItem, QuestionnaireResponseItemAnswer } from '@medplum/fhirtypes';
import { JSX } from 'react';
import { CodeableConceptDisplay } from '../CodeableConceptDisplay/CodeableConceptDisplay';
import { QuantityDisplay } from '../QuantityDisplay/QuantityDisplay';
import { RangeDisplay } from '../RangeDisplay/RangeDisplay';

export interface QuestionnaireResponseItemDisplayProps {
  item: QuestionnaireResponseItem;
}

export function QuestionnaireResponseItemDisplay(props: QuestionnaireResponseItemDisplayProps): JSX.Element {
  const { item } = props;
  const { text: title, answer, item: nestedAnswers } = item;

  function renderContent(): JSX.Element {
    if (answer && answer.length > 0) {
      return <AnswerDisplay key={answer[0].id} answer={answer[0]} />;
    } else if (nestedAnswers && nestedAnswers.length > 0) {
      return (
        <>
          {nestedAnswers.map((nestedAnswer) => (
            <QuestionnaireResponseItemDisplay
              key={nestedAnswer.id}
              item={nestedAnswer}
            />
          ))}
        </>
      );
    } else {
      return <Text c="dimmed">No answer</Text>;
    }
  }

  return (
    <Stack gap={0} pb="xs">
      <Text size="lg" fw={600}>{title}</Text>
      {renderContent()}
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
      return <Text>{value}</Text>;
    case 'valueQuantity':
      return <QuantityDisplay value={value} />;
    case 'valueString':
      return <Text>{value}</Text>;
    case 'valueCoding':
      return <CodeableConceptDisplay value={{ coding: [value] }} />;
    case 'valueRange':
      return <RangeDisplay value={value} />;
    case 'valueDateTime':
      return <Text>{formatDate(value)}</Text>;
    case 'valueBoolean':
      return <Text>{value ? 'True' : 'False'}</Text>;
    case 'valueReference':
      return <Text>{value.display ?? value.reference}</Text>;
    default:
      return <Text>{value.toString()}</Text>;
  }
}
