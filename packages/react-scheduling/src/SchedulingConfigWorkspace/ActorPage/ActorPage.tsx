// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Accordion, Alert, Badge, Button, Group, Loader, Menu, Modal, Stack, Switch, Text, Title } from '@mantine/core';
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
import { IconChevronDown } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { getActorTypeLabel, isBookableActorType } from '../../actors';
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
import { describeNoSharedFacility, isHeldEverywhere, sharesServiceFacility } from '../serviceFacilities';
import { useActorFacilities } from '../useActorFacilities';
import type { NewActorType } from './actorDraft';
import { actorGeneralFieldsOf, buildActorResource, newActorResource } from './actorDraft';
import { ActorGeneral } from './ActorGeneral';
import type { CalendarFields, OfferingFields } from './calendarDraft';
import { buildCalendar, calendarFieldsOf, describeOverrides, newOfferingFields } from './calendarDraft';
import { OfferingEntry } from './OfferingEntry';

export interface ActorPageProps {
  /**
   * The provider, room, or device, with its calendars as stored. The first calendar is the one edited. Omitted
   * to create a room or device.
   */
  readonly actor?: ConfigurableActor;
  /** What to create when `actor` is omitted. Defaults to a room. */
  readonly newActorType?: NewActorType;
  /** Every visit type loaded, which is what can be offered. */
  readonly services: readonly WithId<HealthcareService>[];
  /**
   * The visit type whose entry opens, when the actor offers it, or null for every entry closed. Left out, only a
   * calendar's sole visit type opens.
   */
  readonly initialOpenServiceId?: string | null;
  /**
   * Called with the resources as the server now holds them, after a save, even one that only partly landed, or
   * after reloading newer versions.
   */
  readonly onStored: (resources: WithId<Resource>[]) => void;
  /** Called when a room or device that was being created is discarded instead. */
  readonly onDiscardNew?: () => void;
  /** Called whenever the page starts or stops holding unsaved changes. */
  readonly onDirtyChange?: (dirty: boolean) => void;
}

/**
 * The page for one provider, room, or device: its own fields, and the visit types its calendar offers, each
 * opening to the calendar's own parameters and hours for it. Everything is saved together.
 *
 * The actor's calendar isn't a thing of its own here. Offering a first visit type creates it, on save. A new
 * room or device has to be created before it can offer anything.
 *
 * It opens on the actor as given and then carries on from what it saves or reloads, so edits a save didn't land
 * are kept. A change of props doesn't reset it, so the caller remounts it with a `key` for another actor.
 * @param props - The actor and its calendars, the visit types, and what to do once something is stored.
 * @returns The page.
 */
