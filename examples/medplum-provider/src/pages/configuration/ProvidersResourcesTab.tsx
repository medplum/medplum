// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Anchor, Checkbox, Drawer, Group, Loader, Paper, ScrollArea, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import { getDisplayString, getReferenceString } from '@medplum/core';
import type { HealthcareService, Practitioner, Schedule } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useSearchResources } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { getScheduleActorRef } from '../../hooks/useActorLabels';
import { useNotifyOnError } from '../../hooks/useNotifyOnError';
import { showErrorNotification } from '../../utils/notifications';
import { isSchedulableFor, setScheduleServiceTypeEligibility } from '../../utils/scheduling';

/**
 * Providers & Resources tab (spec §8 Tab 3) — a read-only Practitioner
 * roster (no creation) with a per-provider checklist of which visit types
 * they perform, editing the same `Schedule.serviceType` relation as the
 * Visit Types tab's provider column, just from the provider's side. Links
 * out to Calendar's Availability mode for hours — this tab never duplicates
 * hours editing.
 * @returns The Providers & Resources tab element.
 */
export function ProvidersResourcesTab(): JSX.Element {
  const medplum = useMedplum();
  // Not filtered server-side by `active` — this dataset's seeded Practitioner
  // resources never set the field at all, and FHIR search on a boolean param
  // only matches an explicit value, so `active=true` silently excludes every
  // practitioner that has no `active` element (the common case here). Fetch
  // all and treat a missing `active` as active.
  const [allPractitioners, practitionersLoading, practitionersOutcome] = useSearchResources<'Practitioner'>(
    'Practitioner',
    { _count: 100, _sort: 'name' }
  );
  useNotifyOnError(practitionersOutcome);
  const practitioners = useMemo(() => (allPractitioners ?? []).filter((p) => p.active !== false), [allPractitioners]);
  const [allSchedules, schedulesLoading] = useSearchResources<'Schedule'>('Schedule', { _count: 100 });
  const [activeVisitTypes] = useSearchResources<'HealthcareService'>('HealthcareService', {
    active: 'true',
    _count: 100,
    _sort: 'name',
  });

  const [drawerOpened, drawerHandlers] = useDisclosure(false);
  const [selected, setSelected] = useState<WithId<Practitioner> | undefined>();

  const scheduleFor = useMemo(() => {
    const byRef = new Map((allSchedules ?? []).map((s) => [getScheduleActorRef(s), s]));
    return (practitioner: WithId<Practitioner>): WithId<Schedule> | undefined => byRef.get(getReferenceString(practitioner));
  }, [allSchedules]);

  const openProvider = (practitioner: WithId<Practitioner>): void => {
    setSelected(practitioner);
    drawerHandlers.open();
  };

  const handleToggle = async (schedule: WithId<Schedule>, visitType: WithId<HealthcareService>, eligible: boolean): Promise<void> => {
    try {
      const updated = setScheduleServiceTypeEligibility(schedule, visitType, eligible);
      await medplum.updateResource(updated);
      medplum.invalidateSearches('Schedule');
    } catch (err) {
      showErrorNotification(err);
    }
  };

  const loading = practitionersLoading || schedulesLoading;
  const selectedSchedule = selected ? scheduleFor(selected) : undefined;
  const selectedRef = selected ? getReferenceString(selected) : undefined;

  return (
    <Stack gap="md">
      <Text c="dimmed" size="sm">
        Existing providers — set which visit types each performs. To create a new provider, use the standard
        Practitioner setup flow elsewhere; this tab only manages scheduling assignments.
      </Text>

      {loading && <Loader />}

      <Stack gap="xs">
        {(practitioners ?? []).map((practitioner) => {
          const schedule = scheduleFor(practitioner);
          return (
            <Paper
              key={practitioner.id}
              withBorder
              p="sm"
              onClick={() => openProvider(practitioner)}
              style={{ cursor: 'pointer' }}
            >
              <Group justify="space-between">
                <Text fw={500}>{getDisplayString(practitioner)}</Text>
                {!schedule && <Text size="sm" c="dimmed">No Schedule</Text>}
              </Group>
            </Paper>
          );
        })}
        {!loading && (practitioners ?? []).length === 0 && <Alert color="blue">No active providers found.</Alert>}
      </Stack>

      <Drawer
        opened={drawerOpened}
        onClose={drawerHandlers.close}
        title={selected ? getDisplayString(selected) : ''}
        position="right"
        size="md"
      >
        {selected && (
          <Stack gap="md">
            {selectedRef && (
              <Anchor component={Link} to={`/Calendar?mode=availability&actor=${encodeURIComponent(selectedRef)}`}>
                Set hours in Calendar →
              </Anchor>
            )}
            {!selectedSchedule && (
              <Alert color="yellow">This provider has no Schedule yet and cannot be assigned any visit type.</Alert>
            )}
            {selectedSchedule && (
              <Stack gap="xs">
                <Text fw={600}>Visit types performed</Text>
                <ScrollArea.Autosize mah={400}>
                  <Stack gap={4}>
                    {(activeVisitTypes ?? []).map((visitType) => (
                      <Checkbox
                        key={visitType.id}
                        label={visitType.name}
                        checked={isSchedulableFor(selectedSchedule, visitType)}
                        onChange={(e) => handleToggle(selectedSchedule, visitType, e.currentTarget.checked)}
                      />
                    ))}
                  </Stack>
                </ScrollArea.Autosize>
              </Stack>
            )}
          </Stack>
        )}
      </Drawer>
    </Stack>
  );
}
