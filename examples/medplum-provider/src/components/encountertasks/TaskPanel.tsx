import { Card, Stack } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getReferenceString, normalizeErrorString } from '@medplum/core';
import { QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconCircleOff } from '@tabler/icons-react';
import { JSX } from 'react';
import { useNavigate } from 'react-router';
import { SAVE_TIMEOUT_MS } from '../../config/constants';
import { SimpleTask } from './SimpleTask';
import { TaskQuestionnaireForm } from './TaskQuestionnaireForm';
import { TaskStatusPanel } from './TaskStatusPanel';
import { useDebouncedCallback } from '@mantine/hooks';
import { showErrorNotification } from '../../utils/notifications';

interface TaskPanelProps {
  task: Task;
  onUpdateTask: (task: Task) => void;
}

export const TaskPanel = (props: TaskPanelProps): JSX.Element => {
  const { task, onUpdateTask } = props;
  const navigate = useNavigate();
  const medplum = useMedplum();

  const onActionButtonClicked = async (): Promise<void> => {
    navigate(`Task/${task.id}`)?.catch(console.error);
  };

  const saveQuestionnaireResponse = useDebouncedCallback(
    async (task: Task, response: QuestionnaireResponse): Promise<void> => {
      try {
        if (response.id) {
          await medplum.updateResource<QuestionnaireResponse>(response);
        } else {
          const updatedResponse = await medplum.createResource<QuestionnaireResponse>(response);
          const updatedTask = await medplum.updateResource<Task>({
            ...task,
            output: [
              {
                type: { text: 'QuestionnaireResponse' },
                valueReference: { reference: getReferenceString(updatedResponse) },
              },
            ],
          });
          onUpdateTask(updatedTask);
        }
      } catch (err) {
        showErrorNotification(err);
      }
    },
    SAVE_TIMEOUT_MS
  );

  const onChangeStatus = async (status: Task[`status`]): Promise<void> => {
    const updatedTask: Task = { ...task, status: status };
    await updateTaskStatus(updatedTask, medplum, onUpdateTask);
  };

  return (
    <Card withBorder shadow="sm" p={0}>
      <Stack gap="xs">
        {task.input && task.input[0]?.type?.text === 'Questionnaire' && task.input[0]?.valueReference ? (
          <TaskQuestionnaireForm key={task.id} task={task} onChangeResponse={(response) => saveQuestionnaireResponse(task, response)} />
        ) : (
          <SimpleTask key={task.id} task={task} />
        )}
        <TaskStatusPanel
          task={task}
          onActionButtonClicked={onActionButtonClicked}
          onChangeStatus={onChangeStatus}
        />
      </Stack>
    </Card>
  );
};

const updateTaskStatus = async (task: Task, medplum: any, onUpdateTask: (task: Task) => void): Promise<void> => {
  try {
    const response = await medplum.updateResource(task);
    onUpdateTask(response);
  } catch (err) {
    showNotification({
      color: 'red',
      icon: <IconCircleOff />,
      title: 'Error',
      message: normalizeErrorString(err),
    });
  }
};
