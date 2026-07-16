// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Center, List, Paper, Stack, Text, Title } from '@mantine/core';
import { Loading, useMedplum } from '@medplum/react';
import { IconPlugConnectedX } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import type { WorkflowDependency, WorkflowId } from './dependencies';
import { WORKFLOWS } from './dependencies';
import { useWorkflowAvailability } from './useWorkflowAvailability';

export interface WorkflowGateProps {
  readonly workflow: WorkflowId;
  readonly children: ReactNode;
  /** Rendered while dependencies are being probed. Defaults to `<Loading />`. */
  readonly loadingFallback?: ReactNode;
}

// Blocks entry to a workflow whose hard dependencies are missing, showing role-aware guidance
// instead of the workflow UI. Admins see what to link and where; other users are directed to
// contact an administrator. Renders its children unchanged once all dependencies are present.
// See issue #9824.
export function WorkflowGate(props: WorkflowGateProps): JSX.Element {
  const { workflow, children, loadingFallback } = props;
  const { loading, available, missing } = useWorkflowAvailability(workflow);

  if (loading) {
    return <>{loadingFallback ?? <Loading />}</>;
  }
  if (available) {
    return <>{children}</>;
  }
  return (
    <Center p="xl">
      <MissingDependenciesNotice workflowLabel={WORKFLOWS[workflow].label} missing={missing} />
    </Center>
  );
}

export interface MissingDependenciesNoticeProps {
  readonly workflowLabel: string;
  readonly missing: readonly WorkflowDependency[];
}

// Role-aware guidance shown in place of a blocked workflow. Admins see which integrations to link
// (with docs links); other users are told to contact their administrator.
export function MissingDependenciesNotice(props: MissingDependenciesNoticeProps): JSX.Element {
  const { workflowLabel, missing } = props;
  const medplum = useMedplum();
  const isAdmin = medplum.isProjectAdmin();
  const plural = missing.length !== 1;

  const dependencyList = (
    <List spacing={4} size="sm" withPadding>
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
  );

  const adminBody = (
    <>
      <Text size="sm" c="dimmed">
        This workflow depends on the following {plural ? 'integrations that are' : 'integration that is'} not linked to
        your project:
      </Text>
      {dependencyList}
      <Text size="sm" c="dimmed">
        Link the required project{plural ? 's' : ''} to enable this workflow.
      </Text>
    </>
  );

  const userBody = (
    <Text size="sm" c="dimmed">
      This workflow is not set up yet. Contact your administrator to enable it.
    </Text>
  );

  return (
    <Paper shadow="md" p="xl" radius="md" withBorder maw={480}>
      <Stack align="center" gap="sm" ta="center">
        <IconPlugConnectedX size={48} color="var(--mantine-color-gray-5)" />
        <Title order={3}>{workflowLabel} is unavailable</Title>
        {isAdmin ? adminBody : userBody}
      </Stack>
    </Paper>
  );
}
