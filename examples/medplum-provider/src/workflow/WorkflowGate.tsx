// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, List, Text } from '@mantine/core';
import { Loading } from '@medplum/react';
import { IconPlugConnectedX } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { UnavailableNotice } from '../components/UnavailableNotice';
import type { WorkflowDependency, WorkflowId } from './dependencies';
import { WORKFLOWS } from './dependencies';
import { useWorkflowAvailability } from './useWorkflowAvailability';

export interface WorkflowGateProps {
  readonly workflow: WorkflowId;
  readonly children: ReactNode;
  /** Rendered while dependencies are being probed. Defaults to `<Loading />`. */
  readonly loadingFallback?: ReactNode;
}

// Blocks entry to a workflow whose hard dependencies are missing, showing an admin what to link
// and where instead of the workflow UI. Only project admins are gated: for anyone else the
// dependency probe cannot tell a missing integration from an AccessPolicy that hides `Bot`, so
// they are let through. Renders its children unchanged once all dependencies are present.
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
  return <MissingDependenciesNotice workflowLabel={WORKFLOWS[workflow].label} missing={missing} />;
}

export interface MissingDependenciesNoticeProps {
  readonly workflowLabel: string;
  readonly missing: readonly WorkflowDependency[];
}

// Guidance shown in place of a blocked workflow, listing which integrations to link (with docs
// links). Only ever shown to project admins — see WorkflowGate above.
export function MissingDependenciesNotice(props: MissingDependenciesNoticeProps): JSX.Element {
  const { workflowLabel, missing } = props;
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

  return (
    <UnavailableNotice
      icon={<IconPlugConnectedX size={48} color="var(--mantine-color-gray-5)" aria-hidden />}
      title={`${workflowLabel} is unavailable`}
    >
      <Text size="sm" c="dimmed">
        This workflow depends on the following {plural ? 'integrations that are' : 'integration that is'} not linked to
        your project:
      </Text>
      {dependencyList}
      <Text size="sm" c="dimmed">
        Link the required {plural ? 'projects' : 'project'} to enable this workflow.
      </Text>
    </UnavailableNotice>
  );
}
