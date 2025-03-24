import React, { useState } from 'react';
import { Text, Group, Paper, Flex, ActionIcon, Button, Menu } from '@mantine/core';
import { Encounter, Practitioner } from '@medplum/fhirtypes';
import { IconTrash, IconChevronDown, IconLock } from '@tabler/icons-react';

interface EncounterHeaderProps {
  encounter: Encounter;
  practitioner?: Practitioner | undefined;
  onStatusChange?: (status: Encounter['status']) => void;
}

export const EncounterHeader = (props: EncounterHeaderProps): JSX.Element => {
  const { encounter, onStatusChange } = props;
  const [status, setStatus] = useState<Encounter['status']>(encounter.status);

  const handleStatusChange = (newStatus: Encounter['status']): void => {
    setStatus(newStatus);
    onStatusChange?.(newStatus);
  };

  const getStatusColor = (status: Encounter['status']): string => {
    if (status === 'in-progress') {
      return 'blue';
    }
    if (status === 'finished') {
      return 'green';
    }
    if (status === 'cancelled') {
      return 'red';
    }
    return 'gray';
  };

  return (
    <Paper shadow="sm" p={0}>
      <Flex justify="space-between" align="center" p="lg">
        <Group gap="xs">
          <Text fw={600} size="lg">
            {encounter.serviceType?.coding?.[0]?.display || 'Visit'}
          </Text>
        </Group>
        <Group>
          <ActionIcon
            variant={status === 'finished' ? 'filled' : 'subtle'}
            color={status === 'finished' ? 'blue' : 'gray'}
            radius="xl"
          >
            {status === 'finished' ? <IconLock size={18} /> : <IconTrash size={18} />}
          </ActionIcon>

          <Menu position="bottom-end" shadow="md">
            <Menu.Target>
              <Button
                variant="light"
                color={getStatusColor(status)}
                rightSection={<IconChevronDown size={16} />}
                radius="xl"
                size="sm"
              >
                {status
                  .split('-')
                  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' ')}
              </Button>
            </Menu.Target>

            <Menu.Dropdown>
              <Menu.Item onClick={() => handleStatusChange('planned')}>Planned</Menu.Item>
              <Menu.Item onClick={() => handleStatusChange('in-progress')}>In Progress</Menu.Item>
              <Menu.Item onClick={() => handleStatusChange('finished')}>Finished</Menu.Item>
              <Menu.Item onClick={() => handleStatusChange('cancelled')}>Cancelled</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Flex>
    </Paper>
  );
};
