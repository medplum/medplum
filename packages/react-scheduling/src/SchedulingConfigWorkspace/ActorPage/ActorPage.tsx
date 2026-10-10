// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Accordion, Alert, Badge, Divider, Group, Stack, Text, Title } from '@mantine/core';
import type { WithId } from '@medplum/core';
import {
  deepEquals,
  getDisplayString,
  getReferenceString,
  getSchedulingTimezone,
  normalizeErrorString,
} from '@medplum/core';
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
import { ConfigSection, SaveBar, SaveFailureAlert } from '../ConfigPage/ConfigPage';
import type { ConfigChange, ConfigSaveFailure } from '../ConfigPage/configSave';
import { saveConfigChanges } from '../ConfigPage/configSave';
import { ConfirmModal } from '../ConfirmModal';
import { summarizeOffering } from '../offeringSummary';
import { getActorStatus } from '../SchedulingConfigWorkspace.utils';
import type { ConfigStatus } from '../StatusBadge';
import { StatusBadge } from '../StatusBadge';
import type { ActorGeneralFields, NewActorType } from './actorDraft';
import { actorGeneralFieldsOf, buildActorResource, newActorResource } from './actorDraft';
import { ActorGeneral } from './ActorGeneral';
import { OfferingEditor, OfferingMenu, OfferingSummary } from './OfferingEditor';
import { OfferPicker } from './OfferPicker';
import type { OfferingFields, ScheduleFields } from './scheduleDraft';
import { buildScheduleDraft, newOfferingFields, scheduleFieldsOf, startingOfferingFields } from './scheduleDraft';

export interface ActorPageProps {
  /**
   * The provider, room, or device, with its Schedules as stored. The first Schedule is the one edited. Omitted
   * to create a room or device.
   */
  readonly actor?: ConfigurableActor;
  /** What to create when `actor` is omitted. Defaults to a room. */
  readonly newActorType?: NewActorType;
  /** Every visit type loaded. */
  readonly services: readonly WithId<HealthcareService>[];
  /**
   * The visit type whose entry opens, when the actor offers it. Left out, every entry starts closed.
   */
  readonly initialOpenServiceId?: string;
  /**
   * Called with the resources as the server now holds them, after a save or after reloading newer versions, and
   * the visit type whose entry is open.
   */
  readonly onSynced: (resources: WithId<Resource>[], openServiceId: string | undefined) => void;
  /** Called when a room or device that was being created is discarded instead. */
  readonly onDiscardNew?: () => void;
  /** Called whenever the page starts or stops holding unsaved changes. */
  readonly onDirtyChange?: (dirty: boolean) => void;
}

/**
 * The page for one provider, room, or device: its own fields, and the visit types its Schedule offers, each
 * opening to the Schedule's own parameters and hours for it. Everything is saved together.
 *
 * An actor with no Schedule gets one, on save, once it offers a visit type. A new room or device has to be
 * created before it can offer anything.
 *
 * It opens on what is stored and is not reset by a change of props, so the caller remounts it with a `key`
 * when the actor or its Schedule is replaced.
 * @param props - The actor and its Schedules, the visit types, and what to do once something is stored.
 * @returns The page.
 */
