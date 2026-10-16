// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Group, Stack, Text, Title } from '@mantine/core';
import type { WithId } from '@medplum/core';
import {
  deepEquals,
  generateId,
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
import type { ActorGeneralFields, ActorResource, NewActorType } from './actorDraft';
import { actorGeneralFieldsOf, buildActorResource, hasEditableName, newActorResource } from './actorDraft';
import { ActorGeneral } from './ActorGeneral';
import { OfferAllSwitch } from './OfferAllSwitch';
import { OfferingEditor, OfferingSummary } from './OfferingEditor';
import { OfferingsList } from './OfferingsList';
import { ProviderFacilitiesFields } from './ProviderFacilitiesFields';
import type { OfferingFields, ScheduleFields } from './scheduleDraft';
import { buildScheduleDraft, newOfferingFields, scheduleFieldsOf, startingOfferingFields } from './scheduleDraft';
import { useOfferAll } from './useOfferAll';
import { useProviderFacilities } from './useProviderFacilities';

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
 * An actor with no Schedule gets one, on save, once it offers a visit type. A new room or device is created
 * with an empty Schedule, and has to be created before it can offer anything.
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
  const base = useMemo(() => stored ?? newActorResource(newActorType), [stored, newActorType]);
  const [initialGeneral] = useState(() => actorGeneralFieldsOf(base));
  const [general, setGeneral] = useState(initialGeneral);
  const [initial] = useState<ScheduleFields>(() => scheduleFieldsOf(schedule, servicesById));
  const [fields, setFields] = useState(initial);
  const [open, setOpen] = useState<string | null>(() =>
    initialOpenServiceId && Object.hasOwn(initial.offerings, initialOpenServiceId) ? initialOpenServiceId : null
  );
  const offerAll = useOfferAll({ servicesById, schedule, fields, setFields, setOpenServiceId: setOpen });
  const [confirmingFacilities, setConfirmingFacilities] = useState(false);
  const [saving, setSaving] = useState(false);
  const [triedToSave, setTriedToSave] = useState(false);
  const [failure, setFailure] = useState<Pick<ConfigSaveFailure, 'conflict' | 'message'> & { change?: ConfigChange }>();
  const [reloading, setReloading] = useState(false);
  // Bumped by Discard to remount the General fields, whose location input holds its own selection.
  const [discards, setDiscards] = useState(0);

  const actorDraft = useMemo(() => buildActorResource(base, general, initialGeneral), [base, general, initialGeneral]);
  // The edited actor, for the Schedule code, which needs its id: undefined until the actor is stored.
  const actorWithId = stored && (actorDraft as ConfigurableActorResource);
  const typeLabel = getActorTypeLabel(actorDraft.resourceType);
  const noun = typeLabel.toLowerCase();
  const name = creating ? general.name.trim() : getDisplayString(stored);
  const actorName = name || `this ${noun}`;

  const facilities = useProviderFacilities(stored, actorName);

  const scheduleDraft = actorWithId && buildScheduleDraft(schedule, actorWithId, fields, initial, servicesById);
  const actorDirty = !deepEquals(general, initialGeneral);
  // Compares the fields rather than the Schedule draft, so edits the draft can't store yet, like an emptied
  // week, still count and the save bar can say why it refuses.
  const dirty = creating || actorDirty || !deepEquals(fields, initial) || facilities.changes.length > 0;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const offered = useMemo(
    () => services.filter((service) => Object.hasOwn(fields.offerings, service.id)),
    [services, fields.offerings]
  );
  const scheduleActive = schedule ? fields.active : undefined;
  const status = actorWithId && getActorStatus(actorWithId, scheduleActive);
  const alert = status && getBookingAlert(actorDraft, status);

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

  function blockedReasonFor(service: WithId<HealthcareService>): string | undefined {
    if (Object.keys(errorsFor(service)).length > 0) {
      return `Fix the highlighted fields for ${service.name ?? 'this visit type'} before saving.`;
    }
    return availabilityErrorFor(service);
  }

  const blocking = offered.find((service) => blockedReasonFor(service));
  const nameError = hasEditableName(actorDraft) && !general.name.trim() ? 'A name is required.' : undefined;
  const blockedReason = nameError ?? (blocking && blockedReasonFor(blocking));

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

  function stopOffering(stopped: WithId<HealthcareService>[]): void {
    const ids = new Set(stopped.map((service) => service.id));
    setFields((current) => ({
      ...current,
      offerings: Object.fromEntries(Object.entries(current.offerings).filter(([id]) => !ids.has(id))),
    }));
    setOpen((current) => (current && ids.has(current) ? null : current));
  }

  async function handleSave(): Promise<void> {
    if (blockedReason) {
      setTriedToSave(true);
      // Opening it also lists it when the filter or paging hides it, so what to fix is on screen.
      if (blocking) {
        setOpen(blocking.id);
      }
      return;
    }
    if (facilities.confirmation) {
      setConfirmingFacilities(true);
      return;
    }
    await save();
  }

  async function handleConfirmFacilities(): Promise<void> {
    setConfirmingFacilities(false);
    await save();
  }

  async function save(): Promise<void> {
    setSaving(true);
    setFailure(undefined);
    try {
      // A new actor is created with an empty Schedule, which refers to it by this until the server gives it an id.
      const fullUrl = creating ? `urn:uuid:${generateId()}` : undefined;
      const changes: ConfigChange[] = [{ stored, draft: actorDraft, fullUrl }];
      if (fullUrl) {
        changes.push({ draft: { resourceType: 'Schedule', active: general.active, actor: [{ reference: fullUrl }] } });
      } else if (scheduleDraft) {
        // Conditional, so two pages offering this actor's first visit type at once can't each create a Schedule.
        changes.push({
          stored: schedule,
          draft: scheduleDraft,
          ifNoneExist: `actor=${getReferenceString(actorDraft)}`,
        });
      }
      changes.push(...facilities.changes);
      const result = await saveConfigChanges(medplum, changes);
      facilities.store(result.saved.map(({ resource: saved }) => saved));
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
    facilities.discard();
    setFields(initial);
    offerAll.reset();
    setOpen((current) => (current && Object.hasOwn(initial.offerings, current) ? current : null));
    setTriedToSave(false);
    setFailure(undefined);
  }

  async function handleReload(): Promise<void> {
    if (creating) {
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
      await facilities.reload();
      onSynced(reloadedSchedule ? [reloadedActor, reloadedSchedule] : [reloadedActor], open ?? undefined);
      // When only a role changed, no version the page is keyed on did, so nothing remounts it.
      handleDiscard();
    } catch (err) {
      setFailure({ conflict: false, message: `Could not reload it: ${normalizeErrorString(err)}` });
    } finally {
      setReloading(false);
    }
  }

  let conflictSubject = actorDirty ? `${actorName} or its Schedule` : `The Schedule for ${actorName}`;
  if (failure?.change?.draft.resourceType === 'PractitionerRole') {
    conflictSubject = `The service facilities for ${actorName}`;
  }
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
          <Title order={2}>{name || `Untitled ${noun}`}</Title>
          <StatusBadge status={status ?? 'new'} />
        </Group>
      </Stack>

      {creating && (
        <Alert color="blue" variant="light">
          Nothing is created until you press Create, which creates its Schedule too. It starts active, but can't be
          booked until it's created and offers a visit type.
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
        {facilities.field && <ProviderFacilitiesFields {...facilities.field} />}
        {alert && (
          <Alert color="blue" variant="light">
            {alert}
          </Alert>
        )}
      </ConfigSection>

      <ConfigSection title="Visit types offered">
        {!actorWithId && (
          <Text size="sm" c="dimmed">
            Visit types can be offered once {actorName} is created.
          </Text>
        )}
        {actorWithId && <OfferAllSwitch actorName={actorName} {...offerAll.switchProps} />}
        {actorWithId && (
          <OfferingsList
            actorName={actorName}
            offeredServices={offered}
            offersAllServices={fields.allServices}
            openServiceId={open}
            onOpenServiceIdChange={setOpen}
            renderHeader={(service) => (
              <OfferingSummary
                service={service}
                value={fields.offerings[service.id]}
                summary={scheduleDraft ? summarizeOffering(service, scheduleDraft) : ''}
                dirty={isOfferingDirty(service)}
              />
            )}
            renderPanel={(service) => {
              const timezone = getSchedulingTimezone(service, scheduleDraft, actorWithId);
              return (
                <OfferingEditor
                  service={service}
                  value={fields.offerings[service.id]}
                  initialParameters={startingOfferingFields(initial, service).parameters}
                  onChange={(value) => updateOffering(service.id, value)}
                  errors={errorsFor(service)}
                  availabilityError={triedToSave ? availabilityErrorFor(service) : undefined}
                  timezone={
                    timezone
                      ? { zone: timezone, source: timezoneSource(fields.offerings[service.id], service, actorName) }
                      : undefined
                  }
                />
              );
            }}
            offerableServices={offerable}
            onOffer={offer}
            onStopOffering={stopOffering}
          />
        )}
      </ConfigSection>

      <ConfirmModal
        opened={confirmingFacilities}
        title={facilities.confirmation?.title}
        cancelLabel="Cancel"
        confirmLabel={facilities.confirmation?.confirmLabel ?? 'Save'}
        onCancel={() => setConfirmingFacilities(false)}
        onConfirm={handleConfirmFacilities}
      >
        {facilities.confirmation?.body}
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

function getBookingAlert(resource: ActorResource, status: ConfigStatus): string | undefined {
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
