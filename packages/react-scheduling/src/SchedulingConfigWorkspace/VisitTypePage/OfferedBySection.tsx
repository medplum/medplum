// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Loader, Stack, Text, UnstyledButton } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getDisplayString, getReferenceString } from '@medplum/core';
import type { HealthcareService, Location, Reference } from '@medplum/fhirtypes';
import { IconChevronRight } from '@tabler/icons-react';
import type { JSX } from 'react';
import { getActorTypeLabel } from '../../actors';
import classes from '../ConfigPanel/ConfigRow.module.css';
import { summarizeOffering } from '../offeringSummary';
import type { ConfigOffering } from '../SchedulingConfigWorkspace.utils';
import { describeNoSharedFacility, sharesServiceFacility } from '../serviceFacilities';
import { useActorFacilities } from '../useActorFacilities';

export interface OfferedBySectionProps {
  /** The visit type as stored, whose settings the summaries show. Absent for one not created yet. */
  readonly service?: WithId<HealthcareService>;
  readonly serviceName: string;
  /** The service facilities the visit type is held at, as edited, which decide what can be booked. */
  readonly location: readonly Reference<Location>[];
  readonly offerings: readonly ConfigOffering[];
  readonly loading?: boolean;
  readonly onOpen?: (offering: ConfigOffering) => void;
}

/**
 * Lists every provider, room, and device whose calendar offers a visit type, each opening that actor's page.
 * Offerings are changed from the actor's page, not here.
 * @param props - The visit type, what offers it, and what to do when one is picked.
 * @returns The list.
 */
export function OfferedBySection(props: OfferedBySectionProps): JSX.Element {
  const { service, serviceName, location, offerings, loading, onOpen } = props;
  const facilities = useActorFacilities(offerings.map((offering) => offering.actor.resource));

  if (loading) {
    return <Loader size="sm" aria-label="Loading what offers this visit type" />;
  }
  if (!service || offerings.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Nothing offers {serviceName} yet. Visit types are offered from a provider's, room's, or device's page.
      </Text>
    );
  }

  return (
    <Stack gap={2}>
      {offerings.map((offering) => {
        const { resource } = offering.actor;
        const placed = facilities?.get(getReferenceString(resource));
        const reason =
          placed && !sharesServiceFacility({ location: [...location] }, placed)
            ? describeNoSharedFacility(serviceName, placed)
            : undefined;
        return (
          <UnstyledButton key={getReferenceString(resource)} className={classes.row} onClick={() => onOpen?.(offering)}>
            <Group gap="sm" wrap="nowrap">
              <Stack gap={2} className={classes.label}>
                <Group gap="xs" wrap="nowrap">
                  <Text fw={500} truncate>
                    {getDisplayString(resource)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {getActorTypeLabel(resource.resourceType)}
                  </Text>
                </Group>
                <Text size="sm" c="dimmed" truncate>
                  {summarizeOffering(service, offering.schedule)}
                </Text>
                {reason && (
                  <Text size="sm" c="orange">
                    Can't be booked: {reason}.
                  </Text>
                )}
              </Stack>
              <IconChevronRight size={16} />
            </Group>
          </UnstyledButton>
        );
      })}
    </Stack>
  );
}
