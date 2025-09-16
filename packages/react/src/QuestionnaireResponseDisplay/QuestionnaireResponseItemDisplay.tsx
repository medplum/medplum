// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text } from '@mantine/core';
import { formatDate } from '@medplum/core';
import { QuestionnaireResponseItem, QuestionnaireResponseItemAnswer } from '@medplum/fhirtypes';
import { JSX, useMemo } from 'react';
import { CodeableConceptDisplay } from '../CodeableConceptDisplay/CodeableConceptDisplay';
import { QuantityDisplay } from '../QuantityDisplay/QuantityDisplay';
import { RangeDisplay } from '../RangeDisplay/RangeDisplay';

export interface QuestionnaireResponseItemDisplayProps {
  readonly item: QuestionnaireResponseItem;
}

export function QuestionnaireResponseItemDisplay(props: QuestionnaireResponseItemDisplayProps): JSX.Element {
  const { item } = props;
  const { text: title, answer, item: nestedAnswers } = item;

  const renderContent = useMemo((): JSX.Element => {
    if (answer && answer.length > 0) {
      return (
        <>
          {answer.map((ans, index) => (
            <AnswerDisplay key={`answer-${index}`} answer={ans} />
          ))}
        </>
      );
    } else if (nestedAnswers && nestedAnswers.length > 0) {
      return (
        <>
          {nestedAnswers.map((nestedAnswer, index) => (
            <QuestionnaireResponseItemDisplay key={`nested-${nestedAnswer.id ?? index}`} item={nestedAnswer} />
          ))}
        </>
      );
    } else {
      return <Text c="dimmed">No answer</Text>;
    }
  }, [answer, nestedAnswers]);

  return (
    <Stack gap={0} pb="xs">
      <Text size="lg" fw={600} id={item.id ? `question-${item.id}` : undefined} component="h3">
        {title}
      </Text>
      {renderContent}
    </Stack>
  );
}

interface AnswerDisplayProps {
  readonly answer: QuestionnaireResponseItemAnswer;
}

function AnswerDisplay({ answer }: AnswerDisplayProps): JSX.Element {
  if (!answer) {
    return <Text c="dimmed">Invalid answer</Text>;
  }

  const validEntries = Object.entries(answer).filter(([, value]) => value !== undefined && value !== null);

  if (validEntries.length === 0) {
    return <Text c="dimmed">No valid answer data</Text>;
  }

  const [key, value] = validEntries[0];

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
