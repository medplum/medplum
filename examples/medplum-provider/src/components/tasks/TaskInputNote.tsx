// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Button,
  Card,
  Divider,
  Flex,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { createReference, formatDate, getDisplayString, getReferenceString } from '@medplum/core';
import { Annotation, QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCheck, IconTrash } from '@tabler/icons-react';
import React, { useEffect, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import { TaskQuestionnaireForm } from '../encountertasks/TaskQuestionnaireForm';
import { useDebouncedUpdateResource } from '../../hooks/useDebouncedUpdateResource';
import { TaskNoteItem } from './TaskNoteItem';
import { useDebouncedCallback } from '@mantine/hooks';
import { SAVE_TIMEOUT_MS } from '../../config/constants';

interface TasksInputNoteProps {
  task: Task;
  onTaskChange: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
}

export function TasksInputNote(props: TasksInputNoteProps): React.JSX.Element {
  const { task: initialTask, onTaskChange, onDeleteTask } = props;
  const medplum = useMedplum();
  const debouncedUpdateResource = useDebouncedUpdateResource(medplum);
  const author = useMedplumProfile();
  const [task, setTask] = useState<Task>(initialTask);
  const [note, setNote] = useState<string>('');
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);

  useEffect(() => {
    setTask(initialTask);
  }, [initialTask]);

  const handleAddComment = async (): Promise<void> => {
    const comment: Annotation = {
      text: note,
      authorReference: author && createReference(author),
      time: new Date().toISOString(),
    };

    const taskNotes = [...(task.note || []), comment];

    try {
      const result: Task = await medplum.updateResource({
        ...task,
        note: taskNotes,
      } as Task);
      onTaskChange(result);
      setNote('');
    } catch (error) {
      showErrorNotification(error);
    }
  };

  const handleDeleteTask = (): void => {
    setShowDeleteModal(true);
  };

  const confirmDeleteTask = async (): Promise<void> => {
    try {
      await medplum.deleteResource('Task', task.id as string);
      onDeleteTask(task);
      setShowDeleteModal(false);
    } catch (error) {
      showErrorNotification(error);
    }
  };

  const handleMarkAsCompleted = async (): Promise<void> => {
    try {
      const result: Task = {
        ...task,
        status: 'completed',
      };
      onTaskChange(result);
      await debouncedUpdateResource(result);
    } catch (error) {
      showErrorNotification(error);
    }
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
          onTaskChange(updatedTask);
        }
      } catch (err) {
        showErrorNotification(err);
      }
    },
    SAVE_TIMEOUT_MS
  );

  return (
    <Paper h="100%">
      <Flex justify="space-between" align="flex-start" p="lg" h={72}>
        <Flex justify="left" align="center" direction="row" pr="md">
          <Text size="xl" fw={600} lh={1.2}>
            {task.code?.text ?? `Task`}
            {task?.authoredOn && ` from ${formatDate(task?.authoredOn)}`}
          </Text>
        </Flex>

        <Flex align="center" gap="md">
          <ActionIcon
            variant="outline"
            c="dimmed"
            color="gray"
            aria-label="Delete Task"
            radius="xl"
            w={36}
            h={36}
            onClick={() => handleDeleteTask()}
          >
            <IconTrash size={24} />
          </ActionIcon>

          <ActionIcon
            variant={task.status === 'completed' ? 'filled' : 'outline'}
            color={task.status === 'completed' ? 'blue' : 'gray'}
            aria-label="Mark as Completed"
            radius="xl"
            w={36}
            h={36}
            onClick={() => handleMarkAsCompleted()}
          >
            <IconCheck size={24} />
          </ActionIcon>
        </Flex>
      </Flex>
      <Divider />

      <ScrollArea h="calc(100% - 70px)" p="lg">
        <Stack>
          {task?.focus?.reference?.startsWith('Questionnaire/') && (
            <>
              <Stack gap={0}>
                <Text size="lg" fw={600} mb="lg">
                  Related Questionnaire
                </Text>
                <Card withBorder shadow="sm" p="md">
                  <TaskQuestionnaireForm
                    key={task.focus.reference}
                    task={task}
                    onChangeResponse={(response) => saveQuestionnaireResponse(task, response)}
                  />
                </Card>
              </Stack>
              <Divider />
            </>
          )}

          <Stack gap={0}>
            <Text size="lg" fw={600} mb="md">
              Notes
            </Text>

            {task.note?.map((note, index) => (
              <TaskNoteItem key={note.id || index} note={note} index={index} />
            ))}

            <Stack gap="xs">
              <Textarea
                placeholder="Add a note..."
                minRows={4}
                value={note ?? ''}
                onChange={(e) => setNote(e.currentTarget.value)}
                autosize
              />
              <Flex justify="flex-end">
                <Button type="submit" disabled={!note || note.trim() === ''} onClick={handleAddComment}>
                  Submit
                </Button>
              </Flex>
            </Stack>
          </Stack>
        </Stack>
      </ScrollArea>

      <Modal opened={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete Task" size="md" centered>
        <Stack gap="md">
          <Text>Are you sure you want to delete this task? This action cannot be undone.</Text>
          <Text fw={500} c="dimmed">
            Task: {getDisplayString(task)}
          </Text>
          <Flex justify="flex-end" gap="sm">
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={confirmDeleteTask}>
              Delete
            </Button>
          </Flex>
        </Stack>
      </Modal>
    </Paper>
  );
}
