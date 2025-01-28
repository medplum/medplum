import { useEffect, useState } from 'react';
import { Questionnaire, QuestionnaireResponse, Reference, Task } from '@medplum/fhirtypes';
import { useMedplum, QuestionnaireForm } from '@medplum/react';
import { Box, Card, Stack, Text } from '@mantine/core';
import { TaskStatusPanel } from './TaskStatusPanel';

interface ActionQuestionnaireFormProps {
  task: Task;
  onSaveQuestionnaire: (task: Task, response: QuestionnaireResponse) => void;
}

export const TaskQuestionnaireForm = ({ task, onSaveQuestionnaire }: ActionQuestionnaireFormProps): JSX.Element => {
  const medplum = useMedplum();
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | undefined>(undefined);
  const [questionnaireResponse, setQuestionnaireResponse] = useState<QuestionnaireResponse | undefined>(undefined);

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

  const handleSubmitChanges = async (): Promise<void> => {
    if (!questionnaireResponse) {
      return;
    }

    onSaveQuestionnaire(task, questionnaireResponse);
  };

  if (!questionnaire) {
    return <div>Loading...</div>;
  }

  return (
    <Card withBorder shadow="sm" p={0}>
      <Stack gap="xs">
        {!task.output?.[0]?.valueReference ? (
          <Box p="md">
            <QuestionnaireForm
              questionnaire={questionnaire}
              excludeButtons={true}
              onChange={setQuestionnaireResponse}
            />
          </Box>
        ) : (
          <Box p="md">
            <Text>Questionnaire already completed</Text>
          </Box>
        )}

        <TaskStatusPanel
          task={task}
          onSubmit={handleSubmitChanges}
          isQuestionnaire={questionnaireResponse && !task.output?.[0]?.valueReference}
        />
      </Stack>
    </Card>
  );
};
