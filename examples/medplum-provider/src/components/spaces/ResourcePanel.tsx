// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Text } from '@mantine/core';
import type { Reference, Resource } from '@medplum/fhirtypes';
import { ResourceTable, useResource, PatientSummary } from '@medplum/react';
import type { JSX } from 'react';
import { TaskInputNote } from '../tasks/TaskInputNote';

interface ResourcePanelProps<T extends Resource = Resource> {
  resource: Reference<T> | T;
}

export function ResourcePanel<T extends Resource = Resource>(props: ResourcePanelProps<T>): JSX.Element | null {
  const { resource } = props;
  const displayResource = useResource(resource);

  if (!displayResource) {
    return (
      <Box p="md">
        <Text c="dimmed">Loading resource...</Text>
      </Box>
    );
  }

  if (displayResource.resourceType === 'Patient') {
    return <PatientSummary patient={displayResource} />;
  }

  if (displayResource.resourceType === 'Task') {
    return <TaskInputNote task={displayResource} />;
  }

  return <ResourceTable value={displayResource} />;
}
