// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Loader, Stack, Text, UnstyledButton } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getDisplayString, getReferenceString } from '@medplum/core';
import type { HealthcareService, Location, Reference } from '@medplum/fhirtypes';
import { IconChevronRight } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useId } from 'react';
import { scheduleHasOverrides } from '../ActorPage/scheduleDraft';
import classes from '../ConfigPanel/ConfigRow.module.css';
import { OverridesBadge } from '../OverridesBadge';
import type { ConfigOffering, ConfigOfferingGroup } from '../SchedulingConfigWorkspace.utils';
import { describeNoSharedFacility, isHeldEverywhere, sharesServiceFacility } from '../serviceFacilities';
import { useActorFacilities } from '../useActorFacilities';

export interface OfferingSchedulesSectionProps {
  /** The visit type as stored, which Customized compares each Schedule against. Absent for one not created yet. */
  readonly service?: WithId<HealthcareService>;
  readonly serviceName: string;
  /** The service facilities the visit type is held at, as edited, which decide what can be booked. */
  readonly location: readonly Reference<Location>[];
  /** What offers the visit type, by actor type, in the order the sidebar lists them. */
  readonly groups: readonly ConfigOfferingGroup[];
  readonly loading?: boolean;
  readonly onOpen?: (offering: ConfigOffering) => void;
}

/**
 * Lists every provider, room, and device whose Schedule offers a visit type, grouped by type, each opening that
 * actor's page. Offerings are changed from the actor's page, not here.
 * @param props - The visit type, what offers it, and what to do when one is picked.
 * @returns The list.
 */
export function OfferingSchedulesSection(props: OfferingSchedulesSectionProps): JSX.Element {
  const { service, serviceName, location, groups, loading, onOpen } = props;
  const listed = groups.filter((group) => group.offerings.length > 0);
  const facilities = useActorFacilities(
    isHeldEverywhere(location)
      ? []
      : listed.flatMap((group) => group.offerings.map((offering) => offering.actor.resource))
  );

  if (loading) {
    return <Loader size="sm" aria-label="Loading what offers this visit type" />;
  }
  if (!service || listed.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Nothing offers {serviceName} yet. Visit types are offered from a provider's, room's, or device's page.
      </Text>
    );
  }

  function notBookableReason(offering: ConfigOffering): string | undefined {
    const placed = facilities?.get(getReferenceString(offering.actor.resource));
    return placed && !sharesServiceFacility({ location: [...location] }, placed)
      ? describeNoSharedFacility(serviceName, placed)
      : undefined;
  }

  return (
    <Stack gap="md">
      {listed.map((group) => (
        <OfferingGroup key={group.title} title={group.title}>
          {group.offerings.map((offering) => (
            <OfferingRow
              key={getReferenceString(offering.actor.resource)}
              service={service}
              serviceName={serviceName}
              offering={offering}
              notBookableReason={notBookableReason(offering)}
              onOpen={onOpen}
            />
          ))}
        </OfferingGroup>
      ))}
    </Stack>
  );
}

function OfferingGroup(props: { readonly title: string; readonly children: ReactNode }): JSX.Element {
  const titleId = useId();
  return (
    <Stack gap="xs" role="group" aria-labelledby={titleId}>
      <Text id={titleId} size="xs" fw={700} tt="uppercase" c="dimmed">
        {props.title}
      </Text>
      <Stack gap={2}>{props.children}</Stack>
    </Stack>
  );
}

function OfferingRow(props: {
  readonly service: WithId<HealthcareService>;
  readonly serviceName: string;
  readonly offering: ConfigOffering;
  /** Why the visit type can't be booked with this actor, when it can't. */
  readonly notBookableReason?: string;
  readonly onOpen?: (offering: ConfigOffering) => void;
}): JSX.Element {
  const { service, serviceName, offering, notBookableReason, onOpen } = props;
  const { resource } = offering.actor;
  return (
    <UnstyledButton className={classes.row} onClick={() => onOpen?.(offering)}>
      <Group gap="sm" wrap="nowrap">
        <Stack gap={2} className={classes.label}>
          <Group gap="xs" wrap="nowrap">
            <Text fw={500} truncate>
              {getDisplayString(resource)}
            </Text>
            {scheduleHasOverrides(service, offering.schedule) && <OverridesBadge serviceName={serviceName} />}
          </Group>
          {notBookableReason && (
            <Text size="sm" c="orange">
              Can't be booked: {notBookableReason}.
            </Text>
          )}
        </Stack>
        <IconChevronRight size={16} />
      </Group>
    </UnstyledButton>
  );
}
