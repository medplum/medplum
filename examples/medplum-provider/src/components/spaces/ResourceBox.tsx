// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Group, Loader, Paper, Text, ThemeIcon } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import { useResource } from '@medplum/react';
import { IconFileText } from '@tabler/icons-react';
import type { JSX } from 'react';
import classes from './ResourceBox.module.css';

interface ResourceBoxProps {
  resourceReference: string;
  onClick: (resourceReference: string) => void;
}

export function ResourceBox({ resourceReference, onClick }: ResourceBoxProps): JSX.Element {
  const resource = useResource({ reference: resourceReference });

  if (!resource) {
    return (
      <Paper withBorder p="sm" className={classes.resourceBox}>
        <Loader />
      </Paper>
    );
  }

  const displayName = getDisplayString(resource) ?? '';
  const resourceType = resource.resourceType;

  return (
    <Paper withBorder p="sm" className={classes.resourceBox} onClick={() => onClick(resourceReference)}>
      <Group gap="sm" wrap="nowrap">
        <ThemeIcon size="lg" variant="light" color="violet">
          <IconFileText size={20} />
        </ThemeIcon>
        <Box className={classes.content}>
          <Text size="sm" fw={600} c="violet.7">
            {resourceType}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {displayName}
          </Text>
        </Box>
      </Group>
    </Paper>
  );
}
