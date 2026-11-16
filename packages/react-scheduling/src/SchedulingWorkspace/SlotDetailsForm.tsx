// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Stack, Text, Textarea, TextInput } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getStatus, isGone, isNotFound, normalizeErrorString, OperationOutcomeError } from '@medplum/core';
import type { Slot } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useState } from 'react';
import {
  formatZonedDateTimeInput,
  getNativeInputType,
  parseZonedDateTimeInput,
} from '../AppointmentFinder/AppointmentFinder.times';

export interface SlotDetailsFormProps {
  readonly slot: WithId<Slot>;
  readonly onCancel: () => void;
  readonly onUpdated: () => void;
}

/**
 * Edits when a slot starts and ends, and its comment.
 *
 * Times are typed on the browser's clock, as the calendar draws them. Saving is a plain update,
 * made only if no one else has changed the slot since it was loaded.
 *
 * @param props - The React props.
 * @returns The fields and the button saving them.
 */
export function SlotDetailsForm(props: SlotDetailsFormProps): JSX.Element {
  const { slot, onCancel, onUpdated } = props;
  const medplum = useMedplum();

  const [startInput, setStartInput] = useState(() => formatZonedDateTimeInput(new Date(slot.start)));
  const [endInput, setEndInput] = useState(() => formatZonedDateTimeInput(new Date(slot.end)));
  const [comment, setComment] = useState(slot.comment ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>();
  const [reloading, setReloading] = useState(false);

  const start = parseZonedDateTimeInput(startInput);
  const end = parseZonedDateTimeInput(endInput);
  const valid = start !== undefined && end !== undefined && end > start;
  const edited =
    start?.getTime() !== new Date(slot.start).getTime() ||
    end?.getTime() !== new Date(slot.end).getTime() ||
    comment.trim() !== (slot.comment ?? '');

  async function save(): Promise<void> {
    if (!start || !end) {
      return;
    }
    setSaving(true);
    setSaveError(undefined);
    try {
      await medplum.updateResource<Slot>(
        {
          ...slot,
          start: start.toISOString(),
          end: end.toISOString(),
          // FHIR has no empty strings, so a cleared comment is left off.
          comment: comment.trim() || undefined,
        },
        slot.meta?.versionId ? { headers: { 'If-Match': `W/"${slot.meta.versionId}"` } } : undefined
      );
      onUpdated();
    } catch (error) {
      setSaveError(error);
    } finally {
      setSaving(false);
    }
  }

  // Puts the slot as the server now holds it into the calendar, discarding the edits made here.
  async function reload(): Promise<void> {
    setReloading(true);
    try {
      const latest = await medplum.readResource('Slot', slot.id, { cache: 'no-cache' });
      medplum.notifyResourceModified({ resourceType: 'Slot', operation: 'update', id: latest.id, resource: latest });
      onCancel();
    } catch (error) {
      if (error instanceof OperationOutcomeError && (isNotFound(error.outcome) || isGone(error.outcome))) {
        medplum.notifyResourceModified({ resourceType: 'Slot', operation: 'delete', id: slot.id });
        return;
      }
      setSaveError(error);
    } finally {
      setReloading(false);
    }
  }

  const conflict = saveError instanceof OperationOutcomeError && getStatus(saveError.outcome) === 412;

  return (
    <Stack gap="sm">
      <TextInput
        label="Starts"
        type={getNativeInputType('datetime-local')}
        value={startInput}
        onChange={(event) => setStartInput(event.currentTarget.value)}
      />
      <TextInput
        label="Ends"
        type={getNativeInputType('datetime-local')}
        value={endInput}
        onChange={(event) => setEndInput(event.currentTarget.value)}
        error={start && end && !valid ? 'Must end after it starts.' : undefined}
      />
      <Textarea
        label="Notes"
        autosize
        minRows={2}
        value={comment}
        onChange={(e) => setComment(e.currentTarget.value)}
      />
      {conflict && (
        <Alert color="orange" title="This blocked time changed since you opened it">
          <Stack gap="sm" align="flex-start">
            <Text size="sm">
              A newer version was saved somewhere else, so nothing here was written over it. Reload to see the latest
              version. Your changes here will be discarded.
            </Text>
            <Button size="xs" variant="light" color="orange" loading={reloading} onClick={reload}>
              Reload
            </Button>
          </Stack>
        </Alert>
      )}
      {saveError !== undefined && !conflict && (
        <Alert color="red" title="Could not save this slot">
          {normalizeErrorString(saveError)}
        </Alert>
      )}
      <Button variant="outline" loading={saving} disabled={!valid || !edited} onClick={save}>
        Save Changes
      </Button>
      <Button variant="subtle" disabled={saving} onClick={onCancel}>
        Cancel
      </Button>
    </Stack>
  );
}
