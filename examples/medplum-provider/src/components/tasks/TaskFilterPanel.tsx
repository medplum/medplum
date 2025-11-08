// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Group, Button, Checkbox, Divider, Text, Box, MultiSelect } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useMedplumProfile, ResourceInput } from '@medplum/react';
import { createReference } from '@medplum/core';
import type { Reference, Practitioner, User, Patient, Task } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import type { FilterState } from './TaskFilterUtils';
import { TASK_STATUSES } from './TaskFilterUtils';

interface TaskFilterPanelProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
}

export function TaskFilterPanel({ filters, onFilterChange }: TaskFilterPanelProps): JSX.Element {
  const profile = useMedplumProfile();

  const handleMyTasksToggle = (): void => {
    onFilterChange({
      ...filters,
      showMyTasks: !filters.showMyTasks,
      owners: !filters.showMyTasks && profile ? [createReference(profile) as Reference<Practitioner | User>] : [],
    });
  };

  const handleOpenTasksToggle = (): void => {
    const newShowOpen = !filters.showOpenOnly;
    onFilterChange({
      ...filters,
      showOpenOnly: newShowOpen,
      statuses: newShowOpen
        ? ['ready', 'in-progress', 'received', 'accepted']
        : undefined,
    });
  };

  const handleHighPriorityToggle = (): void => {
    const newShowHighPriority = !filters.showHighPriorityOnly;
    onFilterChange({
      ...filters,
      showHighPriorityOnly: newShowHighPriority,
      priorities: newShowHighPriority ? ['urgent', 'asap', 'stat'] : undefined,
    });
  };

  return (
    <Stack gap="md" p="md">
      {/* Quick Filters Section */}
      <Box>
        <Text size="sm" fw={600} mb="xs">Quick Filters</Text>
        <Group gap="xs">
          <Button
            size="sm"
            variant={filters.showMyTasks ? 'filled' : 'light'}
            onClick={handleMyTasksToggle}
          >
            My Tasks
          </Button>
          <Button
            size="sm"
            variant={!filters.showMyTasks ? 'filled' : 'light'}
            onClick={() => onFilterChange({ ...filters, showMyTasks: false, owners: [] })}
          >
            All Tasks
          </Button>
        </Group>
        <Checkbox
          label="Open Tasks Only"
          checked={filters.showOpenOnly}
          onChange={handleOpenTasksToggle}
          mt="xs"
        />
        <Checkbox
          label="High Priority Only"
          checked={filters.showHighPriorityOnly}
          onChange={handleHighPriorityToggle}
          mt="xs"
        />
      </Box>

      <Divider />

      {/* Status & Priority Section */}
      <Box>
        <Text size="sm" fw={600} mb="xs">Status & Priority</Text>

        <MultiSelect
          label="Status"
          placeholder="Select statuses..."
          data={TASK_STATUSES.map(s => ({ value: s, label: s }))}
          value={filters.statuses || []}
          onChange={(values) => onFilterChange({ ...filters, statuses: values as Task['status'][] })}
          searchable
          clearable
        />

        <MultiSelect
          label="Priority"
          placeholder="Select priorities..."
          data={[
            { value: 'routine', label: 'Routine' },
            { value: 'urgent', label: 'Urgent' },
            { value: 'asap', label: 'ASAP' },
            { value: 'stat', label: 'STAT' },
          ]}
          value={filters.priorities?.map(p => p || '') || []}
          onChange={(values) => onFilterChange({ ...filters, priorities: values as Task['priority'][] })}
          mt="sm"
          clearable
        />
      </Box>

      <Divider />

      {/* Patient Section */}
      <Box>
        <Text size="sm" fw={600} mb="xs">Patient</Text>
        <ResourceInput
          resourceType="Patient"
          name="patient"
          placeholder="Search for patient..."
          defaultValue={filters.patient as Reference<Patient>}
          onChange={(patient: Patient | undefined) => onFilterChange({ ...filters, patient: patient ? createReference(patient) : undefined })}
        />
      </Box>

      <Divider />

      {/* Date Filters Section */}
      <Box>
        <Text size="sm" fw={600} mb="xs">Date Filters</Text>

        <Text size="xs" c="dimmed" mb="xs">Created Date</Text>
        <Group grow>
          <DatePickerInput
            placeholder="From"
            value={filters.createdDateRange?.start}
            onChange={(dateStr) => onFilterChange({
              ...filters,
              createdDateRange: {
                ...filters.createdDateRange,
                start: dateStr || undefined,
              },
            })}
            clearable
            size="xs"
          />
          <DatePickerInput
            placeholder="To"
            value={filters.createdDateRange?.end}
            onChange={(dateStr) => onFilterChange({
              ...filters,
              createdDateRange: {
                ...filters.createdDateRange,
                end: dateStr || undefined,
              },
            })}
            clearable
            size="xs"
          />
        </Group>

        <Text size="xs" c="dimmed" mb="xs" mt="md">Due Date</Text>
        <Group grow>
          <DatePickerInput
            placeholder="From"
            value={filters.dueDateRange?.start}
            onChange={(dateStr) => onFilterChange({
              ...filters,
              dueDateRange: {
                ...filters.dueDateRange,
                start: dateStr || undefined,
              },
            })}
            clearable
            size="xs"
          />
          <DatePickerInput
            placeholder="To"
            value={filters.dueDateRange?.end}
            onChange={(dateStr) => onFilterChange({
              ...filters,
              dueDateRange: {
                ...filters.dueDateRange,
                end: dateStr || undefined,
              },
            })}
            clearable
            size="xs"
          />
        </Group>
      </Box>

      {/* Clear All Filters Button */}
      <Button
        variant="subtle"
        color="gray"
        onClick={() => onFilterChange({
          showMyTasks: false,
          showOpenOnly: false,
          showHighPriorityOnly: false,
          owners: [],
          requestedPerformers: [],
          priorities: [],
          statuses: [],
          patient: undefined,
          createdDateRange: undefined,
          dueDateRange: undefined,
          modifiedDateRange: undefined,
          status: undefined,
          performerType: undefined,
        })}
        mt="md"
      >
        Clear All Filters
      </Button>
    </Stack>
  );
}
