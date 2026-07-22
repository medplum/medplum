// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Drawer, Group, Loader, Modal, Paper, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import { getDisplayString, getReferenceString } from '@medplum/core';
import type { Device, Location } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useSearchResources } from '@medplum/react-hooks';
import { IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { useNotifyOnError } from '../../hooks/useNotifyOnError';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';
import { PRACTICE_TIMEZONE, TimezoneExtensionURI } from '../../utils/scheduling';
import { eligibleVisitTypesFor, findScheduleForActor, RoomDeviceForm } from './RoomDeviceForm';

type RoomOrDevice = WithId<Location> | WithId<Device>;

function displayName(resource: RoomOrDevice): string {
  return getDisplayString(resource) || resource.id;
}

/**
 * Rooms & Devices tab (spec §8 Tab 2) — create/edit/deactivate schedulable
 * Locations ("rooms") and Devices, each backed by a `Schedule` provisioned
 * on creation (spec §10: without one, the resource is invisible to Find &
 * Book and the Calendar roster). Visit-type eligibility is assigned from
 * the Visit Types tab, not here — this tab only manages the resource itself
 * and its per-visit-type buffer override.
 * @returns The Rooms & Devices tab element.
 */
export function RoomsDevicesTab(): JSX.Element {
  const medplum = useMedplum();
  const [allLocations, locationsLoading, locationsOutcome] = useSearchResources<'Location'>('Location', {
    _count: 100,
    _sort: 'name',
  });
  useNotifyOnError(locationsOutcome);
  const [allDevices, devicesLoading, devicesOutcome] = useSearchResources<'Device'>('Device', { _count: 100 });
  useNotifyOnError(devicesOutcome);
  const [allSchedules] = useSearchResources<'Schedule'>('Schedule', { _count: 100 });
  const [allHealthcareServices] = useSearchResources<'HealthcareService'>('HealthcareService', { _count: 100 });

  const facility = useMemo(() => (allLocations ?? []).find((l) => !l.partOf), [allLocations]);
  const rooms = useMemo(() => (allLocations ?? []).filter((l) => !!l.partOf), [allLocations]);

  const sortedRooms = useMemo(() => [...rooms].sort(byActiveThenName), [rooms]);
  const sortedDevices = useMemo(() => [...(allDevices ?? [])].sort(byActiveThenName), [allDevices]);

  const [drawerOpened, drawerHandlers] = useDisclosure(false);
  const [selected, setSelected] = useState<RoomOrDevice | undefined>();
  const [createOpened, createHandlers] = useDisclosure(false);
  const [createType, setCreateType] = useState<'Location' | 'Device'>('Location');
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);

  const loading = locationsLoading || devicesLoading;

  const openEdit = (resource: RoomOrDevice): void => {
    setSelected(resource);
    drawerHandlers.open();
  };

  const handleCreate = async (): Promise<void> => {
    setCreating(true);
    try {
      // `$find` requires a timezone extension on every actor it queries
      // (verified live: omitting it throws "No timezone specified") — the
      // seed data sets this on every Practitioner/Location/Device, so newly
      // created resources must too, or they're unbookable despite having a
      // Schedule.
      const timezoneExtension = [{ url: TimezoneExtensionURI, valueCode: PRACTICE_TIMEZONE }];
      const created =
        createType === 'Location'
          ? await medplum.createResource<Location>({
              resourceType: 'Location',
              status: 'active',
              mode: 'instance',
              name: createName,
              extension: timezoneExtension,
              ...(facility ? { partOf: { reference: getReferenceString(facility) } } : {}),
            })
          : await medplum.createResource<Device>({
              resourceType: 'Device',
              status: 'active',
              deviceName: [{ name: createName, type: 'user-friendly-name' }],
              extension: timezoneExtension,
            });
      // Provision a Schedule immediately so the new resource is schedulable
      // as soon as it's assigned to a visit type (spec §10's easy-to-forget trap).
      await medplum.createResource({
        resourceType: 'Schedule',
        actor: [{ reference: getReferenceString(created) }],
        active: true,
      });
      medplum.invalidateSearches(createType);
      medplum.invalidateSearches('Schedule');
      showSuccessNotification({ title: createType === 'Location' ? 'Room created' : 'Device created' });
      setCreateName('');
      createHandlers.close();
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setCreating(false);
    }
  };

  const selectedSchedule = selected ? findScheduleForActor(allSchedules ?? [], getReferenceString(selected)) : undefined;
  const selectedEligibleVisitTypes = eligibleVisitTypesFor(selectedSchedule, allHealthcareServices ?? []);

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text c="dimmed" size="sm">
          Rooms and devices are schedulable resources — each gets its own Schedule so it can be booked alongside a
          provider.
        </Text>
        <Button leftSection={<IconPlus size={16} />} onClick={createHandlers.open}>
          New room / device
        </Button>
      </Group>

      {loading && <Loader />}

      <ResourceList title="Rooms" resources={sortedRooms} onSelect={openEdit} />
      <ResourceList title="Devices" resources={sortedDevices} onSelect={openEdit} />

      <Modal opened={createOpened} onClose={createHandlers.close} title="New room or device">
        <Stack>
          <SegmentedControl
            value={createType}
            onChange={(v) => setCreateType(v as 'Location' | 'Device')}
            data={[
              { label: 'Room', value: 'Location' },
              { label: 'Device', value: 'Device' },
            ]}
          />
          <TextInput label="Name" value={createName} onChange={(e) => setCreateName(e.currentTarget.value)} required />
          <Group justify="flex-end">
            <Button variant="outline" onClick={createHandlers.close}>
              Cancel
            </Button>
            <Button onClick={handleCreate} loading={creating} disabled={!createName}>
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Drawer
        opened={drawerOpened}
        onClose={drawerHandlers.close}
        title={selected ? displayName(selected) : ''}
        position="right"
        size="lg"
      >
        {selected && (
          <RoomDeviceForm
            key={selected.id}
            resource={selected}
            schedule={selectedSchedule}
            eligibleVisitTypes={selectedEligibleVisitTypes}
            onSaved={() => drawerHandlers.close()}
            onClose={drawerHandlers.close}
          />
        )}
      </Drawer>
    </Stack>
  );
}

function byActiveThenName(a: RoomOrDevice, b: RoomOrDevice): number {
  const aInactive = a.status !== 'active';
  const bInactive = b.status !== 'active';
  if (aInactive !== bInactive) {
    return aInactive ? 1 : -1;
  }
  return displayName(a).localeCompare(displayName(b));
}

function ResourceList(props: { title: string; resources: RoomOrDevice[]; onSelect: (r: RoomOrDevice) => void }): JSX.Element {
  const { title, resources, onSelect } = props;
  return (
    <Stack gap="xs">
      <Text fw={600}>{title}</Text>
      {resources.length === 0 && (
        <Alert color="blue">
          No {title.toLowerCase()} yet.
        </Alert>
      )}
      {resources.map((resource) => (
        <Paper
          key={resource.id}
          withBorder
          p="sm"
          onClick={() => onSelect(resource)}
          style={{ cursor: 'pointer', opacity: resource.status === 'active' ? 1 : 0.55 }}
        >
          <Group justify="space-between">
            <Text fw={500}>{displayName(resource)}</Text>
            <Badge color={resource.status === 'active' ? 'green' : 'gray'}>
              {resource.status === 'active' ? 'Active' : 'Inactive'}
            </Badge>
          </Group>
        </Paper>
      ))}
    </Stack>
  );
}
