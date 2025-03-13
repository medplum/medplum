import React from 'react';
import { Box, Text, Group, Paper } from '@mantine/core';
import { Encounter, Practitioner, HumanName } from '@medplum/fhirtypes';
import classes from './EncounterHeader.module.css';
import { formatHumanName } from '@medplum/core';
import { StatusBadge } from '@medplum/react';

interface EncounterHeaderProps {
  encounter: Encounter;
  practitioner?: Practitioner | undefined;
}

export const EncounterHeader = (props: EncounterHeaderProps): JSX.Element => {
  const { encounter, practitioner } = props;

  return (
    <Paper shadow="sm" px="lg" pt="xs" withBorder>
      <Box className={classes.row}>
        <Group gap="xl">
          <Box>
            <Text className={classes.label} c="dimmed">
              Practitioner
            </Text>
            <Text className={classes.value}>
              {practitioner ? `${formatHumanName(practitioner.name?.[0] as HumanName)}` : 'N/A'}
            </Text>
          </Box>

          <Box>
            <Text className={classes.label} c="dimmed">
              Status
            </Text>
            <StatusBadge status={encounter.status} />
          </Box>

          <Box>
            <Text className={classes.label} c="dimmed">
              Checked in
            </Text>
            <Text className={classes.dash}>—</Text>
          </Box>

          <Box>
            <Text className={classes.label} c="dimmed">
              Checked out
            </Text>
            <Text>—</Text>
          </Box>
        </Group>
      </Box>
    </Paper>
  );
};
