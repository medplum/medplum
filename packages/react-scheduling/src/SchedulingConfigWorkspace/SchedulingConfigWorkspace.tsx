// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Box, Button, Center, Group, Loader, Modal, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import type { HealthcareService, Resource } from '@medplum/fhirtypes';
import { IconCalendarEvent, IconDeviceHeartMonitor, IconDoor } from '@tabler/icons-react';
import cx from 'clsx';
import type { JSX } from 'react';
import { useCallback, useMemo, useState } from 'react';
import type { BookableActorType } from '../actors';
import { isBookableActorType } from '../actors';
import type { ConfigurableActor } from '../configSearch';
import { ActorPage } from './ActorPage/ActorPage';
import { ConfigEmptyState } from './ConfigPage/ConfigEmptyState';
import type { ConfigPanelSection } from './ConfigPanel/ConfigPanel';
import { ConfigPanel } from './ConfigPanel/ConfigPanel';
import classes from './SchedulingConfigWorkspace.module.css';
import type { ConfigOffering, ConfigSelection } from './SchedulingConfigWorkspace.utils';
import { buildActorItems, buildServiceItems, getOfferings, isSameSelection } from './SchedulingConfigWorkspace.utils';
import type { ConfigList } from './useConfigData';
import { useConfigData } from './useConfigData';
import { VisitTypePage } from './VisitTypePage/VisitTypePage';

export interface SchedulingConfigWorkspaceProps {
  readonly className?: string;
}

interface ActorSectionConfig {
  readonly title: string;
  readonly noun: string;
  readonly icon?: JSX.Element;
}

const ACTOR_SECTIONS: Record<BookableActorType, ActorSectionConfig> = {
  Practitioner: { title: 'Providers', noun: 'providers' },
  Location: { title: 'Rooms', noun: 'rooms', icon: <IconDoor size={12} /> },
  Device: { title: 'Devices', noun: 'devices', icon: <IconDeviceHeartMonitor size={12} /> },
};

/**
 * Where an admin sets up scheduling: every visit type, provider, room, and device listed down the side, and the
 * one picked edited in place beside it. The configuration counterpart to `SchedulingWorkspace`, which books.
 *
 * It fetches its own resources, including what booking hides: visit types that are turned off or have no
 * duration, and actors that are turned off or have no calendar yet. Nothing is written until the page's Save,
 * and switching away from unsaved changes asks first.
 * @param props - Component props.
 * @returns The workspace.
 */
