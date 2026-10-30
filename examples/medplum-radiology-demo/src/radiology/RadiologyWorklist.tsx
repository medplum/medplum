// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { NavLink, ScrollArea, Stack, Text } from '@mantine/core';
import type { Task } from '@medplum/fhirtypes';
import { ResourceName, useSearchResources } from '@medplum/react';
import type { JSX } from 'react';
import { RADIOLOGY_WORKLIST_QUERY } from './radiology-utils';

export interface RadiologyWorklistProps {
  readonly selectedTaskId?: string;
  readonly onSelect: (task: Task) => void;
}

export function RadiologyWorklist({ selectedTaskId, onSelect }: RadiologyWorklistProps): JSX.Element {
  const [tasks] = useSearchResources('Task', RADIOLOGY_WORKLIST_QUERY);

  if (tasks?.length === 0) {
    return (
      <Text p="md" c="dimmed" size="sm">
        No studies to read.
      </Text>
    );
  }

  return (
    <ScrollArea>
      <Stack gap={0} p="xs">
        {tasks?.map((task) => (
          <NavLink
            key={task.id}
            active={task.id === selectedTaskId}
            onClick={() => onSelect(task)}
            label={task.for ? <ResourceName value={task.for} /> : 'Unknown patient'}
            description={task.code?.text ?? task.description}
          />
        ))}
      </Stack>
    </ScrollArea>
  );
}
