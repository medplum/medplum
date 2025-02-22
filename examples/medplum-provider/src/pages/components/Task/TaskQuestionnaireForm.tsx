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
  const [questionnaireResponse, setQuestionnaireResponse] = useState<QuestionnaireResponse | undefined>(undefined);

  useEffect(() => {
    const fetchResources = async (): Promise<void> => {
      const questionnaireReference = task.input?.[0]?.valueReference as Reference<Questionnaire>;
      const questionnaireResponseReference = task.output?.[0]?.valueReference as Reference<QuestionnaireResponse>;

      if (questionnaireResponseReference) {
        const response = await medplum.readReference(questionnaireResponseReference);
        setQuestionnaireResponse(response as QuestionnaireResponse);
      }

      if (questionnaireReference) {
        const questionnaireResponse = await medplum.readReference(questionnaireReference);
        setQuestionnaire(questionnaireResponse as Questionnaire);
      }
    };

    fetchResources().catch(console.error);
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
      <Box p="md">
        <QuestionnaireForm
          questionnaire={questionnaire}
          questionnaireResponse={questionnaireResponse}
          excludeButtons={true}
          onChange={onChangeResponse}
        />
      </Box>
    </Stack>
  );
};
