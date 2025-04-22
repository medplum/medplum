import React, { useState } from 'react';
import { Text, Group, Paper, Flex, ActionIcon, Button, Menu, Box, SegmentedControl } from '@mantine/core';
import { Encounter, Practitioner } from '@medplum/fhirtypes';
import { IconTrash, IconChevronDown, IconLock } from '@tabler/icons-react';

interface EncounterHeaderProps {
  encounter: Encounter;
  practitioner?: Practitioner | undefined;
  onStatusChange?: (status: Encounter['status']) => void;
  onTabChange?: (tab: string) => void;
}

export const EncounterHeader = (props: EncounterHeaderProps): JSX.Element => {
  const { encounter, onStatusChange, onTabChange } = props;
  const [status, setStatus] = useState<Encounter['status']>(encounter.status);
  const [activeTab, setActiveTab] = useState<string>('notes');

  const handleStatusChange = (newStatus: Encounter['status']): void => {
    setStatus(newStatus);
    onStatusChange?.(newStatus);
  };

  const handleTabChange = (tab: string): void => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  const getStatusColor = (status: Encounter['status']): string => {
    if (status === 'finished') {
      return 'green';
    }
    if (status === 'cancelled') {
      return 'red';
    }
    return 'blue';
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

      <Box px="md" pb="md">
        <SegmentedControl
          value={activeTab}
          onChange={(value: string) => handleTabChange(value)}
          data={[
            { label: 'Note & Tasks', value: 'notes' },
            { label: 'Details & Billing', value: 'details' },
          ]}
          fullWidth
          radius="md"
          color="gray"
          size="md"
          styles={(theme) => ({
            root: {
              backgroundColor: theme.colors.gray[1],
              borderRadius: theme.radius.md,
            },
            indicator: {
              backgroundColor: theme.white,
            },
            label: {
              fontWeight: 500,
              color: theme.colors.dark[9],
              padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            },
          })}
        />
      </Box>
    </Paper>
  );
};
