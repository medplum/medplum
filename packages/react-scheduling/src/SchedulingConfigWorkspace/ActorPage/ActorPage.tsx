// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Menu,
  Modal,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
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
import { describeNoSharedFacility, sharesServiceFacility } from '../serviceFacilities';
import { useActorFacilities } from '../useActorFacilities';
import type { CalendarFields, OfferingFields } from './calendarDraft';
import { buildCalendar, calendarFieldsOf, describeOverrides, newOfferingFields } from './calendarDraft';
import { OfferingEntry } from './OfferingEntry';

export interface ActorPageProps {
  /** The provider, room, or device, with its calendars as stored. The first calendar is the one edited. */
  readonly actor: ConfigurableActor;
  /** Every visit type loaded, which is what can be offered. */
  readonly services: readonly WithId<HealthcareService>[];
  /**
   * The visit type whose entry opens, when the actor offers it, or null for every entry closed. Left out, only a
   * calendar's sole visit type opens.
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
 * The page for one provider, room, or device: its own fields, and the visit types its calendar offers, each
 * opening to the calendar's own parameters and hours for it. Everything is saved together.
 *
 * The actor's calendar isn't a thing of its own here. Offering a first visit type creates it, on save.
 *
 * It opens on what is stored and is not reset by a change of props, so the caller remounts it with a `key`
 * when the actor or its calendar is replaced.
 * @param props - The actor and its calendars, the visit types, and what to do once something is stored.
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
  const [initial] = useState<CalendarFields>(() => calendarFieldsOf(schedule, servicesById));
  const [fields, setFields] = useState(initial);
  const [open, setOpen] = useState<string | null>(() => {
    if (initialOpenServiceId !== undefined) {
      return initialOpenServiceId && initial.offered.includes(initialOpenServiceId) ? initialOpenServiceId : null;
    }
    return initial.offered.length === 1 ? initial.offered[0] : null;
  });
  const [stopping, setStopping] = useState<WithId<HealthcareService>>();
  const [saving, setSaving] = useState(false);
  const [triedToSave, setTriedToSave] = useState(false);
  const [failure, setFailure] = useState<Pick<ConfigSaveFailure, 'conflict' | 'message'>>();
  const [reloading, setReloading] = useState(false);

  const facilities = useActorFacilities([resource])?.get(getReferenceString(resource));

  const draft = buildCalendar(schedule, resource, fields, initial, servicesById);
  // Edits the draft can't store yet, like an emptied week, still count, so the save bar can say why it refuses.
  const dirty = (schedule ? !deepEquals(draft, schedule) : draft !== undefined) || !deepEquals(fields, initial);
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

  let blockedReason: string | undefined;
  for (const service of offered) {
    if (Object.keys(errorsFor(service)).length > 0) {
      blockedReason = `Fix the highlighted fields for ${service.name ?? 'this visit type'} before saving.`;
      break;
    }
    blockedReason = availabilityErrorFor(service);
    if (blockedReason) {
      break;
    }
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
    setOpen((current) => (current && initial.offered.includes(current) ? current : null));
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

  const offerable = services.filter((service) => service.active !== false && !fields.offered.includes(service.id));

  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          {typeLabel}
        </Text>
        <Group gap="sm">
          <Title order={2}>{actorName}</Title>
          {isActorInactive(resource) && (
            <Badge variant="light" color="gray">
              Inactive
            </Badge>
          )}
        </Group>
      </Stack>

      {failure?.conflict && (
        <Alert color="orange" title={`The calendar for ${actorName} changed since you opened it`}>
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
        <ActorGeneral resource={resource} />
      </ConfigSection>

      <ConfigSection title="Visit types" description={`What ${actorName} can be booked for, and how.`}>
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

        {offered.length === 0 ? (
          <Text size="sm" c="dimmed">
            {actorName} offers no visit types yet.
          </Text>
        ) : (
          <Accordion variant="separated" value={open} onChange={setOpen}>
            {offered.map((service) => {
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
                  errors={errorsFor(service)}
                  availabilityError={triedToSave ? availabilityErrorFor(service) : undefined}
                  notBookableReason={notBookableReason(service)}
                  timezone={
                    timezone
                      ? { zone: timezone, source: timezoneSource(fields.offerings[service.id], service, actorName) }
                      : undefined
                  }
                  timezoneHint={`Set one in Time zone above, on ${service.name ?? 'the visit type'}, or on ${actorName}.`}
                  onStopOffering={() => setStopping(service)}
                />
              );
            })}
          </Accordion>
        )}

        <OfferMenu
          services={offerable}
          // A visit type held everywhere can be offered before the actor's facilities are known.
          checking={(service) => !facilities && (service.location?.length ?? 0) > 0}
          disabledReason={(service) => notBookableReason(service)}
          onOffer={offer}
        />
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
        saving={saving}
        blockedReason={blockedReason}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </Stack>
  );
}

function ActorGeneral(props: { readonly resource: ConfigurableActorResource }): JSX.Element {
  const { resource } = props;
  let status: string;
  if (resource.resourceType === 'Practitioner') {
    status = resource.active === false ? 'Inactive' : 'Active';
  } else {
    status = resource.status ? resource.status.charAt(0).toUpperCase() + resource.status.slice(1) : 'Not set';
  }
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
      <ReadOnlyField label="Name" value={getDisplayString(resource)} />
      <ReadOnlyField label="Status" value={status} />
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
