import { JSX } from "react";
import { Stack, Title, Text, TitleOrder } from "@mantine/core";
import { QuestionnaireResponseItem, QuestionnaireResponseItemAnswer } from "@medplum/fhirtypes";
import { QuantityDisplay } from "../QuantityDisplay/QuantityDisplay";
import { CodeableConceptDisplay } from "../CodeableConceptDisplay/CodeableConceptDisplay";
import { RangeDisplay } from "../RangeDisplay/RangeDisplay";
import { formatDate } from "@medplum/core";

export interface QuestionnaireResponseItemDisplayProps {
  item: QuestionnaireResponseItem;
  order: TitleOrder;
}

export function QuestionnaireResponseItemDisplay(props: QuestionnaireResponseItemDisplayProps): JSX.Element {
  const { item, order } = props;
  const { text: title, answer, item: nestedAnswers } = item;


  function renderContent(): JSX.Element {
    if (answer && answer.length > 0) {
      return <AnswerDisplay key={answer[0].id} answer={answer[0]} />;
    } else if (nestedAnswers && nestedAnswers.length > 0) {
      return (
        <>
          {nestedAnswers.map((nestedAnswer) =>
            <QuestionnaireResponseItemDisplay key={nestedAnswer.id} item={nestedAnswer} order={Math.min(order + 1, 6) as TitleOrder} />
          )}
        </>
      );
    } else {
      return <Text c="dimmed">No answer</Text>;
    }
  }

  return (
    <Stack>
      <Title order={order}>{title}</Title>
      <Stack>{renderContent()}</Stack>
    </Stack>
  );
}

interface AnswerDisplayProps {
  answer: QuestionnaireResponseItemAnswer;
}

function AnswerDisplay({ answer }: AnswerDisplayProps): JSX.Element {

  console.log(answer);
  if (!answer) {
    throw new Error('No answer');
  }
  const [[key, value]] = Object.entries(answer);

  console.log(key, value);

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

