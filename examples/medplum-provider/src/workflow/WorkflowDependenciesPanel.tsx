// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Anchor, List, Stack, Text } from '@mantine/core';
import { useMedplum } from '@medplum/react';
import { IconPlugConnectedX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useMissingWorkflowDependencies } from './useWorkflowAvailability';

// Admin-only summary of missing project dependencies across all gated workflows. Rendered on the
// Get Started page so administrators can see and fix missing shared-project links up front, rather
// than discovering them one blocked workflow at a time. See issue #9824.
// Returns null for non-admin users (who instead see per-workflow guidance when they hit a gate)
// and while probing, so it never flashes an empty card.
export function WorkflowDependenciesPanel(): JSX.Element | null {
  const medplum = useMedplum();
  const isAdmin = medplum.isProjectAdmin();
  const { loading, blockedWorkflows } = useMissingWorkflowDependencies({ enabled: isAdmin });

  if (!isAdmin || loading || blockedWorkflows.length === 0) {
    return null;
  }

  return (
    <Alert variant="light" color="yellow" icon={<IconPlugConnectedX size={20} />} title="Missing project dependencies">
      <Stack gap="sm">
        <Text size="sm">
          Some workflows are unavailable because the integrations they depend on are not linked to this project. Users
          will be blocked from these workflows until the required projects are linked.
        </Text>
        {blockedWorkflows.map(({ workflow, missing }) => (
          <Stack key={workflow.id} gap={2}>
            <Text size="sm" fw={500}>
              {workflow.label}
            </Text>
            <List spacing={2} size="sm" withPadding>
              {missing.map((dependency) => (
                <List.Item key={dependency.identifier}>
                  {dependency.docsUrl ? (
                    <Anchor href={dependency.docsUrl} target="_blank" rel="noreferrer">
                      {dependency.label}
                    </Anchor>
                  ) : (
                    dependency.label
                  )}
                </List.Item>
              ))}
            </List>
          </Stack>
        ))}
      </Stack>
    </Alert>
  );
}
