// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Divider, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getReferenceString, isOk, normalizeErrorString } from '@medplum/core';
import type { Slot } from '@medplum/fhirtypes';
import { ResourceName } from '@medplum/react';
import { useMedplum, useResource, useSearchOne } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { Fragment, useState } from 'react';
import { Detail } from './Detail';
import { formatWhen, isCancelable, isReschedulable } from './SchedulingWorkspace.utils';
import classes from './SlotDetails.module.css';
import { SlotDetailsForm } from './SlotDetailsForm';

export interface SlotDetailsProps {
  readonly slot: WithId<Slot>;
}

/**
 * Shows a single slot: whose time it holds, when, and why, with an edit form for the
 * time and the comment, and a button deleting it.
 *
 * A slot an appointment holds, such as its buffers, cannot be edited or deleted here: it
 * is moved or freed by rescheduling or cancelling that appointment. Both stay disabled
 * until the search for such an appointment comes back empty.
 * @param props - The React props.
 * @returns The details component.
 */
export function SlotDetails(props: SlotDetailsProps): JSX.Element {
  const { slot } = props;
  const schedule = useResource(slot.schedule);
  const actors = schedule?.actor;
  const medplum = useMedplum();
  const [holder, , holderOutcome] = useSearchOne('Appointment', { slot: getReferenceString(slot) });
  const unheld = holderOutcome !== undefined && isOk(holderOutcome) && !holder;
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
            {holder && (
              <Text size="sm">
                This time is held by an appointment.
                {(isReschedulable(holder) || isCancelable(holder)) &&
                  ' Reschedule or cancel the appointment to change it.'}
              </Text>
            )}
            {holderOutcome && !isOk(holderOutcome) && (
              <Alert color="red" title="Could not check for an appointment holding this slot">
                {normalizeErrorString(holderOutcome)}
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
                <Button variant="outline" disabled={!unheld} onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <Button variant="outline" color="red" disabled={!unheld} onClick={() => setConfirmingDelete(true)}>
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
