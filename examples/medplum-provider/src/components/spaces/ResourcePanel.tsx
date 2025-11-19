// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Text } from '@mantine/core';
import type { DiagnosticReport, Encounter, Reference, Resource, ServiceRequest, Task } from '@medplum/fhirtypes';
import { ResourceTable, useResource, PatientSummary } from '@medplum/react';
import type { JSX } from 'react';
import { LabResultDetails } from '../labs/LabResultDetails';
import { LabOrderDetails } from '../labs/LabOrderDetails';
import { EncounterChart } from '../encounter/EncounterChart';
import { TaskDetailPanel } from '../tasks/TaskDetailPanel';

interface ResourcePanelProps<T extends Resource = Resource> {
  resource: Reference<T> | T;
}

export function ResourcePanel<T extends Resource = Resource>(props: ResourcePanelProps<T>): JSX.Element | null {
  const { resource } = props;
  const displayResource = useResource(resource);

  const renderResourceContent = (): JSX.Element => {
    if (!displayResource) {
      return <Text c="dimmed">Loading resource...</Text>;
    }

    switch (displayResource.resourceType) {
      case 'Patient':
        return <PatientSummary patient={displayResource} />;
      case 'Task':
        return <TaskDetailPanel task={displayResource as Task} />;
      case 'DiagnosticReport':
        return <LabResultDetails result={displayResource as DiagnosticReport} />;
      case 'ServiceRequest':
        return <LabOrderDetails order={displayResource as ServiceRequest} onOrderChange={() => {}} />;
      case 'Encounter':
        return <EncounterChart encounter={displayResource as Encounter} />;
      default:
        return <ResourceTable value={displayResource} />;
    }
  };

  return (
    <Box p="md" data-testid="resource-panel">
      {renderResourceContent()}
    </Box>
  );
}
