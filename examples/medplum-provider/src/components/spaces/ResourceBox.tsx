// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Group, Loader, Paper, Text, ThemeIcon } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconFileText } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import classes from './ResourceBox.module.css';

interface ResourceBoxProps {
  resourceReference: string;
  onClick: (resourceReference: string) => void;
}

export function ResourceBox({ resourceReference, onClick }: ResourceBoxProps): JSX.Element {
  const medplum = useMedplum();
  const [resource, setResource] = useState<Resource | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const [resourceType, resourceId] = resourceReference.split('/');
    if (!resourceType || !resourceId) {
      setError('Invalid resource reference');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(undefined);

    medplum
      .readReference({ reference: resourceReference })
      .then(setResource)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [medplum, resourceReference]);

  if (loading) {
    return (
      <Paper withBorder p="sm" className={classes.resourceBox}>
        <Group gap="sm" wrap="nowrap">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Loading...
          </Text>
        </Group>
      </Paper>
    );
  }

  if (error || !resource) {
    return (
      <Paper withBorder p="sm" className={classes.resourceBox}>
        <Text size="sm" c="red">
          {error || 'Unable to find resource'}
        </Text>
      </Paper>
    );
  }

  const displayName = getDisplayString(resource) ?? '';
  const resourceType = resource.resourceType;

  return (
    <Paper
      withBorder
      p="sm"
      className={classes.resourceBox}
      onClick={() => onClick(resourceReference)}
      data-testid="resource-box"
    >
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
