// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Group, Text } from '@mantine/core';
import type { ProjectMembership } from '@medplum/fhirtypes';
import { IconBriefcase, IconCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { getMembershipLabel } from './membership.utils';
import classes from './ProjectLoginOption.module.css';

export interface ProjectLoginOptionProps {
  readonly projectDisplay?: string;
  readonly profileDisplay?: string;
  readonly label?: string;
  readonly selected?: boolean;
}

export function ProjectLoginOption(props: ProjectLoginOptionProps): JSX.Element {
  const { projectDisplay, profileDisplay, label, selected } = props;
  const projectTitle = label ? `${projectDisplay} - ${label}` : projectDisplay;

  return (
    <Group gap="xs" align="center" wrap="nowrap">
      <Box className={classes.iconBox}>
        <IconBriefcase size={16} stroke={2} />
      </Box>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text size="sm" fw={500} truncate>
          {projectTitle}
        </Text>
        <Text size="xs" c="dimmed" truncate>
          {profileDisplay}
        </Text>
      </div>
      {selected && <IconCheck size={16} stroke={2} color="var(--mantine-color-blue-6)" />}
    </Group>
  );
}

export function ProjectMembershipLoginOption(membership: ProjectMembership): JSX.Element {
  return (
    <ProjectLoginOption
      projectDisplay={membership.project?.display}
      profileDisplay={membership.profile?.display}
      label={getMembershipLabel(membership)}
    />
  );
}
