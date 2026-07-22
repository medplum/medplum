// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  NumberInput,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getDisplayString, getReferenceString } from '@medplum/core';
import type { Device, HealthcareService, Location, Practitioner, Resource, Schedule } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { useResourceUsageCount } from '../../hooks/useResourceUsageCount';
import { getScheduleActorRef } from '../../hooks/useActorLabels';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';
import {
  countEligibleResources,
  isSchedulableFor,
  PRACTICE_TIMEZONE,
  setScheduleServiceTypeEligibility,
} from '../../utils/scheduling';
import {
  getVisitTypeSchedulingParams,
  setVisitTypeSchedulingParams,
  VISIT_TYPE_SCHEDULING_DEFAULTS,
} from '../../utils/schedulingParameters';

const ALIGNMENT_OPTIONS = [5, 10, 15, 20, 30, 60];

type ResourceAndSchedule<T> = { resource: WithId<T>; schedule: WithId<Schedule> };

function pairResourcesWithSchedules<T extends Resource>(
  resources: WithId<T>[],
  schedules: WithId<Schedule>[]
): ResourceAndSchedule<T>[] {
  const byActorRef = new Map(schedules.map((s) => [getScheduleActorRef(s), s]));
  return resources
    .map((resource) => {
      const schedule = byActorRef.get(getReferenceString(resource));
      return schedule ? { resource, schedule } : undefined;
    })
    .filter((v): v is ResourceAndSchedule<T> => !!v);
}

function EligibilityColumn<T extends Resource>(props: {
  label: string;
  items: ResourceAndSchedule<T>[];
  healthcareService: WithId<HealthcareService>;
  onToggle: (schedule: WithId<Schedule>, eligible: boolean) => void;
}): JSX.Element {
  const { label, items, healthcareService, onToggle } = props;
  return (
    <Stack gap="xs">
      <Text size="sm" fw={600}>
        {label}
      </Text>
      {items.length === 0 && (
        <Text size="sm" c="dimmed">
          None available
        </Text>
      )}
      <ScrollArea.Autosize mah={220}>
        <Stack gap={4}>
          {items.map(({ resource, schedule }) => (
            <Checkbox
              key={getReferenceString(resource)}
              label={getDisplayString(resource)}
              checked={isSchedulableFor(schedule, healthcareService)}
              onChange={(e) => onToggle(schedule, e.currentTarget.checked)}
            />
          ))}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  );
}

/**
 * Create/edit form for a visit type (`HealthcareService`), spec §8 Tab 1.
 * Owns two concerns: the visit-type-level `SchedulingParameters` fields
 * (duration/buffers/alignment, plain-language per §8) and — the "single
 * set up a visit type end to end" surface — the eligible-resources
 * checklists that write `Schedule.serviceType` on each selected
 * provider/room/device (spec §5, §8 step 3).
 * @param props - Form props.
 * @param props.healthcareService - The visit type being edited, or undefined to create a new one.
 * @param props.allSchedules - All Schedules, for computing eligible-resource counts and checklist state.
 * @param props.activePractitioners - Active Practitioners eligible for assignment.
 * @param props.activeLocations - Active room Locations eligible for assignment.
 * @param props.activeDevices - Active Devices eligible for assignment.
 * @param props.onSaved - Called after a successful create/save/reactivate, with the saved resource.
 * @param props.onDeactivated - Called after a successful deactivate.
 * @param props.onClose - Called to dismiss the form without saving.
 * @returns The visit type form element.
 */
