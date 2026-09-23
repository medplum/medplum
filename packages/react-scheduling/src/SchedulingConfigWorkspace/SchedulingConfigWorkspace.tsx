// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Box, Button, Group, Modal, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconCalendarEvent } from '@tabler/icons-react';
import cx from 'clsx';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { searchConfigurableServices } from '../configSearch';
import { ConfigEmptyState } from './ConfigPage/ConfigEmptyState';
import { ConfigPanel } from './ConfigPanel/ConfigPanel';
import classes from './SchedulingConfigWorkspace.module.css';
import type { ConfigSelection } from './SchedulingConfigWorkspace.utils';
import { buildServiceItems, isSameSelection, withStoredService } from './SchedulingConfigWorkspace.utils';
import { VisitTypePage } from './VisitTypePage/VisitTypePage';

export interface SchedulingConfigWorkspaceProps {
  readonly className?: string;
}

interface LoadedServices {
  readonly items: readonly WithId<HealthcareService>[];
  readonly complete: boolean;
}

/**
 * Where an admin sets up scheduling: every visit type listed down the side, and the one picked edited in place
 * beside it. The configuration counterpart to `SchedulingWorkspace`, which books.
 *
 * It fetches its own resources, including what booking hides: visit types that are turned off or have no
 * duration. Nothing is written until the page's Save, and switching away from unsaved changes asks first.
 * @param props - Component props.
 * @returns The workspace.
 */
export function SchedulingConfigWorkspace(props: SchedulingConfigWorkspaceProps): JSX.Element {
  const medplum = useMedplum();

  // Held as state rather than derived from a search, so a saved visit type can be swapped in where it sits.
  const [services, setServices] = useState<LoadedServices>({ items: [], complete: true });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>();

  const [selection, setSelection] = useState<ConfigSelection>();
  const [filter, setFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [dirty, setDirty] = useState(false);
  // A selection waiting on the viewer to confirm that unsaved changes may be discarded.
  const [pending, setPending] = useState<ConfigSelection>();
  const [nextNewKey, setNextNewKey] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    searchConfigurableServices(medplum, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          // Anything saved while this search was in flight is newer than what it found.
          setServices((current) => ({
            items: current.items.reduce((items, stored) => withStoredService(items, stored), result.services),
            complete: result.complete,
          }));
          setLoadError(undefined);
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(err);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [medplum]);

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

  const handleStored = useCallback((stored: WithId<HealthcareService>): void => {
    setServices((current) => ({ ...current, items: withStoredService(current.items, stored) }));
    setSelection({ kind: 'service', id: stored.id });
    setDirty(false);
  }, []);

  const handleDiscardNew = useCallback((): void => {
    setSelection(undefined);
    setDirty(false);
  }, []);

  const selectedService =
    selection?.kind === 'service' ? services.items.find((service) => service.id === selection.id) : undefined;

  let detail: JSX.Element;
  if (selection?.kind === 'new-service') {
    detail = (
      <VisitTypePage
        key={`new-${selection.key}`}
        onStored={handleStored}
        onDiscardNew={handleDiscardNew}
        onDirtyChange={setDirty}
      />
    );
  } else if (selectedService) {
    detail = (
      <VisitTypePage
        // The version is in the key, so a save or reload remounts the page on what was stored.
        key={`${selectedService.id}-${selectedService.meta?.versionId}`}
        service={selectedService}
        onStored={handleStored}
        onDirtyChange={setDirty}
      />
    );
  } else if (selection) {
    detail = <ConfigEmptyState notFound />;
  } else {
    detail = <ConfigEmptyState onCreate={startNew} />;
  }

  return (
    <Box className={cx(classes.root, props.className)}>
      <Box component="nav" className={classes.sidebar} aria-label="Scheduling configuration">
        <ConfigPanel
          sections={[
            {
              key: 'service',
              title: 'Visit types',
              noun: 'visit types',
              items: buildServiceItems(services.items, selection, filter, showInactive),
              loading,
              incomplete: !services.complete,
              icon: <IconCalendarEvent size={12} />,
              createLabel: 'New visit type',
              onCreate: startNew,
            },
          ]}
          onSelect={(_, id) => select({ kind: 'service', id })}
          filter={filter}
          onFilterChange={setFilter}
          showInactive={showInactive}
          onShowInactiveChange={setShowInactive}
        />
      </Box>

      <Box component="section" className={classes.detail} aria-label="Configuration details">
        <Stack gap="md">
          {!!loadError && <Alert color="red">Visit types could not be loaded: {normalizeErrorString(loadError)}</Alert>}
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
