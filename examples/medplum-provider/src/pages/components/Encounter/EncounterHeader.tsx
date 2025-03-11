import React from 'react';
import { Box, Text, Group, Paper } from '@mantine/core';
import { Patient, Encounter, Practitioner, HumanName } from '@medplum/fhirtypes';
import classes from './EncounterHeader.module.css';
import { formatHumanName } from '@medplum/core';
import { StatusBadge } from '@medplum/react';

interface EncounterHeaderProps {
  patient: Patient;
  encounter: Encounter;
  practitioner?: Practitioner | undefined;
}

export const EncounterHeader = (props: EncounterHeaderProps): JSX.Element => {
  const { patient, encounter, practitioner } = props;

  return (
    <Paper shadow="sm" px="lg" py="xs" withBorder>
      <Text className={classes.header}>Encounters</Text>

      <Box className={classes.row}>
        <Group gap="xl">
          <Box>
            <Text className={classes.label} c="dimmed">
              Patient
            </Text>
            <Text className={classes.value}>{formatHumanName(patient.name?.[0] as HumanName)}</Text>
          </Box>

          <Box>
            <Text className={classes.label} c="dimmed">
              Practitioner
            </Text>
            <Text className={classes.value}>
              {practitioner ? `${formatHumanName(practitioner.name?.[0] as HumanName)}` : 'N/A'}
            </Text>
          </Box>
        </Group>

        <Group gap="xl">
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
