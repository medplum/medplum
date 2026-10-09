// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Stack } from '@mantine/core';
import type { Slot } from '@medplum/fhirtypes';
import { ResourceName } from '@medplum/react';
import { useResource } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { Fragment } from 'react';
import { Detail } from './Detail';
import { formatWhen } from './SchedulingWorkspace.utils';

export interface SlotDetailsProps {
  readonly slot: Slot;
}

/**
 * Shows a read-only detail view of a single slot: whose time it holds, when, and why.
 * @param props - The React props.
 * @returns The details component.
 */
export function SlotDetails(props: SlotDetailsProps): JSX.Element {
  const { slot } = props;
  const schedule = useResource(slot.schedule);
  const actors = schedule?.actor;

  return (
    <Stack gap="sm">
      <Badge color="gray">{slot.status}</Badge>
      <Detail
        label="For"
        value={actors?.map((actor, index) => (
          <Fragment key={actor.reference ?? `actor-${index}`}>
            {index > 0 && ', '}
            <ResourceName value={actor} link={false} inherit />
          </Fragment>
        ))}
      />
      <Detail label="When" value={formatWhen(slot)} />
      <Detail label="Notes" value={slot.comment} />
    </Stack>
  );
}