export function VisitTypeForm(props: {
  healthcareService?: WithId<HealthcareService>;
  allSchedules: WithId<Schedule>[];
  activePractitioners: WithId<Practitioner>[];
  activeLocations: WithId<Location>[];
  activeDevices: WithId<Device>[];
  onSaved: (healthcareService: WithId<HealthcareService>) => void;
  onDeactivated: () => void;
  onClose: () => void;
}): JSX.Element {
  const { healthcareService, allSchedules, activePractitioners, activeLocations, activeDevices, onSaved, onDeactivated, onClose } =
    props;
  const medplum = useMedplum();
  const isNew = !healthcareService;

  const initialParams = healthcareService
    ? getVisitTypeSchedulingParams(healthcareService)
    : { ...VISIT_TYPE_SCHEDULING_DEFAULTS, duration: 30, timezone: PRACTICE_TIMEZONE };

  const [name, setName] = useState(healthcareService?.name ?? '');
  const [duration, setDuration] = useState<number>(initialParams.duration ?? 30);
  const [bufferBefore, setBufferBefore] = useState<number>(initialParams.bufferBefore);
  const [bufferAfter, setBufferAfter] = useState<number>(initialParams.bufferAfter);
  const [alignmentInterval, setAlignmentInterval] = useState<number>(initialParams.alignmentInterval);
  const [alignmentOffset, setAlignmentOffset] = useState<number>(initialParams.alignmentOffset);
  const [saving, setSaving] = useState(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);

  const usage = useResourceUsageCount({ visitType: healthcareService });

  const providerItems = useMemo(
    () => pairResourcesWithSchedules(activePractitioners, allSchedules),
    [activePractitioners, allSchedules]
  );
  const roomItems = useMemo(() => pairResourcesWithSchedules(activeLocations, allSchedules), [activeLocations, allSchedules]);
  const deviceItems = useMemo(() => pairResourcesWithSchedules(activeDevices, allSchedules), [activeDevices, allSchedules]);

  const counts = healthcareService ? countEligibleResources(allSchedules, healthcareService) : undefined;

  const handleToggleEligibility = async (schedule: WithId<Schedule>, eligible: boolean): Promise<void> => {
    if (!healthcareService) {
      return;
    }
    try {
      const updated = setScheduleServiceTypeEligibility(schedule, healthcareService, eligible);
      await medplum.updateResource(updated);
      medplum.invalidateSearches('Schedule');
    } catch (err) {
      showErrorNotification(err);
    }
  };

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      const params = { duration, bufferBefore, bufferAfter, alignmentInterval, alignmentOffset, timezone: PRACTICE_TIMEZONE };
      if (healthcareService) {
        const updated = setVisitTypeSchedulingParams({ ...healthcareService, name }, params);
        const saved = await medplum.updateResource(updated);
        showSuccessNotification({ title: 'Visit type saved' });
        onSaved(saved);
      } else {
        const created = await medplum.createResource<HealthcareService>({
          resourceType: 'HealthcareService',
          active: true,
          name,
        });
        const withParams = setVisitTypeSchedulingParams(created, params);
        const saved = await medplum.updateResource(withParams);
        showSuccessNotification({ title: 'Visit type created' });
        onSaved(saved);
      }
      medplum.invalidateSearches('HealthcareService');
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (): Promise<void> => {
    if (!healthcareService) {
      return;
    }
    try {
      await medplum.updateResource<HealthcareService>({ ...healthcareService, active: false });
      medplum.invalidateSearches('HealthcareService');
      showSuccessNotification({ title: 'Visit type deactivated' });
      onDeactivated();
    } catch (err) {
      showErrorNotification(err);
    }
  };

  const handleReactivate = async (): Promise<void> => {
    if (!healthcareService) {
      return;
    }
    try {
      const saved = await medplum.updateResource<HealthcareService>({ ...healthcareService, active: true });
      medplum.invalidateSearches('HealthcareService');
      showSuccessNotification({ title: 'Visit type reactivated' });
      onSaved(saved);
    } catch (err) {
      showErrorNotification(err);
    }
  };

  return (
    <Stack gap="lg">
      <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
      <SimpleGrid cols={3}>
        <NumberInput label="Duration (min)" value={duration} onChange={(v) => setDuration(Number(v) || 0)} min={5} required />
        <NumberInput
          label="Buffer before (min)"
          value={bufferBefore}
          onChange={(v) => setBufferBefore(Number(v) || 0)}
          min={0}
        />
        <NumberInput label="Buffer after (min)" value={bufferAfter} onChange={(v) => setBufferAfter(Number(v) || 0)} min={0} />
      </SimpleGrid>
      <Group gap="xs" align="flex-end">
        <Text size="sm" fw={500}>
          Appointments can start every
        </Text>
        <SimpleGrid cols={ALIGNMENT_OPTIONS.length} style={{ flex: 1 }}>
          {ALIGNMENT_OPTIONS.map((minutes) => (
            <Button
              key={minutes}
              size="xs"
              variant={alignmentInterval === minutes ? 'filled' : 'outline'}
              onClick={() => setAlignmentInterval(minutes)}
            >
              {minutes} min
            </Button>
          ))}
        </SimpleGrid>
      </Group>
      <Accordion variant="contained">
        <Accordion.Item value="advanced">
          <Accordion.Control>Advanced</Accordion.Control>
          <Accordion.Panel>
            <NumberInput
              label="Start offset (min)"
              description="Shifts when the appointment grid starts within each hour."
              value={alignmentOffset}
              onChange={(v) => setAlignmentOffset(Number(v) || 0)}
              min={0}
            />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      <Group justify="flex-end">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave} loading={saving} disabled={!name}>
          Save
        </Button>
      </Group>

      {healthcareService && (
        <>
          <Stack gap="xs">
            <Text fw={600}>Eligible resources</Text>
            <Text size="sm" c="dimmed">
              Choose which providers, rooms, and devices can fulfill this visit type. A visit type with no eligible
              resource of a needed type won't produce any results in Find &amp; Book.
            </Text>
            {counts && (counts.Practitioner === 0 || counts.Location === 0) && (
              <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
                {counts.Practitioner === 0 && 'No eligible providers — not bookable. '}
                {counts.Location === 0 && 'No eligible rooms — not bookable.'}
              </Alert>
            )}
            <SimpleGrid cols={3}>
              <EligibilityColumn
                label={`Providers (${counts?.Practitioner ?? 0})`}
                items={providerItems}
                healthcareService={healthcareService}
                onToggle={handleToggleEligibility}
              />
              <EligibilityColumn
                label={`Rooms (${counts?.Location ?? 0})`}
                items={roomItems}
                healthcareService={healthcareService}
                onToggle={handleToggleEligibility}
              />
              <EligibilityColumn
                label={`Devices (${counts?.Device ?? 0})`}
                items={deviceItems}
                healthcareService={healthcareService}
                onToggle={handleToggleEligibility}
              />
            </SimpleGrid>
          </Stack>

          <Group justify="space-between" mt="lg">
            <Badge color={healthcareService.active === false ? 'gray' : 'green'}>
              {healthcareService.active === false ? 'Inactive' : 'Active'}
            </Badge>
            {healthcareService.active === false && (
              <Button variant="outline" onClick={handleReactivate}>
                Reactivate
              </Button>
            )}
            {healthcareService.active !== false && !confirmingDeactivate && (
              <Button color="red" variant="outline" onClick={() => setConfirmingDeactivate(true)}>
                Deactivate
              </Button>
            )}
            {healthcareService.active !== false && confirmingDeactivate && (
              <Group gap="xs">
                <Text size="sm" c="dimmed">
                  {usage.loading
                    ? 'Checking upcoming appointments…'
                    : `${usage.count} upcoming appointment(s) reference this visit type.`}
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
        </>
      )}
      {isNew && (
        <Text size="sm" c="dimmed">
          Save the visit type first to assign eligible providers, rooms, and devices.
        </Text>
      )}
    </Stack>
  );
}
