// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Badge, Group, SimpleGrid, Stack, Text, Title, Tooltip } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getDisplayString } from '@medplum/core';
import type { HealthcareService, Schedule } from '@medplum/fhirtypes';
import { IconInfoCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useMemo } from 'react';
import { getActorTypeLabel } from '../../actors';
import type { ConfigurableActor, ConfigurableActorResource } from '../../configSearch';
import { ConfigSection } from '../ConfigPage/ConfigPage';
import { summarizeOffering } from '../offeringSummary';
import { getOfferedServices, isActorInactive } from '../SchedulingConfigWorkspace.utils';

export interface ActorPageProps {
  /** The provider, room, or device, with its Schedules as stored. The first Schedule is the one shown. */
  readonly actor: ConfigurableActor;
  /** Every visit type loaded. */
  readonly services: readonly WithId<HealthcareService>[];
}

/**
 * The page for one provider, room, or device: its own fields, and the visit types its Schedule offers, each
 * with a line saying how it is scheduled.
 * @param props - The actor and its Schedules, and the visit types.
 * @returns The page.
 */
export function ActorPage(props: ActorPageProps): JSX.Element {
  const { actor, services } = props;
  const resource = actor.resource;
  const [schedule] = actor.schedules;
  const actorName = getDisplayString(resource);
  const typeLabel = getActorTypeLabel(resource.resourceType);

  const servicesById = useMemo(() => new Map(services.map((service) => [service.id, service])), [services]);
  const offered = getOfferedServices(schedule, servicesById);

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

      <ConfigSection title="General">
        <ActorGeneral resource={resource} schedule={schedule} />
      </ConfigSection>

      <ConfigSection title="Visit types offered">
        {!schedule || offered.length === 0 ? (
          <Text size="sm" c="dimmed">
            {actorName} offers no visit types yet.
          </Text>
        ) : (
          <Stack gap="sm">
            {offered.map((service) => (
              <Stack key={service.id} gap={2}>
                <Text fw={600} truncate>
                  {service.name ?? 'this visit type'}
                </Text>
                <Text size="sm" c="dimmed" truncate>
                  {summarizeOffering(service, schedule)}
                </Text>
              </Stack>
            ))}
          </Stack>
        )}
      </ConfigSection>
    </Stack>
  );
}

const STATUS_INFO: Record<ConfigurableActorResource['resourceType'], string> = {
  Practitioner: 'Inactive once they leave the practice.',
  Location: 'Inactive once the room is no longer in use.',
  Device: 'Inactive once the device is retired.',
};

function ActorGeneral(props: {
  readonly resource: ConfigurableActorResource;
  readonly schedule: Schedule | undefined;
}): JSX.Element {
  const { resource, schedule } = props;
  let status: string;
  if (resource.resourceType === 'Practitioner') {
    status = resource.active === false ? 'Inactive' : 'Active';
  } else {
    status = resource.status ? resource.status.charAt(0).toUpperCase() + resource.status.slice(1) : 'Active';
  }
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
      <ReadOnlyField label="Name" value={getDisplayString(resource)} />
      <ReadOnlyField
        label={`${getActorTypeLabel(resource.resourceType)} status`}
        value={status}
        info={`${STATUS_INFO[resource.resourceType]} This applies everywhere, not only in scheduling.`}
      />
      {schedule && (
        <ReadOnlyField
          label="Schedule status"
          value={schedule.active === false ? 'Inactive' : 'Active'}
          info="Inactive while booking is paused, such as during leave or maintenance. Stops new bookings and rescheduling. Existing appointments stay."
        />
      )}
    </SimpleGrid>
  );
}

function ReadOnlyField(props: { readonly label: string; readonly value: string; readonly info?: string }): JSX.Element {
  return (
    <Stack gap={2}>
      <Group gap={4}>
        <Text size="sm" fw={500}>
          {props.label}
        </Text>
        {props.info && (
          <Tooltip label={props.info} multiline w={280} withArrow events={{ hover: true, focus: true, touch: true }}>
            <ActionIcon variant="subtle" color="gray" size="xs" aria-label={`About ${props.label}`}>
              <IconInfoCircle size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
      <Text size="sm">{props.value}</Text>
    </Stack>
  );
}
