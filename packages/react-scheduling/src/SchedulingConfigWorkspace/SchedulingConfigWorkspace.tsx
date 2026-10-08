// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Box, Button, Center, Group, Loader, Modal, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import type { HealthcareService, Resource } from '@medplum/fhirtypes';
import { IconCalculatorFilled, IconCalendarEvent, IconMapPinFilled } from '@tabler/icons-react';
import cx from 'clsx';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import type { BookableActorType } from '../actors';
import { isBookableActorType } from '../actors';
import { ActorPage } from './ActorPage/ActorPage';
import { ConfigEmptyState } from './ConfigPage/ConfigEmptyState';
import type { ConfigPanelSection } from './ConfigPanel/ConfigPanel';
import { ConfigPanel } from './ConfigPanel/ConfigPanel';
import classes from './SchedulingConfigWorkspace.module.css';
import type { ConfigSelection } from './SchedulingConfigWorkspace.utils';
import { buildActorItems, buildServiceItems, isSameSelection } from './SchedulingConfigWorkspace.utils';
import { useConfigurableResources } from './useConfigurableResources';
import { VisitTypePage } from './VisitTypePage/VisitTypePage';

export interface SchedulingConfigWorkspaceProps {
  readonly className?: string;
}

interface ActorSectionConfig {
  readonly resourceType: BookableActorType;
  readonly title: string;
  readonly noun: string;
  readonly icon?: JSX.Element;
}

/** In the order `SchedulingWorkspace` lists them. */
const ACTOR_SECTIONS: readonly ActorSectionConfig[] = [
  { resourceType: 'Practitioner', title: 'Providers', noun: 'providers' },
  { resourceType: 'Device', title: 'Devices', noun: 'devices', icon: <IconCalculatorFilled size={12} /> },
  { resourceType: 'Location', title: 'Rooms', noun: 'rooms', icon: <IconMapPinFilled size={12} /> },
];

/**
 * Where an admin sets up scheduling: every visit type, provider, room, and device listed down the side, and the
 * one picked edited in place beside it. The configuration counterpart to `SchedulingWorkspace`, which books.
 *
 * It fetches its own resources, including what booking hides: visit types that are turned off or have no
 * duration, and actors that are turned off or have no Schedule yet. Nothing is written until the page's Save,
 * and switching away from unsaved changes asks first.
 * @param props - Component props.
 * @returns The workspace.
 */
export function SchedulingConfigWorkspace(props: SchedulingConfigWorkspaceProps): JSX.Element {
  const { services, actors, store } = useConfigurableResources();

  const [selection, setSelection] = useState<ConfigSelection>();
  const [filter, setFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [dirty, setDirty] = useState(false);
  // A selection waiting on the viewer to confirm that unsaved changes may be discarded.
  const [pending, setPending] = useState<ConfigSelection>();
  const [nextNewKey, setNextNewKey] = useState(1);

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

  const handleSynced = useCallback(
    (stored: WithId<HealthcareService>): void => {
      store([stored]);
      setSelection({ kind: 'service', id: stored.id });
      setDirty(false);
    },
    [store]
  );

  // Dirty is left to the page, which remounts on what it stored and reports itself clean. A save landing after
  // the viewer moved on must not touch the page now shown.
  const handleActorSynced = useCallback(
    (syncedFor: ConfigSelection, resources: WithId<Resource>[], openServiceId: string | undefined): void => {
      store(resources);
      setSelection((current) =>
        current?.kind === 'actor' && isSameSelection(current, syncedFor) ? { ...current, openServiceId } : current
      );
    },
    [store]
  );

  const handleDiscardNew = useCallback((): void => {
    setSelection(undefined);
    setDirty(false);
  }, []);

  let detail: JSX.Element;
  if (selection?.kind === 'new-service') {
    detail = (
      <VisitTypePage
        key={`new-${selection.key}`}
        onSynced={handleSynced}
        onDiscardNew={handleDiscardNew}
        onDirtyChange={setDirty}
      />
    );
  } else if (selection?.kind === 'service') {
    const service = services.items.find((service) => service.id === selection.id);
    detail = service ? (
      <VisitTypePage
        // The version is in the key, so a save or reload remounts the page on what was stored.
        key={`${service.id}-${service.meta?.versionId}`}
        service={service}
        onSynced={handleSynced}
        onDirtyChange={setDirty}
      />
    ) : (
      <ConfigEmptyState notFound />
    );
  } else if (selection?.kind === 'actor') {
    const list = actors[selection.resourceType];
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
          onSynced={(resources, openServiceId) => handleActorSynced(selection, resources, openServiceId)}
          onDirtyChange={setDirty}
        />
      );
    } else {
      detail = <ConfigEmptyState notFound />;
    }
  } else {
    detail = <ConfigEmptyState />;
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
    ...ACTOR_SECTIONS.map(({ resourceType, ...section }): ConfigPanelSection => ({
      key: resourceType,
      ...section,
      items: buildActorItems(actors[resourceType].items, selection, filter, showInactive),
      loading: actors[resourceType].loading,
      incomplete: !actors[resourceType].complete,
    })),
  ];

  const loadErrors: [string, unknown][] = [
    ['Visit types', services.error],
    ...ACTOR_SECTIONS.map(({ resourceType, title }): [string, unknown] => [title, actors[resourceType].error]),
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
