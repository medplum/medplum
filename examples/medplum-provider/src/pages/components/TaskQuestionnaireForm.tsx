import { useEffect, useState } from 'react';
import { Questionnaire, QuestionnaireResponse, Reference, Task } from '@medplum/fhirtypes';
import { useMedplum, QuestionnaireForm } from '@medplum/react';
import { Box, Card, Stack } from '@mantine/core';
import { TaskStatusPanel } from './TaskStatusPanel';
import { showNotification } from '@mantine/notifications';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { normalizeErrorString } from '@medplum/core';

interface ActionQuestionnaireFormProps {
  task: Task;
}

export const TaskQuestionnaireForm = ({ task }: ActionQuestionnaireFormProps): JSX.Element => {
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

  if (!questionnaire) {
    return <div>Loading...</div>;
  }

  const handleSubmitChanges = async (): Promise<void> => {
    if (!questionnaireResponse) {
      return;
    }

    medplum
      .createResource<QuestionnaireResponse>(questionnaireResponse)
      .then(() => {
        showNotification({
          icon: <IconCircleCheck />,
          title: 'Success',
          message: 'Answers recorded',
        });
      })
      .catch((err) => {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(err),
        });
      });
  };

  return (
    <Card withBorder shadow="sm" p={0}>
      <Stack gap="xs">
        <Box p="md">
          <QuestionnaireForm questionnaire={questionnaire} excludeButtons={true} onChange={setQuestionnaireResponse} />
        </Box>
        <TaskStatusPanel task={task} onSubmit={handleSubmitChanges} />
      </Stack>
    </Card>
  );
};
