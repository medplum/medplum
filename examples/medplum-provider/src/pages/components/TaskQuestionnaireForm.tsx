import { useEffect, useState } from 'react';
import { Questionnaire, Reference, Task } from '@medplum/fhirtypes';
import { useMedplum, QuestionnaireForm } from '@medplum/react';
import { Box, Card, Stack } from '@mantine/core';
import { TaskStatusPanel } from './TaskStatusPanel';

interface ActionQuestionnaireFormProps {
  task: Task;
}

export const TaskQuestionnaireForm = ({ task }: ActionQuestionnaireFormProps): JSX.Element => {
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
    return <div>Loading...</div>;
  }

  return (
    <Card withBorder shadow="sm" p={0}>
      <Stack gap="xs">
        <Box p="md">
          <QuestionnaireForm questionnaire={questionnaire} excludeButtons={true} />
        </Box>
        <TaskStatusPanel task={task} />
      </Stack>
    </Card>
  );
};