export function ActorPage(props: ActorPageProps): JSX.Element {
  const {
    actor,
    newActorType = 'Location',
    services,
    initialOpenServiceId,
    onSynced,
    onDiscardNew,
    onDirtyChange,
  } = props;
  const medplum = useMedplum();
  const stored = actor?.resource;
  const [schedule] = actor?.schedules ?? [];
  const creating = !stored;

  const servicesById = useMemo(() => new Map(services.map((service) => [service.id, service])), [services]);
  const [initialGeneral] = useState(() => actorGeneralFieldsOf(stored ?? newActorResource(newActorType)));
  const [general, setGeneral] = useState(initialGeneral);
  const [initial] = useState<ScheduleFields>(() => scheduleFieldsOf(schedule, servicesById));
  const [fields, setFields] = useState(initial);
  const [open, setOpen] = useState<string | null>(() =>
    initialOpenServiceId && Object.hasOwn(initial.offerings, initialOpenServiceId) ? initialOpenServiceId : null
  );
  const [stopping, setStopping] = useState<WithId<HealthcareService>>();
  const [saving, setSaving] = useState(false);
  const [triedToSave, setTriedToSave] = useState(false);
  const [failure, setFailure] = useState<Pick<ConfigSaveFailure, 'conflict' | 'message'>>();
  const [reloading, setReloading] = useState(false);
  // Bumped by Discard to remount the General fields, whose location input holds its own selection.
  const [discards, setDiscards] = useState(0);

  const actorDraft = useMemo(
    () => buildActorResource(stored ?? newActorResource(newActorType), general, initialGeneral),
    [stored, newActorType, general, initialGeneral]
  );
  // A stored actor's draft keeps its id, so it stands in for the actor wherever its Schedule reads one.
  const resource = stored && (actorDraft as ConfigurableActorResource);
  const typeLabel = getActorTypeLabel(actorDraft.resourceType);
  const noun = typeLabel.toLowerCase();
  const actorName = stored ? getDisplayString(stored) : general.name.trim() || `this ${noun}`;

  const draft = resource && buildScheduleDraft(schedule, resource, fields, initial, servicesById);
  const actorDirty = !deepEquals(general, initialGeneral);
  // Compares the fields rather than the draft, so edits the draft can't store yet, like an emptied week, still
  // count and the save bar can say why it refuses.
  const dirty = creating || actorDirty || !deepEquals(fields, initial);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const offered = Object.keys(fields.offerings).flatMap((id) => servicesById.get(id) ?? []);
  const scheduleActive = schedule ? fields.active : undefined;
  const status = resource && getActorStatus(resource, scheduleActive);
  const alert = resource && status && getBookingAlert(resource, status);

  function errorsFor(service: WithId<HealthcareService>): ReturnType<typeof getBlockingErrors> {
    const current = fields.offerings[service.id];
    return getBlockingErrors(
      validateSchedulingParameters(current.parameters),
      current.parameters,
      startingOfferingFields(initial, service).parameters
    );
  }

  function availabilityErrorFor(service: WithId<HealthcareService>): string | undefined {
    const current = fields.offerings[service.id];
    return deepEquals(current.availability, startingOfferingFields(initial, service).availability)
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
  const nameError =
    actorDraft.resourceType !== 'Practitioner' && !general.name.trim() ? 'A name is required.' : undefined;
  const blockedReason = nameError ?? getOfferingBlockedReason(blocking);

  function handleGeneralChange(next: ActorGeneralFields): void {
    if (next.active !== general.active) {
      // An inactive actor can't keep an active Schedule, so switching the actor off switches its Schedule off
      // too. Switching it back on puts the Schedule back as stored.
      setFields((current) => ({ ...current, active: next.active && initial.active }));
    }
    setGeneral(next);
  }

  function updateOffering(id: string, value: OfferingFields): void {
    setFields((current) => ({ ...current, offerings: { ...current.offerings, [id]: value } }));
  }

  function offer(chosen: WithId<HealthcareService>[]): void {
    const added = Object.fromEntries(chosen.map((service) => [service.id, newOfferingFields(service)]));
    setFields((current) => ({ ...current, offerings: { ...current.offerings, ...added } }));
  }

  function stopOffering(service: WithId<HealthcareService>): void {
    const { [service.id]: _removed, ...offerings } = fields.offerings;
    setFields({ ...fields, offerings });
    setOpen(null);
    setStopping(undefined);
  }

  async function handleSave(): Promise<void> {
    if (blockedReason) {
      setTriedToSave(true);
      return;
    }
    setSaving(true);
    setFailure(undefined);
    try {
      const changes: ConfigChange[] = [{ stored, draft: actorDraft }];
      if (resource && draft) {
        // Conditional, so two pages offering this actor's first visit type at once can't each create a Schedule.
        changes.push({ stored: schedule, draft, ifNoneExist: `actor=${getReferenceString(resource)}` });
      }
      const result = await saveConfigChanges(medplum, changes);
      if (result.failures.length > 0) {
        setFailure(result.failures[0]);
      } else if (result.saved.length === 0) {
        // Nothing differed from what is stored, so no new version remounts the page.
        handleDiscard();
      } else {
        onSynced(
          result.saved.map(({ resource: saved }) => saved),
          open ?? undefined
        );
      }
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard(): void {
    if (creating) {
      onDiscardNew?.();
      return;
    }
    setGeneral(initialGeneral);
    setDiscards((count) => count + 1);
    setFields(initial);
    setOpen((current) => (current && Object.hasOwn(initial.offerings, current) ? current : null));
    setTriedToSave(false);
    setFailure(undefined);
  }

  async function handleReload(): Promise<void> {
    if (!stored) {
      return;
    }
    setReloading(true);
    try {
      const [reloadedActor, reloadedSchedule] = await Promise.all([
        medplum.readResource(stored.resourceType, stored.id, { cache: 'no-cache' }),
        schedule
          ? medplum.readResource('Schedule', schedule.id, { cache: 'no-cache' })
          : medplum.searchOne('Schedule', { actor: getReferenceString(stored) }, { cache: 'no-cache' }),
      ]);
      onSynced(reloadedSchedule ? [reloadedActor, reloadedSchedule] : [reloadedActor], open ?? undefined);
    } catch (err) {
      setFailure({ conflict: false, message: `Could not reload it: ${normalizeErrorString(err)}` });
    } finally {
      setReloading(false);
    }
  }

  const conflictSubject = actorDirty ? `${actorName} or its Schedule` : `The Schedule for ${actorName}`;
  const offerable = useMemo(
    () => services.filter((service) => service.active !== false && !Object.hasOwn(fields.offerings, service.id)),
    [services, fields.offerings]
  );

  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          {creating ? `New ${noun}` : typeLabel}
        </Text>
        <Group gap="sm">
          <Title order={2}>{stored ? actorName : general.name.trim() || `Untitled ${noun}`}</Title>
          {status ? (
            <StatusBadge status={status} />
          ) : (
            <Badge variant="light" color="blue">
              Not saved yet
            </Badge>
          )}
        </Group>
      </Stack>

      {creating && (
        <Alert color="blue" variant="light">
          Nothing is created until you press Create. It starts active, but can't be booked until it's created and offers
          a visit type.
        </Alert>
      )}

      <SaveFailureAlert
        failure={failure}
        conflictTitle={`${conflictSubject} changed since you opened it`}
        reloading={reloading}
        onReload={handleReload}
      />

      <ConfigSection title="General">
        <ActorGeneral
          key={discards}
          resource={actorDraft}
          value={general}
          onChange={handleGeneralChange}
          scheduleActive={scheduleActive}
          onScheduleActiveChange={(active) => setFields((current) => ({ ...current, active }))}
          nameError={triedToSave || initialGeneral.name ? nameError : undefined}
        />
        {alert && (
          <Alert color="blue" variant="light">
            {alert}
          </Alert>
        )}
      </ConfigSection>

      <ConfigSection title="Visit types offered">
        {!resource && (
          <Text size="sm" c="dimmed">
            Visit types can be offered once {actorName} is created.
          </Text>
        )}
        {resource && offered.length === 0 && (
          <Text size="sm" c="dimmed">
            {actorName} offers no visit types yet.
          </Text>
        )}
        {resource && offered.length > 0 && (
          <Accordion variant="separated" value={open} onChange={setOpen}>
            {checks.map(({ service, errors, availabilityError }) => {
              const timezone = getSchedulingTimezone(service, draft, resource);
              return (
                <Accordion.Item key={service.id} value={service.id}>
                  {/* Beside the control rather than in it, which is itself a button. */}
                  <Group gap={0} wrap="nowrap" pr="sm">
                    <Accordion.Control>
                      <OfferingSummary
                        service={service}
                        value={fields.offerings[service.id]}
                        summary={draft ? summarizeOffering(service, draft) : ''}
                        dirty={isOfferingDirty(service)}
                      />
                    </Accordion.Control>
                    <OfferingMenu service={service} onStopOffering={() => setStopping(service)} />
                  </Group>
                  <Accordion.Panel>
                    <Stack gap="lg">
                      <Divider />
                      <OfferingEditor
                        service={service}
                        value={fields.offerings[service.id]}
                        initialParameters={startingOfferingFields(initial, service).parameters}
                        onChange={(value) => updateOffering(service.id, value)}
                        errors={errors}
                        availabilityError={triedToSave ? availabilityError : undefined}
                        timezone={
                          timezone
                            ? {
                                zone: timezone,
                                source: timezoneSource(fields.offerings[service.id], service, actorName),
                              }
                            : undefined
                        }
                      />
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              );
            })}
          </Accordion>
        )}

        {resource && <OfferPicker services={offerable} onOffer={offer} />}
      </ConfigSection>

      <ConfirmModal
        opened={stopping !== undefined}
        title={stopping && `Stop offering ${stopping.name ?? 'this visit type'}?`}
        cancelLabel="Keep offering"
        confirmLabel="Stop offering"
        destructive
        onCancel={() => setStopping(undefined)}
        onConfirm={() => stopping && stopOffering(stopping)}
      >
        {stopping &&
          `${actorName} will no longer be offered for ${stopping.name ?? 'this visit type'} once you save. ` +
            "Existing appointments aren't changed."}
      </ConfirmModal>

      <SaveBar
        dirty={dirty}
        message={creating ? `New ${noun}, not created yet` : undefined}
        saveLabel={creating ? 'Create' : undefined}
        saving={saving}
        blockedReason={blockedReason}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </Stack>
  );
}

function getOfferingBlockedReason(
  blocking:
    | { service: WithId<HealthcareService>; errors: ReturnType<typeof getBlockingErrors>; availabilityError?: string }
    | undefined
): string | undefined {
  if (blocking && Object.keys(blocking.errors).length > 0) {
    return `Fix the highlighted fields for ${blocking.service.name ?? 'this visit type'} before saving.`;
  }
  return blocking?.availabilityError;
}

function getBookingAlert(resource: ConfigurableActorResource, status: ConfigStatus): string | undefined {
  const noun = getActorTypeLabel(resource.resourceType).toLowerCase();
  if (status === 'inactive') {
    return `This ${noun} is inactive and can't be booked.`;
  }
  if (status === 'schedule-inactive') {
    const pronoun = resource.resourceType === 'Practitioner' ? 'they' : 'it';
    return `This ${noun}'s Schedule is switched off, so ${pronoun} can't be booked until it's switched back on. Appointments already booked stay booked.`;
  }
  return undefined;
}

function timezoneSource(offering: OfferingFields, service: WithId<HealthcareService>, actorName: string): string {
  if (offering.parameters.timezone) {
    return 'this Schedule';
  }
  return getSchedulingTimezone(service) ? (service.name ?? 'the visit type') : actorName;
}
