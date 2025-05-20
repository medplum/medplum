import { ActionIcon, Box, Collapse, Flex, Group, Modal, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { getDisplayString } from '@medplum/core';
import { Device, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconChevronDown, IconPlus } from '@tabler/icons-react';
import { JSX, useCallback, useState } from 'react';
import { killEvent } from '../utils/dom';
import { DeviceDialog } from './DeviceDialog';
import styles from './PatientSummary.module.css';
import SummaryItem from './SummaryItem';

export interface DevicesProps {
  readonly patient: Patient;
  readonly devices: Device[];
  readonly onClickResource?: (resource: Device) => void;
}

export function Devices(props: DevicesProps): JSX.Element {
  const medplum = useMedplum();
  const [devices, setDevices] = useState<Device[]>(props.devices);
  const [editDevice, setEditDevice] = useState<Device>();
  const [opened, { open, close }] = useDisclosure(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleSubmit = useCallback(
    async (device: Device) => {
      if (device.id) {
        const updatedDevice = await medplum.updateResource(device);
        setDevices(devices.map((d) => (d.id === updatedDevice.id ? updatedDevice : d)));
      } else {
        const newDevice = await medplum.createResource(device);
        setDevices([newDevice, ...devices]);
      }

      setEditDevice(undefined);
      close();
    },
    [medplum, devices, close]
  );

  return (
    <>
      <Box style={{ position: 'relative' }}>
        <UnstyledButton
          style={{
            width: '100%',
            cursor: 'default',
            '&:hover .add-button': {
              opacity: 1,
            },
            '& .mantine-ActionIcon-root, & .mantine-Text-root': {
              cursor: 'pointer',
              margin: '0',
            },
          }}
        >
          <Group justify="space-between">
            <Group gap={8}>
              <ActionIcon
                variant="subtle"
                onClick={() => setCollapsed((c) => !c)}
                aria-label={collapsed ? 'Show devices' : 'Hide devices'}
                style={{ transition: 'transform 0.2s', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                size="md"
              >
                <IconChevronDown size={20} />
              </ActionIcon>
              <Text fz="md" fw={800} onClick={() => setCollapsed((c) => !c)} style={{ cursor: 'pointer' }}>
                Devices
              </Text>
            </Group>
            <ActionIcon
              className={`${styles.patientSummaryAddButton} add-button`}
              variant="subtle"
              onClick={(e) => {
                killEvent(e);
                setEditDevice(undefined);
                open();
              }}
              size="md"
            >
              <IconPlus size={18} />
            </ActionIcon>
          </Group>
        </UnstyledButton>
        <Collapse in={!collapsed}>
          {devices.length > 0 ? (
            <Box ml="36" mt="8" mb="16">
              <Flex direction="column" gap={8}>
                {devices.map((device) => (
                  <SummaryItem
                    title={getDisplayString(device)}
                    status={device.status}
                    color={getStatusColor(device.status)}
                    onClick={() => {
                      setEditDevice(device);
                      open();
                    }}
                  />
                ))}
              </Flex>
            </Box>
          ) : (
            <Box ml="36" my="4">
              <Text>(none)</Text>
            </Box>
          )}
        </Collapse>
      </Box>
      <Modal opened={opened} onClose={close} title={editDevice ? 'Edit Device' : 'Add Device'}>
        <DeviceDialog patient={props.patient} device={editDevice} onSubmit={handleSubmit} />
      </Modal>
    </>
  );
}

const getStatusColor = (status?: string): string => {
  if (!status) {
    return 'gray';
  }
  switch (status) {
    case 'active':
      return 'green';
    case 'inactive':
      return 'red';
    case 'entered-in-error':
      return 'red';
    case 'unknown':
      return 'gray';
    default:
      return 'gray';
  }
};
