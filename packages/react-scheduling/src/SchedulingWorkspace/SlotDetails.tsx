// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Divider, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import type { Slot } from '@medplum/fhirtypes';
import { ResourceName } from '@medplum/react';
import { useMedplum, useResource } from '@medplum/react-hooks';
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
 * time and the comment, and a button deleting it.
 * @param props - The React props.
 * @returns The details component.
 */
export function SlotDetails(props: SlotDetailsProps): JSX.Element {
  const { slot } = props;
  const schedule = useResource(slot.schedule);
  const actors = schedule?.actor;
  const medplum = useMedplum();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>();

  async function deleteSlot(): Promise<void> {
    setDeleting(true);
    setDeleteError(undefined);
    try {
      await medplum.deleteResource('Slot', slot.id);
    } catch (error) {
      setDeleteError(error);
    } finally {
      setDeleting(false);
    }
  }

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
            {deleteError !== undefined && (
              <Alert color="red" title="Could not delete this slot">
                {normalizeErrorString(deleteError)}
              </Alert>
            )}
            {confirmingDelete ? (
              <>
                <Text size="sm">Delete this blocked time? It cannot be undone.</Text>
                <Button color="red" loading={deleting} onClick={deleteSlot}>
                  Confirm Delete
                </Button>
                <Button
                  variant="outline"
                  disabled={deleting}
                  onClick={() => {
                    setConfirmingDelete(false);
                    setDeleteError(undefined);
                  }}
                >
                  Back
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <Button variant="outline" color="red" onClick={() => setConfirmingDelete(true)}>
                  Delete
                </Button>
              </>
            )}
          </Stack>
        </>
      )}
    </Stack>
  );
}
