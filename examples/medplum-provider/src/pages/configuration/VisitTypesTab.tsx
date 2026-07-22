// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Drawer, Group, Loader, Paper, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { useSearchResources } from '@medplum/react-hooks';
import { IconAlertTriangle, IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { useNotifyOnError } from '../../hooks/useNotifyOnError';
import { countEligibleResources } from '../../utils/scheduling';
import { getVisitTypeSchedulingParams } from '../../utils/schedulingParameters';
import { VisitTypeForm } from './VisitTypeForm';

/**
 * Visit Types tab (spec §8 Tab 1) — list of `HealthcareService` visit types
 * (active first, inactive greyed) with a duration/buffer summary and the
 * eligible-resource completeness badge, plus create/edit via `VisitTypeForm`.
 * @returns The Visit Types tab element.
 */
export function VisitTypesTab(): JSX.Element {
  const [healthcareServices, servicesLoading, servicesOutcome] = useSearchResources<'HealthcareService'>(
    'HealthcareService',
    { _count: 100, _sort: 'name' }
  );
  useNotifyOnError(servicesOutcome);
  const [allSchedules, schedulesLoading, schedulesOutcome] = useSearchResources<'Schedule'>('Schedule', { _count: 100 });
  useNotifyOnError(schedulesOutcome);
  // Not filtered server-side by `active` — this dataset's seeded Practitioner
  // resources never set the field at all, and FHIR search on a boolean param
  // only matches an explicit value, so `active=true` silently excludes every
  // practitioner that has no `active` element (the common case). Fetch all
  // and treat a missing `active` as active, same convention as `Schedule`
  // filtering elsewhere in this app.
  const [allPractitioners] = useSearchResources<'Practitioner'>('Practitioner', { _count: 100 });
  const activePractitioners = useMemo(
    () => (allPractitioners ?? []).filter((p) => p.active !== false),
    [allPractitioners]
  );
  const [activeLocations] = useSearchResources<'Location'>('Location', { status: 'active', _count: 100 });
  const [activeDevices] = useSearchResources<'Device'>('Device', { status: 'active', _count: 100 });

  const rooms = useMemo(() => (activeLocations ?? []).filter((l) => !!l.partOf), [activeLocations]);

  const [drawerOpened, drawerHandlers] = useDisclosure(false);
  const [selected, setSelected] = useState<WithId<HealthcareService> | undefined>();

  const sorted = useMemo(() => {
    const list = healthcareServices ?? [];
    return [...list].sort((a, b) => {
      if ((a.active === false) !== (b.active === false)) {
        return a.active === false ? 1 : -1;
      }
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
  }, [healthcareServices]);

  const openNew = (): void => {
    setSelected(undefined);
    drawerHandlers.open();
  };

  const openExisting = (hs: WithId<HealthcareService>): void => {
    setSelected(hs);
    drawerHandlers.open();
  };

  const loading = servicesLoading || schedulesLoading;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text c="dimmed" size="sm">
          Visit types define duration, buffers, and appointment cadence, and which providers/rooms/devices can fulfill
          them.
        </Text>
        <Button leftSection={<IconPlus size={16} />} onClick={openNew}>
          New visit type
        </Button>
      </Group>

      {loading && <Loader />}

      <Stack gap="xs">
        {sorted.map((hs) => {
          const params = getVisitTypeSchedulingParams(hs);
          const counts = countEligibleResources(allSchedules ?? [], hs);
          const incomplete = counts.Practitioner === 0 || counts.Location === 0;
          const inactive = hs.active === false;
          return (
            <Paper
              key={hs.id}
              withBorder
              p="sm"
              onClick={() => openExisting(hs)}
              style={{ cursor: 'pointer', opacity: inactive ? 0.55 : 1 }}
            >
              <Group justify="space-between" wrap="nowrap">
                <Stack gap={2}>
                  <Group gap="xs">
                    <Text fw={600}>{hs.name}</Text>
                    {inactive && <Badge color="gray">Inactive</Badge>}
                  </Group>
                  <Text size="sm" c="dimmed">
                    {params.duration ?? '—'} min · buffer {params.bufferBefore}/{params.bufferAfter} min · every{' '}
                    {params.alignmentInterval} min
                  </Text>
                </Stack>
                <Group gap="xs" wrap="nowrap">
                  {incomplete && (
                    <Badge color="yellow" leftSection={<IconAlertTriangle size={12} />}>
                      {counts.Practitioner === 0 ? '0 providers' : '0 rooms'} — not bookable
                    </Badge>
                  )}
                  <Badge variant="light">
                    {counts.Practitioner} providers · {counts.Location} rooms · {counts.Device} devices
                  </Badge>
                </Group>
              </Group>
            </Paper>
          );
        })}
        {!loading && sorted.length === 0 && <Alert color="blue">No visit types yet — create one to get started.</Alert>}
      </Stack>

      <Drawer
        opened={drawerOpened}
        onClose={drawerHandlers.close}
        title={selected ? selected.name : 'New visit type'}
        position="right"
        size="xl"
      >
        <VisitTypeForm
          key={selected?.id ?? 'new'}
          healthcareService={selected}
          allSchedules={allSchedules ?? []}
          activePractitioners={activePractitioners ?? []}
          activeLocations={rooms}
          activeDevices={activeDevices ?? []}
          onSaved={(saved) => setSelected(saved)}
          onDeactivated={() => drawerHandlers.close()}
          onClose={drawerHandlers.close}
        />
      </Drawer>
    </Stack>
  );
}
