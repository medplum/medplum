// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Button, Divider, Stack } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Slot } from '@medplum/fhirtypes';
import { ResourceName } from '@medplum/react';
import { useResource } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { Fragment, useState } from 'react';
import { Detail } from './Detail';
import { formatWhen } from './SchedulingWorkspace.utils';
import classes from './SlotDetails.module.css';
import { SlotDetailsForm } from './SlotDetailsForm';

export interface SlotDetailsProps {
  readonly slot: WithId<Slot>;
}

/**
 * Shows a single slot: whose time it holds, when, and why, with an edit form for the
 * time and the comment.
 * @param props - The React props.
 * @returns The details component.
 */
export function SlotDetails(props: SlotDetailsProps): JSX.Element {
  const { slot } = props;
  const schedule = useResource(slot.schedule);
  const actors = schedule?.actor;
  const [editing, setEditing] = useState(false);

  return (
    <Stack gap="sm" className={classes.details}>
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
      {editing ? (
        <SlotDetailsForm slot={slot} onUpdated={() => setEditing(false)} onCancel={() => setEditing(false)} />
      ) : (
        <>
          <Detail label="When" value={formatWhen(slot)} />
          <Detail label="Notes" value={slot.comment} />
          <Stack gap="sm" className={classes.actions}>
            <Divider />
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </Stack>
        </>
      )}
    </Stack>
  );
}
