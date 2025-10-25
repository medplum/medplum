// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Divider, Grid, Modal, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { createReference, normalizeErrorString } from '@medplum/core';
import type { CodeableConcept, Patient, Practitioner, Reference, Task } from '@medplum/fhirtypes';
import {
  CodeableConceptInput,
  CodeInput,
  DateTimeInput,
  ReferenceInput,
  ResourceInput,
  useMedplum,
  useMedplumProfile,
} from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useState } from 'react';
import type { JSX } from 'react';

export interface NewTaskModalProps {
  opened: boolean;
  onClose: () => void;
  onTaskCreated?: (task: Task) => void;
}

export function NewTaskModal(props: NewTaskModalProps): JSX.Element {
  const { opened, onClose, onTaskCreated } = props;
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [intent, setIntent] = useState<string>('order');

  const [status, setStatus] = useState<Task['status']>('draft');
  const [priority, setPriority] = useState<string>('routine');
  const [assignee, setAssignee] = useState<Reference<Practitioner> | undefined>();
  const [dueDate, setDueDate] = useState<string | undefined>();
  const [taskPatient, setTaskPatient] = useState<Reference<Patient> | undefined>();

  const [taskCode, setTaskCode] = useState<CodeableConcept | undefined>();
  const [performerType, setPerformerType] = useState<CodeableConcept | undefined>();

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = async (): Promise<void> => {
    if (!title.trim()) {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Validation Error',
        message: 'Task title is required',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const newTask: Task = {
        resourceType: 'Task',
        status: status,
        intent: intent as Task['intent'],
        priority: priority as Task['priority'],
        code: taskCode || {
          text: title,
        },
        description: description.trim() || undefined,
        for: taskPatient,
        authoredOn: new Date().toISOString(),
        requester: profile ? createReference(profile) : undefined,
        owner: assignee,
        performerType: performerType ? [performerType] : undefined,
        restriction: dueDate
          ? {
              period: {
                end: dueDate,
              },
            }
          : undefined,
      };

      const createdTask = await medplum.createResource(newTask);

      notifications.show({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Task created successfully',
      });

      onTaskCreated?.(createdTask);
      handleClose();
    } catch (error) {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (): void => {
    setTitle('');
    setDescription('');
    setIntent('order');
    setStatus('draft');
    setPriority('routine');
    setAssignee(undefined);
    setDueDate(undefined);
    setTaskCode(undefined);
    setPerformerType(undefined);
    setTaskPatient(undefined);
    setIsSubmitting(false);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      size="xl"
      title="Create New Task"
      styles={{
        body: {
          padding: 0,
          height: '70vh',
        },
      }}
    >
      <Stack h="100%" justify="space-between" gap={0}>
        <Box flex={1} miw={0}>
          <Grid p="md" h="100%">
            <Grid.Col span={6} pr="lg">
              <Stack gap="md" h="100%">
                <Box>
                  <Stack gap="sm">
                    <TextInput
                      label="Title"
                      placeholder="Enter task title"
                      value={title}
                      onChange={(event) => setTitle(event.currentTarget.value)}
                      required
                      size="md"
                    />

                    <Textarea
                      label="Description"
                      placeholder="Enter task description (optional)"
                      value={description}
                      onChange={(event) => setDescription(event.currentTarget.value)}
                      minRows={4}
                      autosize
                      maxRows={8}
                    />
                  </Stack>
                </Box>
              </Stack>
            </Grid.Col>

            <Grid.Col span={6} pl="lg">
              <Stack gap="md" h="100%">
                <Box>
                  <Stack gap="sm">
                    <CodeInput
                      name="status"
                      label="Status"
                      binding="http://hl7.org/fhir/ValueSet/task-status"
                      maxValues={1}
                      defaultValue={status}
                      onChange={(value) => setStatus((value as Task['status']) || 'draft')}
                      required
                    />

                    <DateTimeInput
                      name="dueDate"
                      label="Due Date"
                      placeholder="Select due date (optional)"
                      defaultValue={dueDate}
                      onChange={setDueDate}
                    />

                    <CodeInput
                      name="priority"
                      label="Priority"
                      binding="http://hl7.org/fhir/ValueSet/request-priority"
                      maxValues={1}
                      defaultValue={priority}
                      onChange={(value) => setPriority(value || 'routine')}
                    />

                    <ResourceInput<Patient>
                      resourceType="Patient"
                      name="patient"
                      label="Patient"
                      placeholder="Select patient"
                      defaultValue={taskPatient}
                      onChange={(value: Patient | undefined) =>
                        setTaskPatient(value ? createReference(value) : undefined)
                      }
                    />

                    <Box>
                      <Text size="sm" fw={500} mb="xs">
                        Assignee
                      </Text>
                      <ReferenceInput
                        name="assignee"
                        targetTypes={['Practitioner', 'Organization']}
                        placeholder="Select assignee (optional)"
                        onChange={(value) => setAssignee(value as Reference<Practitioner>)}
                      />
                    </Box>

                    <CodeableConceptInput
                      name="performerType"
                      label="Performer Type"
                      placeholder="Select performer type (optional)"
                      binding="http://hl7.org/fhir/ValueSet/performer-role"
                      maxValues={1}
                      onChange={(value) => setPerformerType(value as CodeableConcept)}
                      path={'Task.performerType'}
                    />
                  </Stack>
                </Box>
              </Stack>
            </Grid.Col>
          </Grid>
        </Box>

        <Stack p="md">
          <Divider />
          <Button variant="filled" w="100%" onClick={handleSubmit} loading={isSubmitting}>
            Create Task
          </Button>
        </Stack>
      </Stack>
    </Modal>
  );
}
