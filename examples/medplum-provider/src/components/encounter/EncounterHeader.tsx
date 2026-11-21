// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Button, Divider, Group, Menu, Modal, Paper, Stack, Tabs, Text, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { formatDate, formatHumanName } from '@medplum/core';
import type { Encounter, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { IconChevronDown, IconLock, IconLockOpen, IconShieldCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { ChartNoteStatus } from '../../types/encounter';
import pillTabs from '../billing/PillTabs.module.css';
import { EncounterCoverageEligibilityModal } from './EncounterCoverageEligibilityModal';
import classes from './EncounterHeader.module.css';
import { SignLockDialog } from './SignLockDialog';

interface EncounterHeaderProps {
  encounter: Encounter;
  practitioner?: Practitioner | undefined;
  chartNoteStatus?: ChartNoteStatus;
  onStatusChange?: (status: Encounter['status']) => void;
  onTabChange?: (tab: string) => void;
  onSign?: (practitioner: Reference<Practitioner>, lock: boolean) => void;
  onSignLock?: (practitioner: Reference<Practitioner>) => void;
}

export const EncounterHeader = (props: EncounterHeaderProps): JSX.Element => {
  const {
    encounter,
    practitioner,
    chartNoteStatus = ChartNoteStatus.Unsigned,
    onStatusChange,
    onTabChange,
    onSign,
  } = props;
  const [status, setStatus] = useState<Encounter['status']>(encounter.status);
  const [activeTab, setActiveTab] = useState('notes');
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const [signOpened, { open: openSign, close: closeSign }] = useDisclosure(false);
  const [insuranceOpened, { open: openInsurance, close: closeInsurance }] = useDisclosure(false);

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

  const onConfirmSign = (practitioner: Reference<Practitioner>, lock: boolean): void => {
    onSign?.(practitioner, lock);
    closeSign();
  };

  const handleTabChange = (tab: string): void => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  const handleSign = (): void => {
    if (chartNoteStatus === ChartNoteStatus.SignedAndLocked) {
      return;
    }
    openSign();
  };

  const handleCheckEligibility = (): void => {
    openInsurance();
  };

  const patientSubject = encounter.subject as Reference<Patient> | undefined;

  const practitionerName = practitioner?.name?.[0] ? formatHumanName(practitioner.name[0]) : 'Unknown Provider';
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
        </>
      );
    }

    if (status === 'arrived') {
      return (
        <>
          <Menu.Item onClick={() => handleStatusChange('in-progress')}>In Progress</Menu.Item>
          <Menu.Item onClick={() => handleStatusChange('finished')}>Finished</Menu.Item>
          <Menu.Item onClick={() => handleStatusChange('cancelled')}>Cancelled</Menu.Item>
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
      <Paper shadow="sm" p={0} className={classes.root}>
        <Stack className={classes.header} gap="md">
          <Group justify="space-between" wrap="nowrap" gap="sm" align="center">
            <Stack gap={0} className={classes.title}>
              <Text size="xl" fw={800} truncate>
                {encounter.type?.[0]?.text || 'Visit'}
              </Text>
              <Text size="sm" c="gray.7" truncate>
                {encounterDetail}
              </Text>
            </Stack>
            <Group gap="xs" wrap="nowrap">
              <Tooltip label="Insurance Eligibility" position="bottom" openDelay={500}>
                <ActionIcon
                  variant="transparent"
                  radius="xl"
                  size={32}
                  className="outline-icon-button"
                  aria-label="Insurance Eligibility"
                  onClick={handleCheckEligibility}
                >
                  <IconShieldCheck size={16} />
                </ActionIcon>
              </Tooltip>
              {status === 'finished' && chartNoteStatus === ChartNoteStatus.Unsigned && (
                <Tooltip label="Sign & Lock" position="bottom" openDelay={500}>
                  <ActionIcon
                    radius="xl"
                    variant="transparent"
                    size={32}
                    className="outline-icon-button"
                    aria-label="Sign"
                    onClick={handleSign}
                  >
                    <IconLock size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
              {status === 'finished' && chartNoteStatus === ChartNoteStatus.Signed && (
                <Tooltip label="Sign and lock" position="bottom" openDelay={500}>
                  <ActionIcon
                    radius="xl"
                    variant="transparent"
                    size={32}
                    className="outline-icon-button"
                    aria-label="Sign and lock"
                    onClick={handleSign}
                  >
                    <IconLockOpen size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
              {status === 'finished' && chartNoteStatus === ChartNoteStatus.SignedAndLocked && (
                <Tooltip label="Signed and locked" position="bottom" openDelay={500}>
                  <ActionIcon
                    radius="xl"
                    variant="filled"
                    color="blue"
                    size={32}
                    aria-label="Signed and locked"
                    onClick={handleSign}
                  >
                    <IconLock size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          </Group>
          <Divider />
          <Group justify="space-between" align="center" wrap="nowrap">
            <Tabs
              value={activeTab}
              onChange={(value) => value && handleTabChange(value)}
              variant="unstyled"
              className={pillTabs.root}
            >
              <Tabs.List>
                <Tabs.Tab value="notes">Notes & Tasks</Tabs.Tab>
                <Tabs.Tab value="billing">Billing & Details</Tabs.Tab>
              </Tabs.List>
            </Tabs>
            {status === 'cancelled' || status === 'finished' ? (
              <Button component="div" variant="light" color={getStatusColor(status)} radius="xl" size="sm">
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
        </Stack>
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

      <Modal opened={signOpened} onClose={closeSign} title="Signing As">
        <SignLockDialog onSign={onConfirmSign} />
      </Modal>

      {patientSubject && (
        <EncounterCoverageEligibilityModal patient={patientSubject} opened={insuranceOpened} onClose={closeInsurance} />
      )}
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
