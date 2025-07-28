import { Divider, Flex, Paper, PaperProps, Stack, Text, Textarea } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Patient, Practitioner, Reference, Task } from '@medplum/fhirtypes';
import { CodeInput, DateTimeInput, ReferenceInput, ResourceInput, useMedplum } from '@medplum/react';
import React, { useState } from 'react';
import { SAVE_TIMEOUT_MS } from '../../config/constants';
import { showErrorNotification } from '../../utils/notifications';
import { useDebouncedUpdateResource } from '../../hooks/useDebouncedUpdateResource';

interface TaskInfoProps extends PaperProps {
  task: Task;
  onTaskChange: (task: Task) => void;
}

export function TaskInfo(props: TaskInfoProps): React.JSX.Element {
  const { task, onTaskChange, ...paperProps } = props;
  const medplum = useMedplum();
  const [description, setDescription] = useState<string | undefined>(task?.description);
  const [dueDate, setDueDate] = useState<string | undefined>(task?.restriction?.period?.end);
  const debouncedUpdateResource = useDebouncedUpdateResource(medplum, SAVE_TIMEOUT_MS);

  const handleDueDateChange = async (value: string | undefined): Promise<void> => {
    setDueDate(value);
    await handleTaskUpdate({ ...task, restriction: { ...task.restriction, period: { end: value } } });
  };

  const handlePatientChange = async (value: Reference<Patient> | undefined): Promise<void> => {
    await handleTaskUpdate({ ...task, for: value });
  };

  const handleDescriptionChange = async (value: string): Promise<void> => {
    setDescription(value);
    await handleTaskUpdate({ ...task, description: value });
  };

  const handlePriorityChange = async (value: string): Promise<void> => {
    await handleTaskUpdate({ ...task, priority: value as Task['priority'] });
  };

  const handlePractitionerChange = async (value: Reference<Practitioner> | undefined): Promise<void> => {
    await handleTaskUpdate({ ...task, owner: value });
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
          <DateTimeInput
            name="Due Date"
            placeholder="End"
            label="Due Date"
            defaultValue={dueDate}
            onChange={handleDueDateChange}
          />

          <Textarea
            label="Description"
            value={description}
            minRows={3}
            autosize
            onChange={(event) => handleDescriptionChange(event.currentTarget.value)}
          />

          <CodeInput
            name="priority"
            label="Priority"
            binding="http://hl7.org/fhir/ValueSet/request-priority"
            maxValues={1}
            defaultValue={task?.priority?.toString()}
            onChange={(value: string | undefined) => handlePriorityChange(value ?? '')}
          />

          <ResourceInput
            label="Assignee"
            resourceType="Practitioner"
            name="practitioner"
            defaultValue={task?.owner ? { reference: task.owner.reference } : undefined}
            onChange={async (practitioner: Practitioner | undefined) => {
              await handlePractitionerChange(
                practitioner ? { reference: getReferenceString(practitioner) } : undefined
              );
            }}
          />

          {task?.basedOn && task.basedOn.length > 0 ? (
            <ResourceInput
              label="Based On"
              resourceType={task.basedOn[0].reference?.split('/')[0] as any}
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
                    const newBasedOn = [...(task.basedOn || []), value];
                    await handleTaskUpdate({ ...task, basedOn: newBasedOn });
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
            <ResourceInput
              label="Encounter"
              resourceType="Encounter"
              name="encounter"
              defaultValue={task.encounter}
            />
          )}
        </Stack>
      </Flex>
    </Paper>
  );
}
