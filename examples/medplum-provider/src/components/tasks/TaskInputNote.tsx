import { ActionIcon, Button, Divider, Flex, Modal, Paper, ScrollArea, Stack, Text, Textarea } from '@mantine/core';
import { Annotation, Task } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { TaskQuestionnaireForm } from '../encountertasks/TaskQuestionnaireForm';
import { createReference, formatDate, getDisplayString, PatchOperation } from '@medplum/core';
import { IconCheck, IconTrash } from '@tabler/icons-react';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { showErrorNotification } from '../../utils/notifications';

interface TasksInputNoteProps {
  task: Task;
  onDeleteTask: (task: Task) => void;
}

export function TasksInputNote(props: TasksInputNoteProps): React.JSX.Element {
  const { task: initialTask, onDeleteTask } = props;
  const medplum = useMedplum();
  const author = useMedplumProfile();
  const [task, setTask] = useState<Task>(initialTask);
  const [note, setNote] = useState<string>('');
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);

  const handleAddComment = async (): Promise<void> => {
    const taskId = task.id as string;
    const ops: PatchOperation[] = [{ op: 'test', path: '/meta/versionId', value: task.meta?.versionId }];
    const comment: Annotation = {
      text: note,
      authorReference: author && createReference(author),
      time: new Date().toISOString(),
    };

    const taskNotes = [...(task.note || []), comment];
    const op: PatchOperation['op'] = task.note ? 'replace' : 'add';
    ops.push({ op, path: '/note', value: taskNotes });

    try {
      const result = await medplum.patchResource('Task', taskId, ops);
      setTask(result);
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
    const ops: PatchOperation[] = [{ op: 'test', path: '/meta/versionId', value: task.meta?.versionId }];
    ops.push({ op: 'replace', path: '/status', value: 'completed' });

    try {
      const result = await medplum.patchResource('Task', task.id as string, ops);
      setTask(result);
    } catch (error) {
      showErrorNotification(error);
    }
  };

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
              <TaskQuestionnaireForm key={task.id} task={task} />
              <Divider />
            </>
          )}

          {task.note?.map((note) => (
            <div key={note.id}>
              <Text>{note.text}</Text>
              <Divider />
            </div>
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
      </ScrollArea>

      <Modal
        opened={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Task"
        size="md"
        centered
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to delete this task? This action cannot be undone.
          </Text>
          <Text fw={500} c="dimmed">
            Task: {getDisplayString(task)}
          </Text>
          <Flex justify="flex-end" gap="sm">
            <Button 
              variant="outline" 
              onClick={() => setShowDeleteModal(false)}
            >
              Cancel
            </Button>
            <Button 
              color="red" 
              onClick={confirmDeleteTask}
            >
              Delete
            </Button>
          </Flex>
        </Stack>
      </Modal>
    </Paper>
  );
}
