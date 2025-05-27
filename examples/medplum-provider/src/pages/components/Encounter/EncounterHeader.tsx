import { ActionIcon, Box, Button, Flex, Group, Menu, Paper, SegmentedControl, Stack, Text } from '@mantine/core';
import { formatDate, formatHumanName } from '@medplum/core';
import { Encounter, HumanName, Practitioner } from '@medplum/fhirtypes';
import { IconChevronDown, IconLock, IconTrash } from '@tabler/icons-react';
import { JSX, useState } from 'react';

interface EncounterHeaderProps {
  encounter: Encounter;
  practitioner?: Practitioner | undefined;
  onStatusChange?: (status: Encounter['status']) => void;
  onTabChange?: (tab: string) => void;
}

export const EncounterHeader = (props: EncounterHeaderProps): JSX.Element => {
  const { encounter, practitioner, onStatusChange, onTabChange } = props;
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

  const practitionerName = practitioner?.name?.[0]
    ? formatHumanName(practitioner.name[0] as HumanName)
    : 'Unknown Provider';
  const formattedDate = formatDate(encounter.period?.start);
  const encounterDetail = formattedDate ? `${formattedDate} · ${practitionerName}` : practitionerName;

  return (
    <Paper shadow="sm" p={0}>
      <Flex justify="space-between" align="center" p="lg">
        <Stack gap={0}>
          <Text fw={800} size="lg">
            {encounter.serviceType?.coding?.[0]?.display || 'Visit'}
          </Text>
          <Text fw={500} size="xs" c="dimmed">
            {encounterDetail}
          </Text>
        </Stack>
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
