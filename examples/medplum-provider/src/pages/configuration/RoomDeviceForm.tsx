// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Divider, Group, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { Device, HealthcareService, Location, Schedule } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { getScheduleActorRef } from '../../hooks/useActorLabels';
import { useResourceUsageCount } from '../../hooks/useResourceUsageCount';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';
import type { AvailabilityWindow } from '../../utils/schedulingParameters';
import {
  getScheduleAvailability,
  getScheduleBufferOverride,
  setScheduleAvailability,
  setScheduleBufferOverride,
  toPerDayWindows,
} from '../../utils/schedulingParameters';
import { isSchedulableFor } from '../../utils/scheduling';
import { WeeklyHoursConfig } from '../../components/schedule/WeeklyHoursConfig';

type RoomOrDevice = WithId<Location> | WithId<Device>;

function isActive(resource: RoomOrDevice): boolean {
  return resource.status === 'active';
}

/**
 * Edit form for a single Room (`Location`) or Device, spec §8 Tab 2. Manages
 * only the resource itself and its per-visit-type buffer (turnover/cleanup)
 * override — visit-type eligibility (which services this resource performs)
 * is assigned from the Visit Types tab, not here (spec §8 Tab 2 step 4).
 * @param props - Form props.
 * @param props.resource - The Location (room) or Device being edited.
 * @param props.schedule - The resource's Schedule, if provisioned (spec §10: it should always be, but the UI degrades gracefully otherwise).
 * @param props.eligibleVisitTypes - Visit types this Schedule is already eligible for (assigned from the Visit Types tab), for the buffer-override picker.
 * @param props.onSaved - Called after a successful save/deactivate/reactivate.
 * @param props.onClose - Called to dismiss the form without saving.
 * @returns The room/device edit form element.
 */
