// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Flex, Group, Menu, Paper, SegmentedControl, Stack, Text, Modal } from '@mantine/core';
import { formatDate, formatHumanName } from '@medplum/core';
import { Encounter, HumanName, Practitioner } from '@medplum/fhirtypes';
import { IconChevronDown } from '@tabler/icons-react';
import { JSX, useState } from 'react';
import { useDisclosure } from '@mantine/hooks';

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
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);

  const handleStatusChange = (newStatus: Encounter['status']): void => {
    if (newStatus === 'cancelled') {
      openConfirm();
      return;
    }

    setStatus(newStatus);
    onStatusChange?.(newStatus);
  };

  const confirmStatusChange = (): void => {
    setStatus('cancelled');
    onStatusChange?.('cancelled');
    closeConfirm();
  };

  const handleTabChange = (tab: string): void => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  const practitionerName = practitioner?.name?.[0]
    ? formatHumanName(practitioner.name[0] as HumanName)
    : 'Unknown Provider';
  const formattedDate = formatDate(encounter.period?.start);
  const encounterDetail = formattedDate ? `${formattedDate} · ${practitionerName}` : practitionerName;

  const renderMenuItems = (): JSX.Element | null => {
    if (status === 'planned') {
      return (
        <>
          <Menu.Item onClick={() => handleStatusChange('arrived')}>Arrived</Menu.Item>
          <Menu.Item onClick={() => handleStatusChange('in-progress')}>In Progress</Menu.Item>
          <Menu.Item onClick={() => handleStatusChange('finished')}>Finished</Menu.Item>
          <Menu.Item onClick={() => handleStatusChange('cancelled')}>Cancelled</Menu.Item>
          <Menu.Divider />
        </>
      );
    }

    if (status === 'arrived') {
      return (
        <>
          <Menu.Item onClick={() => handleStatusChange('in-progress')}>In Progress</Menu.Item>
          <Menu.Item onClick={() => handleStatusChange('finished')}>Finished</Menu.Item>
          <Menu.Item onClick={() => handleStatusChange('cancelled')}>Cancelled</Menu.Item>
          <Menu.Divider />
        </>
      );
    }

    if (status === 'in-progress') {
      return (
        <>
          <Menu.Item onClick={() => handleStatusChange('finished')}>Finished</Menu.Item>
          <Menu.Item onClick={() => handleStatusChange('cancelled')}>Cancelled</Menu.Item>
        </>
      );
    }

    return null;
  };

  return (
    <>
      <Paper shadow="sm" p={0}>
        <Flex justify="space-between" align="center" p="lg">
          <Stack gap={0}>
            <Text fw={800} size="lg">
              {encounter.basedOn?.[0]?.display || 'Visit'}
            </Text>
            <Text fw={500} size="xs" c="dimmed">
              {encounterDetail}
            </Text>
          </Stack>
          <Group>
            {status === 'cancelled' || status === 'finished' ? (
              <Button variant="light" color={getStatusColor(status)} radius="xl" size="sm">
                {getStatusDisplay(status)}
              </Button>
            ) : (
              <Menu position="bottom-end" shadow="md">
                <Menu.Target>
                  <Button
                    variant="light"
                    color={getStatusColor(status)}
                    rightSection={<IconChevronDown size={16} />}
                    radius="xl"
                    size="sm"
                  >
                    {getStatusDisplay(status)}
                  </Button>
                </Menu.Target>

                <Menu.Dropdown>{renderMenuItems()}</Menu.Dropdown>
              </Menu>
            )}
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

      <Modal opened={confirmOpened} onClose={closeConfirm}>
        <Text size="lg" fw={500}>
          Are you sure you want to cancel this encounter?
        </Text>
        <Text size="sm" c="dimmed" mt="xs">
          This action cannot be undone.
        </Text>
        <Group justify="flex-end" mt="xl" gap="xs">
          <Button onClick={closeConfirm} color="red" variant="outline">
            No, keep it
          </Button>
          <Button onClick={confirmStatusChange} color="red">
            Yes, cancel it
          </Button>
        </Group>
      </Modal>
    </>
  );
};

const getStatusColor = (status: Encounter['status']): string => {
  if (status === 'finished') {
    return 'green';
  }
  if (status === 'cancelled') {
    return 'red';
  }
  if (status === 'arrived' || status === 'in-progress' || status === 'planned') {
    return 'blue';
  }
  return 'gray';
};

const getStatusDisplay = (status: Encounter['status']): string => {
  return status
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};