export function SchedulingConfigWorkspace(props: SchedulingConfigWorkspaceProps): JSX.Element {
  const data = useConfigData();
  const { services, providers, rooms, devices, store } = data;
  const actorLists: Record<BookableActorType, ConfigList<ConfigurableActor>> = {
    Practitioner: providers,
    Location: rooms,
    Device: devices,
  };

  const [selection, setSelection] = useState<ConfigSelection>();
  const [filter, setFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [dirty, setDirty] = useState(false);
  // A selection waiting on the viewer to confirm that unsaved changes may be discarded.
  const [pending, setPending] = useState<ConfigSelection>();
  const [nextNewKey, setNextNewKey] = useState(1);

  const servicesById = useMemo(() => new Map(services.items.map((service) => [service.id, service])), [services.items]);

  function select(next: ConfigSelection): void {
    if (isSameSelection(next, selection)) {
      return;
    }
    if (dirty) {
      setPending(next);
      return;
    }
    setSelection(next);
  }

  function startNew(): void {
    select({ kind: 'new-service', key: nextNewKey });
    setNextNewKey((key) => key + 1);
  }

  function confirmDiscard(): void {
    setDirty(false);
    setSelection(pending);
    setPending(undefined);
  }

  const handleServiceStored = useCallback(
    (stored: WithId<HealthcareService>): void => {
      store([stored]);
      setSelection({ kind: 'service', id: stored.id });
      setDirty(false);
    },
    [store]
  );

  const handleActorStored = useCallback(
    (resources: WithId<Resource>[], openServiceId: string | null): void => {
      store(resources);
      setSelection((current) => (current?.kind === 'actor' ? { ...current, openServiceId } : current));
      setDirty(false);
    },
    [store]
  );

  const handleDiscardNew = useCallback((): void => {
    setSelection(undefined);
    setDirty(false);
  }, []);

  function openOffering(offering: ConfigOffering, serviceId: string): void {
    const { resource } = offering.actor;
    select({ kind: 'actor', resourceType: resource.resourceType, id: resource.id, openServiceId: serviceId });
  }

  const allActors = [...providers.items, ...rooms.items, ...devices.items];
  const actorsLoading = providers.loading || rooms.loading || devices.loading;

  let detail: JSX.Element;
  if (selection?.kind === 'new-service') {
    detail = (
      <VisitTypePage
        key={`new-${selection.key}`}
        onStored={handleServiceStored}
        onDiscardNew={handleDiscardNew}
        onDirtyChange={setDirty}
      />
    );
  } else if (selection?.kind === 'service') {
    const service = servicesById.get(selection.id);
    detail = service ? (
      <VisitTypePage
        // The version is in the key, so a save or reload remounts the page on what was stored.
        key={`${service.id}-${service.meta?.versionId}`}
        service={service}
        onStored={handleServiceStored}
        onDirtyChange={setDirty}
        offerings={getOfferings(allActors, service)}
        offeringsLoading={actorsLoading}
        onOpenOffering={(offering) => openOffering(offering, service.id)}
      />
    ) : (
      <ConfigEmptyState notFound />
    );
  } else if (selection?.kind === 'actor') {
    const list = actorLists[selection.resourceType];
    const actor = list.items.find((item) => item.resource.id === selection.id);
    if (list.loading || services.loading) {
      detail = (
        <Center py={96}>
          <Loader aria-label="Loading" />
        </Center>
      );
    } else if (actor) {
      const [schedule] = actor.schedules;
      detail = (
        <ActorPage
          // Every version the page reads is in the key, so a save or reload remounts it on what was stored.
          key={`${selection.resourceType}/${actor.resource.id}-${actor.resource.meta?.versionId}-${schedule?.id}-${schedule?.meta?.versionId}`}
          actor={actor}
          services={services.items}
          initialOpenServiceId={selection.openServiceId}
          onStored={handleActorStored}
          onDirtyChange={setDirty}
        />
      );
    } else {
      detail = <ConfigEmptyState notFound />;
    }
  } else {
    detail = <ConfigEmptyState onCreate={startNew} />;
  }

  const sections: ConfigPanelSection[] = [
    {
      key: 'service',
      title: 'Visit types',
      noun: 'visit types',
      items: buildServiceItems(services.items, selection, filter, showInactive),
      loading: services.loading,
      incomplete: !services.complete,
      icon: <IconCalendarEvent size={12} />,
      createLabel: 'New visit type',
      onCreate: startNew,
    },
    ...(Object.keys(ACTOR_SECTIONS) as BookableActorType[]).map((resourceType): ConfigPanelSection => ({
      key: resourceType,
      ...ACTOR_SECTIONS[resourceType],
      items: buildActorItems(actorLists[resourceType].items, selection, filter, showInactive, servicesById),
      loading: actorLists[resourceType].loading,
      incomplete: !actorLists[resourceType].complete,
    })),
  ];

  const loadErrors: [string, unknown][] = [
    ['Visit types', services.error],
    ['Providers', providers.error],
    ['Rooms', rooms.error],
    ['Devices', devices.error],
  ];

  return (
    <Box className={cx(classes.root, props.className)}>
      <Box component="nav" className={classes.sidebar} aria-label="Scheduling configuration">
        <ConfigPanel
          sections={sections}
          onSelect={(sectionKey, id) =>
            select(
              isBookableActorType(sectionKey)
                ? { kind: 'actor', resourceType: sectionKey, id }
                : { kind: 'service', id }
            )
          }
          filter={filter}
          onFilterChange={setFilter}
          showInactive={showInactive}
          onShowInactiveChange={setShowInactive}
          footer={
            data.unbookableCalendars > 0 && (
              <Text c="dimmed" size="xs" pl="xs">
                {data.unbookableCalendars === 1
                  ? '1 calendar is not listed because it can’t be booked: it'
                  : `${data.unbookableCalendars} calendars are not listed because they can’t be booked: each`}{' '}
                has more than one actor, or an actor that isn’t a provider, room, or device.
              </Text>
            )
          }
        />
      </Box>

      <Box component="section" className={classes.detail} aria-label="Configuration details">
        <Stack gap="md">
          {loadErrors.map(
            ([title, error]) =>
              !!error && (
                <Alert key={title} color="red">
                  {title} could not be loaded: {normalizeErrorString(error)}
                </Alert>
              )
          )}
          {detail}
        </Stack>
      </Box>

      <Modal
        opened={pending !== undefined}
        onClose={() => setPending(undefined)}
        title="Discard unsaved changes?"
        centered
      >
        <Stack gap="md">
          <Text size="sm">The changes on this page haven't been saved.</Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setPending(undefined)}>
              Keep editing
            </Button>
            <Button color="red" onClick={confirmDiscard}>
              Discard changes
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}
