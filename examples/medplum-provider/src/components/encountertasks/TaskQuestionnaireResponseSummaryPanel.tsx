import { Box, Card, Stack, Text } from '@mantine/core';
import { QuestionnaireResponse, QuestionnaireResponseItem, Reference, Task } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { JSX, useEffect, useState } from 'react';

interface TaskQuestionnaireFormProps {
  task: Task;
}

export const TaskQuestionnaireResponseSummaryPanel = ({ task }: TaskQuestionnaireFormProps): JSX.Element => {
  const medplum = useMedplum();
  const [questionnaireResponse, setQuestionnaireResponse] = useState<QuestionnaireResponse | undefined>(undefined);

  useEffect(() => {
    const fetchResources = async (): Promise<void> => {
      const questionnaireResponseReference = task.output?.[0]?.valueReference as Reference<QuestionnaireResponse>;

      if (questionnaireResponseReference) {
        const response = await medplum.readReference(questionnaireResponseReference);
        setQuestionnaireResponse(response as QuestionnaireResponse);
      }
    };

    fetchResources().catch(console.error);
  }, [medplum, task]);

  return (
    <Card withBorder shadow="sm" p={0}>
      <Stack gap="xs" p="md">
        {questionnaireResponse ? (
          <QuestionnaireResponseComponent items={questionnaireResponse.item || []} />
        ) : (
          <Text>No Chart Note recorded.</Text>
        )}
      </Stack>
    </Card>
  );
};

interface QuestionnaireResponseProps {
  items: QuestionnaireResponseItem[];
}

const QuestionnaireResponseComponent = ({ items }: QuestionnaireResponseProps): JSX.Element => {
  return (
    <>
      {items.map((item, index) => (
        <Box key={index}>
          <Stack gap="xs">
            <Text c="dimmed">{item.text}</Text>
            {item.answer?.map((answer, answerIndex) => (
              <Text key={answerIndex}>
                {answer.valueString || answer.valueBoolean?.toString() || answer.valueInteger}
              </Text>
            ))}
            <QuestionnaireResponseComponent items={item.item || []} />
          </Stack>
        </Box>
      ))}
    </>
  );
};
