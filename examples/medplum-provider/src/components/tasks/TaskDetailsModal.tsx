// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Card, Grid, Group, Stack, Text, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { createReference, formatHumanName } from '@medplum/core';
import type { Practitioner, Reference, Task } from '@medplum/fhirtypes';
import {
  CodeInput,
  DateTimeInput,
  Loading,
  Modal,
  ResourceInput,
  useMedplum,
  useMedplumProfile,
  useResource,
} from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { usePatient } from '../../hooks/usePatient';
import { showErrorNotification } from '../../utils/notifications';
import classes from './TaskDetailsModal.module.css';

export interface TaskDetailsModalProps {
  /** The task to display and edit. */
  task: WithId<Task> | Reference<Task>;
  /** Called with the saved task after a successful update. */
  onUpdateTask?: (task: WithId<Task>) => void;
}

export const TaskDetailsModal = (props: TaskDetailsModalProps): JSX.Element => {
  const { task: taskProp, onUpdateTask } = props;
  const { patientId, encounterId } = useParams();
  const patient = usePatient();
  const medplum = useMedplum();
  const navigate = useNavigate();
  const location = useLocation();
  const author = useMedplumProfile();
  const taskResource = useResource(taskProp, showErrorNotification);
  const [task, setTask] = useState<WithId<Task> | undefined>(undefined);
  const [practitioner, setPractitioner] = useState<Practitioner | undefined>();
  const [dueDate, setDueDate] = useState<string | undefined>();
  const [status, setStatus] = useState<Task['status'] | undefined>();
  const [note, setNote] = useState('');

  // Closing returns to the encounter, keeping the search query so the visits list retains its pagination/sort.
  const handleClose = (): void => {
    navigate(`/Patient/${patientId}/Encounter/${encounterId}${location.search}`)?.catch(console.error);
  };

  useEffect(() => {
    if (taskResource) {
      setTask(taskResource);
      setStatus(taskResource.status);
      setDueDate(taskResource.restriction?.period?.end);
    }
  }, [taskResource]);

  const handleOnSubmit = async (): Promise<void> => {
    if (!task) {
      return;
    }

    const updatedTask: Task = {
      ...task,
    };

    const trimmedNote = note.trim();
    if (trimmedNote !== '') {
      updatedTask.note = [
        ...(task.note || []),
        {
          text: trimmedNote,
          authorReference: author && createReference(author),
          time: new Date().toISOString(),
        },
      ];
    }

    if (status) {
      updatedTask.status = status;
    }

    if (dueDate) {
      updatedTask.restriction = {
        ...updatedTask.restriction,
        period: {
          ...updatedTask.restriction?.period,
          end: dueDate,
        },
      };
    }

    if (practitioner) {
      updatedTask.owner = createReference(practitioner);
    }

    try {
      const savedTask = await medplum.updateResource(updatedTask);
      notifications.show({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Task updated',
      });
      setTask(savedTask);
      onUpdateTask?.(savedTask);
      handleClose();
    } catch {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: 'Failed to update the task.',
      });
    }
  };

  return (
    <Modal
      opened
      onClose={handleClose}
      size="xl"
      title={task?.code?.text}
      padding="md"
      bodyHeight="60vh"
      actions={
        <Group justify="flex-end">
          <Button variant="filled" onClick={handleOnSubmit} disabled={!task}>
            Save Changes
          </Button>
        </Group>
      }
    >
      {!task ? (
        <Loading />
      ) : (
        <Grid h="100%">
          <Grid.Col span={6} pr="lg">
            <Stack gap="sm">
              <Card p="md" radius="md" className={classes.taskDetails}>
                <Stack gap="sm">
                  {task?.description && <Text>{task.description}</Text>}
                  {patient?.name && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Text>View Patient</Text>
                      <Button variant="subtle" component={Link} to={`/Patient/${patient.id}`}>
                        {formatHumanName(patient.name?.[0])}
                      </Button>
                    </div>
                  )}
                </Stack>
              </Card>

              <ResourceInput<Practitioner>
                name="practitioner"
                resourceType="Practitioner"
                label="Assigned to"
                defaultValue={task?.owner ? { reference: task.owner.reference } : undefined}
                onChange={(value) => {
                  setPractitioner(value);
                }}
              />

              <DateTimeInput
                name="Due Date"
                placeholder="End"
                label="Due Date"
                defaultValue={dueDate}
                onChange={setDueDate}
              />

              {task?.status && (
                <CodeInput
                  name="status"
                  label="Status"
                  binding="http://hl7.org/fhir/ValueSet/task-status|4.0.1"
                  maxValues={1}
                  defaultValue={status}
                  onChange={(value) => {
                    if (value) {
                      setStatus(value as typeof status);
                    }
                  }}
                />
              )}
            </Stack>
          </Grid.Col>

          <Grid.Col span={6} pr="md">
            <Stack gap="sm">
              <Text>Note</Text>
              <Text c="dimmed">Optional free form details about this task</Text>
              <Textarea
                placeholder="Add note to this task"
                minRows={3}
                value={note}
                onChange={(event) => setNote(event.currentTarget.value)}
              />
            </Stack>
          </Grid.Col>
        </Grid>
      )}
    </Modal>
  );
};
