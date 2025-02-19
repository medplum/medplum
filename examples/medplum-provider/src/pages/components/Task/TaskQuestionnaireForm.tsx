import { useEffect, useState } from 'react';
import { Questionnaire, QuestionnaireResponse, Reference, Task } from '@medplum/fhirtypes';
import { useMedplum, QuestionnaireForm, Loading } from '@medplum/react';
import { Box, Stack, Text } from '@mantine/core';

interface TaskQuestionnaireFormProps {
  task: Task;
  onChangeResponse?: (response: QuestionnaireResponse) => void;
}

export const TaskQuestionnaireForm = ({ task, onChangeResponse }: TaskQuestionnaireFormProps): JSX.Element => {
  const medplum = useMedplum();
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | undefined>(undefined);

  useEffect(() => {
    const fetchQuestionnaire = async (): Promise<void> => {
      const questionnaireReference = task.input?.[0]?.valueReference as Reference<Questionnaire>;
      if (!questionnaireReference) {
        return;
      }

      const response = await medplum.readReference(questionnaireReference as Reference<Questionnaire>);
      setQuestionnaire(response as Questionnaire);
    };

    fetchQuestionnaire().catch(console.error);
  }, [medplum, task]);

  if (!questionnaire) {
    return (
      <Box p="md">
        <Text>
          <Loading />
        </Text>
      </Box>
    );
  }

  return (
    <Stack gap="xs">
      {!task.output?.[0]?.valueReference ? (
        <Box p="md">
          <QuestionnaireForm questionnaire={questionnaire} excludeButtons={true} onChange={onChangeResponse} />
        </Box>
      ) : (
        <Box p="md">
          <Text>Responses submitted</Text>
        </Box>
      )}
    </Stack>
  );
};
