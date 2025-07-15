import { Badge, Divider, Flex, Menu, Stack, Text, Textarea } from '@mantine/core';
import { formatDate, formatHumanName, getDisplayString, getReferenceString } from '@medplum/core';
import { HumanName, Patient, Practitioner, Reference, Task } from '@medplum/fhirtypes';
import { CodeInput, DateTimeInput, ResourceInput, useMedplum, useResource } from '@medplum/react';
import React, { useState } from 'react';
import { SAVE_TIMEOUT_MS } from '../../config/constants';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { showErrorNotification } from '../../utils/notifications';
import { useDebouncedUpdateResource } from '../../hooks/useDebouncedUpdateResource';

interface TaskInfoProps {
  task: Task;
  onTaskChange: (task: Task) => void;
}

export function TaskInfo(props: TaskInfoProps): React.JSX.Element {
  const { task, onTaskChange } = props;
  const medplum = useMedplum();
  const practitioner = useResource(task?.requester);
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

  const handleStatusChange = async (value: Task['status']): Promise<void> => {
    await handleTaskUpdate({ ...task, status: value });
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
    <Flex direction="column" gap="lg">
      <Flex justify="space-between" align="flex-start">
        <Stack gap={0}>
          <Text size="xl" fw={600}>
            {getDisplayString(task)}
          </Text>
          <Text size="sm" c="dimmed">
            Created {formatDate(task?.authoredOn)}{' '}
            {practitioner?.resourceType === 'Practitioner' &&
              `by ${formatHumanName(practitioner.name?.[0] as HumanName)}`}
          </Text>
        </Stack>

        <Menu position="bottom-start">
          <Menu.Target>
            <Badge
              variant="light"
              color={getBadgeColor(task.status)}
              size="lg"
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0 }}
              rightSection={<IconChevronDown size={16} />}
            >
              {task.status.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())}
            </Badge>
          </Menu.Target>
          <Menu.Dropdown style={{ width: 140 }}>
            {statuses.map((status) => (
              <Menu.Item
                key={status.value}
                rightSection={
                  task.status === status.value ? (
                    <div style={{ marginLeft: 4, display: 'flex', alignItems: 'center' }}>
                      <IconCheck size={16} color="gray" />
                    </div>
                  ) : null
                }
                onClick={() => handleStatusChange(status.value as Task['status'])}
              >
                {status.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      </Flex>

      <Divider />

      <Stack gap="xs">
        <ResourceInput
          label="Patient"
          resourceType="Patient"
          name="patient"
          defaultValue={task?.for as Reference<Patient>}
          onChange={async (patient: Patient | undefined) => {
            await handlePatientChange(patient ? { reference: getReferenceString(patient) } : undefined);
          }}
        />

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
            await handlePractitionerChange(practitioner ? { reference: getReferenceString(practitioner) } : undefined);
          }}
        />
      </Stack>
    </Flex>
  );
}

const statuses = [
  { value: 'completed', label: 'Completed' },
  { value: 'ready', label: 'Ready' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'on-hold', label: 'On Hold' },
  { value: 'cancelled', label: 'Cancelled' },
];

const getBadgeColor = (status: Task['status']): string => {
  const colors = { completed: 'green', cancelled: 'red' };
  return colors[status as keyof typeof colors] ?? 'blue';
};
