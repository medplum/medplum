// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider, Flex, Paper, PaperProps, Stack, Text } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Organization, Patient, Practitioner, Reference, ResourceType, Task } from '@medplum/fhirtypes';
import { CodeInput, DateTimeInput, ReferenceInput, ResourceInput, useMedplum } from '@medplum/react';
import React, { useEffect, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import { useDebouncedUpdateResource } from '../../hooks/useDebouncedUpdateResource';

interface TaskPropertiesProps extends PaperProps {
  task: Task;
  onTaskChange: (task: Task) => void;
}

export function TaskProperties(props: TaskPropertiesProps): React.JSX.Element {
  const { task: initialTask, onTaskChange, ...paperProps } = props;
  const [task, setTask] = useState<Task | undefined>(initialTask);
  const medplum = useMedplum();
  const [dueDate, setDueDate] = useState<string | undefined>(task?.restriction?.period?.end);
  const debouncedUpdateResource = useDebouncedUpdateResource(medplum);

  useEffect(() => {
    setTask(initialTask);
  }, [initialTask]);

  const handleDueDateChange = async (value: string | undefined): Promise<void> => {
    setDueDate(value);
    await handleTaskUpdate({ ...task, restriction: { ...task?.restriction, period: { end: value } } } as Task);
  };

  const handlePatientChange = async (value: Reference<Patient> | undefined): Promise<void> => {
    await handleTaskUpdate({ ...task, for: value } as Task);
  };

  const handlePriorityChange = async (value: string): Promise<void> => {
    await handleTaskUpdate({ ...task, priority: value as Task['priority'] } as Task);
  };

  const handleOwnerChange = async (value: Reference<Practitioner | Organization> | undefined): Promise<void> => {
    await handleTaskUpdate({ ...task, owner: value } as Task);
  };

  const handleStatusChange = async (value: string | undefined): Promise<void> => {
    if (value) {
      await handleTaskUpdate({ ...task, status: value as Task['status'] } as Task);
    }
  };

  const handleTaskUpdate = async (value: Task): Promise<void> => {
    onTaskChange(value);
    try {
      await debouncedUpdateResource(value);
    } catch (error) {
      showErrorNotification(error);
    }
  };

  return (
    <Paper {...paperProps}>
      <Flex direction="column" gap="lg">
        <Stack gap="xs">
          <CodeInput
            key={`${task?.status}-${task?.id}`}
            name="status"
            label="Status"
            binding="http://hl7.org/fhir/ValueSet/task-status"
            maxValues={1}
            defaultValue={task?.status}
            onChange={handleStatusChange}
          />

          <DateTimeInput
            name="Due Date"
            placeholder="End"
            label="Due Date"
            defaultValue={dueDate}
            onChange={handleDueDateChange}
          />

          <Stack gap={0}>
            <Text size="sm" fw={500}>
              Assignee
            </Text>
            <ReferenceInput
              name="owner"
              targetTypes={['Practitioner', 'Organization']}
              defaultValue={task?.owner ? { reference: task.owner.reference } : undefined}
              onChange={async (value: Reference<Practitioner | Organization> | undefined) => {
                await handleOwnerChange(value ? { reference: value.reference } : undefined);
              }}
            />
          </Stack>

          <CodeInput
            name="priority"
            label="Priority"
            binding="http://hl7.org/fhir/ValueSet/request-priority"
            maxValues={1}
            defaultValue={task?.priority?.toString()}
            onChange={(value: string | undefined) => handlePriorityChange(value ?? '')}
          />

          {task?.basedOn && task.basedOn.length > 0 ? (
            <ResourceInput
              label="Based On"
              resourceType={task.basedOn[0].reference?.split('/').pop() as ResourceType}
              name="basedOn-0"
              defaultValue={task.basedOn[0]}
              disabled
            />
          ) : (
            <Stack gap={0}>
              <Text size="sm" fw={500}>
                Based On
              </Text>
              <ReferenceInput
                name="basedOn"
                placeholder="Select any resource..."
                onChange={async (value: Reference | undefined) => {
                  if (value?.reference) {
                    const newBasedOn = [...(task?.basedOn || []), value];
                    await handleTaskUpdate({ ...task, basedOn: newBasedOn } as Task);
                  }
                }}
              />
            </Stack>
          )}
        </Stack>

        <Divider />

        <Stack gap="xs" pt="md">
          <ResourceInput
            label="Patient"
            resourceType="Patient"
            name="patient"
            defaultValue={task?.for as Reference<Patient>}
            onChange={async (patient: Patient | undefined) => {
              await handlePatientChange(patient ? { reference: getReferenceString(patient) } : undefined);
            }}
          />

          {task?.encounter && (
            <ResourceInput label="Encounter" resourceType="Encounter" name="encounter" defaultValue={task.encounter} />
          )}
        </Stack>
      </Flex>
    </Paper>
  );
}
