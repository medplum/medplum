// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Accordion,
  Alert,
  Box,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
  VisuallyHidden,
} from '@mantine/core';
import type { WithId } from '@medplum/core';
import { deepEquals, getDisplayString, getSchedulingTimezone, normalizeErrorString } from '@medplum/core';
import type { HealthcareService, Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useId, useMemo, useState } from 'react';
import { getActorTypeLabel } from '../../actors';
import type { ConfigurableActor, ConfigurableActorResource } from '../../configSearch';
import { getAvailabilityFieldsError } from '../../ScheduleAvailabilityEditor/ScheduleAvailabilityEditor.utils';
import {
  getBlockingErrors,
  validateSchedulingParameters,
} from '../../SchedulingParametersEditor/SchedulingParametersEditor.utils';
import { ConfigSection, SaveBar } from '../ConfigPage/ConfigPage';
import type { ConfigChange, ConfigSaveFailure } from '../ConfigPage/configSave';
import { saveConfigChanges } from '../ConfigPage/configSave';
import { summarizeOffering } from '../offeringSummary';
import { isActorInactive } from '../SchedulingConfigWorkspace.utils';
import type { ConfigStatus } from '../StatusBadge';
import { StatusBadge } from '../StatusBadge';
import { OfferingEntry } from './OfferingEntry';
import type { OfferingFields, ScheduleFields } from './scheduleDraft';
import { buildScheduleDraft, scheduleFieldsOf } from './scheduleDraft';

export interface ActorPageProps {
  /** The provider, room, or device, with its Schedules as stored. The first Schedule is the one edited. */
  readonly actor: ConfigurableActor;
  /** Every visit type loaded. */
  readonly services: readonly WithId<HealthcareService>[];
  /**
   * The visit type whose entry opens, when the actor offers it. Left out or null, every entry starts closed.
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
  const [actorDraft, setActorDraft] = useState<ConfigurableActorResource>(resource);
  const [open, setOpen] = useState<string | null>(() =>
    initialOpenServiceId && initial.offered.includes(initialOpenServiceId) ? initialOpenServiceId : null
  );
  const [saving, setSaving] = useState(false);
  const [triedToSave, setTriedToSave] = useState(false);
  const [failure, setFailure] = useState<Pick<ConfigSaveFailure, 'conflict' | 'message'>>();
  const [reloading, setReloading] = useState(false);

  const draft = schedule && buildScheduleDraft(schedule, fields, initial, servicesById);
  // Edits the draft can't store yet, like an emptied week, still count, so the save bar can say why it refuses.
  const actorDirty = !deepEquals(actorDraft, resource);
  const dirty = actorDirty || (schedule ? !deepEquals(draft, schedule) : false) || !deepEquals(fields, initial);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const offered = fields.offered.flatMap((id) => servicesById.get(id) ?? []);
  const inactive = isActorInactive(actorDraft);
  const alert = getBookingAlert(actorDraft, schedule && fields.active);

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

  // An inactive actor can't keep an active Schedule, so switching the actor off switches its Schedule off too.
  // Switching it back on puts the Schedule back as stored.
  function handleActorActiveChange(active: boolean): void {
    setActorDraft(active === !isActorInactive(resource) ? resource : withActorActive(resource, active));
    setFields((current) => ({ ...current, active: active && initial.active }));
  }

  function updateOffering(id: string, value: OfferingFields): void {
    setFields((current) => ({ ...current, offerings: { ...current.offerings, [id]: value } }));
  }

  async function handleSave(): Promise<void> {
    if (blockedReason) {
      setTriedToSave(true);
      return;
    }
    setSaving(true);
    setFailure(undefined);
    try {
      const changes: ConfigChange[] = [{ stored: resource, draft: actorDraft }];
      if (schedule && draft) {
        changes.push({ stored: schedule, draft });
      }
      const result = await saveConfigChanges(medplum, changes);
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
    setActorDraft(resource);
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
          <StatusBadge status={getStatus(inactive, schedule && fields.active)} />
        </Group>
      </Stack>

      {failure?.conflict && (
        <Alert
          color="orange"
          title={`${actorDirty ? `${actorName} or its Schedule` : `The Schedule for ${actorName}`} changed since you opened it`}
        >
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
          resource={actorDraft}
          onActiveChange={handleActorActiveChange}
          scheduleActive={schedule && fields.active}
          onScheduleActiveChange={(active) => setFields((current) => ({ ...current, active }))}
        />
        {alert && (
          <Alert color="blue" variant="light">
            {alert}
          </Alert>
        )}
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

function getStatus(inactive: boolean, scheduleActive: boolean | undefined): ConfigStatus {
  if (inactive) {
    return 'inactive';
  }
  return scheduleActive === false ? 'schedule-inactive' : 'active';
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
  /** The provider, room, or device, as edited. */
  readonly resource: ConfigurableActorResource;
  readonly onActiveChange: (active: boolean) => void;
  /** Whether the actor's Schedule is active, as edited, or undefined when it has none. */
  readonly scheduleActive: boolean | undefined;
  readonly onScheduleActiveChange: (active: boolean) => void;
}): JSX.Element {
  const { resource, onActiveChange, scheduleActive, onScheduleActiveChange } = props;
  const typeLabel = getActorTypeLabel(resource.resourceType);
  const active = !isActorInactive(resource);
  // Only turning off is allowed while the actor is inactive, so a Schedule stored on can still be switched off.
  const scheduleLocked = !active && !scheduleActive;
  return (
    <>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <StatusSwitch
          label={`${typeLabel} status`}
          value={statusLabel(resource)}
          checked={active}
          onChange={onActiveChange}
        />
        {scheduleActive !== undefined && (
          <StatusSwitch
            label="Schedule status"
            value={scheduleActive ? 'Active' : 'Inactive'}
            checked={scheduleActive}
            onChange={onScheduleActiveChange}
            disabledReason={
              scheduleLocked ? `Can't be switched on while the ${typeLabel.toLowerCase()} is inactive.` : undefined
            }
          />
        )}
      </SimpleGrid>
      <ReadOnlyField label="Name" value={getDisplayString(resource)} />
    </>
  );
}

