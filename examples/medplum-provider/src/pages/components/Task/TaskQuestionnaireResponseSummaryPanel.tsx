import React, { useEffect, useState } from 'react';
import { QuestionnaireResponse, Reference, Task, QuestionnaireResponseItem } from '@medplum/fhirtypes';
import { useMedplum, Loading } from '@medplum/react';
import { Box, Card, Stack, Text } from '@mantine/core';

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
          <Loading />
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
          <Text c="dimmed">{item.text}</Text>
          {item.answer?.map((answer) => (
            <Text>{answer.valueString || answer.valueBoolean?.toString() || answer.valueInteger}</Text>
          ))}
          <QuestionnaireResponseComponent items={item.item || []} />
        </Box>
      ))}
    </>
  );
};
