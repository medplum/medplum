// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Loader, Stack, Text, UnstyledButton } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getDisplayString, getReferenceString } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { IconChevronRight } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useId } from 'react';
import { scheduleHasOverrides } from '../ActorPage/scheduleDraft';
import classes from '../ConfigPanel/ConfigRow.module.css';
import { OverridesBadge } from '../OverridesBadge';
import type { ConfigOffering, ConfigOfferingGroup } from '../SchedulingConfigWorkspace.utils';

export interface OfferedBySectionProps {
  /** The visit type as stored, which Customized compares each Schedule against. Absent for one not created yet. */
  readonly service?: WithId<HealthcareService>;
  readonly serviceName: string;
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
export function OfferedBySection(props: OfferedBySectionProps): JSX.Element {
  const { service, serviceName, groups, loading, onOpen } = props;
  if (loading) {
    return <Loader size="sm" aria-label="Loading what offers this visit type" />;
  }
  const listed = groups.filter((group) => group.offerings.length > 0);
  if (!service || listed.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Nothing offers {serviceName} yet. Visit types are offered from a provider's, room's, or device's page.
      </Text>
    );
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
  readonly onOpen?: (offering: ConfigOffering) => void;
}): JSX.Element {
  const { service, serviceName, offering, onOpen } = props;
  const { resource } = offering.actor;
  return (
    <UnstyledButton className={classes.row} onClick={() => onOpen?.(offering)}>
      <Group gap="sm" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" className={classes.label}>
          <Text fw={500} truncate>
            {getDisplayString(resource)}
          </Text>
          {scheduleHasOverrides(service, offering.schedule) && <OverridesBadge serviceName={serviceName} />}
        </Group>
        <IconChevronRight size={16} />
      </Group>
    </UnstyledButton>
  );
}