function StatusSwitch(props: {
  readonly label: string;
  readonly value: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  /** Why the switch can't be used. Given, the switch is disabled and the reason shows on hover. */
  readonly disabledReason?: string;
}): JSX.Element {
  const reasonId = useId();
  return (
    <Stack gap={2}>
      <Text size="sm" fw={500}>
        {props.label}
      </Text>
      <Tooltip label={props.disabledReason} disabled={!props.disabledReason} multiline w={280} withArrow>
        {/* A disabled input emits no pointer events, so the tooltip hangs on a wrapper instead. */}
        <Box w="fit-content">
          <Switch
            aria-label={props.label}
            aria-describedby={props.disabledReason ? reasonId : undefined}
            label={props.value}
            checked={props.checked}
            disabled={!!props.disabledReason}
            onChange={(event) => props.onChange(event.currentTarget.checked)}
          />
        </Box>
      </Tooltip>
      {props.disabledReason && <VisuallyHidden id={reasonId}>{props.disabledReason}</VisuallyHidden>}
    </Stack>
  );
}

// A room's or device's other statuses, like suspended, read as on and are kept until switched.
function statusLabel(resource: ConfigurableActorResource): string {
  if (resource.resourceType === 'Practitioner') {
    return resource.active === false ? 'Inactive' : 'Active';
  }
  return resource.status ? resource.status.charAt(0).toUpperCase() + resource.status.slice(1) : 'Active';
}

function withActorActive(resource: ConfigurableActorResource, active: boolean): ConfigurableActorResource {
  if (resource.resourceType === 'Practitioner') {
    return { ...resource, active };
  }
  return { ...resource, status: active ? 'active' : 'inactive' };
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