export function ActorPage(props: ActorPageProps): JSX.Element {
  const {
    actor,
    newActorType = 'Location',
    services,
    initialOpenServiceId,
    onStored,
    onDiscardNew,
    onDirtyChange,
  } = props;
  const medplum = useMedplum();
  const servicesById = useMemo(() => new Map(services.map((service) => [service.id, service])), [services]);

  const [storedResource, setStoredResource] = useState(actor?.resource);
  const [schedule, setSchedule] = useState(actor?.schedules[0]);
  const [initialGeneral, setInitialGeneral] = useState(() =>
    actorGeneralFieldsOf(actor?.resource ?? newActorResource(newActorType))
  );
  const [general, setGeneral] = useState(initialGeneral);
  const [initial, setInitial] = useState<CalendarFields>(() => calendarFieldsOf(schedule, servicesById));
  const [fields, setFields] = useState(initial);

  const creating = !storedResource;
  const actorDraft = buildActorResource(storedResource ?? newActorResource(newActorType), general, initialGeneral);
  // The draft keeps a stored actor's id, so it stands in for the actor wherever the calendar reads one.
  const resource = storedResource && (actorDraft as ConfigurableActorResource);
  const typeLabel = getActorTypeLabel(actorDraft.resourceType);
  const noun = typeLabel.toLowerCase();
  const actorName = storedResource ? getDisplayString(storedResource) : general.name.trim() || `this ${noun}`;
  const [open, setOpen] = useState<string | null>(() => {
    if (initialOpenServiceId !== undefined) {
      return initialOpenServiceId && initial.offered.includes(initialOpenServiceId) ? initialOpenServiceId : null;
    }
    return initial.offered.length === 1 ? initial.offered[0] : null;
  });
  const [stopping, setStopping] = useState<WithId<HealthcareService>>();
  const [saving, setSaving] = useState(false);
  const [triedToSave, setTriedToSave] = useState(false);
  const [failure, setFailure] = useState<PageFailure>();
  const [reloading, setReloading] = useState(false);

  const facilities = useActorFacilities(resource ? [resource] : [])?.get(resource ? getReferenceString(resource) : '');

  const draft = resource && buildCalendar(schedule, resource, fields, initial, servicesById);
  // Edits the draft can't store yet, like an emptied week, still count, so the save bar can say why it refuses.
  const dirty =
    creating ||
    !deepEquals(actorDraft, storedResource) ||
    (schedule ? !deepEquals(draft, schedule) : draft !== undefined) ||
    !deepEquals(fields, initial);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const offered = fields.offered.flatMap((id) => servicesById.get(id) ?? []);

  function errorsFor(service: WithId<HealthcareService>): ReturnType<typeof getBlockingErrors> {
    const current = fields.offerings[service.id];
    return getBlockingErrors(
      validateSchedulingParameters(current.parameters),
      current.parameters,
      initial.offerings[service.id]?.parameters ?? {}
    );
  }

  function availabilityErrorFor(service: WithId<HealthcareService>): string | undefined {
    const current = fields.offerings[service.id];
    const before = initial.offerings[service.id];
    return before && deepEquals(current.availability, before.availability)
      ? undefined
      : getAvailabilityFieldsError(current.availability, service, 'override');
  }

  function isOfferingDirty(service: WithId<HealthcareService>): boolean {
    const before = initial.offerings[service.id];
    return !before || !deepEquals(fields.offerings[service.id], before);
  }

  const checks = offered.map((service) => ({
    service,
    errors: errorsFor(service),
    availabilityError: availabilityErrorFor(service),
  }));
  const blocking = checks.find(({ errors, availabilityError }) => Object.keys(errors).length > 0 || availabilityError);
  const nameError =
    actorDraft.resourceType !== 'Practitioner' && !general.name.trim() ? 'A name is required.' : undefined;
  let blockedReason: string | undefined;
  if (nameError) {
    blockedReason = nameError;
  } else if (blocking && Object.keys(blocking.errors).length > 0) {
    blockedReason = `Fix the highlighted fields for ${blocking.service.name ?? 'this visit type'} before saving.`;
  } else {
    blockedReason = blocking?.availabilityError;
  }

  function notBookableReason(service: WithId<HealthcareService>): string | undefined {
    return facilities && !sharesServiceFacility(service, facilities)
      ? describeNoSharedFacility(service.name ?? 'This visit type', facilities)
      : undefined;
  }

  function updateOffering(id: string, value: OfferingFields): void {
    setFields((current) => ({ ...current, offerings: { ...current.offerings, [id]: value } }));
  }

  function offer(service: WithId<HealthcareService>): void {
    setFields((current) => ({
      ...current,
      offered: [...current.offered, service.id],
      offerings: { ...current.offerings, [service.id]: newOfferingFields(service) },
    }));
    setOpen(service.id);
  }

  function stopOffering(service: WithId<HealthcareService>): void {
    const offeredNext = fields.offered.filter((id) => id !== service.id);
    const { [service.id]: _removed, ...offerings } = fields.offerings;
    setFields({ ...fields, offered: offeredNext, offerings });
    setOpen(null);
    setStopping(undefined);
  }

  /**
   * Makes what the server now holds the page's starting point, dropping the edits to those resources and keeping
   * the rest.
   * @param resources - The actor, its calendar, or both, as stored.
   */
  function adopt(resources: readonly WithId<Resource>[]): void {
    for (const stored of resources) {
      if (stored.resourceType === 'Schedule') {
        const next = calendarFieldsOf(stored, servicesById);
        setSchedule(stored);
        setInitial(next);
        setFields(next);
        setOpen((current) => (current && next.offered.includes(current) ? current : null));
      } else if (isBookableActorType(stored.resourceType)) {
        const next = actorGeneralFieldsOf(stored as ConfigurableActorResource);
        setStoredResource(stored as ConfigurableActorResource);
        setInitialGeneral(next);
        setGeneral(next);
      }
    }
  }

  async function handleSave(): Promise<void> {
    if (blockedReason) {
      setTriedToSave(true);
      return;
    }
    setSaving(true);
    setFailure(undefined);
    try {
      const changes: ConfigChange[] = [{ stored: storedResource, draft: actorDraft }];
      if (draft) {
        changes.push({ stored: schedule, draft });
      }
      const result = await saveConfigChanges(medplum, changes);
      const saved = result.saved.map(({ resource: stored }) => stored);
      if (saved.length > 0) {
        adopt(saved);
        onStored(saved);
      }
      if (result.failures.length > 0) {
        setFailure({ failed: result.failures.map(toSaveFailure), partly: saved.length > 0 });
      } else if (saved.length === 0) {
        // Nothing differed from what is stored, say a visit type stopped and offered again.
        handleDiscard();
      } else {
        setTriedToSave(false);
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
    setFields(initial);
    setOpen((current) => (current && initial.offered.includes(current) ? current : null));
    setTriedToSave(false);
    setFailure(undefined);
  }

  async function handleReload(): Promise<void> {
    if (!storedResource) {
      return;
    }
    setReloading(true);
    try {
      const reloaded: WithId<Resource>[] = [
        await medplum.readResource(storedResource.resourceType, storedResource.id, { cache: 'no-cache' }),
      ];
      if (schedule) {
        reloaded.push(await medplum.readResource('Schedule', schedule.id, { cache: 'no-cache' }));
      }
      adopt(reloaded);
      setTriedToSave(false);
      setFailure(undefined);
      onStored(reloaded);
    } catch (err) {
      setFailure({
        failed: [{ target: 'actor', conflict: false, message: `Could not reload it: ${normalizeErrorString(err)}` }],
        partly: false,
      });
    } finally {
      setReloading(false);
    }
  }

  function subjectOf(target: SaveFailure['target']): string {
    return target === 'calendar' ? `The calendar for ${actorName}` : actorName;
  }

  const conflicts = failure?.failed.filter(({ conflict }) => conflict) ?? [];
  const refusals = failure?.failed.filter(({ conflict }) => !conflict) ?? [];

  const offerable = services.filter((service) => service.active !== false && !fields.offered.includes(service.id));

  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          {creating ? `New ${noun}` : typeLabel}
        </Text>
        <Group gap="sm">
          <Title order={2}>{storedResource ? actorName : general.name.trim() || `Untitled ${noun}`}</Title>
          {creating && (
            <Badge variant="light" color="blue">
              Not saved yet
            </Badge>
          )}
          {storedResource && isActorInactive(storedResource) && (
            <Badge variant="light" color="gray">
              Inactive
            </Badge>
          )}
        </Group>
      </Stack>

      {creating && (
        <Alert color="blue" variant="light">
          Nothing is created until you press Create.
        </Alert>
      )}

      {conflicts.length > 0 && (
        <Alert color="orange" title={conflictTitle(conflicts, actorName)}>
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
      {failure?.partly
        ? refusals.map(({ target, message }) => (
            <Alert key={target} color="red" title={`${subjectOf(target)} was not saved`}>
              {message} The rest was saved. These changes are kept, so you can save them again.
            </Alert>
          ))
        : refusals.length > 0 && (
            <Alert color="red" title="Not saved">
              {refusals[0].message}
            </Alert>
          )}

      <ConfigSection title="General">
        <ActorGeneral
          resource={actorDraft}
          value={general}
          onChange={setGeneral}
          creating={creating}
          nameError={triedToSave || initialGeneral.name ? nameError : undefined}
        />
      </ConfigSection>

      <ConfigSection title="Visit types offered">
        {!resource && (
          <Text size="sm" c="dimmed">
            Visit types can be offered once {actorName} is created.
          </Text>
        )}
        {schedule && (
          <Stack gap={4}>
            <Switch
              label="Accepting appointments"
              checked={fields.active}
              onChange={(event) => {
                const active = event.currentTarget.checked;
                setFields((current) => ({ ...current, active }));
              }}
            />
            <Text size="xs" c={fields.active ? 'dimmed' : 'orange'}>
              {fields.active
                ? 'Turning this off stops new bookings. Existing appointments are untouched.'
                : `${actorName} can't be booked while this is off. Everything below can still be edited.`}
            </Text>
          </Stack>
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
                  notBookableReason={notBookableReason(service)}
                  timezone={
                    timezone
                      ? { zone: timezone, source: timezoneSource(fields.offerings[service.id], service, actorName) }
                      : undefined
                  }
                  timezoneHint={`Set one in Time zone above, on ${service.name ?? 'the visit type'}, or under General for ${actorName}.`}
                  onStopOffering={() => setStopping(service)}
                />
              );
            })}
          </Accordion>
        )}

        {resource && (
          <OfferMenu
            services={offerable}
            checking={(service) => !facilities && !isHeldEverywhere(service.location)}
            disabledReason={(service) => notBookableReason(service)}
            onOffer={offer}
          />
        )}
      </ConfigSection>

      <Modal
        opened={stopping !== undefined}
        onClose={() => setStopping(undefined)}
        title={stopping && `Stop offering ${stopping.name ?? 'this visit type'}?`}
        centered
      >
        {stopping && (
          <Stack gap="md">
            <Text size="sm">{stopOfferingText(stopping, fields.offerings[stopping.id], actorName)}</Text>
            <Group justify="flex-end" gap="sm">
              <Button variant="default" onClick={() => setStopping(undefined)}>
                Keep offering
              </Button>
              <Button color="red" onClick={() => stopOffering(stopping)}>
                Stop offering
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

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

interface SaveFailure {
  /** Which write failed: the actor's own, or its calendar's. */
  readonly target: 'actor' | 'calendar';
  readonly conflict: boolean;
  readonly message: string;
}

interface PageFailure {
  readonly failed: readonly SaveFailure[];
  /** Something else on the page was saved. */
  readonly partly: boolean;
}

function toSaveFailure(failure: ConfigSaveFailure): SaveFailure {
  return {
    target: failure.change.draft.resourceType === 'Schedule' ? 'calendar' : 'actor',
    conflict: failure.conflict,
    message: failure.message,
  };
}

function conflictTitle(conflicts: readonly SaveFailure[], actorName: string): string {
  const actorChanged = conflicts.some(({ target }) => target === 'actor');
  const calendarChanged = conflicts.some(({ target }) => target === 'calendar');
  if (actorChanged && calendarChanged) {
    return `${actorName} and its calendar changed since you opened them`;
  }
  return actorChanged
    ? `${actorName} changed since you opened it`
    : `The calendar for ${actorName} changed since you opened it`;
}

interface OfferMenuProps {
  /** The active visit types the calendar doesn't offer yet. */
  readonly services: readonly WithId<HealthcareService>[];
  /** Whether it's still being worked out if a visit type can be booked with the actor. */
  readonly checking: (service: WithId<HealthcareService>) => boolean;
  /** Why a visit type can't be offered, for one that shares no service facility with the actor. */
  readonly disabledReason: (service: WithId<HealthcareService>) => string | undefined;
  readonly onOffer: (service: WithId<HealthcareService>) => void;
}

function OfferMenu(props: OfferMenuProps): JSX.Element {
  const { services, checking, disabledReason, onOffer } = props;
  if (services.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        There is nothing more to offer: every active visit type is offered here.
      </Text>
    );
  }
  return (
    <Group>
      <Menu position="bottom-start" withinPortal>
        <Menu.Target>
          <Button variant="light" rightSection={<IconChevronDown size={16} />}>
            Offer a visit type
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {services.map((service) => {
            const pending = checking(service);
            const reason = pending ? undefined : disabledReason(service);
            return (
              <Menu.Item
                key={service.id}
                disabled={pending || !!reason}
                rightSection={pending && <Loader size={12} aria-label="Checking service facilities" />}
                onClick={() => onOffer(service)}
              >
                <Text size="sm">{service.name ?? 'Untitled visit type'}</Text>
                {reason && (
                  <Text size="xs" c="dimmed">
                    {reason}
                  </Text>
                )}
              </Menu.Item>
            );
          })}
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}

function timezoneSource(offering: OfferingFields, service: WithId<HealthcareService>, actorName: string): string {
  if (offering.parameters.timezone) {
    return 'this calendar';
  }
  return getSchedulingTimezone(service) ? (service.name ?? 'the visit type') : actorName;
}

function stopOfferingText(service: WithId<HealthcareService>, offering: OfferingFields, actorName: string): string {
  const serviceName = service.name ?? 'this visit type';
  const overrides = describeOverrides(offering);
  const lost =
    overrides.length > 0
      ? `What this calendar sets of its own for it is removed too: ${overrides.join(', ')}.`
      : `This calendar sets nothing of its own for it.`;
  return `${actorName} will no longer be offered for ${serviceName} once you save. ${lost} Existing appointments aren't changed.`;
}
