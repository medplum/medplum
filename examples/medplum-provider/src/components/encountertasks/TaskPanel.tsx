// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Card, Stack } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { getReferenceString, normalizeErrorString } from '@medplum/core';
import { DiagnosticReport, QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconCircleOff } from '@tabler/icons-react';
import { JSX } from 'react';
import { useNavigate } from 'react-router';
import { SAVE_TIMEOUT_MS } from '../../config/constants';
import { SimpleTask } from './SimpleTask';
import { TaskQuestionnaireForm } from './TaskQuestionnaireForm';
import { TaskStatusPanel } from './TaskStatusPanel';
import { TaskServiceRequest } from './TaskServiceRequest';

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

  const onChangeResponse = (response: QuestionnaireResponse): void => {
    saveQuestionnaireResponse(task, response);
  };

  const onSaveDiagnosticReport = (diagnosticReport: DiagnosticReport): void => {
    saveDiagnosticReport(task, diagnosticReport);
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
        console.error(err);
      }
    },
    SAVE_TIMEOUT_MS
  );

  const saveDiagnosticReport = useDebouncedCallback(
    async (task: Task, diagnosticReport: DiagnosticReport): Promise<void> => {
      const updatedTask = await medplum.updateResource<Task>({
        ...task,
        output: [
          {
            type: { text: 'DiagnosticReport' },
            valueReference: { reference: getReferenceString(diagnosticReport) },
          },
        ],
      });
      onUpdateTask(updatedTask);
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
        <Stack p="md">
          {task.focus?.reference?.startsWith('Questionnaire/') && (
            <TaskQuestionnaireForm key={task.id} task={task} onChangeResponse={onChangeResponse} />
          )}
          {task.focus?.reference?.startsWith('ServiceRequest/') && (
            <TaskServiceRequest key={task.id} task={task} saveDiagnosticReport={onSaveDiagnosticReport} />
          )}

          {!task.focus?.reference?.startsWith('ServiceRequest/') &&
            !task.focus?.reference?.startsWith('Questionnaire/') && <SimpleTask key={task.id} task={task} />}
        </Stack>
        <TaskStatusPanel task={task} onActionButtonClicked={onActionButtonClicked} onChangeStatus={onChangeStatus} />
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
