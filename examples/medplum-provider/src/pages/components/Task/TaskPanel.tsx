import { Annotation, QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { TaskQuestionnaireForm } from './TaskQuestionnaireForm';
import { SimpleTask } from './SimpleTask';
import { Card, Stack } from '@mantine/core';
import { TaskStatusPanel } from './TaskStatusPanel';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { showNotification } from '@mantine/notifications';
import { IconCircleOff } from '@tabler/icons-react';
import { createReference, normalizeErrorString } from '@medplum/core';

interface TaskPanelProps {
  task: Task;
  onCompleteTask: (task: Task) => void;
  onSaveQuestionnaire: (task: Task, response: QuestionnaireResponse) => void;
}

const updateTaskStatus = async (task: Task, medplum: any, onCompleteTask: (task: Task) => void): Promise<void> => {
  try {
    const response = await medplum.updateResource(task);
    onCompleteTask(response);
  } catch (err) {
    showNotification({
      color: 'red',
      icon: <IconCircleOff />,
      title: 'Error',
      message: normalizeErrorString(err),
    });
  }
};

export const TaskPanel = ({ task, onCompleteTask, onSaveQuestionnaire }: TaskPanelProps): JSX.Element => {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const author = useMedplumProfile();
  const [questionnaireResponse, setQuestionnaireResponse] = useState<QuestionnaireResponse | undefined>(undefined);
  const [isQuestionnaire, setIsQuestionnaire] = useState<boolean>(
    !!task.input?.[0]?.valueReference && task.status !== 'completed'
  );

  const onActionButtonClicked = async (): Promise<void> => {
    if (questionnaireResponse && isQuestionnaire) {
      // Task handles an active questionnaire. Action will submit questionnaire and complete task
      onSaveQuestionnaire(task, questionnaireResponse);
    } else if (task.status === 'ready' || task.status === 'requested') {
      // Task status is Ready or Requested. Action will mark as complete.
      await updateTaskStatus({ ...task, status: 'completed' }, medplum, onCompleteTask);
    } else {
      // Fallback navigation to Task details.
      navigate(`Task/${task.id}`);
    }
  };

  const onChangeResponse = (response: QuestionnaireResponse): void => {
    setIsQuestionnaire(true);
    setQuestionnaireResponse(response);
  };

  const onAddNote = async (note: string): Promise<void> => {
    const newNote: Annotation = {
      text: note,
      authorReference: author && createReference(author),
      time: new Date().toISOString(),
    };

    const taskNotes = task?.note || [];
    taskNotes.push(newNote);
    const updatedTask: Task = { ...task, note: taskNotes };
    await updateTaskStatus(updatedTask, medplum, onCompleteTask);
  };

  const onChangeStatus = async (status: Task[`status`]): Promise<void> => {
    const updatedTask: Task = { ...task, status: status };
    await updateTaskStatus(updatedTask, medplum, onCompleteTask);
  };

  return (
    <Card withBorder shadow="sm" p={0}>
      <Stack gap="xs">
        {task.input && task.input[0]?.type?.text === 'Questionnaire' && task.input[0]?.valueReference ? (
          <TaskQuestionnaireForm key={task.id} task={task} onChangeResponse={onChangeResponse} />
        ) : (
          <SimpleTask key={task.id} task={task} />
        )}
        <TaskStatusPanel
          task={task}
          isQuestionnaire={isQuestionnaire}
          onActionButtonClicked={onActionButtonClicked}
          onAddNote={onAddNote}
          onChangeStatus={onChangeStatus}
        />
      </Stack>
    </Card>
  );
};