export function RoomDeviceForm(props: {
  resource: RoomOrDevice;
  schedule?: WithId<Schedule>;
  eligibleVisitTypes: WithId<HealthcareService>[];
  onSaved: () => void;
  onClose: () => void;
}): JSX.Element {
  const { resource, schedule, eligibleVisitTypes, onSaved, onClose } = props;
  const medplum = useMedplum();
  const [name, setName] = useState(
    resource.resourceType === 'Location' ? resource.name ?? '' : (resource as Device).deviceName?.[0]?.name ?? ''
  );
  const [saving, setSaving] = useState(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [selectedVisitTypeId, setSelectedVisitTypeId] = useState<string | null>(eligibleVisitTypes[0]?.id ?? null);

  const selectedVisitType = eligibleVisitTypes.find((v) => v.id === selectedVisitTypeId);
  const bufferOverride =
    schedule && selectedVisitType ? getScheduleBufferOverride(schedule, selectedVisitType) : undefined;
  const [bufferBefore, setBufferBefore] = useState<number | undefined>(bufferOverride?.bufferBefore);
  const [bufferAfter, setBufferAfter] = useState<number | undefined>(bufferOverride?.bufferAfter);
  const [availabilityWindows, setAvailabilityWindows] = useState<AvailabilityWindow[]>(() =>
    schedule && selectedVisitType ? toPerDayWindows(getScheduleAvailability(schedule, selectedVisitType)) : []
  );
  // Tracks whether the admin actually touched the weekly-hours widget this
  // session. A brand-new room/device Schedule has no availability extension
  // at all, which means "always available" (spec §10) — `getScheduleAvailability`
  // can't distinguish that from "explicitly zero hours" (both read back as
  // `[]`), so without this guard, saving the form for an unrelated reason
  // (renaming, adjusting a buffer) would silently persist an empty
  // `availability` extension and make the resource permanently unbookable.
  // Only write availability when this is true — untouched means "leave
  // whatever's already there (or the default) alone."
  const [availabilityDirty, setAvailabilityDirty] = useState(false);

  const actorRef = getReferenceString(resource);
  const usage = useResourceUsageCount({ actorRef });

  const handleSelectVisitType = (value: string | null): void => {
    setSelectedVisitTypeId(value);
    const visitType = eligibleVisitTypes.find((v) => v.id === value);
    const override = schedule && visitType ? getScheduleBufferOverride(schedule, visitType) : undefined;
    setBufferBefore(override?.bufferBefore);
    setBufferAfter(override?.bufferAfter);
    setAvailabilityWindows(
      schedule && visitType ? toPerDayWindows(getScheduleAvailability(schedule, visitType)) : []
    );
    setAvailabilityDirty(false);
  };

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      const baseUpdate =
        resource.resourceType === 'Location'
          ? { ...resource, name }
          : { ...resource, deviceName: [{ name, type: 'user-friendly-name' as const }] };
      await medplum.updateResource(baseUpdate);

      if (schedule && selectedVisitType) {
        const withBuffers = setScheduleBufferOverride(schedule, selectedVisitType, {
          bufferBefore,
          bufferAfter,
        });
        const withAvailability = availabilityDirty
          ? setScheduleAvailability(withBuffers, selectedVisitType, availabilityWindows)
          : withBuffers;
        await medplum.updateResource(withAvailability);
      }
      medplum.invalidateSearches(resource.resourceType);
      medplum.invalidateSearches('Schedule');
      showSuccessNotification({ title: 'Saved' });
      onSaved();
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (): Promise<void> => {
    try {
      await medplum.updateResource({ ...resource, status: 'inactive' });
      if (schedule) {
        await medplum.updateResource({ ...schedule, active: false });
      }
      medplum.invalidateSearches(resource.resourceType);
      medplum.invalidateSearches('Schedule');
      showSuccessNotification({ title: 'Deactivated' });
      onSaved();
    } catch (err) {
      showErrorNotification(err);
    }
  };

  const handleReactivate = async (): Promise<void> => {
    try {
      await medplum.updateResource({ ...resource, status: 'active' });
      if (schedule) {
        await medplum.updateResource({ ...schedule, active: true });
      }
      medplum.invalidateSearches(resource.resourceType);
      medplum.invalidateSearches('Schedule');
      showSuccessNotification({ title: 'Reactivated' });
      onSaved();
    } catch (err) {
      showErrorNotification(err);
    }
  };

  return (
    <Stack gap="lg">
      <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} required />

      {!schedule && (
        <Alert color="yellow">
          This resource has no Schedule and can never be booked. Recreate it from this screen so a Schedule is
          provisioned automatically.
        </Alert>
      )}

      {schedule && (
        <Stack gap="xs">
          <Text fw={600}>Turnover time (buffer)</Text>
          <Text size="sm" c="dimmed">
            Cleanup/turnaround time before or after an appointment. Only buffers can differ per resource — duration
            and appointment cadence are set on the visit type.
          </Text>
          {eligibleVisitTypes.length === 0 ? (
            <Text size="sm" c="dimmed">
              Not yet assigned to any visit type — assign it from the Visit Types tab first.
            </Text>
          ) : (
            <>
              <Select
                label="Visit type"
                data={eligibleVisitTypes.map((v) => ({ value: v.id, label: v.name ?? v.id }))}
                value={selectedVisitTypeId}
                onChange={handleSelectVisitType}
              />
              <Group grow>
                <NumberInput
                  label="Buffer before (min)"
                  placeholder="Inherit from visit type"
                  value={bufferBefore}
                  onChange={(v) => setBufferBefore(v === '' ? undefined : Number(v))}
                  min={0}
                />
                <NumberInput
                  label="Buffer after (min)"
                  placeholder="Inherit from visit type"
                  value={bufferAfter}
                  onChange={(v) => setBufferAfter(v === '' ? undefined : Number(v))}
                  min={0}
                />
              </Group>

              <Divider />

              <Text fw={600}>Weekly availability</Text>
              <Text size="sm" c="dimmed">
                Standing hours for “{selectedVisitType?.name}”. This is a one-time setup step, not something you'll
                edit often. Until you set hours here, this resource defaults to always-available; once you save any
                change here, an empty week means never available.
              </Text>
              <WeeklyHoursConfig
                windows={availabilityWindows}
                onChange={(windows) => {
                  setAvailabilityWindows(windows);
                  setAvailabilityDirty(true);
                }}
              />
            </>
          )}
        </Stack>
      )}

      <Group justify="flex-end">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave} loading={saving} disabled={!name}>
          Save
        </Button>
      </Group>

      <Group justify="space-between" mt="md">
        <Badge color={isActive(resource) ? 'green' : 'gray'}>{isActive(resource) ? 'Active' : 'Inactive'}</Badge>
        {!isActive(resource) && (
          <Button variant="outline" onClick={handleReactivate}>
            Reactivate
          </Button>
        )}
        {isActive(resource) && !confirmingDeactivate && (
          <Button color="red" variant="outline" onClick={() => setConfirmingDeactivate(true)}>
            Deactivate
          </Button>
        )}
        {isActive(resource) && confirmingDeactivate && (
          <Group gap="xs">
            <Text size="sm" c="dimmed">
              {usage.loading
                ? 'Checking upcoming appointments…'
                : `${usage.count} upcoming appointment(s) reference this resource.`}
            </Text>
            <Button color="red" onClick={handleDeactivate}>
              Confirm deactivate
            </Button>
            <Button variant="subtle" onClick={() => setConfirmingDeactivate(false)}>
              Cancel
            </Button>
          </Group>
        )}
      </Group>
    </Stack>
  );
}

export function findScheduleForActor(schedules: WithId<Schedule>[], actorRef: string): WithId<Schedule> | undefined {
  return schedules.find((s) => getScheduleActorRef(s) === actorRef);
}

export function eligibleVisitTypesFor(
  schedule: WithId<Schedule> | undefined,
  healthcareServices: WithId<HealthcareService>[]
): WithId<HealthcareService>[] {
  if (!schedule) {
    return [];
  }
  return healthcareServices.filter((hs) => isSchedulableFor(schedule, hs));
}
