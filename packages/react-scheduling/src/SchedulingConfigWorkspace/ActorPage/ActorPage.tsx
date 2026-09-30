// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Accordion, Alert, Badge, Button, Group, SimpleGrid, Stack, Switch, Text, Title } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { deepEquals, getDisplayString, getSchedulingTimezone, normalizeErrorString } from '@medplum/core';
import type { HealthcareService, Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { getActorTypeLabel } from '../../actors';
import type { ConfigurableActor, ConfigurableActorResource } from '../../configSearch';
import { getAvailabilityFieldsError } from '../../ScheduleAvailabilityEditor/ScheduleAvailabilityEditor.utils';
import {
  getBlockingErrors,
  validateSchedulingParameters,
} from '../../SchedulingParametersEditor/SchedulingParametersEditor.utils';
import { ConfigSection, SaveBar } from '../ConfigPage/ConfigPage';
import type { ConfigSaveFailure } from '../ConfigPage/configSave';
import { saveConfigChanges } from '../ConfigPage/configSave';
import { summarizeOffering } from '../offeringSummary';
import { isActorInactive } from '../SchedulingConfigWorkspace.utils';
import { OfferingEntry } from './OfferingEntry';
import type { OfferingFields, ScheduleFields } from './scheduleDraft';
import { buildScheduleDraft, scheduleFieldsOf } from './scheduleDraft';

export interface ActorPageProps {
  /** The provider, room, or device, with its Schedules as stored. The first Schedule is the one edited. */
  readonly actor: ConfigurableActor;
  /** Every visit type loaded. */
  readonly services: readonly WithId<HealthcareService>[];
  /**
   * The visit type whose entry opens, when the actor offers it, or null for every entry closed. Left out, only a
   * Schedule's sole visit type opens.
   */
  readonly initialOpenServiceId?: string | null;
  /**
   * Called with the resources as the server now holds them, after a save or after reloading newer versions, and
   * the visit type whose entry is open.
   */
  readonly onStored: (resources: WithId<Resource>[], openServiceId: string | null) => void;
  /** Called whenever the page starts or stops holding unsaved changes. */
  readonly onDirtyChange?: (dirty: boolean) => void;
}

/**
 * The page for one provider, room, or device: its own fields, and the visit types its Schedule offers, each
 * opening to the Schedule's own parameters and hours for it. Everything is saved together.
 *
 * The actor's Schedule isn't a thing of its own here.
 *
 * It opens on what is stored and is not reset by a change of props, so the caller remounts it with a `key`
 * when the actor or its Schedule is replaced.
 * @param props - The actor and its Schedules, the visit types, and what to do once something is stored.
 * @returns The page.
 */
export function ActorPage(props: ActorPageProps): JSX.Element {
  const { actor, services, initialOpenServiceId, onStored, onDirtyChange } = props;
  const medplum = useMedplum();
  const resource = actor.resource;
  const [schedule] = actor.schedules;
  const actorName = getDisplayString(resource);
  const typeLabel = getActorTypeLabel(resource.resourceType);

  const servicesById = useMemo(() => new Map(services.map((service) => [service.id, service])), [services]);
  const [initial] = useState<ScheduleFields>(() => scheduleFieldsOf(schedule, servicesById));
  const [fields, setFields] = useState(initial);
  const [open, setOpen] = useState<string | null>(() => {
    if (initialOpenServiceId !== undefined) {
      return initialOpenServiceId && initial.offered.includes(initialOpenServiceId) ? initialOpenServiceId : null;
    }
    return initial.offered.length === 1 ? initial.offered[0] : null;
  });
  const [saving, setSaving] = useState(false);
  const [triedToSave, setTriedToSave] = useState(false);
  const [failure, setFailure] = useState<Pick<ConfigSaveFailure, 'conflict' | 'message'>>();
  const [reloading, setReloading] = useState(false);

  const draft = schedule && buildScheduleDraft(schedule, fields, initial, servicesById);
  // Edits the draft can't store yet, like an emptied week, still count, so the save bar can say why it refuses.
  const dirty = (schedule ? !deepEquals(draft, schedule) : draft !== undefined) || !deepEquals(fields, initial);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const offered = fields.offered.flatMap((id) => servicesById.get(id) ?? []);
  const inactive = isActorInactive(resource);
  const alert = getBookingAlert(resource, schedule && fields.active);

  function errorsFor(service: WithId<HealthcareService>): ReturnType<typeof getBlockingErrors> {
    const current = fields.offerings[service.id];
    return getBlockingErrors(
      validateSchedulingParameters(current.parameters),
      current.parameters,
      initial.offerings[service.id].parameters
    );
  }

  function availabilityErrorFor(service: WithId<HealthcareService>): string | undefined {
    const current = fields.offerings[service.id];
    const before = initial.offerings[service.id];
    return deepEquals(current.availability, before.availability)
      ? undefined
      : getAvailabilityFieldsError(current.availability, service, 'override');
  }

  function isOfferingDirty(service: WithId<HealthcareService>): boolean {
    const before = initial.offerings[service.id];
    return !deepEquals(fields.offerings[service.id], before);
  }

  const checks = offered.map((service) => ({
    service,
    errors: errorsFor(service),
    availabilityError: availabilityErrorFor(service),
  }));
  const blocking = checks.find(({ errors, availabilityError }) => Object.keys(errors).length > 0 || availabilityError);
  const blockedReason =
    blocking && Object.keys(blocking.errors).length > 0
      ? `Fix the highlighted fields for ${blocking.service.name ?? 'this visit type'} before saving.`
      : blocking?.availabilityError;

  function updateOffering(id: string, value: OfferingFields): void {
    setFields((current) => ({ ...current, offerings: { ...current.offerings, [id]: value } }));
  }

  async function handleSave(): Promise<void> {
    if (blockedReason) {
      setTriedToSave(true);
      return;
    }
    if (!draft) {
      return;
    }
    setSaving(true);
    setFailure(undefined);
    try {
      const result = await saveConfigChanges(medplum, [{ stored: schedule, draft }]);
      if (result.failures.length > 0) {
        setFailure(result.failures[0]);
      } else if (result.saved.length === 0) {
        // Nothing differed from what is stored, so no new version remounts the page.
        handleDiscard();
      } else {
        onStored(
          result.saved.map(({ resource: saved }) => saved),
          open
        );
      }
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard(): void {
    setFields(initial);
    setTriedToSave(false);
    setFailure(undefined);
  }

  async function handleReload(): Promise<void> {
    setReloading(true);
    try {
      const reloaded: WithId<Resource>[] = [
        await medplum.readResource(resource.resourceType, resource.id, { cache: 'no-cache' }),
      ];
      if (schedule) {
        reloaded.push(await medplum.readResource('Schedule', schedule.id, { cache: 'no-cache' }));
      }
      onStored(reloaded, open);
    } catch (err) {
      setFailure({ conflict: false, message: `Could not reload it: ${normalizeErrorString(err)}` });
    } finally {
      setReloading(false);
    }
  }

  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          {typeLabel}
        </Text>
        <Group gap="sm">
          <Title order={2}>{actorName}</Title>
          {inactive && (
            <Badge variant="light" color="gray">
              Inactive
            </Badge>
          )}
        </Group>
      </Stack>

      {alert && (
        <Alert color="blue" variant="light">
          {alert}
        </Alert>
      )}
      {failure?.conflict && (
        <Alert color="orange" title={`The Schedule for ${actorName} changed since you opened it`}>
          <Stack gap="sm" align="flex-start">
            <Text size="sm">
              A newer version was saved somewhere else, so nothing here was written over it. Reload to see the latest
              version. Your changes on this page will be discarded.
            </Text>
            <Button size="xs" variant="light" color="orange" loading={reloading} onClick={handleReload}>
              Reload
            </Button>
          </Stack>
        </Alert>
      )}
      {failure && !failure.conflict && (
        <Alert color="red" title="Not saved">
          {failure.message}
        </Alert>
      )}

      <ConfigSection title="General">
        <ActorGeneral
          resource={resource}
          scheduleActive={schedule && fields.active}
          onScheduleActiveChange={(active) => setFields((current) => ({ ...current, active }))}
        />
      </ConfigSection>

      <ConfigSection title="Visit types offered">
        {offered.length === 0 ? (
          <Text size="sm" c="dimmed">
            {actorName} offers no visit types yet.
          </Text>
        ) : (
          <Accordion variant="separated" value={open} onChange={setOpen}>
            {checks.map(({ service, errors, availabilityError }) => {
              const timezone = getSchedulingTimezone(service, draft, resource);
              return (
                <OfferingEntry
                  key={service.id}
                  service={service}
                  value={fields.offerings[service.id]}
                  initial={initial.offerings[service.id]}
                  onChange={(value) => updateOffering(service.id, value)}
                  summary={draft ? summarizeOffering(service, draft) : ''}
                  dirty={isOfferingDirty(service)}
                  errors={errors}
                  availabilityError={triedToSave ? availabilityError : undefined}
                  timezone={
                    timezone
                      ? { zone: timezone, source: timezoneSource(fields.offerings[service.id], service, actorName) }
                      : undefined
                  }
                />
              );
            })}
          </Accordion>
        )}
      </ConfigSection>

      <SaveBar
        dirty={dirty}
        saving={saving}
        blockedReason={blockedReason}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </Stack>
  );
}

function getBookingAlert(resource: ConfigurableActorResource, scheduleActive: boolean | undefined): string | undefined {
  const noun = getActorTypeLabel(resource.resourceType).toLowerCase();
  // Checked first: switching the Schedule back on wouldn't make an inactive actor bookable.
  if (isActorInactive(resource)) {
    return `This ${noun} is inactive and can't be booked.`;
  }
  if (scheduleActive === false) {
    const pronoun = resource.resourceType === 'Practitioner' ? 'they' : 'it';
    return `This ${noun}'s Schedule is switched off, so ${pronoun} can't be booked until it's switched back on. Appointments already booked stay booked.`;
  }
  return undefined;
}

function ActorGeneral(props: {
  readonly resource: ConfigurableActorResource;
  /** Whether the actor's Schedule is active, as edited, or undefined when it has none. */
  readonly scheduleActive: boolean | undefined;
  readonly onScheduleActiveChange: (active: boolean) => void;
}): JSX.Element {
  const { resource, scheduleActive, onScheduleActiveChange } = props;
  let status: string;
  if (resource.resourceType === 'Practitioner') {
    status = resource.active === false ? 'Inactive' : 'Active';
  } else {
    status = resource.status ? resource.status.charAt(0).toUpperCase() + resource.status.slice(1) : 'Active';
  }
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
      <ReadOnlyField label="Name" value={getDisplayString(resource)} />
      <ReadOnlyField label={`${getActorTypeLabel(resource.resourceType)} status`} value={status} />
      {scheduleActive !== undefined && (
        <Stack gap={2}>
          <Text size="sm" fw={500}>
            Schedule status
          </Text>
          <Switch
            aria-label="Schedule status"
            label={scheduleActive ? 'Active' : 'Inactive'}
            checked={scheduleActive}
            onChange={(event) => onScheduleActiveChange(event.currentTarget.checked)}
          />
        </Stack>
      )}
    </SimpleGrid>
  );
}

function ReadOnlyField(props: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <Stack gap={2}>
      <Text size="sm" fw={500}>
        {props.label}
      </Text>
      <Text size="sm">{props.value}</Text>
    </Stack>
  );
}

function timezoneSource(offering: OfferingFields, service: WithId<HealthcareService>, actorName: string): string {
  if (offering.parameters.timezone) {
    return 'this Schedule';
  }
  return getSchedulingTimezone(service) ? (service.name ?? 'the visit type') : actorName;
}
